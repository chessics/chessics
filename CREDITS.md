# Credits

Chessics is free software: you can redistribute it and/or modify it under the terms of the GNU
Affero General Public License as published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version. See [LICENSE](LICENSE).


Chessics is built on the open-source software below. Each keeps its own license.

## Sent to your browser

| Software | License | By |
|---|---|---|
| [chessground](https://github.com/lichess-org/chessground) 9.2.1: the chessboard | GPL-3.0-or-later | Thibault Duplessis and lichess.org contributors |
| [chess.js](https://github.com/jhlywa/chess.js) 1.0.0-beta.8: move rules and notation | BSD-2-Clause (notice below) | Jeff Hlywa |
| [Next.js](https://github.com/vercel/next.js) 14.2.35 | MIT | Vercel |
| [React](https://github.com/facebook/react) and React DOM 18.3.1 | MIT | Meta Platforms |
| [Supabase JS](https://github.com/supabase/supabase-js) and [@supabase/ssr](https://github.com/supabase/ssr) | MIT | Supabase |
| [Lucide](https://github.com/lucide-icons/lucide) (lucide-react): icons | ISC | Lucide contributors |
| [clsx](https://github.com/lukeed/clsx) | MIT | Luke Edwards |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) (build time) | MIT | Tailwind Labs |
| Cormorant Garamond, Old Standard TT, DM Sans, JetBrains Mono, via Google Fonts | SIL Open Font License 1.1 | their designers |
| [three.js](https://github.com/mrdoob/three.js) 0.170.0: the 3D board on the landing page | MIT | three.js authors |
| [@vercel/analytics](https://github.com/vercel/analytics) 2.0.1: cookieless page-view counts | MIT | Vercel |

## On the server

| Software | License | Use |
|---|---|---|
| [Stockfish](https://github.com/official-stockfish/Stockfish) | GPL-3.0 | Every evaluation in the analysis. Runs on the analysis worker; never sent to the browser |
| [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript) | MIT | Calls Claude to write the game narratives. Stockfish supplies every chess fact; the model writes language only |
| [@upstash/redis](https://github.com/upstash/redis-js) and [@upstash/ratelimit](https://github.com/upstash/ratelimit-js) | MIT | Job queue and rate limits |
| [@vercel/functions](https://github.com/vercel/vercel/tree/main/packages/functions) 1.6.0 | Apache-2.0 | Lets the product-event counts finish writing after the response is sent |
| [Maia-2](https://github.com/CSSLab/maia2) 0.11.0 and its rapid weights | MIT | The human-like opponent in "play it out", run by the move service in `maia-service/`. Never sent to the browser |
| [python-chess](https://github.com/niklasf/python-chess) 1.11.2 | GPL-3.0-or-later | Move rules inside the move service |
| [FastAPI](https://github.com/fastapi/fastapi) 0.162.0 and [Uvicorn](https://github.com/encode/uvicorn) 0.54.0 | MIT and BSD-3-Clause | The move service's web server |
| [PyTorch](https://github.com/pytorch/pytorch) (CPU build, through Maia-2) | BSD-3-Clause | Runs the Maia-2 model inside the move service |

## Services

Supabase (database and accounts), Upstash (Redis), Vercel (the site, and Web Analytics for anonymous visit counts), Railway (the analysis
worker), [chess-api.com](https://chess-api.com) (Stockfish evaluations used to grade training
answers), and Anthropic's Claude (narratives, as above). Games are imported from Chess.com's
public API.

## Development tools

TypeScript (Apache-2.0), Vitest, ESLint, PostCSS, tsx, ts-node (MIT).

## chess.js notice

```
Copyright (c) 2023, Jeff Hlywa (jhlywa@gmail.com)
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
```
