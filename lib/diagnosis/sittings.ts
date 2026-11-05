import { MATE_SCORE_CP, STILL_WINNING_CP } from '../training/grading'
import type { GameResult } from './finding'

export const BREAK_MS = 10 * 60 * 1000
export const MAX_MOVES_PER_SIDE = 80
export const EARLY_GAMES = 2
export const MIN_GAMES_EACH_SIDE = 5
export const MIN_LATE_SITTINGS = 3
export const MIN_AFTER_LOSS_SITTINGS = 3

export type Platform = 'chess_com' | 'lichess'

export interface HistoryGame {
  id: string
  platform: string | null
  playedAt: string | null
  timeControl: string | null
  result?: GameResult | null
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
  evaluated?: boolean
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

export const EVAL_PROBE_PLIES = 10

export function hasEngineEvals(moves: { eval_before: number | string | null; eval_after: number | string | null }[]): boolean {
  return moves.some((m) =>
    [m.eval_before, m.eval_after].some((v) => Number.isFinite(Number(v)) && Number(v) !== 0)
  )
}

export interface SittingDoorGame {
  key: string
  gameId: string
  position: number
  side: 'early' | 'late'
  afterLoss: boolean | null
  opponent: string | null
  result: GameResult | null
  blundered: boolean
}

export interface SittingDoorGroup {
  key: string
  playedAt: string | null
  games: SittingDoorGame[]
}

export type NotCountedReason =
  | 'not_analysed'
  | 'no_evals'
  | 'unknown_colour'
  | 'undated'
  | 'daily'
  | 'unreadable_clock'
  | 'earliest_sitting'
  | 'after_unreadable'
  | 'unplaced'

export const NOT_COUNTED_WORDS: Record<NotCountedReason, string> = {
  not_analysed: 'not analysed',
  no_evals: 'no engine evals stored',
  unknown_colour: 'your colour is not on record',
  undated: 'no date on record',
  daily: 'daily game',
  unreadable_clock: 'its clock cannot be read',
  earliest_sitting: 'first sitting on record',
  after_unreadable: 'after a game whose clock cannot be read',
  unplaced: 'not found among your games',
}

export interface NotCountedGame {
  key: string
  gameId: string
  playedAt: string | null
  opponent: string | null
  result: GameResult | null
  reason: NotCountedReason
}

export function countedSittings(
  history: HistoryGame[],
  scope: ScopeGame[],
  blunders: BlunderMove[]
): { groups: SittingDoorGroup[]; notCounted: NotCountedGame[] } {
  const byId = new Map(scope.map((g) => [g.id, g]))
  const historyById = new Map(history.map((h) => [h.id, h]))
  const blundered = gamesWithUserBlunder(scope, blunders)
  const resultOf = new Map<string, GameResult | null>()
  for (const h of history) if (h.result !== undefined) resultOf.set(h.id, h.result)
  for (const g of scope) resultOf.set(g.id, g.result)

  const sittings = buildSittings(history)
  const placement = new Map<string, NotCountedReason | null>()
  const groups: SittingDoorGroup[] = []
  sittings.forEach((s, index) => {
    for (const id of s.gameIds) placement.set(id, s.placed ? null : index === 0 ? 'earliest_sitting' : 'after_unreadable')
    if (!s.placed) return
    const games: SittingDoorGame[] = []
    s.gameIds.forEach((id, i) => {
      const g = byId.get(id)
      if (!g || ownReason(g) !== null) return
      const position = i + 1
      const before = i > 0 ? (resultOf.get(s.gameIds[i - 1]!) ?? null) : undefined
      games.push({
        key: id,
        gameId: id,
        position,
        side: position <= EARLY_GAMES ? 'early' : 'late',
        afterLoss: before === undefined ? false : before === null ? null : before === 'loss',
        opponent: g.opponent,
        result: g.result,
        blundered: blundered.has(id),
      })
    })
    if (games.length > 0) groups.push({ key: s.gameIds[0]!, playedAt: byId.get(games[0]!.gameId)?.playedAt ?? null, games })
  })

  const counted = new Set(groups.flatMap((s) => s.games.map((g) => g.gameId)))
  const notCounted: NotCountedGame[] = []
  for (const g of scope) {
    if (counted.has(g.id)) continue
    notCounted.push({
      key: g.id,
      gameId: g.id,
      playedAt: g.playedAt,
      opponent: g.opponent,
      result: g.result,
      reason: ownReason(g) ?? placeReason(g.id, historyById.get(g.id), placement),
    })
  }
  const time = (iso: string | null) => (iso === null ? NaN : Date.parse(iso))
  notCounted.sort((a, b) => {
    const ta = time(a.playedAt)
    const tb = time(b.playedAt)
    if (Number.isNaN(ta) !== Number.isNaN(tb)) return Number.isNaN(ta) ? 1 : -1
    return (Number.isNaN(ta) ? 0 : ta - tb) || (a.gameId < b.gameId ? -1 : a.gameId > b.gameId ? 1 : 0)
  })
  return { groups, notCounted }
}

function ownReason(g: ScopeGame): NotCountedReason | null {
  if (!g.analysed) return 'not_analysed'
  if (g.evaluated === false) return 'no_evals'
  if (g.userColor === null) return 'unknown_colour'
  return null
}

function placeReason(id: string, h: HistoryGame | undefined, placement: Map<string, NotCountedReason | null>): NotCountedReason {
  const placed = placement.get(id)
  if (placed) return placed
  if (!h) return 'unplaced'
  if (h.playedAt === null || Number.isNaN(Date.parse(h.playedAt))) return 'undated'
  if (parseClock(h.timeControl).kind === 'daily') return 'daily'
  return 'unreadable_clock'
}

interface Side {
  games: number
  blundered: number
}
interface SittingSide extends Side {
  sittings: number
}

export interface SittingTallies {
  early: Side
  late: SittingSide
  afterLoss: SittingSide
  otherwise: Side
  unknownBefore: number
}

function tally(groups: SittingDoorGroup[], keep: (g: SittingDoorGame) => boolean): SittingSide {
  let games = 0
  let blundered = 0
  let sittings = 0
  for (const s of groups) {
    const kept = s.games.filter(keep)
    games += kept.length
    blundered += kept.filter((g) => g.blundered).length
    if (kept.length > 0) sittings += 1
  }
  return { games, blundered, sittings }
}

function side(groups: SittingDoorGroup[], keep: (g: SittingDoorGame) => boolean): Side {
  const t = tally(groups, keep)
  return { games: t.games, blundered: t.blundered }
}

function talliesOf(groups: SittingDoorGroup[]): SittingTallies {
  return {
    early: side(groups, (g) => g.side === 'early'),
    late: tally(groups, (g) => g.side === 'late'),
    afterLoss: tally(groups, (g) => g.afterLoss === true),
    otherwise: side(groups, (g) => g.afterLoss === false),
    unknownBefore: groups.reduce((n, s) => n + s.games.filter((g) => g.afterLoss === null).length, 0),
  }
}

export function sittingTallies(history: HistoryGame[], scope: ScopeGame[], blunders: BlunderMove[]): SittingTallies {
  return talliesOf(countedSittings(history, scope, blunders).groups)
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

export const SCOPE_RULE = {
  report: FATIGUE_RULE[2]!,
  account: 'All your analysed games are counted, except the ones listed below as not counted, each with its reason.',
} as const

export const UNSEEN_RULE = 'Games not on record here, such as bullet games, are not seen, even when played in between.'

export const TILT_RULE = [
  'A game counts as after a loss when the game straight before it, in the same sitting, was lost.',
  'The first game of a sitting, and a game after a win or a draw, count as otherwise.',
  'A game whose previous game has no result on record is left out of these two counts.',
]

export const SAME_RATE = 'The rate is the same either way.'

const EARLY_WORDS = ['', 'first game', 'first two games', 'first three games']

function fatigueSentences(t: SittingTallies, lateSittings: number): FatigueSentence[] | null {
  if (t.early.games < MIN_GAMES_EACH_SIDE || t.late.games < MIN_GAMES_EACH_SIDE || lateSittings < MIN_LATE_SITTINGS) return null
  const out: FatigueSentence[] = [
    { text: `In the ${EARLY_WORDS[EARLY_GAMES]} of a sitting, you blundered in ${t.early.blundered} of ${t.early.games}.`, door: true },
    { text: `From game ${EARLY_GAMES + 1} on, you blundered in ${t.late.blundered} of ${t.late.games}.`, door: true },
  ]
  if (t.early.blundered * t.late.games === t.late.blundered * t.early.games) out.push({ text: SAME_RATE })
  return out
}

function tiltSentences(t: SittingTallies): FatigueSentence[] | null {
  const a = t.afterLoss
  const o = t.otherwise
  if (a.games < MIN_GAMES_EACH_SIDE || o.games < MIN_GAMES_EACH_SIDE || a.sittings < MIN_AFTER_LOSS_SITTINGS) return null
  const out: FatigueSentence[] = [
    { text: `After a loss in the same sitting, you blundered in ${a.blundered} of ${a.games} games.`, door: true },
    { text: `Otherwise, you blundered in ${o.blundered} of ${o.games}.`, door: true },
  ]
  if (a.blundered * o.games === o.blundered * a.games) out.push({ text: SAME_RATE })
  return out
}

export function fatigueLine(history: HistoryGame[], scope: ScopeGame[], blunders: BlunderMove[]): FatigueLine | null {
  const { groups } = countedSittings(history, scope, blunders)
  const t = talliesOf(groups)
  const sentences = fatigueSentences(t, t.late.sittings)
  return sentences ? { sentences, rule: FATIGUE_RULE, sittings: groups } : null
}

export function tiltLine(history: HistoryGame[], scope: ScopeGame[], blunders: BlunderMove[]): FatigueLine | null {
  const { groups } = countedSittings(history, scope, blunders)
  const sentences = tiltSentences(talliesOf(groups))
  return sentences ? { sentences, rule: TILT_RULE, sittings: groups } : null
}

export interface SittingReport {
  coverage: FatigueSentence
  fatigue: FatigueSentence[] | null
  tilt: FatigueSentence[] | null
  rule: string[]
  sittings: SittingDoorGroup[]
  notCounted: NotCountedGame[]
}

export function sittingReport(
  history: HistoryGame[],
  scope: ScopeGame[],
  blunders: BlunderMove[],
  scopeKind: 'report' | 'account'
): SittingReport | null {
  const { groups, notCounted } = countedSittings(history, scope, blunders)
  const t = talliesOf(groups)
  const fatigue = fatigueSentences(t, t.late.sittings)
  const tilt = tiltSentences(t)
  if (!fatigue && !tilt) return null
  const counted = t.early.games + t.late.games
  const coverage =
    scopeKind === 'account'
      ? `These counts cover ${counted} of your ${scope.length} analysed games.`
      : `These counts cover ${counted} of the ${scope.length} games in this report.`
  return {
    coverage: { text: coverage, door: true },
    fatigue,
    tilt,
    rule: [FATIGUE_RULE[0]!, FATIGUE_RULE[1]!, SCOPE_RULE[scopeKind], UNSEEN_RULE, ...(tilt ? TILT_RULE : [])],
    sittings: groups,
    notCounted,
  }
}
