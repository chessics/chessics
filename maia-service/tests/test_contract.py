"""The /v1/policy and /health contract, against the stub and the real model."""

from __future__ import annotations

import chess
import pytest

from conftest import (
    POSITIONS,
    ConstantScorer,
    DroppingScorer,
    LargeLogitScorer,
    StubScorer,
    body,
    legal,
    make_client,
)

ALL = sorted(POSITIONS.items())


def test_positions_are_what_they_claim():
    for name, fen in POSITIONS.items():
        b = chess.Board(fen)
        assert b.is_valid() and not b.is_game_over(), name
    assert len(legal(POSITIONS["max_legal_moves"])) == 218
    assert chess.Board(POSITIONS["black_after_e4"]).turn == chess.BLACK
    b = chess.Board(POSITIONS["white_castles_both"])
    assert {"e1g1", "e1c1"} <= legal(b.fen())
    b = chess.Board(POSITIONS["black_castles_both"])
    assert {"e8g8", "e8c8"} <= legal(b.fen())
    assert "e5d6" in legal(POSITIONS["white_en_passant"])
    assert "d4e3" in legal(POSITIONS["black_en_passant"])
    assert {"a7a8q", "a7a8n", "a7b8r"} <= legal(POSITIONS["white_promotes"])
    assert {"a2a1q", "a2a1n", "a2b1b"} <= legal(POSITIONS["black_promotes"])
    assert chess.Board(POSITIONS["white_in_check"]).is_check()
    assert legal(POSITIONS["white_in_check"]) == {"e1e2"}  # one forced move
    assert chess.Board(POSITIONS["black_in_check"]).is_check()


def test_health(any_scorer):
    with make_client(any_scorer) as c:
        r = c.get("/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "model": any_scorer.model_name}


def test_real_model_name(maia2):
    assert maia2.model_name == "maia2-rapid"
    with make_client(maia2) as c:
        assert c.get("/health").json() == {"ok": True, "model": "maia2-rapid"}
        r = c.post("/v1/policy", json=body(chess.STARTING_FEN))
    assert r.json()["model"] == "maia2-rapid"


@pytest.mark.parametrize("name,fen", ALL)
def test_contract_shape(any_scorer, name, fen):
    with make_client(any_scorer) as c:
        r = c.post("/v1/policy", json=body(fen))
    assert r.status_code == 200, r.text
    data = r.json()
    assert set(data) == {"moves", "model", "ms"}
    assert data["model"] == any_scorer.model_name
    assert isinstance(data["ms"], int) and not isinstance(data["ms"], bool)
    assert data["ms"] >= 0
    assert isinstance(data["moves"], list) and data["moves"]
    for m in data["moves"]:
        assert set(m) == {"uci", "p"}
        assert isinstance(m["uci"], str)
        assert isinstance(m["p"], float)
        assert 0.0 <= m["p"] <= 1.0


@pytest.mark.parametrize("name,fen", ALL)
def test_every_legal_move_exactly_once(any_scorer, name, fen):
    with make_client(any_scorer) as c:
        moves = c.post("/v1/policy", json=body(fen)).json()["moves"]
    ucis = [m["uci"] for m in moves]
    assert len(ucis) == len(set(ucis)), "a move appears twice"
    assert set(ucis) == legal(fen)


@pytest.mark.parametrize("name,fen", ALL)
def test_probabilities_sum_to_one(any_scorer, name, fen):
    with make_client(any_scorer) as c:
        moves = c.post("/v1/policy", json=body(fen)).json()["moves"]
    assert abs(sum(m["p"] for m in moves) - 1.0) <= 0.001


@pytest.mark.parametrize("name,fen", ALL)
def test_sorted_by_p_descending(any_scorer, name, fen):
    with make_client(any_scorer) as c:
        moves = c.post("/v1/policy", json=body(fen)).json()["moves"]
    ps = [m["p"] for m in moves]
    assert ps == sorted(ps, reverse=True)
    if len(ps) == 1:
        assert ps == [1.0]  # a forced move
    else:
        # Not all the same, so the order carries information (stub and model).
        assert ps[0] > ps[-1]


def test_ties_are_broken_by_uci_ascending():
    with make_client(ConstantScorer()) as c:
        moves = c.post("/v1/policy", json=body(POSITIONS["max_legal_moves"])).json()["moves"]
    ucis = [m["uci"] for m in moves]
    assert ucis == sorted(ucis)
    assert len({m["p"] for m in moves}) == 1


def test_sum_holds_with_218_tied_moves():
    # 218 equal shares of 1/218 rounded to 6 places is the worst rounding case.
    with make_client(ConstantScorer()) as c:
        moves = c.post("/v1/policy", json=body(POSITIONS["max_legal_moves"])).json()["moves"]
    assert len(moves) == 218
    assert abs(sum(m["p"] for m in moves) - 1.0) <= 0.001


def test_large_logits_do_not_overflow():
    with make_client(LargeLogitScorer()) as c:
        r = c.post("/v1/policy", json=body(POSITIONS["max_legal_moves"]))
    assert r.status_code == 200
    moves = r.json()["moves"]
    assert abs(sum(m["p"] for m in moves) - 1.0) <= 0.001
    assert moves[0]["p"] > 0.5


def test_a_scorer_that_drops_a_move_is_a_500_not_a_short_list():
    from app.main import create_app
    from fastapi.testclient import TestClient

    app = create_app(scorer_factory=DroppingScorer, token=None)
    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.post("/v1/policy", json=body(chess.STARTING_FEN))
    assert r.status_code == 500
    assert r.json() == {"error": "internal"}


def test_model_is_loaded_once_at_startup():
    loads = []

    def factory():
        s = StubScorer()
        loads.append(s)
        return s

    from app.main import create_app
    from fastapi.testclient import TestClient

    with TestClient(create_app(scorer_factory=factory, token=None)) as c:
        assert len(loads) == 1  # before any request
        for _ in range(5):
            assert c.post("/v1/policy", json=body(chess.STARTING_FEN)).status_code == 200
        assert c.get("/health").status_code == 200
    assert len(loads) == 1
    assert loads[0].calls == 5


@pytest.mark.parametrize("name,fen", ALL)
def test_deterministic(any_scorer, name, fen):
    with make_client(any_scorer) as c:
        a = c.post("/v1/policy", json=body(fen)).json()["moves"]
        b = c.post("/v1/policy", json=body(fen)).json()["moves"]
    with make_client(any_scorer) as c:
        d = c.post("/v1/policy", json=body(fen)).json()["moves"]
    assert a == b == d
