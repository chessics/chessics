"""The real model: same numbers as maia2's own inference, and ratings matter.

Skipped when the weights are not on disk (see README: fetch_weights.py).
"""

from __future__ import annotations

import chess
import pytest

from app.policy import MoveP, softmax_policy, policy
from app.request import ELO_CLAMP_MAX, ELO_CLAMP_MIN, clamp_elo
from conftest import POSITIONS, body, make_client


def as_dict(moves):
    return {m.uci: m.p for m in moves}


@pytest.fixture(scope="module")
def reference():
    """A second copy of the model, used only through maia2's own inference."""
    pytest.importorskip("maia2")
    from conftest import real_scorer

    real_scorer()  # skips the module when the weights are missing
    import os

    from maia2 import inference, model

    save_root = os.environ.get("MAIA_MODEL_DIR", "./maia2_models")
    ref = model.from_pretrained(type="rapid", device="cpu", save_root=save_root)
    return ref, inference.prepare()


@pytest.mark.parametrize("name,fen", sorted(POSITIONS.items()))
@pytest.mark.parametrize("elos", [(1100, 1900), (1500, 1500), (1900, 1100), (2400, 800)])
def test_matches_maia2_reference_inference(maia2, reference, name, fen, elos):
    """Our preprocessing must reproduce maia2.inference.inference_each."""
    from maia2 import inference

    ref_model, prepared = reference
    expected, _ = inference.inference_each(ref_model, prepared, fen, *elos)
    got = as_dict(policy(maia2, chess.Board(fen), clamp_elo(elos[0]), clamp_elo(elos[1])))
    assert set(got) == set(expected)
    # maia2 rounds to 4 places and runs softmax in float32.
    worst = max(abs(got[u] - expected[u]) for u in got)
    assert worst <= 1e-4 + 1e-6, (name, elos, worst)


def test_rating_changes_the_policy(maia2):
    fen = POSITIONS["middlegame_black"]
    low = as_dict(policy(maia2, chess.Board(fen), 1100, 1100))
    high = as_dict(policy(maia2, chess.Board(fen), 2000, 2000))
    assert max(abs(low[u] - high[u]) for u in low) > 0.01


def test_self_and_opponent_ratings_are_not_interchangeable(maia2):
    fen = POSITIONS["middlegame_black"]
    a = as_dict(policy(maia2, chess.Board(fen), 1100, 2000))
    b = as_dict(policy(maia2, chess.Board(fen), 2000, 1100))
    assert a != b


def test_clamp_moves_no_rating_into_another_band():
    from maia2.utils import create_elo_dict, map_to_category

    bands = create_elo_dict()
    for elo in [x / 2 for x in range(0, 8001)]:  # 0 to 4000 in halves
        assert map_to_category(clamp_elo(elo), bands) == map_to_category(elo, bands), elo
    assert clamp_elo(900) == ELO_CLAMP_MIN == 1099
    assert clamp_elo(2600) == ELO_CLAMP_MAX == 2000
    assert clamp_elo(1350.7) == 1350
    # The clamp is the tightest one: one step in moves a rating to a new band.
    assert map_to_category(ELO_CLAMP_MIN + 1, bands) != map_to_category(ELO_CLAMP_MIN, bands)
    assert map_to_category(ELO_CLAMP_MAX - 1, bands) != map_to_category(ELO_CLAMP_MAX, bands)


def test_band_edges_through_the_api(maia2):
    fen = POSITIONS["middlegame_black"]
    with make_client(maia2) as c:
        get = lambda e: c.post("/v1/policy", json=body(fen, e, 1500)).json()["moves"]
        assert get(0) == get(900) == get(1099)
        assert get(1099) != get(1100)
        assert get(2000) == get(2600) == get(4000)
        assert get(1999) != get(2000)
        assert get(1350) == get(1399.9)


@pytest.mark.parametrize("name,fen", sorted(POSITIONS.items()))
def test_colour_flipped_position_gives_the_mirrored_policy(maia2, name, fen):
    """Maia sees a Black-to-move board mirrored, so a board and its colour
    flip are the same input to the network: same p, moves mirrored."""
    board = chess.Board(fen)
    flipped = board.mirror()
    if not flipped.is_valid():
        pytest.skip("flip not valid")
    a = as_dict(policy(maia2, board, 1500, 1500))
    b = as_dict(policy(maia2, flipped, 1500, 1500))

    def mirror(uci):
        m = chess.Move.from_uci(uci)
        return chess.Move(
            chess.square_mirror(m.from_square), chess.square_mirror(m.to_square), m.promotion
        ).uci()

    assert {mirror(u): p for u, p in b.items()} == a


def test_obvious_recapture_is_the_top_move(maia2):
    # 1.e4 e5 2.Nf3 Nc6 3.d4 exd4 4.Nxd4 Nxd4: only Qxd4 keeps material level.
    board = chess.Board()
    for san in ["e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Nxd4", "Nxd4"]:
        board.push_san(san)
    for elo in [1100, 1500, 1900]:
        top = policy(maia2, board, elo, elo)[0]
        assert top.uci == "d1d4", (elo, top)
        assert top.p > 0.5, (elo, top)


def test_batched_and_single_agree(maia2):
    from app.policy import policy_batch

    boards = [chess.Board(f) for _, f in sorted(POSITIONS.items())]
    single = [as_dict(policy(maia2, b, 1500, 1500)) for b in boards]
    batched = [as_dict(m) for m in policy_batch(maia2, boards, [1500] * len(boards), [1500] * len(boards))]
    for s, b in zip(single, batched):
        assert set(s) == set(b)
        assert max(abs(s[u] - b[u]) for u in s) <= 1e-5


def test_softmax_policy_rejects_extra_and_missing_keys():
    from app.policy import ScorerContractError

    board = chess.Board()
    logits = {m.uci(): 0.0 for m in board.legal_moves}
    with pytest.raises(ScorerContractError):
        softmax_policy(board, {**logits, "e2e5": 1.0})
    del logits["e2e4"]
    with pytest.raises(ScorerContractError):
        softmax_policy(board, logits)


def test_softmax_policy_rejects_non_finite():
    from app.policy import ScorerContractError

    board = chess.Board()
    logits = {m.uci(): 0.0 for m in board.legal_moves}
    logits["e2e4"] = float("nan")
    with pytest.raises(ScorerContractError):
        softmax_policy(board, logits)


def test_softmax_values():
    board = chess.Board()
    logits = {m.uci(): 0.0 for m in board.legal_moves}
    logits["e2e4"] = 2.0
    moves = softmax_policy(board, logits)
    import math

    expect = math.exp(2) / (math.exp(2) + 19)
    assert moves[0] == MoveP("e2e4", round(expect, 6))
    assert all(m.p == round(1 / (math.exp(2) + 19), 6) for m in moves[1:])


def test_all_torch_work_runs_on_the_loading_thread(maia2):
    """Torch calls from more than one thread start more than one OpenMP team,
    and the teams then fight over the cores: measured 17 ms per request
    instead of 9 (RESULTS.md). Load, warm-up and every forward pass share one
    thread, whichever thread asks."""
    from concurrent.futures import ThreadPoolExecutor

    board = chess.Board(POSITIONS["middlegame_black"])
    before = maia2.forward_count
    maia2.logits([board], [1500], [1500])
    with ThreadPoolExecutor(max_workers=3) as pool:
        for f in [pool.submit(maia2.logits, [board], [1500], [1500]) for _ in range(6)]:
            f.result()
    assert maia2.forward_count == before + 7
    assert maia2.forward_thread_ids == {maia2.load_thread}


def test_the_model_is_warmed_up_at_load(maia2):
    # The first forward pass pays one-off setup; it happens before serving.
    from app.maia2_scorer import Maia2Scorer

    fresh = Maia2Scorer()
    assert fresh.forward_count == 1
    assert fresh.forward_thread_ids == {fresh.load_thread}
    assert fresh.warmup_ms is not None and fresh.warmup_ms > 0
