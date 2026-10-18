import type { SyncedGame, TimeControlFilter } from './chess-com'
export type { SyncedGame }

interface LichessPlayer {
  user?: { name: string }
  rating?: number
  ratingDiff?: number
}

interface LichessGame {
  id: string
  createdAt: number
  clock?: { initial: number; increment: number }
  perf?: string
  speed?: string
  players: {
    white: LichessPlayer
    black: LichessPlayer
  }
  winner?: 'white' | 'black'
  pgn?: string
  opening?: { name: string; eco: string }
}

const LICHESS_BASE = 'https://lichess.org/api'

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  retries = 3
): Promise<Response> {
  const delays = [1000, 2000, 4000]
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers })
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

function mapLichessGame(game: LichessGame, username: string): SyncedGame {
  const lowerUsername = username.toLowerCase()

  const whiteUsername = game.players.white.user?.name ?? ''
  const userColor: 'white' | 'black' =
    whiteUsername.toLowerCase() === lowerUsername ? 'white' : 'black'

  const userSide = userColor === 'white' ? game.players.white : game.players.black
  const opponentSide = userColor === 'white' ? game.players.black : game.players.white

  let result: 'win' | 'loss' | 'draw'
  if (game.winner === undefined || game.winner === null) {
    result = 'draw'
  } else if (game.winner === userColor) {
    result = 'win'
  } else {
    result = 'loss'
  }

  const initial = game.clock?.initial ?? 0
  const increment = game.clock?.increment ?? 0
  const time_control = `${initial}+${increment}`

  return {
    pgn: game.pgn ?? '',
    platform: 'chess_com' as const,
    platform_game_id: game.id,
    played_at: new Date(game.createdAt).toISOString(),
    time_control,
    user_color: userColor,
    opponent_username: opponentSide.user?.name ?? '',
    result,
    user_rating_at_time: userSide.rating ?? 0,
    opponent_rating_at_time: opponentSide.rating ?? 0,
    opening_name: game.opening?.name ?? null,
    opening_eco: game.opening?.eco ?? null,
  }
}

export interface LichessSyncedGame extends Omit<SyncedGame, 'platform'> {
  platform: 'lichess'
}

const KEPT_SPEEDS = new Set(['rapid', 'blitz'])

export async function fetchLichessGames(
  username: string,
  batchSize: number,
  timeControlFilter: TimeControlFilter = 'rapid_blitz'
): Promise<LichessSyncedGame[]> {
  const perfTypeParam = timeControlFilter === 'rapid_blitz' ? '&perfType=blitz,rapid' : ''
  const url = `${LICHESS_BASE}/games/user/${encodeURIComponent(username)}?max=${batchSize}&pgnInJson=true${perfTypeParam}`

  const headers = {
    Accept: 'application/x-ndjson',
    'User-Agent': 'Chessics/1.0',
  }

  const res = await fetchWithRetry(url, headers)

  if (res.status === 404) {
    const err = new Error('Username not found') as Error & { status: number }
    err.status = 404
    throw err
  }
  if (res.status === 429) {
    const err = new Error('Rate limited, try again shortly') as Error & { status: number }
    err.status = 429
    throw err
  }

  const text = await res.text()
  const lines = text.split('\n').filter((line) => line.trim().length > 0)

  const games: LichessSyncedGame[] = []

  for (const line of lines) {
    try {
      const raw = JSON.parse(line) as LichessGame
      if (timeControlFilter === 'rapid_blitz' && raw.speed !== undefined && !KEPT_SPEEDS.has(raw.speed)) continue
      const mapped = mapLichessGame(raw, username)
      games.push({ ...mapped, platform: 'lichess' })
    } catch {
    }
  }

  return games.slice(0, batchSize)
}
