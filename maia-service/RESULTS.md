# Results

Measured on 4 Nov 2026 in a cloud sandbox, with maia2 0.11.0 and the rapid
weights (sha256 `65aae846…e997`, 23.3 M parameters).

**Summary.** Fast enough: a warm request takes a median 20 ms of server time on
one vCPU and 10 ms on four. Memory is about 0.4 GB in a container, and the
service starts serving 3 to 5 s after launch. Moves are right from about ply 3
on: it plays free material and recaptures, and it predicts the human's move
better than an engine does. It is wrong in the first two plies of a game. A
rating changes its choice of a hard move only a little.

## Machine

| | |
|---|---|
| CPU | Intel Xeon @ 2.10 GHz (the sandbox hides the model), 4 vCPU, AVX-512 |
| RAM | 15.7 GB |
| OS | Linux 6.18, Python 3.11.18 |
| torch | 2.8.0+cu128 run on CPU. The CPU-only wheel the Dockerfile uses could not be downloaded here (the sandbox proxy refused download.pytorch.org's file host). The CPU kernels are the same code; memory is not (see below). |

## Latency

Raw output: `results/bench.json` (in-process and local server),
`results/docker-1cpu.json` and `results/docker-2cpu.json` (the runtime image
under CPU limits). Positions: `bench/positions.txt`, 200 positions from Maia
self-play at 1100 to 1900 plus 4 extremes. They have 1 to 218 legal moves and
3 to 32 pieces, and 100 have Black to move. Each latency figure is over 2 or 3 passes of all 204,
after 10 warm-up requests.

**Warm, server-side `ms` (what the API reports):**

| setup | p50 | p95 | client round trip p50 / p95 |
|---|---|---|---|
| container, 1 vCPU, MAIA_THREADS=1 | 20 ms | 26 ms | 21.6 / 28.5 ms |
| container, 2 vCPU, MAIA_THREADS=2 | 14 ms | 18 ms | 15.6 / 20.3 ms |
| local server, 4 vCPU, torch default (4 threads) | 9.5 ms | 14 ms | 11.1 / 16.0 ms |

**Model call alone, in-process** (`policy()`, 612 calls each):

| threads | p50 | p95 |
|---|---|---|
| 1 | 18.7 ms | 23.5 ms |
| 2 | 12.9 ms | 16.6 ms |
| 4 | 7.7 ms | 11.0 ms |

**Cold start:**

| | |
|---|---|
| local process start to `/health` answering | 2.6, 2.8, 3.5 s (three starts) |
| `docker run` to `/health` answering, 1 vCPU | 5.0 s (2 vCPU: 4.7 s) |
| first request after that | 23 to 39 ms server-side |

Start-up is importing torch, checking the weights' sha256, building the
model, and one warm-up forward pass. `/health` answers only after all four, so the first
real request does not pay for the warm-up.

**One fix came out of measuring.** The first version ran the model on
whichever server worker thread took the request: median 17 ms, p95 30 ms on
4 vCPU. Torch called from several threads starts several OpenMP thread teams,
which compete for the same cores (once a second thread had run torch, even the
main thread slowed from 7.7 ms to 14.5 ms). All torch work now runs on one
dedicated thread, which brought it to the 9.5 / 14 ms above. A test pins this.

**Under concurrent load** (runtime image, 1 vCPU, MAIA_THREADS=1, 408
requests per run, client-side latency):

| clients at once | throughput | p50 | p95 |
|---|---|---|---|
| 1 | 42 req/s | 23 ms | 29 ms |
| 4 | 44 req/s | 88 ms | 105 ms |
| 16 | 43 req/s | 371 ms | 424 ms |

One forward pass runs at a time, so extra clients queue: throughput stays
about 43 requests a second and latency grows with the queue. No request failed.

**Batched variant (in-process only; the API is one position per request):**

| batch size | per position, 1 thread | per position, 4 threads |
|---|---|---|
| 1 | 19.7 ms | 8.2 ms |
| 8 | 9.2 ms | 3.8 ms |
| 32 | 7.6 ms | 3.0 ms |
| 64 | 7.9 ms | 2.4 ms |

Batching cuts the cost per position 2.6 to 3.4 times. That matters for bulk work
(scoring stored positions for difficulty), not for one interactive move. It would need a new endpoint; the contract has none, so none was added.

## Memory

| measure | value |
|---|---|
| container memory in use (`docker stats`), after load and after 400 requests | 405 MiB, 406 MiB |
| smallest container limit tested that starts | 768 MB starts and serves; 512 MB is killed out of memory during load |
| process resident set on the host, after load / peak during load | 869 MB / 1.10 GB |
| of which `import torch` alone | 689 MB |

The host resident set counts file-backed pages of the CUDA libraries in this
torch build; the container figure largely does not. The CPU-only build has no
CUDA libraries, so it should need no more, but that was not measured. A
checkpoint of 280 MB holds 93 MB of weights; the rest is the optimiser
state, read once at load and freed.

## Railway cost: an estimate

Rates: 10 USD per GB of memory per month, 20 USD per vCPU per month, billed on use
by the minute, egress 0.05 USD per GB. These come from Railway's documentation as
quoted by a web search on 4 Nov 2026. docs.railway.com was not reachable from
this sandbox, so check them there.

| item | assumption | per month |
|---|---|---|
| memory | 0.4 GB in use around the clock (the container figure); 0.85 GB if Railway counts it like the host resident set | 4 to 8.5 USD |
| CPU | about 20 ms of one vCPU per request; 100,000 requests a month | about 0.02 USD |
| egress | 0.9 KB per response on average (largest 6.1 KB, at 218 legal moves) | under 0.01 USD |
| **total** | | **about 4 to 9 USD a month, almost all of it memory** |

Traffic barely moves it: a million requests a month adds about 0.15 USD of CPU.
Size the service at 1 vCPU and a 1 GB memory limit (the limit is a ceiling;
billing follows use). One vCPU serves about 43 requests a second
(measured above); a game against Maia asks for one move every few seconds, so
that is far more than early traffic needs.

## Sanity: is the policy right?

Raw output: `results/sanity.json`. Positions: `sanity/positions.json`, picked
by `scripts/select_sanity.py` from 12 real rapid games and 133 real
training positions from Chessics' own analysed games, all of club players (about 1300; their ratings are not in the
data). Stockfish 16 at depth 18 on this machine picked and checked them; the
service itself never calls an engine. The pass criteria are in the docstring
of `scripts/sanity.py` and were written before the run. One exception: the start
position and 1.e4 had been seen once, in a manual request.

**Verdict: PASS for move choice from ply 10 on, with two limits.** The policy is
not garbage. It takes free material and obvious recaptures at every rating.
It predicts the move a club player actually played 50% of the time, against
35% for the engine's best move. It gives a quiet engine move that a club
player missed a low weight at 1300 (median 0.19). Limit 1: the first two
plies of a game are wrong. Limit 2: rating moves the hard-move weight only a
little.

| check | result | |
|---|---|---|
| H1 hard-move weight rises with rating | median 0.217 / 0.226 / 0.251 at 1100 / 1500 / 1900; rises 1100→1900 in 61% of positions (bar 60%) | **pass, narrowly** |
| H2 hard move gets low weight at 1300 | median 0.194; top move at 1300 in 6 of 18 | pass |
| O1 recapture / free piece is the top move | 16 of 16 at 1100, 1500 and 1900 | pass |
| O2 in the top 3 | 16 of 16 | pass |
| O3 median weight ≥ 0.5 | 0.826 / 0.870 / 0.902 | pass |
| B1 openings, ply ≥ 10 (book move on top, book ≥ half of p) | 5 of 5 | pass |
| B2 openings, ply < 10 | 7 of 12 | **fail** |
| M1 move-match at 1300, 439 real positions | 50.3% | pass |
| M2 White and Black within 10 points | White 56.8%, Black 43.8% | **fail** (see below) |
| M3 Maia beats the engine's best move at predicting the human | 50.3% vs 34.9% | pass |

### Hard moves: does the weight rise with rating?

18 positions where the engine's best move was quiet (no capture, check or
promotion), at least 100 cp better than the second-best, and the club player
to move played something else that lost at least 100 cp. "Demonstrably
wouldn't find it" here means one real player at about 1300 did not find it in
a real game. That is an n=1 observation per position, not a population rate.
The population data that would give a rate (the Lichess puzzle database,
Lichess and chess.com themselves) was not reachable from this sandbox.

p(engine move) at each rating, and p(the move the human played):

| engine move | human played | 1100 | 1300 | 1500 | 1900 | human's move p at 1300 |
|---|---|---|---|---|---|---|
| Qd7 | Nxa1 | 0.001 | 0.001 | 0.002 | 0.004 | 0.87 |
| Qd4 | Nc2 | 0.051 | 0.051 | 0.053 | 0.075 | 0.37 |
| Nf7 | Qxg8 | 0.097 | 0.098 | 0.109 | 0.132 | 0.79 |
| Rae8 | Nxe2 | 0.011 | 0.010 | 0.009 | 0.011 | 0.85 |
| Qd1 | Qc4 | 0.565 | 0.553 | 0.541 | 0.488 | 0.06 |
| f5 | Rae8 | 0.138 | 0.182 | 0.251 | 0.404 | 0.30 |
| Bh6 | Kc7 | 0.325 | 0.297 | 0.285 | 0.281 | 0.31 |
| d4 | dxc4 | 0.360 | 0.419 | 0.488 | 0.589 | 0.37 |
| Nb6 | Bxb7 | 0.237 | 0.195 | 0.179 | 0.194 | 0.01 |
| d6 | Bxh6 | 0.197 | 0.193 | 0.202 | 0.220 | 0.01 |
| Kb1 | Kc1 | 0.367 | 0.458 | 0.525 | 0.603 | 0.13 |
| Qc6 | c6 | 0.052 | 0.060 | 0.067 | 0.060 | 0.52 |
| b4 | Rc1 | 0.019 | 0.013 | 0.011 | 0.009 | 0.05 |
| Qe6 | c5 | 0.660 | 0.704 | 0.745 | 0.813 | 0.00 |
| Ne4 | Ke7 | 0.172 | 0.161 | 0.155 | 0.150 | 0.32 |
| Rg6 | Kh8 | 0.246 | 0.292 | 0.366 | 0.442 | 0.21 |
| Kf4 | Kf3 | 0.617 | 0.596 | 0.585 | 0.574 | 0.37 |
| Re4 | Re8 | 0.379 | 0.375 | 0.379 | 0.418 | 0.45 |
| **mean** | | **0.250** | **0.259** | **0.275** | **0.304** | **0.35** |

What this says:

- **The weight rises with rating, but slowly.** The mean goes from 0.250 at 1100
  to 0.304 at 1900. 11 of 18 positions rise; some rise steeply (f5, d4, Kb1,
  Rg6); 6 fall slightly. Any "found by X% of players at your rating" number
  built on this will move only a few points between ratings.
- **It often predicts the miss itself.** The move the human actually played gets
  more weight than the engine's move in 10 of 18 positions at 1300. The
  clearest case: Qd7 gets 0.001 and the human's rook grab Nxa1 gets 0.87.
- **Qe6 and Qd1 are not hard for Maia** (0.66 and 0.57 at 1100), although the
  human missed them. One player's miss is weak evidence of difficulty.

### Obvious moves: recaptures and free pieces

7 recaptures (the opponent just captured, the best move takes back on that
square, at least 200 cp clear of the second-best) and 9 free pieces (the best
move takes a minor piece or more that nothing can take back, at least 200 cp
clear). The key move is Maia's top move in all 16 positions at all three
ratings. Its weight rises from 1100 to 1900 in 13 of 16 positions (median 0.83 / 0.87 /
0.90). The lowest is Bxb8, a free rook, at 0.39 at 1100 (still the top move). Three of
the nine grabs are the same queen on a7 left hanging on three moves in a row
of one game. The player missed it three times; Maia makes it the top move
each time (0.64 to 0.84 at 1100).

### Openings

Book moves are from general opening knowledge, not measured explorer shares.
The explorers were not reachable from here.

| ply | position | result | top move at 1100 / 1500 / 1900 | book share at 1500 |
|---|---|---|---|---|
| 0 | start | fail | Nf3 / Nf3 / Nf3 | 0.47 (Na3 0.08 at 1100) |
| 1 | 1.e4 | fail | Nf6 / Nf6 / Nf6 | 0.26 |
| 1 | 1.d4 | pass | Nf6 / Nf6 / Nf6 | 0.58 |
| 2 | 1.e4 e5 | fail | Nf3 / Nf3 / Nf3 | 0.39 (Qe2 0.17 at 1100) |
| 2 | 1.e4 c5 | fail | Bc4 / Nf3 / Bc4 | 0.45 |
| 2 | 1.d4 d5 | pass | Nc3 / Nc3 / Nf3 | 0.68 |
| 3 | 1.e4 e5 2.Nf3 | pass | Nc6 | 0.57 |
| 3 | 1.d4 d5 2.c4 | pass | dxc4 | 0.93 |
| 4 | 1.e4 e5 2.Nf3 Nc6 | pass | Bc4 / Bb5 / Bc4 | 0.75 |
| 5 | Italian, 3.Bc4 | fail | Nf6 / h6 / Be7 | 0.59 |
| 6 | Ruy Lopez, 3...a6 | pass | Bxc6 / Bxc6 / Ba4 | 0.93 |
| 6 | Open Sicilian, 3...cxd4 | pass | Nxd4 | 0.99 |
| 10 | Ruy Lopez, 5...Be7 | pass | Re1 | 0.87 |
| 10 | Italian, 5...d6 | pass | O-O / h3 / h3 | 0.92 |
| 10 | QGD, 5...O-O | pass | Nf3 | 0.88 |
| 10 | Najdorf, 5...a6 | pass | Bg5 | 0.83 |
| 10 | London, 5...Nc6 | pass | Nd2 | 0.90 |

**The first two plies are wrong.** After 1.e4 the model gives all the normal
replies together a quarter of the weight, and leads with 1...Nf6 and 1...Nc6. It
gives 2.Qe2 0.17 and 1.Na3 0.08 at 1100, moves club players rarely play. That
last point is general chess knowledge; no explorer data was reachable from here. Maia-2 never trained on
plies 0 to 9 (API.md), and this is what that looks like. From ply 3 on, 10 of 11
positions pass, and 5 of 5 inside the training window pass. The Italian
"fail" at ply 5 is 3...h6 at 1500, a common club move that the book list left
out. A client should not use Maia for the first moves of a game (use
book moves or the user's own games there).

### Move-match on real games, and the White/Black gap

Every position from ply 10 on in the 12 rapid games, both sides (439
positions), at a fixed rating since the players' ratings are not in the data:

| rating given | all | White to move | Black to move |
|---|---|---|---|
| 1100 | 50.6% | 57.7% | 43.3% |
| 1300 | 50.3% | 56.8% | 43.8% |
| 1500 | 51.0% | 56.8% | 45.2% |
| 1900 | 51.5% | 56.3% | 46.5% |

The engine best move stored with these games (Stockfish) matches the human
34.9% of the time. Maia's advantage over it is the human-model property
working.

**M2 failed as written** (13 points between White and Black). It was set to catch
a broken mirror for Black. It is not that. Two checks after the run, so post hoc:

- Each of the 439 positions, colour-flipped, gives the identical top move. The
  network sees the same input for both, by construction. The tests also show
  this service matches maia2's own inference exactly on Black-to-move positions.
- The gap is not who had which colour: White beats Black for the 1300 player
  (62.5% vs 46.0%) and for the opponents (55.2% vs 34.9%). But per-game match
  ranges from 17% to 62%. One game supplies 172 of the 439 positions, and two
  of the four cells hold 43 and 48 positions. Twelve games cannot separate a
  model property from these particular games.

Open: re-run M2 on a larger set with known ratings before relying on equal
accuracy for both colours.
