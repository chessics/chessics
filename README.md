# Chessics

Chessics analyses your Chess.com or Lichess games and traces each blunder back to the earlier move
that started the slide. Those moments become training positions: draw your move, commit to it, then
see what the engine preferred and what happened in your game.

## Stack

- Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- chessground and chess.js for the board and move rules
- Supabase for Postgres and accounts, Upstash Redis for the job queue
- An analysis worker (Node) that runs Stockfish
- Anthropic's Claude API writes the short game summaries; Stockfish supplies every chess fact

## Running it

### App

```bash
npm install
npm run dev
```

`.env.local`:

| Name | |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | server only |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Upstash REST credentials |
| `GRADING_ENGINE_URL` | optional; defaults to `https://chess-api.com/v1` |
| `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` | optional; `true` shows Google sign-in |

### Database

Apply the files in `supabase/migrations/` in order, in the Supabase SQL editor.

### Worker

```bash
cd worker
npm install
npm run build
node dist/start.js
```

`node dist/start.js` starts Stockfish behind a small local HTTP server, then the worker. It needs a
`stockfish` binary on `PATH` (or `STOCKFISH_BIN`). Environment: `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `UPSTASH_REDIS_REST_URL`,
`UPSTASH_REDIS_REST_TOKEN`, and `ENGINE_LABEL` (the engine name recorded with each analysis). See
`worker/.env.example`.

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE) and [CREDITS.md](CREDITS.md).
