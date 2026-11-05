"""Every error code, and auth on and off."""

from __future__ import annotations

import json

import chess
import pytest

from app.main import create_app
from conftest import CHECKMATE, INSUFFICIENT, STALEMATE, StubScorer, body, make_client

START = chess.STARTING_FEN
TOKEN = "s3cret-token-value"


def post_raw(client, raw: bytes | str, headers=None):
    h = {"content-type": "application/json", **(headers or {})}
    return client.post("/v1/policy", content=raw, headers=h)


# ── invalid_fen ──────────────────────────────────────────────────────────────

INVALID_FEN_BODIES = {
    "garbage": body("not a fen"),
    "empty": body(""),
    "missing": {"elo_self": 1350, "elo_oppo": 1420},
    "number": body(12345),
    "null": body(None),
    "four_fields": body("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -"),
    "board_only": body("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"),
    "seven_fields": body(START + " extra"),
    "no_kings": body("8/8/8/8/8/8/8/8 w - - 0 1"),
    "bad_rank": body("rnbqkbnr/ppppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"),
    "side_not_to_move_in_check": body("4k3/8/8/1B6/8/8/P7/4K3 w - - 0 1"),
    "too_long": body(START + " " * 200),
}


@pytest.mark.parametrize("case", sorted(INVALID_FEN_BODIES))
def test_invalid_fen(stub, case):
    with make_client(stub) as c:
        r = c.post("/v1/policy", json=INVALID_FEN_BODIES[case])
    assert r.status_code == 400
    assert r.json() == {"error": "invalid_fen"}


@pytest.mark.parametrize(
    "raw", [b"", b"{", b"[1,2]", b'"a string"', b"null", b"\xff\xfe", b"42"]
)
def test_body_that_is_not_a_json_object_is_invalid_fen(stub, raw):
    with make_client(stub) as c:
        r = post_raw(c, raw)
    assert r.status_code == 400
    assert r.json() == {"error": "invalid_fen"}


def test_oversized_body_is_invalid_fen(stub):
    big = {**body(START), "padding": "x" * 5000}
    with make_client(stub) as c:
        r = post_raw(c, json.dumps(big))
    assert r.status_code == 400
    assert r.json() == {"error": "invalid_fen"}


# ── game_over ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("fen", [CHECKMATE, STALEMATE, INSUFFICIENT])
def test_game_over(stub, fen):
    b = chess.Board(fen)
    assert b.is_checkmate() or b.is_stalemate() or b.is_insufficient_material()
    with make_client(stub) as c:
        r = c.post("/v1/policy", json=body(fen))
    assert r.status_code == 400
    assert r.json() == {"error": "game_over"}


def test_seventy_five_move_rule_is_game_over(stub):
    fen = "8/5pk1/6p1/8/3R4/6P1/5PK1/3r4 w - - 150 120"
    with make_client(stub) as c:
        r = c.post("/v1/policy", json=body(fen))
    assert r.json() == {"error": "game_over"}


# ── bad_elo ──────────────────────────────────────────────────────────────────

BAD_ELOS = {
    "string": "1350",
    "null": None,
    "true": True,
    "false": False,
    "negative": -1,
    "too_high": 4001,
    "huge_int": 10**400,
    "list": [1350],
    "object": {"elo": 1350},
}


@pytest.mark.parametrize("which", ["elo_self", "elo_oppo"])
@pytest.mark.parametrize("case", sorted(BAD_ELOS))
def test_bad_elo(stub, which, case):
    b = body(START)
    b[which] = BAD_ELOS[case]
    with make_client(stub) as c:
        r = c.post("/v1/policy", json=b)
    assert r.status_code == 400
    assert r.json() == {"error": "bad_elo"}


@pytest.mark.parametrize("which", ["elo_self", "elo_oppo"])
def test_missing_elo(stub, which):
    b = body(START)
    del b[which]
    with make_client(stub) as c:
        r = c.post("/v1/policy", json=b)
    assert r.json() == {"error": "bad_elo"}


@pytest.mark.parametrize("literal", ["NaN", "Infinity", "-Infinity", "1e400"])
def test_non_finite_elo(stub, literal):
    raw = f'{{"fen": "{START}", "elo_self": {literal}, "elo_oppo": 1420}}'
    with make_client(stub) as c:
        r = post_raw(c, raw)
    assert r.status_code == 400
    assert r.json() == {"error": "bad_elo"}


@pytest.mark.parametrize("elo", [0, 4000, 1350.5, 800, 2900])
def test_edge_and_fractional_elos_are_accepted(stub, elo):
    with make_client(stub) as c:
        r = c.post("/v1/policy", json=body(START, elo, elo))
    assert r.status_code == 200


def test_error_precedence(stub):
    with make_client(stub) as c:
        # A bad FEN wins over a bad rating; a bad rating wins over game over.
        assert c.post("/v1/policy", json=body("nope", "x", "x")).json() == {"error": "invalid_fen"}
        assert c.post("/v1/policy", json=body(CHECKMATE, "x", 1)).json() == {"error": "bad_elo"}


# ── auth ─────────────────────────────────────────────────────────────────────


def test_auth_off_needs_no_header(stub):
    with make_client(stub, token=None) as c:
        assert c.post("/v1/policy", json=body(START)).status_code == 200
        # A header sent anyway is ignored when auth is off.
        r = c.post("/v1/policy", json=body(START), headers={"authorization": "Bearer x"})
        assert r.status_code == 200


@pytest.mark.parametrize(
    "header",
    [
        None,
        "",
        "Bearer",
        "Bearer ",
        "Bearer wrong",
        f"Bearer {TOKEN}x",
        f"Bearer {TOKEN[:-1]}",
        f"Basic {TOKEN}",
        TOKEN,
        f"Bearer  {TOKEN}",
    ],
)
def test_auth_on_rejects(stub, header):
    headers = {} if header is None else {"authorization": header}
    with make_client(stub, token=TOKEN) as c:
        r = c.post("/v1/policy", json=body(START), headers=headers)
    assert r.status_code == 401
    assert r.json() == {"error": "unauthorized"}


@pytest.mark.parametrize("scheme", ["Bearer", "bearer", "BEARER"])
def test_auth_on_accepts_the_token(stub, scheme):
    with make_client(stub, token=TOKEN) as c:
        r = c.post("/v1/policy", json=body(START), headers={"authorization": f"{scheme} {TOKEN}"})
    assert r.status_code == 200
    assert {m["uci"] for m in r.json()["moves"]} == {m.uci() for m in chess.Board().legal_moves}


def test_auth_is_checked_before_the_body(stub):
    with make_client(stub, token=TOKEN) as c:
        r = c.post("/v1/policy", json=body("nope"))
    assert r.status_code == 401
    assert r.json() == {"error": "unauthorized"}


def test_health_is_open_when_auth_is_on(stub):
    with make_client(stub, token=TOKEN) as c:
        assert c.get("/health").json() == {"ok": True, "model": "stub"}


def test_token_from_env(monkeypatch, stub):
    from fastapi.testclient import TestClient

    monkeypatch.setenv("MAIA_TOKEN", TOKEN)
    with TestClient(create_app(scorer_factory=lambda: stub)) as c:
        assert c.post("/v1/policy", json=body(START)).status_code == 401
        ok = c.post("/v1/policy", json=body(START), headers={"authorization": f"Bearer {TOKEN}"})
        assert ok.status_code == 200
    monkeypatch.delenv("MAIA_TOKEN")
    with TestClient(create_app(scorer_factory=lambda: stub)) as c:
        assert c.post("/v1/policy", json=body(START)).status_code == 200


@pytest.mark.parametrize("blank", ["", "   ", "\t"])
def test_blank_token_refuses_to_start(blank, monkeypatch):
    with pytest.raises(RuntimeError, match="blank"):
        create_app(scorer_factory=StubScorer, token=blank)
    monkeypatch.setenv("MAIA_TOKEN", blank)
    with pytest.raises(RuntimeError, match="blank"):
        create_app(scorer_factory=StubScorer)


def test_no_docs_routes(stub):
    with make_client(stub) as c:
        for path in ["/docs", "/redoc", "/openapi.json"]:
            assert c.get(path).status_code == 404
