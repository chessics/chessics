import { MATE_SCORE_CP, STILL_WINNING_CP } from '../training/grading'
import type { GameResult } from './finding'

export const BREAK_MS = 10 * 60 * 1000
export const MAX_MOVES_PER_SIDE = 80
export const EARLY_GAMES = 2
export const MIN_GAMES_EACH_SIDE = 5
export const MIN_LATE_SITTINGS = 3
export const HISTORY_LOOKBACK_MS = 24 * 60 * 60 * 1000

export type Platform = 'chess_com' | 'lichess'

export interface HistoryGame {
  id: string
  platform: string | null
  playedAt: string | null
  timeControl: string | null
}

export interface Sitting {
  placed: boolean
  gameIds: string[]
}

type Clock = { kind: 'timed'; baseS: number; incS: number } | { kind: 'daily' } | { kind: 'unknown' }

export function parseClock(raw: string | null): Clock {
  const tc = raw?.trim() ?? ''
  if (/^\d+\/\d+$/.test(tc)) return { kind: 'daily' }
  const m = tc.match(/^(\d+)(?:\+(\d+))?$/)
  if (!m) return { kind: 'unknown' }
  const baseS = Number(m[1])
  const incS = Number(m[2] ?? '0')
  if (baseS === 0 && incS === 0) return { kind: 'unknown' }
  return { kind: 'timed', baseS, incS }
}

export function maxDurationMs(baseS: number, incS: number): number {
  return (2 * baseS + 2 * MAX_MOVES_PER_SIDE * incS) * 1000
}

interface Span {
  id: string
  t: number
  earliestStart: number
  latestEnd: number
}

function spanOf(g: HistoryGame, t: number, durMs: number): Span | null {
  if (g.platform === 'chess_com') return { id: g.id, t, earliestStart: t - durMs, latestEnd: t }
  if (g.platform === 'lichess') return { id: g.id, t, earliestStart: t, latestEnd: t + durMs }
  return null
}

export function buildSittings(history: HistoryGame[]): Sitting[] {
  const dated = history
    .map((g) => ({ g, t: g.playedAt === null ? NaN : Date.parse(g.playedAt) }))
    .filter(({ g, t }) => !Number.isNaN(t) && parseClock(g.timeControl).kind !== 'daily')
    .sort((a, b) => a.t - b.t || (a.g.id < b.g.id ? -1 : a.g.id > b.g.id ? 1 : 0))

  const sittings: Sitting[] = []
  let current: Sitting | null = null
  let last: Span | null = null
  let nextPlaced = false
  for (const { g, t } of dated) {
    const clock = parseClock(g.timeControl)
    const span = clock.kind === 'timed' ? spanOf(g, t, maxDurationMs(clock.baseS, clock.incS)) : null
    if (!span) {
      current = null
      last = null
      nextPlaced = false
      continue
    }
    if (current && last && span.earliestStart - last.latestEnd <= BREAK_MS) {
      current.gameIds.push(span.id)
    } else {
      current = { placed: nextPlaced, gameIds: [span.id] }
      sittings.push(current)
      nextPlaced = true
    }
    last = span
  }
  return sittings
}

export interface ScopeGame {
  id: string
  playedAt: string | null
  opponent: string | null
  result: GameResult | null
  userColor: 'white' | 'black' | null
  analysed: boolean
}

export interface BlunderMove {
  gameId: string
  ply: number
  evalBefore: number | null
  evalAfter: number | null
}

export function isUserPly(ply: number, userColor: 'white' | 'black'): boolean {
  return userColor === 'white' ? ply % 2 === 1 : ply % 2 === 0
}

export function isMateMissWhileWinning(m: BlunderMove, userColor: 'white' | 'black'): boolean {
  if (m.evalBefore === null || m.evalAfter === null) return false
  const sign = userColor === 'white' ? 1 : -1
  return sign * m.evalBefore >= MATE_SCORE_CP && sign * m.evalAfter >= STILL_WINNING_CP
}

export function gamesWithUserBlunder(games: ScopeGame[], blunders: BlunderMove[]): Set<string> {
  const colour = new Map(games.map((g) => [g.id, g.userColor]))
  const out = new Set<string>()
  for (const m of blunders) {
    const c = colour.get(m.gameId)
    if (!c || !isUserPly(m.ply, c) || isMateMissWhileWinning(m, c)) continue
    out.add(m.gameId)
  }
  return out
}

export interface SittingDoorGame {
  key: string
  gameId: string
  position: number
  side: 'early' | 'late'
  opponent: string | null
  result: GameResult | null
  blundered: boolean
}

export interface SittingDoorGroup {
  key: string
  playedAt: string | null
  games: SittingDoorGame[]
}

export interface FatigueSentence {
  text: string
  door?: boolean
}

export interface FatigueLine {
  sentences: FatigueSentence[]
  rule: string[]
  sittings: SittingDoorGroup[]
}

export const FATIGUE_RULE = [
  'A game is counted when the engine marked at least one of your moves in it a blunder.',
  'Two games are one sitting unless their times show a break of more than 10 minutes between them.',
  'Only the games of this report are counted, and only those whose place in their sitting is known.',
]

export const SAME_RATE = 'The rate is the same either way.'

const EARLY_WORDS = ['', 'first game', 'first two games', 'first three games']

export function fatigueLine(history: HistoryGame[], scope: ScopeGame[], blunders: BlunderMove[]): FatigueLine | null {
  const byId = new Map(scope.map((g) => [g.id, g]))
  const blundered = gamesWithUserBlunder(scope, blunders)

  const groups: SittingDoorGroup[] = []
  for (const s of buildSittings(history)) {
    if (!s.placed) continue
    const games: SittingDoorGame[] = []
    s.gameIds.forEach((id, i) => {
      const g = byId.get(id)
      if (!g || !g.analysed || g.userColor === null) return
      const position = i + 1
      games.push({
        key: id,
        gameId: id,
        position,
        side: position <= EARLY_GAMES ? 'early' : 'late',
        opponent: g.opponent,
        result: g.result,
        blundered: blundered.has(id),
      })
    })
    if (games.length > 0) groups.push({ key: s.gameIds[0]!, playedAt: byId.get(games[0]!.gameId)?.playedAt ?? null, games })
  }

  const all = groups.flatMap((s) => s.games)
  const early = all.filter((g) => g.side === 'early')
  const late = all.filter((g) => g.side === 'late')
  const lateSittings = groups.filter((s) => s.games.some((g) => g.side === 'late')).length
  if (early.length < MIN_GAMES_EACH_SIDE || late.length < MIN_GAMES_EACH_SIDE || lateSittings < MIN_LATE_SITTINGS) {
    return null
  }

  const a = early.filter((g) => g.blundered).length
  const c = late.filter((g) => g.blundered).length
  const sentences: FatigueSentence[] = [
    { text: `In the ${EARLY_WORDS[EARLY_GAMES]} of a sitting, you blundered in ${a} of ${early.length}.`, door: true },
    { text: `From game ${EARLY_GAMES + 1} on, you blundered in ${c} of ${late.length}.`, door: true },
  ]
  if (a * late.length === c * early.length) sentences.push({ text: SAME_RATE })
  return { sentences, rule: FATIGUE_RULE, sittings: groups }
}
