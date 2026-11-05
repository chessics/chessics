from __future__ import annotations

import hashlib
import os
import sys
from pathlib import Path
from typing import Sequence

import chess
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.main import create_app  # noqa: E402


def board_after(*sans: str) -> chess.Board:
    board = chess.Board()
    for san in sans:
        board.push_san(san)
    return board


def fen_after(*sans: str) -> str:
    return board_after(*sans).fen()


# Positions chosen to reach every corner of move encoding: both colours to
# move, castling both ways for both sides, en passant for both sides, white
# and black promotion with underpromotion and capture-promotion, check, and
# the 218-legal-move position.
POSITIONS = {
    "start": chess.STARTING_FEN,
    "black_after_e4": fen_after("e4"),
    "white_en_passant": fen_after("e4", "a6", "e5", "d5"),
    "black_en_passant": fen_after("a3", "d5", "a4", "d4", "e4"),
    "white_castles_both": "r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 6 8",
    "black_castles_both": "r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R b KQkq - 6 8",
    "white_promotes": "1n5k/P7/8/8/8/8/8/K7 w - - 0 1",
    "black_promotes": "k7/8/8/8/8/8/p7/1N5K b - - 0 1",
    "white_in_check": "4k3/8/8/8/8/8/4q3/4K3 w - - 0 1",
    "black_in_check": "4k3/8/8/1B6/8/8/P7/4K3 b - - 0 1",
    "max_legal_moves": "R6R/3Q4/1Q4Q1/4Q3/2Q4Q/Q4Q2/pp1Q4/kBNN1KB1 w - - 0 1",
    "middlegame_black": fen_after(
        "e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6", "Be2"
    ),
    "endgame_white": "8/5pk1/6p1/8/3R4/6P1/5PK1/3r4 w - - 0 40",
}

CHECKMATE = fen_after("f3", "e5", "g4", "Qh4#")
STALEMATE = "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"
INSUFFICIENT = "8/8/8/4k3/8/8/8/4K3 w - - 0 1"


class StubScorer:
    """Deterministic made-up logits, varied per move and per rating."""

    model_name = "stub"

    def __init__(self):
        self.calls = 0

    def logits(self, boards, elos_self, elos_oppo):
        self.calls += 1
        out = []
        for board, es, eo in zip(boards, elos_self, elos_oppo):
            row = {}
            for move in board.legal_moves:
                key = f"{board.fen()}|{move.uci()}|{es}|{eo}".encode()
                h = int.from_bytes(hashlib.sha256(key).digest()[:4], "big")
                row[move.uci()] = (h / 2**32) * 6 - 3
            out.append(row)
        return out


class ConstantScorer:
    """Every legal move the same logit: all p tie."""

    model_name = "constant"

    def __init__(self, value: float = 0.0):
        self.value = value

    def logits(self, boards, elos_self, elos_oppo):
        return [{m.uci(): self.value for m in b.legal_moves} for b in boards]


class LargeLogitScorer:
    """Logits large enough to overflow exp() unless the max is subtracted."""

    model_name = "large"

    def logits(self, boards, elos_self, elos_oppo):
        out = []
        for b in boards:
            moves = sorted(m.uci() for m in b.legal_moves)
            out.append({u: 1000.0 + i for i, u in enumerate(moves)})
        return out


class DroppingScorer:
    """Leaves one legal move out: a scorer bug the API must not pass on."""

    model_name = "dropping"

    def logits(self, boards, elos_self, elos_oppo):
        return [dict(list({m.uci(): 0.0 for m in b.legal_moves}.items())[1:]) for b in boards]


def make_client(scorer, token=None) -> TestClient:
    return TestClient(create_app(scorer_factory=lambda: scorer, token=token))


@pytest.fixture
def stub():
    return StubScorer()


_REAL = {}


def real_scorer():
    """The Maia-2 scorer, loaded once per test session; skips without weights."""
    if "scorer" not in _REAL:
        try:
            from app.maia2_scorer import Maia2Scorer, WeightsMissing
        except ImportError as exc:  # maia2 or torch not installed
            _REAL["skip"] = f"maia2 not importable: {exc}"
        else:
            try:
                _REAL["scorer"] = Maia2Scorer(model_dir=os.environ.get("MAIA_MODEL_DIR"))
            except WeightsMissing as exc:
                _REAL["skip"] = str(exc)
    if "skip" in _REAL and "scorer" not in _REAL:
        pytest.skip(_REAL["skip"])
    return _REAL["scorer"]


@pytest.fixture(params=["stub", "maia2"])
def any_scorer(request):
    """Both the stub and, when the weights are present, the real model."""
    if request.param == "stub":
        return StubScorer()
    return real_scorer()


@pytest.fixture
def maia2():
    return real_scorer()


def body(fen: str, elo_self=1350, elo_oppo=1420) -> dict:
    return {"fen": fen, "elo_self": elo_self, "elo_oppo": elo_oppo}


def legal(fen: str) -> set[str]:
    return {m.uci() for m in chess.Board(fen).legal_moves}
