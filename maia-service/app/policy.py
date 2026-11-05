"""Move policy: turn a scorer's raw logits into the response the API promises.

The scorer (the model) is behind the `MoveScorer` protocol so the request
handling, legality, normalisation and ordering can be tested without the
weights. Everything the contract promises is enforced here, not in the model:

* every legal move exactly once, nothing else
* p is a softmax over the legal moves only, so it sums to 1
* sorted by p descending, ties broken by uci ascending
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Protocol, Sequence

import chess

# Decimal places kept on p. With at most 218 legal moves the rounding error on
# the sum is at most 218 * 0.5e-6 = 1.1e-4, inside the contract's 0.001.
P_DECIMALS = 6


class MoveScorer(Protocol):
    """A model that scores moves.

    `logits` gets boards in their real orientation and returns, for each
    board, one finite logit per legal move keyed by python-chess UCI. It must
    not return a key for an illegal move and must not leave a legal move out.
    """

    model_name: str

    def logits(
        self,
        boards: Sequence[chess.Board],
        elos_self: Sequence[int],
        elos_oppo: Sequence[int],
    ) -> list[dict[str, float]]: ...


class ScorerContractError(RuntimeError):
    """The model returned something the API cannot pass on. A server bug."""


@dataclass(frozen=True)
class MoveP:
    uci: str
    p: float


def legal_ucis(board: chess.Board) -> set[str]:
    return {move.uci() for move in board.legal_moves}


def softmax_policy(board: chess.Board, logits: dict[str, float]) -> list[MoveP]:
    """Softmax over the legal moves of `board`, sorted, rounded."""
    legal = legal_ucis(board)
    keys = set(logits)
    if keys != legal:
        missing = sorted(legal - keys)
        extra = sorted(keys - legal)
        raise ScorerContractError(
            f"scorer keys do not match legal moves: missing={missing} extra={extra}"
        )
    values = [float(logits[k]) for k in legal]
    if not all(math.isfinite(v) for v in values):
        raise ScorerContractError("scorer returned a non-finite logit")

    top = max(values)
    weights = {k: math.exp(float(logits[k]) - top) for k in legal}
    total = math.fsum(weights.values())
    moves = [MoveP(k, round(w / total, P_DECIMALS)) for k, w in weights.items()]
    moves.sort(key=lambda m: (-m.p, m.uci))
    return moves


def policy(
    scorer: MoveScorer, board: chess.Board, elo_self: int, elo_oppo: int
) -> list[MoveP]:
    (logits,) = scorer.logits([board], [elo_self], [elo_oppo])
    return softmax_policy(board, logits)


def policy_batch(
    scorer: MoveScorer,
    boards: Sequence[chess.Board],
    elos_self: Sequence[int],
    elos_oppo: Sequence[int],
) -> list[list[MoveP]]:
    all_logits = scorer.logits(boards, elos_self, elos_oppo)
    if len(all_logits) != len(boards):
        raise ScorerContractError("scorer returned the wrong number of rows")
    return [softmax_policy(b, lg) for b, lg in zip(boards, all_logits)]
