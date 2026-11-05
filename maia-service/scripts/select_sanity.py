"""Pick the sanity positions from real games, checked with a local Stockfish.

    python scripts/select_sanity.py --evals-json GAMES.json --training-jsonl ROWS.jsonl \\
        --stockfish /usr/games/stockfish --out sanity/positions.json

Inputs (both optional, both from Chessics' own analysed games):
  --evals-json      a list of games, each {"userColor", "moves": [{"ply", "san",
                    "fen_before", ...}]}: every move of the game.
  --training-jsonl  training_positions rows: {"fen", "root_move_san", ...}: the
                    position before a move the user played and later regretted.

Written out: FEN, the key move, the category, and for "hard" positions the
move the human actually played. No names, game ids or links.

Categories, decided before any Maia output was read:

  hard     The user (a club player, about 1300) was to move and did not play
           the engine's best move. The best move is quiet (no capture, no
           check, no promotion), at least 100 cp better than the second-best
           move, and the move the user played lost at least 100 cp against it.
           Ply 10 or later (Maia-2 trained only from ply 10).
  recapture The opponent just captured; the best move takes back on that
           square, at least 200 cp better than the second-best move.
  grab     The best move captures a knight, bishop, rook or queen that nothing
           can take back on that square, at least 200 cp better than the
           second-best move.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import chess
import chess.engine

DEPTH = 18
HARD_GAP_CP = 100
HARD_LOSS_CP = 100
OBVIOUS_GAP_CP = 200
MIN_PLY = 10
VALUE = {chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9}


def cp(score: chess.engine.PovScore, turn: chess.Color) -> int:
    return score.pov(turn).score(mate_score=10000)


def quiet(board: chess.Board, move: chess.Move) -> bool:
    return not (board.is_capture(move) or board.gives_check(move) or move.promotion)


def analyse(engine, board: chess.Board):
    infos = engine.analyse(board, chess.engine.Limit(depth=DEPTH), multipv=3)
    lines = [(i["pv"][0], cp(i["score"], board.turn)) for i in infos if "pv" in i and i["pv"]]
    return lines


def move_value(engine, board: chess.Board, move: chess.Move) -> int:
    after = board.copy()
    after.push(move)
    if after.is_game_over():
        return 10000 if after.is_checkmate() else 0
    info = engine.analyse(after, chess.engine.Limit(depth=DEPTH))
    return cp(info["score"], board.turn)


def candidates(args):
    """(fen, played uci, square the opponent just captured on or None, is_user_move, ply)."""
    if args.evals_json:
        games = json.loads(Path(args.evals_json).read_text())
        for g in games:
            user_white = g["userColor"] == "white"
            captured_on = None
            for m in g["moves"]:
                board = chess.Board(m["fen_before"])
                played = board.parse_san(m["san"])
                is_user = (board.turn == chess.WHITE) == user_white
                yield board.fen(), played.uci(), captured_on, is_user, m["ply"] - 1
                captured_on = played.to_square if board.is_capture(played) else None
    if args.training_jsonl:
        for line in Path(args.training_jsonl).read_text().splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            board = chess.Board(row["fen"])
            played = board.parse_san(row["root_move_san"])
            ply = (board.fullmove_number - 1) * 2 + (0 if board.turn == chess.WHITE else 1)
            yield board.fen(), played.uci(), None, True, ply


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--evals-json")
    ap.add_argument("--training-jsonl")
    ap.add_argument("--stockfish", default="stockfish")
    ap.add_argument("--out", default="sanity/positions.json")
    args = ap.parse_args()

    engine = chess.engine.SimpleEngine.popen_uci(args.stockfish)
    engine.configure({"Threads": 4, "Hash": 256})
    engine_name = engine.id.get("name", "stockfish")
    picked, seen = [], set()
    try:
        for fen, played, captured_on, is_user, ply in candidates(args):
            if fen in seen:
                continue
            seen.add(fen)
            board = chess.Board(fen)
            if board.is_game_over() or board.legal_moves.count() < 2:
                continue
            lines = analyse(engine, board)
            if len(lines) < 2:
                continue
            (best, best_cp), (_, second_cp) = lines[0], lines[1]
            gap = best_cp - second_cp
            entry = {"fen": fen, "key": best.uci(), "key_san": board.san(best),
                     "best_cp": best_cp, "gap_cp": gap, "ply": ply}

            if is_user and ply >= MIN_PLY and played != best.uci() and quiet(board, best) and gap >= HARD_GAP_CP:
                played_move = chess.Move.from_uci(played)
                loss = best_cp - move_value(engine, board, played_move)
                if loss >= HARD_LOSS_CP:
                    picked.append({**entry, "category": "hard", "human": played,
                                   "human_san": board.san(played_move), "human_loss_cp": loss})
                    continue

            if gap < OBVIOUS_GAP_CP or not board.is_capture(best) or ply < MIN_PLY:
                continue
            if captured_on is not None and captured_on == best.to_square:
                picked.append({**entry, "category": "recapture"})
                continue
            target = board.piece_at(best.to_square)
            if target and target.piece_type in VALUE:
                after = board.copy()
                after.push(best)
                if not after.is_attacked_by(after.turn, best.to_square):
                    picked.append({**entry, "category": "grab", "captured": chess.piece_name(target.piece_type)})
    finally:
        engine.quit()

    out = {"engine": f"{engine_name}, depth {DEPTH}, MultiPV 3", "positions": picked}
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(out, indent=1) + "\n")
    counts = {}
    for p in picked:
        counts[p["category"]] = counts.get(p["category"], 0) + 1
    print(f"{len(picked)} positions {counts} -> {args.out}")


if __name__ == "__main__":
    main()
