"""Reading a POST /v1/policy body. Every rejection maps to one contract error."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass

import chess

INVALID_FEN = "invalid_fen"
GAME_OVER = "game_over"
BAD_ELO = "bad_elo"

MAX_BODY_BYTES = 4096
MAX_FEN_CHARS = 120

# Ratings outside this range are not ratings: rejected as bad_elo.
ELO_ACCEPT_MIN = 0
ELO_ACCEPT_MAX = 4000

# maia2 has 11 rating bands: below 1100, then 1100-1199 ... 1900-1999, then
# 2000 and up. Clamping to [1099, 2000] is the tightest range that moves no
# rating into a different band, so 900 and 1099 get the same answer, as do
# 2000 and 2600.
ELO_CLAMP_MIN = 1099
ELO_CLAMP_MAX = 2000


@dataclass(frozen=True)
class PolicyRequest:
    board: chess.Board
    elo_self: int
    elo_oppo: int


def parse_board(fen: object) -> chess.Board | str:
    if not isinstance(fen, str) or len(fen) > MAX_FEN_CHARS:
        return INVALID_FEN
    # Exactly the six FEN fields. python-chess fills in a missing side to move
    # as White, which would answer for the wrong player without saying so.
    if len(fen.split()) != 6:
        return INVALID_FEN
    try:
        board = chess.Board(fen)
    except ValueError:
        return INVALID_FEN
    if not board.is_valid():
        return INVALID_FEN
    return board


def clamp_elo(elo: float) -> int:
    return int(math.floor(min(max(elo, ELO_CLAMP_MIN), ELO_CLAMP_MAX)))


def parse_elo(value: object) -> int | None:
    # bool is an int subclass in Python; true is not a rating.
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    # Python reads NaN and Infinity in JSON. Big ints compare without
    # overflowing, so only floats need the finiteness check.
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if value < ELO_ACCEPT_MIN or value > ELO_ACCEPT_MAX:
        return None
    return clamp_elo(value)


def parse_policy_request(raw: bytes) -> PolicyRequest | str:
    """The request, or the error code to answer with.

    Order: the body and FEN (invalid_fen), then the ratings (bad_elo), then
    whether the position still has a game in it (game_over).
    """
    if len(raw) > MAX_BODY_BYTES:
        return INVALID_FEN
    try:
        body = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        return INVALID_FEN
    if not isinstance(body, dict):
        return INVALID_FEN

    board = parse_board(body.get("fen"))
    if isinstance(board, str):
        return board

    elo_self = parse_elo(body.get("elo_self"))
    elo_oppo = parse_elo(body.get("elo_oppo"))
    if elo_self is None or elo_oppo is None:
        return BAD_ELO

    # Checkmate, stalemate, insufficient material, the 75-move rule. Positions
    # carry no history, so repetition is never detected here.
    if board.is_game_over():
        return GAME_OVER

    return PolicyRequest(board=board, elo_self=elo_self, elo_oppo=elo_oppo)
