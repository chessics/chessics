import type { FetchWindow, SyncedGame, TimeControlFilter, WindowResult } from './chess-com'
export type { SyncedGame }

interface LichessPlayer {
  user?: { name: string }
  aiLevel?: number
  rating?: number
  ratingDiff?: number
}

interface LichessGame {
  id: string
  createdAt: number
  clock?: { initial: number; increment: number }
  daysPerTurn?: number
  status?: string
  perf?: string
  speed?: string
  players: {
    white: LichessPlayer
    black: LichessPlayer
  }
  winner?: 'white' | 'black'
  pgn?: string
  opening?: { name: string; eco: string }
  variant?: string
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

function playerName(p: LichessPlayer): string {
  if (p.user?.name) return p.user.name
  if (typeof p.aiLevel === 'number') return `Stockfish level ${p.aiLevel}`
  return 'Anonymous'
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
  const time_control =
    !game.clock && typeof game.daysPerTurn === 'number' && game.daysPerTurn > 0
      ? `1/${game.daysPerTurn * 86400}`
      : `${initial}+${increment}`

  return {
    pgn: game.pgn ?? '',
    platform: 'chess_com' as const,
    platform_game_id: game.id,
    played_at: new Date(game.createdAt).toISOString(),
    time_control,
    user_color: userColor,
    opponent_username: playerName(opponentSide),
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
    const kept = keptGame(line, username, timeControlFilter)
    if (kept) games.push(kept)
  }

  return games.slice(0, batchSize)
}

function keptGame(line: string, username: string, timeControlFilter: TimeControlFilter): LichessSyncedGame | null {
  try {
    const raw = JSON.parse(line) as LichessGame
    if (timeControlFilter === 'rapid_blitz' && raw.speed !== undefined && !KEPT_SPEEDS.has(raw.speed)) return null
    if (raw.variant !== undefined && raw.variant !== 'standard') return null
    if (raw.status === 'aborted' || raw.status === 'noStart') return null
    return { ...mapLichessGame(raw, username), platform: 'lichess' }
  } catch {
    return null
  }
}

export async function fetchLichessWindow(
  username: string,
  w: FetchWindow,
  { now = Date.now }: { now?: () => number } = {}
): Promise<WindowResult<LichessSyncedGame>> {
  const params = new URLSearchParams({ max: String(w.max), pgnInJson: 'true' })
  if (w.after !== null) params.set('since', String(w.after + 1))
  if (w.before !== null) params.set('until', String(w.before - 1))
  if (w.order === 'asc') params.set('sort', 'dateAsc')
  if (w.filter === 'rapid_blitz') params.set('perfType', 'blitz,rapid')
  const url = `${LICHESS_BASE}/games/user/${encodeURIComponent(username)}?${params}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(0, w.deadline - now()))
  const games: LichessSyncedGame[] = []
  let lines = 0
  try {
    let res: Response
    try {
      res = await fetch(url, {
        headers: { Accept: 'application/x-ndjson', 'User-Agent': 'Chessics/1.0' },
        signal: controller.signal,
      })
    } catch {
      return { games, complete: false }
    }
    if (res.status === 404) throw Object.assign(new Error('Username not found'), { status: 404 })
    if (res.status === 429) throw Object.assign(new Error('Rate limited, try again shortly'), { status: 429 })
    if (!res.ok || !res.body) return { games, complete: false }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const take = (line: string) => {
      if (!line.trim()) return
      lines++
      const kept = keptGame(line, username, w.filter)
      if (!kept) return
      const at = Date.parse(kept.played_at)
      if ((w.after === null || at > w.after) && (w.before === null || at < w.before)) games.push(kept)
    }
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await reader.read()
      } catch {
        return { games, complete: false }
      }
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      const parts = buffer.split('\n')
      buffer = parts.pop() ?? ''
      parts.forEach(take)
    }
    take(buffer)
    return { games, complete: lines < w.max }
  } finally {
    clearTimeout(timer)
  }
}
