import type { Color, Result } from '@/lib/supabase/types'
import { STABLE_CP, toUserEval } from '@/lib/chains/stands-alone'
import { standing } from '@/lib/training/reveal'
import { gameDecidedAt, moveNumberOfPly, type DecidedAtChain } from './decided-at'
import { winChance } from './win-chance'

export const STANDALONE_DROP = 15
export const BIGGEST_DROP = 10

export interface KeyMomentMove {
  ply_number: number
  san: string
  eval_before: number | null
  eval_after: number | null
}

export type KeyMomentKind = 'decided' | 'alone' | 'drop'

export interface KeyMoment {
  kind: KeyMomentKind
  ply: number
  moveNumber: number
  san: string
  before: string
  after: string
  terminal: { ply: number; moveNumber: number; san: string } | null
  spentMs: number | null
}

export function keyMoment(input: {
  result: Result | null
  userColor: Color | null
  chains: readonly DecidedAtChain[]
  moves: readonly KeyMomentMove[]
  spent?: ReadonlyMap<number, number> | null
}): KeyMoment | null {
  const { result, userColor, chains, moves, spent } = input
  if (userColor !== 'white' && userColor !== 'black') return null
  const user = (cp: number) => toUserEval(cp, userColor)
  const byPly = new Map(moves.map(m => [m.ply_number, m]))
  const spentOn = (ply: number) => spent?.get(ply) ?? null

  const decided = gameDecidedAt({ result, userColor, chains, moves })
  if (decided) {
    const root = byPly.get(decided.rootPly)
    const terminalPly = Math.min(
      ...chains.filter(c => c.root_move_ply === decided.rootPly).map(c => c.terminal_blunder_ply)
    )
    const terminal = byPly.get(terminalPly)
    if (root && terminal && root.eval_before !== null && terminal.eval_after !== null) {
      return {
        kind: 'decided',
        ply: root.ply_number,
        moveNumber: moveNumberOfPly(root.ply_number),
        san: root.san,
        before: standing(user(root.eval_before)),
        after: standing(user(terminal.eval_after)),
        terminal: { ply: terminal.ply_number, moveNumber: moveNumberOfPly(terminal.ply_number), san: terminal.san },
        spentMs: spentOn(root.ply_number),
      }
    }
  }

  const parity = userColor === 'white' ? 1 : 0
  const own = [...moves]
    .filter(m => m.ply_number % 2 === parity && m.eval_before !== null && m.eval_after !== null)
    .sort((a, b) => a.ply_number - b.ply_number)
    .map(m => {
      const before = user(m.eval_before!)
      const after = user(m.eval_after!)
      return { m, before, after, drop: winChance(before) - winChance(after) }
    })

  const card = (kind: KeyMomentKind, x: (typeof own)[number]): KeyMoment => ({
    kind,
    ply: x.m.ply_number,
    moveNumber: moveNumberOfPly(x.m.ply_number),
    san: x.m.san,
    before: standing(x.before),
    after: standing(x.after),
    terminal: null,
    spentMs: spentOn(x.m.ply_number),
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

export function keyMomentTitle(k: KeyMoment): string {
  if (k.kind === 'decided') return `Game decided at: move ${k.moveNumber}`
  const turned = k.before !== 'a bit worse' && k.before !== 'clearly worse' && k.before !== 'losing'
    && (k.after === 'a bit worse' || k.after === 'clearly worse' || k.after === 'losing')
  return turned ? `Where it turned: move ${k.moveNumber}` : `Your costliest move: move ${k.moveNumber}`
}

export function keyMomentSentences(k: KeyMoment): string[] {
  const out: string[] = []
  if (k.kind === 'decided' && k.terminal) {
    out.push(
      `Before ${k.san} you were ${k.before}; by ${k.terminal.san} on move ${k.terminal.moveNumber}, the end of the slide it started, you were ${k.after}.`
    )
  } else if (k.before === k.after) {
    out.push(`You were ${k.before} before ${k.san} and still ${k.after} after it, though it gave back a large part of your edge.`)
  } else {
    out.push(`Before ${k.san} you were ${k.before}; after it, ${k.after}.`)
  }
  if (k.spentMs !== null) out.push(`You spent ${spentWords(k.spentMs)} on it.`)
  return out
}
