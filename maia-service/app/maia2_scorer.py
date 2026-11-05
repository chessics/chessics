"""Maia-2 behind the MoveScorer protocol.

Preprocessing follows maia2's own `inference.preprocessing` exactly: a board
with Black to move is mirrored so the model always sees White to move, the
ratings are mapped to maia2's bands, and moves are read from the model's fixed
move vocabulary, then mirrored back.

All torch work (load, warm-up, every forward pass) runs on one dedicated
thread. Torch called from several threads starts several OpenMP thread teams,
which then compete for the same cores: on 4 cores a request took a median
17 ms from the server's worker threads against 9 ms from a single thread.
"""

from __future__ import annotations

import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Sequence

import chess
import torch

from maia2 import model as maia2_model
from maia2.utils import (
    board_to_tensor,
    create_elo_dict,
    get_all_possible_moves,
    map_to_category,
    mirror_move,
)

MODEL_NAME = "maia2-rapid"
MODEL_TYPE = "rapid"
WEIGHTS_FILENAME = "rapid_model.pt"
DEFAULT_MODEL_DIR = "./maia2_models"


class WeightsMissing(RuntimeError):
    pass


class Maia2Scorer:
    model_name = MODEL_NAME

    def __init__(self, model_dir: str | None = None, allow_download: bool = False):
        model_dir = model_dir or os.environ.get("MAIA_MODEL_DIR", DEFAULT_MODEL_DIR)
        weights = Path(model_dir) / WEIGHTS_FILENAME
        if not weights.is_file() and not allow_download:
            raise WeightsMissing(
                f"{weights} not found. Fetch it with `python scripts/fetch_weights.py`"
                " (the Docker build does this), or set MAIA_ALLOW_DOWNLOAD=1."
            )
        self.forward_count = 0
        self.forward_thread_ids: set[int] = set()  # bounded: distinct threads only
        self.warmup_ms: float | None = None
        # One thread for all torch work; it also serialises forward passes.
        self._torch = ThreadPoolExecutor(max_workers=1, thread_name_prefix="maia-torch")
        self._torch.submit(self._load, model_dir).result()

    def _load(self, model_dir: str) -> None:
        self.load_thread = threading.get_ident()
        threads = os.environ.get("MAIA_THREADS")
        if threads:
            torch.set_num_threads(int(threads))
        # from_pretrained checks the file's sha256 against maia2's pinned value
        # and downloads it only when it is missing or wrong.
        self._model = maia2_model.from_pretrained(
            type=MODEL_TYPE, device="cpu", save_root=model_dir
        )
        # Dropout is active until eval(); without this the policy is random.
        self._model.eval()
        all_moves = get_all_possible_moves()
        self._move_index = {m: i for i, m in enumerate(all_moves)}
        self._elo_dict = create_elo_dict()
        x, es, eo, _ = self._batch([chess.Board()], [1500], [1500])
        started = time.perf_counter()
        self._forward(x, es, eo)
        self.warmup_ms = (time.perf_counter() - started) * 1000

    def _encode(self, board: chess.Board):
        black = board.turn == chess.BLACK
        seen = board.mirror() if black else board
        indices: list[int] = []
        ucis: list[str] = []
        for move in seen.legal_moves:
            uci = move.uci()
            indices.append(self._move_index[uci])
            ucis.append(mirror_move(uci) if black else uci)
        return board_to_tensor(seen), indices, ucis

    def _batch(self, boards, elos_self, elos_oppo):
        encoded = [self._encode(b) for b in boards]
        x = torch.stack([e[0] for e in encoded])
        es = torch.tensor([map_to_category(e, self._elo_dict) for e in elos_self])
        eo = torch.tensor([map_to_category(e, self._elo_dict) for e in elos_oppo])
        return x, es, eo, encoded

    def _forward(self, x, es, eo) -> list[list[float]]:
        self.forward_count += 1
        self.forward_thread_ids.add(threading.get_ident())
        with torch.inference_mode():
            logits_maia, _, _ = self._model(x, es, eo)
        return logits_maia.to(torch.float64).tolist()

    def logits(
        self,
        boards: Sequence[chess.Board],
        elos_self: Sequence[int],
        elos_oppo: Sequence[int],
    ) -> list[dict[str, float]]:
        x, es, eo, encoded = self._batch(boards, elos_self, elos_oppo)
        rows = self._torch.submit(self._forward, x, es, eo).result()
        out: list[dict[str, float]] = []
        for row, (_, indices, ucis) in zip(rows, encoded):
            out.append({u: row[i] for u, i in zip(ucis, indices)})
        return out
