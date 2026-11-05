"""Latency on this machine's CPU.

    python scripts/bench.py positions [--out bench/positions.txt]   # make the set
    python scripts/bench.py run [--out results/bench.json]          # measure

`positions` builds 200 varied positions by Maia-2 self-play (moves sampled
from the policy, ratings 1100-1900, fixed seed), plus 4 fixed extremes. They are synthetic games, written once and
committed, so the measurement can be repeated on another machine.

`run` measures, in this order:
  cold    process start -> /health answers, then the first request, 3 times
  http    warm round trips through uvicorn on localhost (client and server ms)
  forward warm in-process policy() per position at 1, 2 and all threads
  batch   one forward pass over N positions, per-position cost
  memory  the server's resident set after load and after the warm run

    python scripts/bench.py remote --url https://... [--rounds 3]

`remote` measures warm round trips against a running service (MAIA_TOKEN from
the environment, if auth is on).
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import random
import statistics
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import chess

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

FIXED = [
    chess.STARTING_FEN,
    "R6R/3Q4/1Q4Q1/4Q3/2Q4Q/Q4Q2/pp1Q4/kBNN1KB1 w - - 0 1",  # 218 legal moves
    "4k3/8/8/8/8/8/4q3/4K3 w - - 0 1",  # one legal move
    "k7/8/8/8/8/8/p7/1N5K b - - 0 1",  # black promotes
]


def pct(xs, q):
    xs = sorted(xs)
    i = (len(xs) - 1) * q
    lo, hi = int(i), min(int(i) + 1, len(xs) - 1)
    return xs[lo] + (xs[hi] - xs[lo]) * (i - lo)


def summary(xs):
    return {
        "n": len(xs),
        "p50": round(pct(xs, 0.5), 2),
        "p95": round(pct(xs, 0.95), 2),
        "mean": round(statistics.fmean(xs), 2),
        "min": round(min(xs), 2),
        "max": round(max(xs), 2),
    }


def make_positions(out: Path, target: int = 200, seed: int = 0) -> None:
    from app.maia2_scorer import Maia2Scorer
    from app.policy import policy

    rng = random.Random(seed)
    scorer = Maia2Scorer()
    picked: list[str] = list(FIXED)
    while len(set(picked)) < len(FIXED) + target:
        elo = rng.choice([1100, 1300, 1500, 1700, 1900])
        board = chess.Board()
        plies = rng.randint(40, 120)
        keep = set(rng.sample(range(4, plies), 8))
        for ply in range(plies):
            if board.is_game_over():
                break
            moves = policy(scorer, board, elo, elo)
            r = rng.random()
            acc = 0.0
            choice = moves[-1].uci
            for m in moves:
                acc += m.p
                if acc >= r:
                    choice = m.uci
                    break
            board.push_uci(choice)
            if ply in keep and not board.is_game_over():
                picked.append(board.fen())
    seen = []
    for f in picked:
        if f not in seen:
            seen.append(f)
    seen = seen[: len(FIXED) + target]
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(seen) + "\n")
    print(f"wrote {len(seen)} positions to {out}")


def machine() -> dict:
    info = {"python": platform.python_version(), "platform": platform.platform()}
    try:
        cpu = Path("/proc/cpuinfo").read_text()
        info["cpu_model"] = next(l.split(":", 1)[1].strip() for l in cpu.splitlines() if l.startswith("model name"))
        flags = next(l for l in cpu.splitlines() if l.startswith("flags"))
        info["avx512"] = "avx512f" in flags
        info["avx2"] = "avx2" in flags
    except (OSError, StopIteration):
        pass
    info["logical_cpus"] = os.cpu_count()
    try:
        mem = Path("/proc/meminfo").read_text().splitlines()
        info["ram_total_gb"] = round(int(mem[0].split()[1]) / 1024 / 1024, 1)
    except OSError:
        pass
    import torch

    info["torch"] = torch.__version__
    info["torch_threads_default"] = torch.get_num_threads()
    return info


def rss_mb(pid: int) -> dict:
    status = Path(f"/proc/{pid}/status").read_text().splitlines()
    out = {}
    for line in status:
        if line.startswith(("VmRSS", "VmHWM")):
            k, v = line.split(":")
            out[k] = round(int(v.split()[0]) / 1024, 1)
    return out


def post(port, fen, elo_self=1500, elo_oppo=1500):
    data = json.dumps({"fen": fen, "elo_self": elo_self, "elo_oppo": elo_oppo}).encode()
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/v1/policy", data=data, headers={"content-type": "application/json"}
    )
    t = time.perf_counter()
    with urllib.request.urlopen(req, timeout=30) as r:
        body = json.loads(r.read())
    return (time.perf_counter() - t) * 1000, body


def start_server(port: int, threads: int | None = None):
    env = {**os.environ, "PYTHONUNBUFFERED": "1"}
    env.pop("MAIA_TOKEN", None)
    if threads:
        env["MAIA_THREADS"] = str(threads)
    t0 = time.perf_counter()
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "--factory", "app.main:create_app",
         "--host", "127.0.0.1", "--port", str(port), "--workers", "1", "--no-access-log"],
        cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    while True:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1) as r:
                if r.status == 200:
                    break
        except OSError:
            pass
        if proc.poll() is not None:
            raise SystemExit("server exited during startup")
        time.sleep(0.05)
    return proc, (time.perf_counter() - t0) * 1000


def measure_forward(fens, threads, passes=3):
    """policy() per position in a fresh process, so the thread count holds."""
    code = f"""
import json, sys, time, torch
sys.path.insert(0, {str(ROOT)!r})
torch.set_num_threads({threads})
import chess
from app.maia2_scorer import Maia2Scorer
from app.policy import policy
s = Maia2Scorer()
fens = json.loads(sys.stdin.read())
for f in fens[:10]:
    policy(s, chess.Board(f), 1500, 1500)
out = []
for _ in range({passes}):
    for f in fens:
        b = chess.Board(f)
        t = time.perf_counter()
        policy(s, b, 1500, 1500)
        out.append((time.perf_counter() - t) * 1000)
print(json.dumps(out))
"""
    r = subprocess.run([sys.executable, "-c", code], input=json.dumps(fens), capture_output=True, text=True, check=True)
    return json.loads(r.stdout.strip().splitlines()[-1])


def measure_batch(fens, sizes, threads):
    code = f"""
import json, sys, time, torch
sys.path.insert(0, {str(ROOT)!r})
torch.set_num_threads({threads})
import chess
from app.maia2_scorer import Maia2Scorer
from app.policy import policy_batch
s = Maia2Scorer()
fens = json.loads(sys.stdin.read())
boards = [chess.Board(f) for f in fens]
res = {{}}
for n in {sizes!r}:
    groups = [boards[i:i + n] for i in range(0, len(boards) - n + 1, n)]
    policy_batch(s, groups[0], [1500] * n, [1500] * n)  # warm this shape
    t = time.perf_counter()
    for g in groups:
        policy_batch(s, g, [1500] * n, [1500] * n)
    total = (time.perf_counter() - t) * 1000
    res[n] = {{"batches": len(groups), "ms_per_batch": round(total / len(groups), 2),
              "ms_per_position": round(total / (len(groups) * n), 2)}}
print(json.dumps(res))
"""
    r = subprocess.run([sys.executable, "-c", code], input=json.dumps(fens), capture_output=True, text=True, check=True)
    return json.loads(r.stdout.strip().splitlines()[-1])


def run(out: Path, positions: Path) -> None:
    fens = [l for l in positions.read_text().splitlines() if l.strip()]
    result = {"machine": machine(), "positions": len(fens), "source": str(positions.relative_to(ROOT))}
    all_threads = os.cpu_count() or 1
    port = 8791

    cold = []
    for i in range(3):
        proc, ready_ms = start_server(port)
        first_ms, body = post(port, fens[i + 4])
        cold.append({"start_to_health_ms": round(ready_ms), "first_request_client_ms": round(first_ms, 1),
                     "first_request_server_ms": body["ms"]})
        proc.terminate()
        proc.wait()
    result["cold"] = cold
    print("cold", cold, flush=True)

    proc, _ = start_server(port)
    try:
        result["memory_after_load_mb"] = rss_mb(proc.pid)
        for f in fens[:10]:
            post(port, f)
        client, server = [], []
        for _ in range(3):
            for f in fens:
                c, body = post(port, f)
                client.append(c)
                server.append(body["ms"])
        result["http"] = {"client_round_trip_ms": summary(client), "server_ms_field": summary(server),
                          "threads": "torch default"}
        result["memory_after_warm_mb"] = rss_mb(proc.pid)
    finally:
        proc.terminate()
        proc.wait()
    print("http", result["http"], flush=True)

    result["forward"] = {}
    for t in sorted({1, 2, all_threads}):
        result["forward"][f"threads_{t}"] = summary(measure_forward(fens, t))
        print("forward", t, result["forward"][f"threads_{t}"], flush=True)

    result["batch"] = {}
    for t in sorted({1, all_threads}):
        result["batch"][f"threads_{t}"] = measure_batch(fens, [1, 8, 32, 64], t)
        print("batch", t, result["batch"][f"threads_{t}"], flush=True)

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2) + "\n")
    print(f"wrote {out}")


def remote(url: str, token: str | None, positions: Path, rounds: int = 3) -> dict:
    """Warm round trips against a running service (e.g. the deployed one)."""
    fens = [l for l in positions.read_text().splitlines() if l.strip()]
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = f"Bearer {token}"

    def call(fen):
        data = json.dumps({"fen": fen, "elo_self": 1500, "elo_oppo": 1500}).encode()
        req = urllib.request.Request(url.rstrip("/") + "/v1/policy", data=data, headers=headers)
        t = time.perf_counter()
        with urllib.request.urlopen(req, timeout=30) as r:
            body = json.loads(r.read())
        return (time.perf_counter() - t) * 1000, body["ms"]

    first = call(fens[4])
    for f in fens[:10]:
        call(f)
    client, server = [], []
    for _ in range(rounds):
        for f in fens:
            c, s = call(f)
            client.append(c)
            server.append(s)
    return {"url": url, "first_request_ms": [round(first[0], 1), first[1]],
            "client_round_trip_ms": summary(client), "server_ms_field": summary(server)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["positions", "run", "remote"])
    ap.add_argument("--out")
    ap.add_argument("--positions", default=str(ROOT / "bench" / "positions.txt"))
    ap.add_argument("--url", help="remote: the service's base URL")
    ap.add_argument("--rounds", type=int, default=3)
    args = ap.parse_args()
    if args.cmd == "positions":
        make_positions(Path(args.out or ROOT / "bench" / "positions.txt"))
    elif args.cmd == "remote":
        res = remote(args.url, os.environ.get("MAIA_TOKEN"), Path(args.positions), args.rounds)
        print(json.dumps(res, indent=2))
        if args.out:
            Path(args.out).write_text(json.dumps(res, indent=2) + "\n")
    else:
        run(Path(args.out or ROOT / "results" / "bench.json"), Path(args.positions))


if __name__ == "__main__":
    main()
