"""Deliberate breaks: each one must make the test suite fail.

    python scripts/mutate.py            # needs the weights for the model breaks

Each break replaces one exact snippet in one file, runs pytest, and puts the
file back. A break the suite survives is reported and the script exits 1.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

BREAKS: list[tuple[str, str, str, str]] = [
    # (file, exact old text, new text, what the break means)
    ("app/policy.py", "    if keys != legal:", "    if False:", "accept a scorer whose moves are not the legal moves"),
    ("app/policy.py", "for k, w in weights.items()]", "for k, w in sorted(weights.items())[1:]]", "drop one legal move from the answer"),
    ("app/policy.py", "moves.sort(key=lambda m: (-m.p, m.uci))", "moves.sort(key=lambda m: (m.p, m.uci))", "sort ascending"),
    ("app/policy.py", "moves.sort(key=lambda m: (-m.p, m.uci))", "moves.sort(key=lambda m: -m.p)", "no tie-break on uci"),
    ("app/policy.py", "round(w / total, P_DECIMALS)", "round(w, P_DECIMALS)", "skip normalisation"),
    ("app/policy.py", "P_DECIMALS = 6", "P_DECIMALS = 2", "round p too coarsely for the sum to hold"),
    ("app/policy.py", "math.exp(float(logits[k]) - top)", "math.exp(float(logits[k]))", "softmax without subtracting the max"),
    ("app/policy.py", "    if not all(math.isfinite(v) for v in values):", "    if False:", "pass a NaN logit through"),
    ("app/main.py", "        if expected_bytes is None:\n            return True", "        return True", "auth always passes"),
    ("app/main.py", '        if scheme.lower() != "bearer":', "        if False:", "any auth scheme accepted"),
    ("app/main.py", "return hmac.compare_digest(got.encode(), expected_bytes)", "return got.encode().startswith(expected_bytes)", "token prefix match"),
    ("app/main.py", "if not isinstance(token, str) or not token.strip():", "if not isinstance(token, str):", "blank token silently turns auth off"),
    ("app/main.py", "scorer: MoveScorer = app.state.scorer", "scorer: MoveScorer = factory()", "load the model per request"),
    ("app/main.py", '"model": scorer.model_name,', '"model": "maia2",', "wrong model name"),
    ("app/main.py", '"ms": round((time.perf_counter() - started) * 1000),', '"ms": (time.perf_counter() - started) * 1000,', "ms not an integer"),
    ("app/request.py", "MAX_BODY_BYTES = 4096", "MAX_BODY_BYTES = 1_000_000", "no body size cap"),
    ("app/request.py", "    if len(fen.split()) != 6:", "    if False:", "accept a partial FEN"),
    ("app/request.py", "    if not board.is_valid():", "    if False:", "accept an impossible position"),
    ("app/request.py", "    if board.is_game_over():", "    if False:", "no game_over check"),
    ("app/request.py", "if isinstance(value, bool) or not isinstance", "if not isinstance", "true accepted as a rating"),
    ("app/request.py", "    if value < ELO_ACCEPT_MIN or value > ELO_ACCEPT_MAX:\n        return None", "", "no rating range check"),
    ("app/request.py", "    if isinstance(value, float) and not math.isfinite(value):\n        return None", "", "NaN rating passes"),
    ("app/request.py", "ELO_CLAMP_MIN = 1099", "ELO_CLAMP_MIN = 1100", "clamp moves sub-1100 ratings up a band"),
    ("app/request.py", "ELO_CLAMP_MAX = 2000", "ELO_CLAMP_MAX = 1999", "clamp moves 2000+ ratings down a band"),
    (
        "app/request.py",
        "    elo_self = parse_elo(body.get(\"elo_self\"))\n    elo_oppo = parse_elo(body.get(\"elo_oppo\"))\n    if elo_self is None or elo_oppo is None:\n        return BAD_ELO\n\n    # Checkmate, stalemate, insufficient material, the 75-move rule. Positions\n    # carry no history, so repetition is never detected here.\n    if board.is_game_over():\n        return GAME_OVER\n",
        "    if board.is_game_over():\n        return GAME_OVER\n    elo_self = parse_elo(body.get(\"elo_self\"))\n    elo_oppo = parse_elo(body.get(\"elo_oppo\"))\n    if elo_self is None or elo_oppo is None:\n        return BAD_ELO\n",
        "game_over checked before bad_elo",
    ),
    ("app/maia2_scorer.py", "        self._model.eval()\n", "", "dropout left on (no eval())"),
    ("app/maia2_scorer.py", "self._model(x, es, eo)", "self._model(x, eo, es)", "ratings swapped"),
    ("app/maia2_scorer.py", "seen = board.mirror() if black else board", "seen = board", "Black-to-move board not mirrored"),
    ("app/maia2_scorer.py", "ucis.append(mirror_move(uci) if black else uci)", "ucis.append(uci)", "Black's moves not mirrored back"),
    ("app/maia2_scorer.py", "[map_to_category(e, self._elo_dict) for e in elos_self]", "[map_to_category(e + 100, self._elo_dict) for e in elos_self]", "rating mapped to the wrong band"),
    ("app/maia2_scorer.py", "out.append({u: row[i] for u, i in zip(ucis, indices)})", "out.append({u: row[i + 1] for u, i in zip(ucis, indices)})", "logits read from the wrong vocabulary slot"),
    ("app/maia2_scorer.py", "rows = self._torch.submit(self._forward, x, es, eo).result()", "rows = self._forward(x, es, eo)", "forward pass on the caller's thread"),
    ("app/maia2_scorer.py", "self._torch.submit(self._load, model_dir).result()", "self._load(model_dir)", "model loaded on the caller's thread"),
    ("app/maia2_scorer.py", "max_workers=1, thread_name_prefix", "max_workers=4, thread_name_prefix", "torch work spread over several threads"),
    ("app/maia2_scorer.py", "        started = time.perf_counter()\n        self._forward(x, es, eo)\n", "        started = time.perf_counter()\n", "no warm-up pass at load"),
]


def run_tests() -> int:
    return subprocess.run(
        [sys.executable, "-m", "pytest", "-x", "-q", "-p", "no:warnings"],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    ).returncode


def main() -> int:
    if run_tests() != 0:
        print("suite fails before any break; fix that first")
        return 2
    survived = []
    for i, (rel, old, new, what) in enumerate(BREAKS, 1):
        path = ROOT / rel
        original = path.read_text()
        count = original.count(old)
        if count != 1:
            print(f"{i:2d} SETUP ERROR {rel}: snippet found {count} times: {what}")
            survived.append(what)
            continue
        path.write_text(original.replace(old, new))
        try:
            code = run_tests()
        finally:
            path.write_text(original)
        verdict = "caught" if code != 0 else "SURVIVED"
        print(f"{i:2d} {verdict:8s} {rel}: {what}")
        if code == 0:
            survived.append(what)
    print(f"{len(BREAKS) - len(survived)} of {len(BREAKS)} deliberate breaks caught")
    if run_tests() != 0:
        print("suite fails after restoring; a file was not put back")
        return 2
    return 1 if survived else 0


if __name__ == "__main__":
    sys.exit(main())
