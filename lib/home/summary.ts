import { speedOf, openingFamily, type Speed } from '@/lib/games/player-lookup'
import { clockAtPly, parseClocks, pgnHeader } from '@/lib/clock'

export type HomePlatform = 'chess_com' | 'lichess'

export interface HomeGame {
  id: string
  platform: string | null
  played_at: string | null
  time_control: string | null
  opening_name: string | null
  user_color: 'white' | 'black' | null
  opponent_username: string | null
  result: 'win' | 'loss' | 'draw' | null
  user_rating_at_time: number | null
  opponent_rating_at_time: number | null
  is_analyzed: boolean | null
}

export const HOME_WINDOW_DAYS = 91

export function windowStart(now: number, days = HOME_WINDOW_DAYS): number {
  return now - days * 24 * 60 * 60 * 1000
}

function platformOf(g: HomeGame): HomePlatform | null {
  return g.platform === 'chess_com' || g.platform === 'lichess' ? g.platform : null
}

function rated(n: number | null): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

function time(g: HomeGame): number {
  const t = g.played_at ? Date.parse(g.played_at) : NaN
  return Number.isFinite(t) ? t : NaN
}

function chronological(games: readonly HomeGame[]): HomeGame[] {
  return games
    .filter((g) => Number.isFinite(time(g)))
    .sort((a, b) => time(a) - time(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

export interface Pool {
  platform: HomePlatform
  speed: Speed
}

export function poolOf(g: HomeGame): Pool | null {
  const platform = platformOf(g)
  if (!platform || !g.time_control) return null
  const speed = speedOf(platform, g.time_control)
  return speed ? { platform, speed } : null
}

const poolKey = (p: Pool) => `${p.platform}:${p.speed}`

export function ratingChanges(games: readonly HomeGame[]): Map<string, number | null> {
  const byPool = new Map<string, HomeGame[]>()
  for (const g of chronological(games)) {
    const p = poolOf(g)
    if (!p) continue
    const list = byPool.get(poolKey(p)) ?? []
    list.push(g)
    byPool.set(poolKey(p), list)
  }
  const out = new Map<string, number | null>()
  for (const g of games) out.set(g.id, null)
  for (const list of Array.from(byPool.values())) {
    list.forEach((g, i) => {
      if (platformOf(g) === 'chess_com') {
        const prev = list[i - 1]
        out.set(g.id, prev && rated(prev.user_rating_at_time) && rated(g.user_rating_at_time) ? g.user_rating_at_time - prev.user_rating_at_time : null)
      } else {
        const next = list[i + 1]
        out.set(g.id, next && rated(next.user_rating_at_time) && rated(g.user_rating_at_time) ? next.user_rating_at_time - g.user_rating_at_time : null)
      }
    })
  }
  return out
}

export interface RatingPoint {
  id: string
  at: string
  rating: number
  result: HomeGame['result']
  opponent: string | null
  habit: boolean
  analysed: boolean
}

export interface RatingSeries {
  platform: HomePlatform
  speed: Speed
  points: RatingPoint[]
  now: number
  highest: number
}

export const MIN_SERIES_POINTS = 2

export function ratingSeries(games: readonly HomeGame[], habitIds: ReadonlySet<string>, from: number): RatingSeries[] {
  const byPool = new Map<string, { pool: Pool; points: RatingPoint[] }>()
  for (const g of chronological(games)) {
    if (time(g) < from || !rated(g.user_rating_at_time)) continue
    const pool = poolOf(g)
    if (!pool) continue
    const entry = byPool.get(poolKey(pool)) ?? { pool, points: [] }
    entry.points.push({
      id: g.id,
      at: g.played_at as string,
      rating: g.user_rating_at_time,
      result: g.result,
      opponent: g.opponent_username,
      habit: habitIds.has(g.id),
      analysed: !!g.is_analyzed,
    })
    byPool.set(poolKey(pool), entry)
  }
  return Array.from(byPool.values())
    .filter((e) => e.points.length >= MIN_SERIES_POINTS)
    .map((e) => ({
      platform: e.pool.platform,
      speed: e.pool.speed,
      points: e.points,
      now: e.points[e.points.length - 1].rating,
      highest: Math.max(...e.points.map((p) => p.rating)),
    }))
    .sort((a, b) => b.points.length - a.points.length || (a.speed < b.speed ? -1 : 1))
}

export function siteName(p: HomePlatform): string {
  return p === 'chess_com' ? 'chess.com' : 'lichess'
}

export interface HabitCost {
  games: number
  bySite: Array<{ platform: HomePlatform; change: number }>
  incomplete: boolean
}

export function habitCost(games: readonly HomeGame[], habitIds: ReadonlySet<string>, changes: ReadonlyMap<string, number | null>): HabitCost {
  const found = games.filter((g) => habitIds.has(g.id))
  const sums = new Map<HomePlatform, number>()
  let incomplete = found.length === 0
  for (const g of found) {
    const c = changes.get(g.id)
    const p = platformOf(g)
    if (c === null || c === undefined || !p) {
      incomplete = true
      continue
    }
    sums.set(p, (sums.get(p) ?? 0) + c)
  }
  return {
    games: found.length,
    bySite: incomplete ? [] : Array.from(sums.entries()).map(([platform, change]) => ({ platform, change })),
    incomplete,
  }
}

function points(n: number): string {
  return `${n} ${n === 1 ? 'point' : 'points'}`
}

export function habitCostLine(cost: HabitCost): { lost: string[]; rest: string | null } | null {
  if (cost.incomplete || cost.bySite.length === 0) return null
  const lost = cost.bySite.filter((s) => s.change < 0).map((s) => `${points(-s.change)} on ${siteName(s.platform)}`)
  const kept = cost.bySite.filter((s) => s.change >= 0)
  const rest = kept.length > 0 ? `They didn't cost you rating overall on ${kept.map((s) => siteName(s.platform)).join(' or ')}.` : null
  return { lost, rest }
}

export interface Record3 {
  wins: number
  draws: number
  losses: number
  games: number
}

function tally(games: readonly HomeGame[]): Record3 {
  const r = { wins: 0, draws: 0, losses: 0, games: 0 }
  for (const g of games) {
    if (g.result === 'win') r.wins++
    else if (g.result === 'draw') r.draws++
    else if (g.result === 'loss') r.losses++
    else continue
    r.games++
  }
  return r
}

export interface OpeningRow extends Record3 {
  family: string
  color: 'white' | 'black'
}

export const MIN_OPENING_GAMES = 3
export const OPENING_ROWS = 3

export function openingsRecord(games: readonly HomeGame[], from: number): OpeningRow[] {
  const groups = new Map<string, { family: string; color: 'white' | 'black'; games: HomeGame[] }>()
  for (const g of games) {
    if (time(g) < from || !g.user_color) continue
    const family = openingFamily(g.opening_name)
    if (!family) continue
    const key = `${family}|${g.user_color}`
    const entry = groups.get(key) ?? { family, color: g.user_color, games: [] }
    entry.games.push(g)
    groups.set(key, entry)
  }
  return Array.from(groups.values())
    .map((e) => ({ family: e.family, color: e.color, ...tally(e.games) }))
    .filter((r) => r.games >= MIN_OPENING_GAMES)
    .sort((a, b) => b.games - a.games || a.family.localeCompare(b.family) || (a.color < b.color ? -1 : 1))
    .slice(0, OPENING_ROWS)
}

export interface OpponentsRecord {
  higher: Record3
  lower: Record3
}

export function opponentsRecord(games: readonly HomeGame[], from: number): OpponentsRecord {
  const higher: HomeGame[] = []
  const lower: HomeGame[] = []
  for (const g of games) {
    if (time(g) < from || !rated(g.user_rating_at_time) || !rated(g.opponent_rating_at_time)) continue
    if (g.opponent_rating_at_time > g.user_rating_at_time) higher.push(g)
    else if (g.opponent_rating_at_time < g.user_rating_at_time) lower.push(g)
  }
  return { higher: tally(higher), lower: tally(lower) }
}

export const LOW_CLOCK_MS = 30_000
export const CLOCK_SQUARES = 25

export interface ClockLoss {
  id: string
  at: string
  pgn: string
  user_color: 'white' | 'black'
}

export function lostOnTime(pgn: string): boolean {
  const t = pgnHeader(pgn, 'Termination') ?? ''
  return /won on time/i.test(t) || /time forfeit/i.test(t)
}

export function clockInLosses(losses: readonly ClockLoss[]): Array<{ id: string; low: boolean }> {
  return [...losses]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || (a.id < b.id ? -1 : 1))
    .flatMap((g) => {
      const plies = parseClocks(g.pgn).length
      if (plies === 0) return []
      const left = clockAtPly(g.pgn, plies + 1)[g.user_color]
      if (left === null) return []
      return [{ id: g.id, low: left < LOW_CLOCK_MS || lostOnTime(g.pgn) }]
    })
    .slice(0, CLOCK_SQUARES)
}

export interface CalendarCell {
  day: string
  count: number
  marked: boolean
  level: 0 | 1 | 2 | 3
}

export function buildCalendar(
  events: ReadonlyArray<{ at: string; marked?: boolean }>,
  today: Date,
  dayOf: (d: Date) => string,
  levels: readonly [number, number, number],
  weeks = 13
): CalendarCell[] {
  const counts = new Map<string, { count: number; marked: boolean }>()
  for (const e of events) {
    const t = Date.parse(e.at)
    if (!Number.isFinite(t)) continue
    const key = dayOf(new Date(t))
    const c = counts.get(key) ?? { count: 0, marked: false }
    c.count++
    c.marked = c.marked || !!e.marked
    counts.set(key, c)
  }
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() - (weeks - 1) * 7)
  const last = dayOf(today)
  const cells: CalendarCell[] = []
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const day = dayOf(d)
    if (day > last) break
    const c = counts.get(day) ?? { count: 0, marked: false }
    const level = c.count >= levels[2] ? 3 : c.count >= levels[1] ? 2 : c.count >= levels[0] ? 1 : 0
    cells.push({ day, count: c.count, marked: c.marked && c.count > 0, level })
  }
  return cells
}

export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const GAME_LEVELS = [1, 2, 4] as const
export const TRAINING_LEVELS = [1, 3, 7] as const

export interface RecentMove {
  ply: number
  eval_after: number | null
  classification: string | null
  eval_before: number | null
}

export const LINE_CLAMP_CP = 1000
const MATE_SCORE_CP = 9000
const STILL_WINNING_CP = 500

export type RecentNote =
  | { kind: 'analyze' }
  | { kind: 'habit' }
  | { kind: 'blunder'; move: number }
  | { kind: 'clean' }
  | { kind: 'review' }

export interface RecentSummary {
  line: number[] | null
  blunderAt: number | null
  note: RecentNote
}

export function recentSummary(
  game: Pick<HomeGame, 'is_analyzed' | 'user_color'>,
  moves: readonly RecentMove[],
  inHabit: boolean
): RecentSummary {
  if (!game.is_analyzed || !game.user_color) return { line: null, blunderAt: null, note: { kind: 'analyze' } }
  const sorted = [...moves].sort((a, b) => a.ply - b.ply)
  const real = sorted.some((m) => (m.eval_after ?? 0) !== 0 || (m.eval_before ?? 0) !== 0)
  if (sorted.length === 0 || !real) return { line: null, blunderAt: null, note: { kind: 'review' } }
  const sign = game.user_color === 'white' ? 1 : -1
  const line = sorted.map((m) => Math.max(-LINE_CLAMP_CP, Math.min(LINE_CLAMP_CP, sign * Number(m.eval_after ?? 0))))
  const mine = (ply: number) => (game.user_color === 'white' ? ply % 2 === 1 : ply % 2 === 0)
  const idx = sorted.findIndex(
    (m) =>
      m.classification === 'blunder' &&
      mine(m.ply) &&
      !(m.eval_before !== null && m.eval_after !== null && sign * m.eval_before >= MATE_SCORE_CP && sign * m.eval_after >= STILL_WINNING_CP)
  )
  if (idx === -1) return { line, blunderAt: null, note: { kind: 'clean' } }
  if (inHabit) return { line, blunderAt: idx, note: { kind: 'habit' } }
  return { line, blunderAt: idx, note: { kind: 'blunder', move: Math.ceil(sorted[idx].ply / 2) } }
}

export function recentNoteText(note: RecentNote): string {
  switch (note.kind) {
    case 'habit':
      return 'The habit came up again'
    case 'blunder':
      return `Blunder at move ${note.move}`
    case 'clean':
      return 'No blunders'
    case 'review':
      return 'Open the review'
    case 'analyze':
      return 'Not analysed yet'
  }
}
