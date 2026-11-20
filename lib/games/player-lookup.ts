import type { SyncedGame } from '@/lib/sync/chess-com'
import type { LichessSyncedGame } from '@/lib/sync/lichess'

export type LookupPlatform = 'chess_com' | 'lichess'

export const LOOKUP_DAYS = 90
export const LOOKUP_MAX_GAMES = 100
export const LOOKUP_FIRST_ROWS = 20
export const LOOKUP_BUDGET_MS = 12_000

const USERNAME = /^[A-Za-z0-9_-]{1,50}$/

export interface LookupQuery {
  platform: LookupPlatform
  username: string
}

export function parseLookupQuery(params: URLSearchParams): LookupQuery | 'bad_platform' | 'bad_username' {
  const platform = params.get('platform')
  if (platform !== 'chess_com' && platform !== 'lichess') return 'bad_platform'
  const username = (params.get('username') ?? '').trim()
  if (!USERNAME.test(username)) return 'bad_username'
  return { platform, username }
}

export type Speed = 'bullet' | 'blitz' | 'rapid'
export const SPEEDS: readonly Speed[] = ['bullet', 'blitz', 'rapid']

export interface LookedUpGame {
  id: string
  platform: LookupPlatform
  url: string
  played_at: string
  time_control: string
  speed: Speed | null
  color: 'white' | 'black'
  result: 'win' | 'loss' | 'draw'
  rating: number | null
  opponent: string
  opponent_rating: number | null
  opening: string | null
  family: string | null
}

export function speedOf(platform: LookupPlatform, timeControl: string): Speed | null {
  const m = /^(\d+)(?:\+(\d+))?$/.exec(timeControl.trim())
  if (!m) return null
  const estimate = Number(m[1]) + 40 * Number(m[2] ?? 0)
  if (platform === 'lichess' && estimate < 30) return null
  if (estimate < 180) return 'bullet'
  if (estimate < (platform === 'chess_com' ? 600 : 480)) return 'blitz'
  if (platform === 'lichess' && estimate >= 1500) return null
  return 'rapid'
}

const FAMILY_END = /^(Opening|Defense|Defence|Game|Gambit|Attack|System)$/

export function openingFamily(name: string | null): string | null {
  if (!name) return null
  const words = name.split(':')[0].trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return null
  const end = words.findIndex((w) => FAMILY_END.test(w))
  return (end === -1 ? words : words.slice(0, end + 1)).join(' ')
}

export function gameUrl(platform: LookupPlatform, id: string, color: 'white' | 'black'): string {
  const safe = encodeURIComponent(id)
  return platform === 'chess_com'
    ? `https://www.chess.com/game/live/${safe}`
    : `https://lichess.org/${safe}${color === 'black' ? '/black' : ''}`
}

const rating = (n: number | null | undefined): number | null => (typeof n === 'number' && n > 0 ? n : null)

export function toLookedUpGame(game: SyncedGame | LichessSyncedGame): LookedUpGame {
  const platform: LookupPlatform = game.platform === 'lichess' ? 'lichess' : 'chess_com'
  return {
    id: game.platform_game_id,
    platform,
    url: gameUrl(platform, game.platform_game_id, game.user_color),
    played_at: game.played_at,
    time_control: game.time_control,
    speed: speedOf(platform, game.time_control),
    color: game.user_color,
    result: game.result,
    rating: rating(game.user_rating_at_time),
    opponent: game.opponent_username,
    opponent_rating: rating(game.opponent_rating_at_time),
    opening: game.opening_name,
    family: openingFamily(game.opening_name),
  }
}

export interface LookupFilters {
  speed: Speed | 'all'
  color: 'white' | 'black' | 'all'
  family: string
}

export const NO_FILTERS: LookupFilters = { speed: 'all', color: 'all', family: 'all' }

export function filterGames(games: readonly LookedUpGame[], f: LookupFilters): LookedUpGame[] {
  return games.filter(
    (g) =>
      (f.speed === 'all' || g.speed === f.speed) &&
      (f.color === 'all' || g.color === f.color) &&
      (f.family === 'all' || g.family === f.family)
  )
}

export function speedsIn(games: readonly LookedUpGame[]): Speed[] {
  return SPEEDS.filter((s) => games.some((g) => g.speed === s))
}

export function familiesIn(games: readonly LookedUpGame[]): Array<{ family: string; count: number }> {
  const counts = new Map<string, number>()
  for (const g of games) if (g.family) counts.set(g.family, (counts.get(g.family) ?? 0) + 1)
  return Array.from(counts)
    .map(([family, count]) => ({ family, count }))
    .sort((a, b) => b.count - a.count || a.family.localeCompare(b.family))
}

export function recordLine(games: readonly LookedUpGame[]): string {
  const n = (r: LookedUpGame['result']) => games.filter((g) => g.result === r).length
  const part = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`
  return [part(n('win'), 'win', 'wins'), part(n('loss'), 'loss', 'losses'), part(n('draw'), 'draw', 'draws')].join(', ')
}

export type LookupErrorCode =
  | 'bad_platform'
  | 'bad_username'
  | 'player_not_found'
  | 'site_busy'
  | 'site_unreachable'
  | 'too_many_requests'
  | 'unauthorized'

export function platformName(platform: LookupPlatform): string {
  return platform === 'chess_com' ? 'Chess.com' : 'Lichess'
}

export function lookupMessage(code: string | null | undefined, platform: LookupPlatform): string {
  const site = platformName(platform)
  switch (code) {
    case 'bad_username':
      return 'Usernames use only letters, numbers, "_" and "-".'
    case 'player_not_found':
      return `No ${site} player has that username.`
    case 'site_busy':
      return `${site} is busy. Try again in a minute.`
    case 'too_many_requests':
      return 'Too many lookups just now. Try again in a minute.'
    case 'unauthorized':
      return 'Sign in again to look up players.'
    default:
      return `${site} didn't answer. Try again in a moment.`
  }
}

export function noGamesLine(username: string): string {
  return `${username} has no bullet, blitz or rapid games in the last 3 months.`
}
