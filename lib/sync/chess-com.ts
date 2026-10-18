export interface ChessComGame {
  pgn: string
  time_control: string
  time_class: string
  end_time: number
  white: { username: string; rating: number; result: string }
  black: { username: string; rating: number; result: string }
  url: string
}

export type TimeControlFilter = 'rapid_blitz' | 'all'

const KEPT_TIME_CLASSES = new Set(['rapid', 'blitz'])

export interface SyncedGame {
  pgn: string
  platform: 'chess_com'
  platform_game_id: string
  played_at: string
  time_control: string
  user_color: 'white' | 'black'
  opponent_username: string
  result: 'win' | 'loss' | 'draw'
  user_rating_at_time: number
  opponent_rating_at_time: number
  opening_name: string | null
  opening_eco: string | null
}

const CHESS_COM_BASE = 'https://api.chess.com/pub/player'
const REQUEST_HEADERS = { 'User-Agent': 'Chessics/1.0' }

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  const delays = [1000, 2000, 4000]
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: REQUEST_HEADERS })
      if (res.status === 404 || res.status === 429) {
        return res
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`)
      }
      return res
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delays[attempt]))
      }
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${url}`)
}

function extractPgnHeader(pgn: string, key: string): string | null {
  const match = pgn.match(new RegExp(`\\[${key} "(.+?)"\\]`))
  return match ? match[1] : null
}

function determineResult(
  game: ChessComGame,
  userColor: 'white' | 'black'
): 'win' | 'loss' | 'draw' {
  const userSide = userColor === 'white' ? game.white : game.black
  const opponentSide = userColor === 'white' ? game.black : game.white

  if (userSide.result === 'win') return 'win'
  if (opponentSide.result === 'win') return 'loss'
  return 'draw'
}

function mapChessComGame(game: ChessComGame, username: string): SyncedGame {
  const lowerUsername = username.toLowerCase()
  const userColor: 'white' | 'black' =
    game.white.username.toLowerCase() === lowerUsername ? 'white' : 'black'

  const userSide = userColor === 'white' ? game.white : game.black
  const opponentSide = userColor === 'white' ? game.black : game.white

  const urlParts = game.url.split('/')
  const platform_game_id = urlParts[urlParts.length - 1]

  return {
    pgn: game.pgn,
    platform: 'chess_com',
    platform_game_id,
    played_at: new Date(game.end_time * 1000).toISOString(),
    time_control: game.time_control,
    user_color: userColor,
    opponent_username: opponentSide.username,
    result: determineResult(game, userColor),
    user_rating_at_time: userSide.rating,
    opponent_rating_at_time: opponentSide.rating,
    opening_name: extractPgnHeader(game.pgn, 'Opening'),
    opening_eco: extractPgnHeader(game.pgn, 'ECO'),
  }
}

export async function fetchChessComGames(
  username: string,
  batchSize: number,
  timeControlFilter: TimeControlFilter = 'rapid_blitz'
): Promise<SyncedGame[]> {
  const archivesRes = await fetchWithRetry(
    `${CHESS_COM_BASE}/${encodeURIComponent(username)}/games/archives`
  )

  if (archivesRes.status === 404) {
    const err = new Error('Username not found') as Error & { status: number }
    err.status = 404
    throw err
  }
  if (archivesRes.status === 429) {
    const err = new Error('Rate limited, try again shortly') as Error & { status: number }
    err.status = 429
    throw err
  }

  const archivesData = (await archivesRes.json()) as { archives: string[] }
  const archives = archivesData.archives ?? []

  const collectedGames: SyncedGame[] = []

  for (let i = archives.length - 1; i >= 0 && collectedGames.length < batchSize; i--) {
    const monthUrl = archives[i]
    const monthRes = await fetchWithRetry(monthUrl)

    if (!monthRes.ok) continue

    const monthData = (await monthRes.json()) as { games: ChessComGame[] }
    const monthGames = (monthData.games ?? []).reverse()

    for (const game of monthGames) {
      if (collectedGames.length >= batchSize) break
      if (timeControlFilter === 'rapid_blitz' && !KEPT_TIME_CLASSES.has(game.time_class)) continue
      collectedGames.push(mapChessComGame(game, username))
    }
  }

  return collectedGames.slice(0, batchSize)
}
