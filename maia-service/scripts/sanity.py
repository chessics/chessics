"""Is the policy right, not only fast? Run against the real weights.

    python scripts/sanity.py --positions sanity/positions.json \\
        [--evals-json GAMES.json] --out results/sanity.json

Pass criteria, written before any of these numbers were produced (the start
position and 1.e4 policies had been seen once, in a manual request):

  hard       quiet engine moves a club player missed in a real game
    H1  median p(key) rises 1100 -> 1500 -> 1900, and p(key) at 1900 is above
        p(key) at 1100 in at least 60% of positions
    H2  median p(key) at 1300 is at most 0.25 (a ~1300 mostly does not find it)
  obvious    recaptures and free pieces (categories recapture + grab)
    O1  key move is the top move in at least 80% of positions at each rating
    O2  key move is in the top 3 in at least 95% at each rating
    O3  median p(key) at least 0.5 at each rating
  openings   book moves from general chess knowledge, not explorer counts
    B1  at ply 10 and later (inside Maia-2's training window): the top move is
        a book move and book moves hold at least half of p, at all three
        ratings, in at least 80% of positions
    B2  before ply 10 (outside the window): reported, and the same test applied
  move match (only with --evals-json): every move from ply 10 on in real games
    M1  Maia's top move equals the move played in at least 40% of positions at
        1300 (players' ratings are not in the data; they are club players)
    M2  White and Black move-match within 10 points of each other (a broken
        mirror for Black would show here)
    M3  Maia matches the human more often than the stored engine best move does
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path

import chess

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

ELOS = [1100, 1300, 1500, 1900]
GATED = [1100, 1500, 1900]


def line(*sans):
    b = chess.Board()
    for s in sans:
        b.push_san(s)
    return b


# (name, moves, book moves in UCI). Ply = number of moves played.
OPENINGS = [
    ("start", [], {"e2e4", "d2d4", "g1f3", "c2c4"}),
    ("1.e4", ["e4"], {"e7e5", "c7c5", "e7e6", "c7c6", "d7d5", "d7d6", "g7g6"}),
    ("1.d4", ["d4"], {"d7d5", "g8f6", "e7e6", "f7f5", "g7g6", "d7d6"}),
    ("1.e4 e5", ["e4", "e5"], {"g1f3", "b1c3", "f1c4", "f2f4", "d2d4"}),
    ("1.e4 c5", ["e4", "c5"], {"g1f3", "b1c3", "c2c3", "d2d4", "f2f4"}),
    ("1.d4 d5", ["d4", "d5"], {"c2c4", "g1f3", "c1f4", "e2e3", "c1g5", "b1c3"}),
    ("1.e4 e5 2.Nf3", ["e4", "e5", "Nf3"], {"b8c6", "g8f6", "d7d6"}),
    ("1.d4 d5 2.c4", ["d4", "d5", "c4"], {"e7e6", "c7c6", "d5c4", "g8f6", "e7e5", "b8c6", "c8f5"}),
    ("1.e4 e5 2.Nf3 Nc6", ["e4", "e5", "Nf3", "Nc6"], {"f1b5", "f1c4", "d2d4", "b1c3"}),
    ("Italian 3.Bc4", ["e4", "e5", "Nf3", "Nc6", "Bc4"], {"f8c5", "g8f6", "f8e7", "d7d6"}),
    ("Ruy Lopez 3...a6", ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"], {"b5a4", "b5c6"}),
    ("Open Sicilian 3...cxd4", ["e4", "c5", "Nf3", "d6", "d4", "cxd4"], {"f3d4", "d1d4"}),
    ("Ruy Lopez 5...Be7", ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7"],
     {"f1e1", "a4c6", "d2d3", "d1e2", "d2d4", "b1c3"}),
    ("Italian 5...d6", ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d3", "d6"],
     {"e1g1", "b1d2", "h2h3", "a2a4", "b2b4", "c4b3", "c1e3", "c1g5"}),
    ("QGD 5...O-O", ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Be7", "e3", "O-O"],
     {"g1f3", "a1c1", "d1c2", "f1d3", "c4d5"}),
    ("Najdorf 5...a6", ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"],
     {"c1e3", "c1g5", "f1e2", "f2f3", "f2f4", "f1c4", "h2h3", "g2g3", "a2a4"}),
    ("London 5...Nc6", ["d4", "d5", "Bf4", "Nf6", "e3", "e6", "Nf3", "c5", "c3", "Nc6"],
     {"b1d2", "f1d3", "h2h3", "a2a3", "f1e2", "f1b5", "d1b3"}),
]


def run_policy(scorer, fen, elo):
    from app.policy import policy

    return policy(scorer, chess.Board(fen), elo, elo)


def rank_and_p(moves, uci):
    for i, m in enumerate(moves):
        if m.uci == uci:
            return i + 1, m.p
    raise KeyError(uci)


def frac(xs):
    return round(sum(xs) / len(xs), 3) if xs else None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--positions", default=str(ROOT / "sanity" / "positions.json"))
    ap.add_argument("--evals-json")
    ap.add_argument("--out", default=str(ROOT / "results" / "sanity.json"))
    args = ap.parse_args()

    from app.maia2_scorer import Maia2Scorer

    scorer = Maia2Scorer()
    data = json.loads(Path(args.positions).read_text())
    report = {"selected_with": data["engine"], "elos": ELOS}

    rows = []
    for pos in data["positions"]:
        row = {k: pos[k] for k in ("category", "fen", "key", "key_san", "gap_cp", "ply")}
        if pos["category"] == "hard":
            row.update(human=pos["human"], human_san=pos["human_san"], human_loss_cp=pos["human_loss_cp"])
        for elo in ELOS:
            moves = run_policy(scorer, pos["fen"], elo)
            r, p = rank_and_p(moves, pos["key"])
            row[f"p{elo}"], row[f"rank{elo}"] = round(p, 4), r
            row[f"top{elo}"] = moves[0].uci
            if pos["category"] == "hard":
                row[f"human_p{elo}"] = round(rank_and_p(moves, pos["human"])[1], 4)
        rows.append(row)
    report["positions"] = rows

    hard = [r for r in rows if r["category"] == "hard"]
    obvious = [r for r in rows if r["category"] in ("recapture", "grab")]
    checks = {}
    if hard:
        med = {e: round(statistics.median(r[f"p{e}"] for r in hard), 4) for e in ELOS}
        rises = frac([r["p1900"] > r["p1100"] for r in hard])
        checks["H1"] = {"median_p": med, "share_rising_1100_to_1900": rises,
                        "pass": med[1100] < med[1500] < med[1900] and rises >= 0.6}
        checks["H2"] = {"median_p_1300": med[1300], "share_top1_at_1300": frac([r["rank1300"] == 1 for r in hard]),
                        "median_p_human_move_1300": round(statistics.median(r["human_p1300"] for r in hard), 4),
                        "pass": med[1300] <= 0.25}
    if obvious:
        o = {}
        for e in GATED:
            o[e] = {"top1": frac([r[f"rank{e}"] == 1 for r in obvious]),
                    "top3": frac([r[f"rank{e}"] <= 3 for r in obvious]),
                    "median_p": round(statistics.median(r[f"p{e}"] for r in obvious), 4)}
        checks["O1"] = {"top1": {e: o[e]["top1"] for e in GATED}, "pass": all(o[e]["top1"] >= 0.8 for e in GATED)}
        checks["O2"] = {"top3": {e: o[e]["top3"] for e in GATED}, "pass": all(o[e]["top3"] >= 0.95 for e in GATED)}
        checks["O3"] = {"median_p": {e: o[e]["median_p"] for e in GATED}, "pass": all(o[e]["median_p"] >= 0.5 for e in GATED)}

    books = []
    for name, sans, book in OPENINGS:
        b = line(*sans)
        assert book <= {m.uci() for m in b.legal_moves}, name
        entry = {"name": name, "ply": len(sans), "fen": b.fen(), "book": sorted(book)}
        ok = True
        for e in ELOS:
            moves = run_policy(scorer, b.fen(), e)
            mass = sum(m.p for m in moves if m.uci in book)
            entry[str(e)] = {"top3": [(m.uci, round(m.p, 3)) for m in moves[:3]], "book_mass": round(mass, 3)}
            if e in GATED:
                ok = ok and moves[0].uci in book and mass >= 0.5
        entry["pass"] = ok
        books.append(entry)
    report["openings"] = books
    inside = [x for x in books if x["ply"] >= 10]
    outside = [x for x in books if x["ply"] < 10]
    checks["B1"] = {"passed": f"{sum(x['pass'] for x in inside)}/{len(inside)}",
                    "pass": frac([x["pass"] for x in inside]) >= 0.8}
    checks["B2"] = {"passed": f"{sum(x['pass'] for x in outside)}/{len(outside)}",
                    "pass": frac([x["pass"] for x in outside]) >= 0.8}

    if args.evals_json:
        games = json.loads(Path(args.evals_json).read_text())
        match = {e: {"white": [], "black": []} for e in ELOS}
        engine_match = []
        for g in games:
            for m in g["moves"]:
                if m["ply"] - 1 < 10:
                    continue
                board = chess.Board(m["fen_before"])
                played = board.parse_san(m["san"]).uci()
                side = "white" if board.turn == chess.WHITE else "black"
                if m.get("best_move"):
                    engine_match.append(m["best_move"] == played)
                for e in ELOS:
                    match[e][side].append(run_policy(scorer, board.fen(), e)[0].uci == played)
        mm = {e: {"all": frac(match[e]["white"] + match[e]["black"]),
                  "white": frac(match[e]["white"]), "black": frac(match[e]["black"]),
                  "n": len(match[e]["white"]) + len(match[e]["black"])} for e in ELOS}
        report["move_match"] = {"maia": mm, "stored_engine_best": frac(engine_match), "engine_n": len(engine_match)}
        checks["M1"] = {"top1_1300": mm[1300]["all"], "pass": mm[1300]["all"] >= 0.4}
        checks["M2"] = {"white": mm[1300]["white"], "black": mm[1300]["black"],
                        "pass": abs(mm[1300]["white"] - mm[1300]["black"]) <= 0.10}
        checks["M3"] = {"maia_1300": mm[1300]["all"], "engine": frac(engine_match),
                        "pass": mm[1300]["all"] > frac(engine_match)}

    report["checks"] = checks
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(report, indent=1) + "\n")
    for k, v in checks.items():
        print(k, "PASS" if v["pass"] else "FAIL", {a: b for a, b in v.items() if a != "pass"})


if __name__ == "__main__":
    main()
