import { pgnAnalysable } from './standard'
export { pgnAnalysable, setUpFromPosition } from './standard'

export interface ChessComGame {
  pgn: string
  time_control: string
  time_class: string
  end_time: number
  white: { username: string; rating: number; result: string }
  black: { username: string; rating: number; result: string }
  url: string
  rules?: string
}

export function analysableChessComGame(game: Pick<ChessComGame, 'rules' | 'pgn'>): boolean {
  if (game.rules !== undefined && game.rules !== 'chess') return false
  return pgnAnalysable(game.pgn)
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

export const CHESS_COM_WALK_BUDGET_MS = 18_000

export async function fetchChessComGames(
  username: string,
  batchSize: number,
  timeControlFilter: TimeControlFilter = 'rapid_blitz',
  { budgetMs = CHESS_COM_WALK_BUDGET_MS, now = Date.now }: { budgetMs?: number; now?: () => number } = {}
): Promise<SyncedGame[]> {
  const startedAt = now()
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
    if (now() - startedAt > budgetMs) {
      if (collectedGames.length === 0) {
        const err = new Error('No rapid or blitz games in recent months') as Error & { status: number; code: string }
        err.status = 422
        err.code = 'no_recent_rapid_blitz_games'
        throw err
      }
      break
    }
    const monthUrl = archives[i]
    const monthRes = await fetchWithRetry(monthUrl)

    if (!monthRes.ok) continue

    const monthData = (await monthRes.json()) as { games: ChessComGame[] }
    const monthGames = (monthData.games ?? []).reverse()

    for (const game of monthGames) {
      if (collectedGames.length >= batchSize) break
      if (timeControlFilter === 'rapid_blitz' && !KEPT_TIME_CLASSES.has(game.time_class)) continue
      if (!analysableChessComGame(game)) continue
      collectedGames.push(mapChessComGame(game, username))
    }
  }

  return collectedGames.slice(0, batchSize)
}

export interface FetchWindow {
  after: number | null
  before: number | null
  order: 'asc' | 'desc'
  max: number
  deadline: number
  filter: TimeControlFilter
}

export interface WindowResult<G> {
  games: G[]
  complete: boolean
}

const DAY_MS = 86_400_000

export function archiveMonth(url: string): [number, number] | null {
  const m = /\/(\d{4})\/(\d{2})\/?$/.exec(url)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  return [Date.UTC(y, mo, 1), Date.UTC(y, mo + 1, 1)]
}

export async function fetchChessComWindow(
  username: string,
  w: FetchWindow,
  { now = Date.now }: { now?: () => number } = {}
): Promise<WindowResult<SyncedGame>> {
  const archivesRes = await fetchWithRetry(`${CHESS_COM_BASE}/${encodeURIComponent(username)}/games/archives`)
  if (archivesRes.status === 404) {
    throw Object.assign(new Error('Username not found'), { status: 404 })
  }
  if (archivesRes.status === 429) {
    throw Object.assign(new Error('Rate limited, try again shortly'), { status: 429 })
  }
  const archives = ((await archivesRes.json()) as { archives?: string[] }).archives ?? []

  const months = archives
    .map((url) => ({ url, span: archiveMonth(url) }))
    .filter((m): m is { url: string; span: [number, number] } => m.span !== null)
    .filter(({ span: [start, end] }) => (w.after === null || end + DAY_MS > w.after) && (w.before === null || start - DAY_MS < w.before))
    .sort((a, b) => (w.order === 'asc' ? a.span[0] - b.span[0] : b.span[0] - a.span[0]))

  const games: SyncedGame[] = []
  for (const { url } of months) {
    if (now() > w.deadline) return { games, complete: false }
    let res: Response
    try {
      res = await fetchWithRetry(url)
    } catch {
      return { games, complete: false }
    }
    if (res.status === 404) continue
    if (!res.ok) return { games, complete: false }
    const monthGames = ((await res.json()) as { games?: ChessComGame[] }).games ?? []
    const inWindow = monthGames
      .filter((g) => (w.after === null || g.end_time * 1000 > w.after) && (w.before === null || g.end_time * 1000 < w.before))
      .filter((g) => w.filter !== 'rapid_blitz' || KEPT_TIME_CLASSES.has(g.time_class))
      .filter((g) => analysableChessComGame(g))
      .sort((a, b) => (w.order === 'asc' ? a.end_time - b.end_time : b.end_time - a.end_time))
    for (const g of inWindow) {
      if (games.length >= w.max) return { games, complete: false }
      games.push(mapChessComGame(g, username))
    }
  }
  return { games, complete: true }
}
