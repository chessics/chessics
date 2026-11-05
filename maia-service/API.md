# Maia move service: API

The contract is fixed. Clients are built against this page.

```
POST /v1/policy
Authorization: Bearer <MAIA_TOKEN>      (required only when env MAIA_TOKEN is set)
body: { "fen": "<FEN>", "elo_self": 1350, "elo_oppo": 1420 }
  elo_self = rating of the side to move; elo_oppo = rating of the other side
200: { "moves": [ { "uci": "e2e4", "p": 0.31 }, ... ], "model": "maia2-rapid", "ms": 14 }
  every legal move exactly once, sorted by p descending, p sums to 1 (±0.001)
400: { "error": "invalid_fen" | "game_over" | "bad_elo" }
401: { "error": "unauthorized" }
GET /health -> 200 { "ok": true, "model": "maia2-rapid" }
```

Example (auth on):

```bash
curl -s -X POST "$MAIA_URL/v1/policy" -H "Authorization: Bearer $MAIA_TOKEN" -H "content-type: application/json" -d '{"fen":"r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq - 0 3","elo_self":1350,"elo_oppo":1420}'
```

## Details the contract leaves open

**Ratings and the model's supported range.** Maia-2 does not read a rating as
a number. It maps each rating to one of 11 bands:

| band | ratings |
|---|---|
| 0 | below 1100 |
| 1 to 9 | 1100–1199, 1200–1299, …, 1900–1999 |
| 10 | 2000 and above |

So the model distinguishes ratings only between 1100 and 2000, in steps of
100. The service clamps each rating to **[1099, 2000]**, the tightest range
that moves no rating into another band, then floors it to an integer. 900 and
1099 give the same answer; so do 2000 and 2600; so do 1350 and 1399.9.

The bands are **Lichess ratings**: maia2 trains on Lichess games. A chess.com
rating is on a different scale (at club level it usually reads lower than the
same player's Lichess rating). The service does not convert; a client sending
chess.com ratings should decide whether to.

`bad_elo` means: `elo_self` or `elo_oppo` is missing, not a JSON number
(strings, `true`, `null` are refused), NaN or infinite, or outside 0–4000.
Fractional ratings are accepted.

**FEN.** Exactly the six space-separated fields, and a position python-chess
calls valid (two kings, side not to move not in check, sane castling and en
passant fields). A missing side-to-move field is refused rather than read as
White. `invalid_fen` also covers a body that is not a JSON object, a missing or
non-string `fen`, and a body over 4096 bytes.

**game_over** means checkmate, stalemate, insufficient material (python-chess:
K v K, K and one minor v K, bishops all on one colour) or the 75-move rule
(halfmove clock 150 or more). A FEN carries no history, so repetition is never
detected.

**Order of checks:** 401 first (before the body is read), then `invalid_fen`,
then `bad_elo`, then `game_over`.

**p.** A softmax over the legal moves only, rounded to 6 decimal places, so a
very unlikely legal move can read `0.0`. The sum stays within 0.0002 of 1 even
with 218 legal moves. Ties in p are ordered by `uci` ascending. Castling is
the king's move (`e1g1`), promotions end in the piece letter (`e7e8q`).

**Determinism.** The same request gives the same response (same process, same
thread count). Across machines or thread counts p can differ in the last
decimal places.

**ms.** Server time for the request, from the handler starting to the response
being built: reading the body, validating, the model call. Network time is not
in it.

**Auth.** `MAIA_TOKEN` unset: no header needed, any header ignored. Set: the
header must be `Bearer <token>` (scheme case-insensitive, token exact).
`MAIA_TOKEN` set to a blank value refuses to start, rather than turning auth
off. `/health` never needs the token.

**Outside the contract.** An internal failure answers `500 {"error": "internal"}`.
There are no `/docs` or `/openapi.json` routes.

## What the model is and is not trained on

Read from maia2 0.11.0's training code (`maia2/main.py`, `process_per_game`):
it learns from rated Lichess games, **from ply 10 to ply 300 only**, and only
moves made with **more than 30 seconds** on the mover's clock.

- **The first 10 plies are outside the training data.** Measured (RESULTS.md,
  openings): in the first two plies the policy is wrong. After 1.e4 it gives
  all the usual replies together about a quarter of the weight. From about ply
  3 it is mostly sound. A client should not present Maia's moves in the
  opening moves of a game as human-like.
- **Time pressure is not modelled.** The policy is what a player of that
  rating plays with time to think.
- **The weights are the rapid model** (`maia2-rapid`). maia2 also ships a
  blitz model; this service does not load it.
