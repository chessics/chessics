import type { Color, Result } from '@/lib/supabase/types'
import { Chess } from 'chess.js'
import { pgnHeader, pgnSanMoves } from '@/lib/clock'
import { STABLE_CP, toUserEval } from '@/lib/chains/stands-alone'
import { standing } from '@/lib/training/reveal'
import { decidingChain, moveNumberOfPly, type DecidedAtChain } from './decided-at'
import { winChance } from './win-chance'

export const STANDALONE_DROP = 15
export const BIGGEST_DROP = 10

export interface KeyMomentMove {
  ply_number: number
  san: string
  fen_before?: string
  eval_before: number | null
  eval_after: number | null
}

interface MomentDetails {
  ply: number
  moveNumber: number
  san: string
  before: string
  after: string
  terminal: { ply: number; moveNumber: number; san: string } | null
  spentMs: number | null
}

export type KeyMoment = MomentDetails & (
  | { kind: 'decided' | 'alone' | 'drop'; usualMs: number | null }
  | { kind: 'won'; opponent: 'White' | 'Black' | null; reply: string | null; captured: string | null }
)

export type KeyMomentKind = KeyMoment['kind']

type KeyMomentInput = {
  result: Result | null
  userColor: Color | null
  chains: readonly DecidedAtChain[]
  moves: readonly KeyMomentMove[]
  spent?: ReadonlyMap<number, number> | null
  pgn?: string | null
}

function capturedByReply(reply: KeyMomentMove): string | null {
  if (!reply.fen_before) return null
  try {
    const piece = new Chess(reply.fen_before).move(reply.san)?.captured
    return piece ? { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }[piece] : null
  } catch {
    return null
  }
}

export function keyMoment(input: KeyMomentInput): KeyMoment | null {
  if (input.result !== 'win') return costlyMoment(input)
  const { moves, userColor, pgn } = input
  if (!userColor) return null
  const ordered = [...moves].sort((a, b) => a.ply_number - b.ply_number)
  if (pgn) {
    if (/\b(?:on time|time forfeit|timeout)\b/i.test(pgnHeader(pgn, 'Termination') ?? '')) return null
    const plies = pgnSanMoves(pgn).length
    if (plies !== ordered.length || ordered.some((move, i) => move.ply_number !== i + 1)) return null
  }

  const aheadCp = 50
  for (let i = ordered.length - 1; i >= 0; i--) {
    const move = ordered[i]
    const next = ordered[i + 1]
    if (next && next.ply_number !== move.ply_number + 1) return null
    if (move.eval_before === null || move.eval_after === null) return null
    const before = toUserEval(move.eval_before, userColor)
    const after = toUserEval(move.eval_after, userColor)
    if (after < aheadCp) return null
    if (before >= aheadCp) continue
    const mover = move.ply_number % 2 === 1 ? 'white' : 'black'
    const opponent = mover === userColor ? null : mover === 'white' ? 'White' : 'Black'
    return {
      kind: 'won', ply: move.ply_number, moveNumber: moveNumberOfPly(move.ply_number), san: move.san,
      before: standing(before), after: standing(after), terminal: null, spentMs: null,
      opponent, reply: opponent && next ? next.san : null,
      captured: opponent && next ? capturedByReply(next) : null,
    }
  }
  return null
}

export function costlyMoment(input: KeyMomentInput): KeyMoment | null {
  const { result, userColor, chains, moves, spent } = input
  if (userColor !== 'white' && userColor !== 'black') return null
  const user = (cp: number) => toUserEval(cp, userColor)
  const byPly = new Map(moves.map(m => [m.ply_number, m]))
  const parity = userColor === 'white' ? 1 : 0
  const timingOn = (ply: number) => {
    const spentMs = spent?.get(ply) ?? null
    if (!spent || spentMs === null) return { spentMs, usualMs: null }

    const times = Array.from(spent)
      .filter(([p]) => p % 2 === parity && moveNumberOfPly(p) >= 6)
      .map(([, ms]) => ms)
      .sort((a, b) => a - b)
    if (times.length === 0) return { spentMs, usualMs: null }
    const mid = Math.floor(times.length / 2)
    const usualMs = times.length % 2 === 1 ? times[mid] : (times[mid - 1] + times[mid]) / 2
    return { spentMs, usualMs }
  }

  const decided = decidingChain({ result, userColor, chains, moves })
  if (decided) {
    const root = byPly.get(decided.root_move_ply)
    const terminal = byPly.get(decided.terminal_blunder_ply)
    if (root && terminal && root.eval_before !== null && terminal.eval_after !== null) {
      return {
        kind: 'decided',
        ply: root.ply_number,
        moveNumber: moveNumberOfPly(root.ply_number),
        san: root.san,
        before: standing(user(root.eval_before)),
        after: standing(user(terminal.eval_after)),
        terminal: { ply: terminal.ply_number, moveNumber: moveNumberOfPly(terminal.ply_number), san: terminal.san },
        ...timingOn(root.ply_number),
      }
    }
  }

  const own = [...moves]
    .filter(m => m.ply_number % 2 === parity && m.eval_before !== null && m.eval_after !== null)
    .sort((a, b) => a.ply_number - b.ply_number)
    .map(m => {
      const before = user(m.eval_before!)
      const after = user(m.eval_after!)
      return { m, before, after, drop: winChance(before) - winChance(after) }
    })

  const card = (kind: 'alone' | 'drop', x: (typeof own)[number]): KeyMoment => ({
    kind,
    ply: x.m.ply_number,
    moveNumber: moveNumberOfPly(x.m.ply_number),
    san: x.m.san,
    before: standing(x.before),
    after: standing(x.after),
    terminal: null,
    ...timingOn(x.m.ply_number),
  })

  const alone = own.find(x => x.before >= STABLE_CP && x.drop >= STANDALONE_DROP)
  if (alone) return card('alone', alone)

  let biggest: (typeof own)[number] | null = null
  for (const x of own) if (!biggest || x.drop > biggest.drop) biggest = x
  if (biggest && biggest.drop >= BIGGEST_DROP) return card('drop', biggest)

  return null
}

export function spentWords(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const min = Math.floor(total / 60)
  const sec = total % 60
  const s = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
  if (min === 0) return s(sec, 'second')
  return sec === 0 ? s(min, 'minute') : `${s(min, 'minute')} ${s(sec, 'second')}`
}

export function isTurningMove(k: KeyMoment): boolean {
  if (k.kind === 'won') return false
  if (k.kind === 'decided') return true
  return k.before !== 'a bit worse' && k.before !== 'clearly worse' && k.before !== 'losing'
    && (k.after === 'a bit worse' || k.after === 'clearly worse' || k.after === 'losing')
}

function momentLead(k: KeyMoment) {
  if (k.kind === 'won') return { heading: 'Where you went ahead', row: 'Went ahead at' }
  if (k.kind === 'decided') return { heading: 'Game decided at', row: 'Turned at' }
  if (isTurningMove(k)) return { heading: 'Where it turned', row: 'Turned at' }
  if (k.kind === 'drop') return { heading: 'Your costliest move', row: 'Costliest' }
  return { heading: 'A costly move', row: 'Costly' }
}

export function keyMomentTitle(k: KeyMoment): string {
  return `${momentLead(k).heading}: move ${k.moveNumber}`
}

export function keyMomentRowLabel(k: KeyMoment): string {
  return `${momentLead(k).row} move ${k.moveNumber}, ${k.san}`
}

export function keyMomentSentences(k: KeyMoment): string[] {
  if (k.kind === 'won') {
    if (!k.opponent) return [`You went ahead with ${k.san} and stayed ahead.`]
    if (!k.reply) return [`You went ahead after ${k.opponent} played ${k.san}.`]
    const reply = k.captured ? `took the ${k.captured} with ${k.reply}` : `replied with ${k.reply}`
    return [`After ${k.opponent} played ${k.san}, you ${reply} and stayed ahead.`]
  }
  const out: string[] = []
  if (k.kind === 'decided' && k.terminal) {
    out.push(
      `Before ${k.san} you were ${k.before}; by ${k.terminal.san} on move ${k.terminal.moveNumber}, the end of the slide it started, you were ${k.after}.`
    )
  } else if (k.before === k.after) {
    out.push(`You were ${k.before} before ${k.san} and still ${k.after} after it, but your position got worse.`)
  } else {
    out.push(`Before ${k.san} you were ${k.before}; after it, ${k.after}.`)
  }
  if (k.spentMs !== null) {
    const comparison = k.usualMs === null ? '' : `, compared with your usual ${spentWords(k.usualMs)}`
    out.push(`You spent ${spentWords(k.spentMs)} on it${comparison}.`)
  }
  return out
}
