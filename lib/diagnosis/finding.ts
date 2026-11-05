import { standing } from '@/lib/training/reveal'
import { countNoun } from '../count-noun'
import { tagSentences } from './tag-sentences'

export type GameResult = 'win' | 'loss' | 'draw'

export interface GroupFacts {
  tag: string
  label: string
  gameIds: string[]
  frequency: number
  occurrences: number
  totalCp: number
  avgCp: number
  score: number
  recurring: boolean
  exhibit: { gameId: string; rootPly: number; rootSan: string; blunderPly: number; blunderSan: string; swingCp: number }
}

export interface InstanceFacts {
  gameId: string
  rootPly: number
  rootSan: string
  fenBefore: string
  from: string | null
  to: string | null
  userColor: 'white' | 'black'
  playedAt: string | null
  opponent: string | null
  result: GameResult | null
  beforeCp: number | null
  afterCp: number | null
}

export interface EvidenceBoard {
  key: string
  label: string
  fen: string
  orientation: 'white' | 'black'
  from: string
  to: string
}

export interface SourceRow {
  key: string
  gameId: string
  rootPly: number
  playedAt: string | null
  opponent: string | null
  moveNumber: number
  result: GameResult | null
  counted: boolean
}

export interface ClaimSentence {
  text: string
  door?: boolean | string
}

export interface Finding {
  tag: string
  label: string
  checked: string | null
  frequency: number
  gameCount: number
  recurring: boolean
  status: string
  note: string | null
  claim: ClaimSentence[]
  rule: string
  boards: EvidenceBoard[]
  shownNote: string | null
  sources: SourceRow[]
}

export const MAX_FINDINGS = 5
export const MAX_BOARDS = 6
export const RECURRING_GAMES = 3

export function userCp(whitePerspectiveCp: number | null | undefined, userColor: 'white' | 'black'): number | null {
  if (whitePerspectiveCp === null || whitePerspectiveCp === undefined) return null
  return userColor === 'white' ? whitePerspectiveCp : -whitePerspectiveCp
}

export function moveNumber(ply: number): number {
  return Math.ceil(ply / 2)
}

export function sentenceCase(label: string): string {
  const lower = label.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

function byScore(a: GroupFacts, b: GroupFacts): number {
  return b.score - a.score || b.frequency - a.frequency || b.avgCp - a.avgCp
}

export function selectFindings(groups: GroupFacts[]): { ordered: GroupFacts[]; degraded: boolean } {
  const sorted = [...groups].sort(byScore)
  const recurring = sorted.filter((g) => g.recurring)
  const rest = sorted.filter((g) => !g.recurring)
  if (recurring.length > 0) return { ordered: [...recurring, ...rest].slice(0, MAX_FINDINGS), degraded: false }
  if (sorted.length === 0) return { ordered: [], degraded: false }
  const costliest = sorted.reduce((a, b) => (b.exhibit.swingCp > a.exhibit.swingCp ? b : a))
  return { ordered: [costliest, ...sorted.filter((g) => g !== costliest)].slice(0, MAX_FINDINGS), degraded: true }
}

export function chronological(instances: InstanceFacts[]): InstanceFacts[] {
  return [...instances].sort((a, b) => {
    if (a.playedAt !== b.playedAt) {
      if (a.playedAt === null) return 1
      if (b.playedAt === null) return -1
      return a.playedAt < b.playedAt ? -1 : 1
    }
    if (a.gameId !== b.gameId) return a.gameId < b.gameId ? -1 : 1
    return a.rootPly - b.rootPly
  })
}

export function isSignFlip(i: Pick<InstanceFacts, 'beforeCp' | 'afterCp'>): boolean {
  return i.beforeCp !== null && i.afterCp !== null && i.beforeCp > 0 && i.afterCp < 0
}

function sharedStanding(cps: number[], signWord: 'ahead' | 'behind'): string {
  const bands = new Set(cps.map(standing))
  return bands.size === 1 ? Array.from(bands)[0]! : signWord
}

type Verb = 'lost' | 'drew' | 'won'
const VERB: Record<GameResult, Verb> = { loss: 'lost', draw: 'drew', win: 'won' }

function resultList(lost: number, drew: number, won: number): string {
  const parts = [
    lost ? `lost ${lost}` : null,
    drew ? `drew ${drew}` : null,
    won ? `won ${won}` : null,
  ].filter((p): p is string => p !== null)
  return parts.length === 3 ? `${parts[0]}, ${parts[1]} and ${parts[2]}` : `${parts[0]} and ${parts[1]}`
}

function resultsSentence(games: { result: GameResult | null }[], times: number): string | null {
  if (games.length === 0 || games.some((g) => g.result === null)) return null
  const n = games.length
  const lost = games.filter((g) => g.result === 'loss').length
  const drew = games.filter((g) => g.result === 'draw').length
  const won = games.filter((g) => g.result === 'win').length
  const same: Verb | null = lost === n ? 'lost' : drew === n ? 'drew' : won === n ? 'won' : null
  if (n === 1) {
    const verb = VERB[games[0]!.result!]
    if (times === 1) return `You ${verb} that game.`
    return `${times === 2 ? 'Both' : `All ${times}`} came in one game, and you ${verb} it.`
  }
  const allOf = n === 2 ? 'both' : `all ${n}`
  if (n === times) {
    return same ? `You ${same} ${allOf} games.` : `Of those ${n} games, you ${resultList(lost, drew, won)}.`
  }
  return same ? `They came in ${n} games, and you ${same} ${allOf}.` : `They came in ${n} games: you ${resultList(lost, drew, won)}.`
}

function countPhrase(counted: number, total: number): string {
  if (counted < total) return `${counted} of the ${total} times`
  if (total === 1) return 'Once'
  if (total === 2) return 'Both times'
  return `All ${total} times`
}

export function buildClaim(
  instances: InstanceFacts[],
  frequency: number,
  gameCount: number
): ClaimSentence[] {
  const counted = instances.filter(isSignFlip)
  if (counted.length === 0) {
    return [{ text: `This came up in ${frequency} of your ${countNoun(gameCount, 'game')}.`, door: true }]
  }
  const before = sharedStanding(counted.map((i) => i.beforeCp!), 'ahead')
  const after = sharedStanding(counted.map((i) => i.afterCp!), 'behind')
  const count = countPhrase(counted.length, instances.length)
  const games = Array.from(new Map(counted.map((i) => [i.gameId, { result: i.result }])).values())
  const outcome = resultsSentence(games, counted.length)
  return [
    { text: `${count}, you were ${before} before this move and ${after} after the blunder that ended its slide.`, door: count },
    ...(outcome ? [{ text: outcome }] : []),
  ]
}

export const COUNTED_RULE =
  'Counted when the engine had you ahead before this move and behind after the blunder that ended its slide.'
export const LISTED_RULE = 'Every game where this pattern started a slide.'

function status(g: GroupFacts, gameCount: number): string {
  const base = `${g.frequency} of ${countNoun(gameCount, 'game')}`
  return g.recurring ? base : `${base}, not yet a habit`
}

export function buildFindings(
  groups: GroupFacts[],
  instancesByTag: Map<string, InstanceFacts[]>,
  gameCount: number
): Finding[] {
  const { ordered } = selectFindings(groups)
  return ordered.map((g) => {
    const instances = chronological(instancesByTag.get(g.tag) ?? [])
    const claim = buildClaim(instances, g.frequency, gameCount)
    const hasLead = claim.length > 1
    const drawable = instances.filter((i) => i.from !== null && i.to !== null)
    const shown = drawable.slice(0, MAX_BOARDS)
    return {
      tag: g.tag,
      label: sentenceCase(g.label),
      checked: tagSentences(g.tag)?.finding ?? null,
      frequency: g.frequency,
      gameCount,
      recurring: g.recurring,
      status: status(g, gameCount),
      note: null,
      claim,
      rule: hasLead ? COUNTED_RULE : LISTED_RULE,
      boards: shown.map((i) => ({
        key: `${i.gameId}:${i.rootPly}`,
        label: `Move ${moveNumber(i.rootPly)}: ${i.rootSan}`,
        fen: i.fenBefore,
        orientation: i.userColor,
        from: i.from!,
        to: i.to!,
      })),
      shownNote: drawable.length > shown.length ? `${shown.length} of ${drawable.length} shown` : null,
      sources: instances.map((i) => ({
        key: `${i.gameId}:${i.rootPly}`,
        gameId: i.gameId,
        rootPly: i.rootPly,
        playedAt: i.playedAt,
        opponent: i.opponent,
        moveNumber: moveNumber(i.rootPly),
        result: i.result,
        counted: isSignFlip(i),
      })),
    }
  })
}

export const ARROW_STEP_MS = 500
export const ARROW_IN_MS = 280
export const FADE_PAUSE_MS = 3000
export const FADE_MS = 1200
export const FADED_OPACITY = 0.4

export type EvidencePhase = 'idle' | 'run' | 'final'

export interface EvidenceTiming {
  arrowDelaysMs: number[]
  fadeDelayMs: number
  arrowInMs: number
  fadeMs: number
}

export function evidenceTiming(boards: number, reducedMotion: boolean): EvidenceTiming {
  if (reducedMotion) {
    return { arrowDelaysMs: Array.from({ length: boards }, () => 0), fadeDelayMs: 0, arrowInMs: 0, fadeMs: 0 }
  }
  const arrowDelaysMs = Array.from({ length: boards }, (_, i) => i * ARROW_STEP_MS)
  const lastArrowDone = boards > 0 ? arrowDelaysMs[boards - 1]! + ARROW_IN_MS : 0
  return { arrowDelaysMs, fadeDelayMs: lastArrowDone + FADE_PAUSE_MS, arrowInMs: ARROW_IN_MS, fadeMs: FADE_MS }
}

export function initialPhase(reducedMotion: boolean | undefined): EvidencePhase {
  return reducedMotion === true ? 'final' : 'idle'
}
