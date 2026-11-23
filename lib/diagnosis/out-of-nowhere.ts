import { blunderStandsAlone, toUserEval } from '../chains/stands-alone'
import { isMateMissWhileWinning, isUserPly, type BlunderMove } from './sittings'
import { countNoun } from '../count-noun'
import { standing } from '../training/reveal'
import {
  MAX_BOARDS,
  RECURRING_GAMES,
  chronological,
  countPhrase,
  moveNumber,
  resultsSentence,
  type Finding,
  type GameResult,
  type InstanceFacts,
} from './finding'
import { rootSquares } from './instance'

function breaksAFinePosition(m: BlunderMove, c: 'white' | 'black'): boolean {
  if (!isUserPly(m.ply, c) || isMateMissWhileWinning(m, c)) return false
  if (m.evalBefore === null || !blunderStandsAlone(toUserEval(m.evalBefore, c))) return false
  return m.evalAfter !== null && !blunderStandsAlone(toUserEval(m.evalAfter, c))
}

export function outOfNowhereGames(
  games: readonly { id: string; user_color: 'white' | 'black' | null }[],
  blunders: readonly BlunderMove[]
): Set<string> {
  const colour = new Map(games.map((g) => [g.id, g.user_color]))
  const out = new Set<string>()
  for (const m of blunders) {
    const c = colour.get(m.gameId)
    if (c && breaksAFinePosition(m, c)) out.add(m.gameId)
  }
  return out
}

export interface SuddenBlunderMove extends BlunderMove {
  san: string
  fenBefore: string
}

export interface SuddenGame {
  id: string
  played_at: string | null
  opponent_username: string | null
  result: GameResult | null
  user_color: 'white' | 'black' | null
}

export function suddenBlunderInstances(games: readonly SuddenGame[], blunders: readonly SuddenBlunderMove[]): InstanceFacts[] {
  const byId = new Map(games.map((g) => [g.id, g]))
  const first = new Map<string, SuddenBlunderMove>()
  for (const m of blunders) {
    const g = byId.get(m.gameId)
    if (!g?.user_color || !breaksAFinePosition(m, g.user_color)) continue
    const prev = first.get(m.gameId)
    if (!prev || m.ply < prev.ply) first.set(m.gameId, m)
  }
  return Array.from(first.values()).map((m) => {
    const g = byId.get(m.gameId)!
    const c = g.user_color!
    const sq = rootSquares(m.fenBefore, m.san)
    return {
      gameId: g.id,
      rootPly: m.ply,
      rootSan: m.san,
      fenBefore: m.fenBefore,
      from: sq?.from ?? null,
      to: sq?.to ?? null,
      userColor: c,
      playedAt: g.played_at,
      opponent: g.opponent_username,
      result: g.result,
      beforeCp: toUserEval(m.evalBefore!, c),
      afterCp: toUserEval(m.evalAfter!, c),
    }
  })
}

export const SUDDEN_TAG = 'sudden_blunder'
export const SUDDEN_CHECKED = 'Each board shows a blunder that threw away a good position.'
export const SUDDEN_RULE =
  'Counted when you were about equal or better just before one of your blunders and worse after it. One board per game: its first such blunder.'

function bands(cps: number[], otherwise: string): string {
  const set = new Set(cps.map(standing))
  return set.size === 1 ? Array.from(set)[0]! : otherwise
}

export function suddenBlunderFinding(instances: readonly InstanceFacts[], gameCount: number): Finding | null {
  if (instances.length === 0) return null
  const ordered = chronological([...instances])
  const n = ordered.length
  const before = bands(ordered.map((i) => i.beforeCp!), 'doing fine')
  const after = bands(ordered.map((i) => i.afterCp!), 'behind')
  const count = countPhrase(n, n)
  const outcome = resultsSentence(ordered.map((i) => ({ result: i.result })), n)
  const recurring = n >= RECURRING_GAMES
  const base = `${n} of ${countNoun(gameCount, 'game')}`
  const drawable = ordered.filter((i) => i.from !== null && i.to !== null)
  const shown = drawable.slice(0, MAX_BOARDS)
  return {
    tag: SUDDEN_TAG,
    label: 'Sudden blunder',
    checked: SUDDEN_CHECKED,
    frequency: n,
    gameCount,
    recurring,
    status: recurring ? base : `${base}, not yet a habit`,
    note: null,
    claim: [
      { text: `${count}, you were ${before} before the blunder and ${after} after it.`, door: count },
      ...(outcome ? [{ text: outcome }] : []),
    ],
    rule: SUDDEN_RULE,
    boards: shown.map((i) => ({
      key: `${i.gameId}:${i.rootPly}`,
      label: `Move ${moveNumber(i.rootPly)}: ${i.rootSan}`,
      fen: i.fenBefore,
      orientation: i.userColor,
      from: i.from!,
      to: i.to!,
    })),
    shownNote: drawable.length > shown.length ? `${shown.length} of ${drawable.length} shown` : null,
    sources: ordered.map((i) => ({
      key: `${i.gameId}:${i.rootPly}`,
      gameId: i.gameId,
      rootPly: i.rootPly,
      playedAt: i.playedAt,
      opponent: i.opponent,
      moveNumber: moveNumber(i.rootPly),
      result: i.result,
      counted: true,
    })),
  }
}

export function withSuddenFinding(findings: readonly Finding[], sudden: Finding | null, suddenLeads: boolean): Finding[] {
  if (!sudden) return [...findings]
  const out = suddenLeads ? [sudden, ...findings] : [...findings.slice(0, 1), sudden, ...findings.slice(1)]
  return out.slice(0, 5)
}

export function outOfNowhereSentence(games: number, gameCount: number): string | null {
  if (!(games > 0)) return null
  return `In ${games} of your ${countNoun(gameCount, 'game')}, you threw away a good position with one sudden blunder.`
}
