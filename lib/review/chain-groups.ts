import { moveNumberOfPly } from './decided-at'

export interface GroupableChain {
  id: string
  root_move_ply: number
  root_move_san: string
  terminal_blunder_ply: number
  terminal_blunder_san: string
  nodes: readonly { move_ply: number; move_san: string }[]
}

export interface GroupMove {
  ply: number
  san: string
  moveNumber: number
}

export type ChainGroup =
  | {
      kind: 'chain'
      key: string
      root: GroupMove
      middle: GroupMove[]
      blunders: (GroupMove & { chainId: string })[]
      chainIds: string[]
    }
  | {
      kind: 'alone'
      key: string
      blunder: GroupMove & { chainId: string }
      chainIds: string[]
    }

const at = (ply: number, san: string): GroupMove => ({ ply, san, moveNumber: moveNumberOfPly(ply) })

export function groupChains(chains: readonly GroupableChain[], standAloneIds: ReadonlySet<string>): ChainGroup[] {
  const byRoot = new Map<number, GroupableChain[]>()
  const alone = new Map<number, GroupableChain[]>()
  for (const c of chains) {
    const into = standAloneIds.has(c.id) ? alone : byRoot
    const key = standAloneIds.has(c.id) ? c.terminal_blunder_ply : c.root_move_ply
    into.set(key, [...(into.get(key) ?? []), c])
  }

  const groups: (ChainGroup & { firstPly: number })[] = []

  for (const [rootPly, list] of Array.from(byRoot.entries())) {
    const blunderPlies = new Set(list.map(c => c.terminal_blunder_ply))
    const middle = new Map<number, GroupMove>()
    for (const c of list) {
      for (const n of c.nodes) {
        if (n.move_ply > rootPly && !blunderPlies.has(n.move_ply)) middle.set(n.move_ply, at(n.move_ply, n.move_san))
      }
    }
    const blunders = new Map<number, GroupMove & { chainId: string }>()
    for (const c of [...list].sort((a, b) => a.terminal_blunder_ply - b.terminal_blunder_ply)) {
      if (!blunders.has(c.terminal_blunder_ply)) {
        blunders.set(c.terminal_blunder_ply, { ...at(c.terminal_blunder_ply, c.terminal_blunder_san), chainId: c.id })
      }
    }
    groups.push({
      kind: 'chain',
      key: `root-${rootPly}`,
      root: at(rootPly, list[0].root_move_san),
      middle: Array.from(middle.values()).sort((a, b) => a.ply - b.ply),
      blunders: Array.from(blunders.values()),
      chainIds: list.map(c => c.id),
      firstPly: rootPly,
    })
  }

  for (const [ply, list] of Array.from(alone.entries())) {
    if (Array.from(byRoot.values()).some(l => l.some(c => c.terminal_blunder_ply === ply))) continue
    groups.push({
      kind: 'alone',
      key: `alone-${ply}`,
      blunder: { ...at(ply, list[0].terminal_blunder_san), chainId: list[0].id },
      chainIds: list.map(c => c.id),
      firstPly: ply,
    })
  }

  return groups
    .sort((a, b) => a.firstPly - b.firstPly)
    .map(g => {
      const out: ChainGroup & { firstPly?: number } = { ...g }
      delete out.firstPly
      return out
    })
}

function list(words: string[]): string {
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

export function groupSentence(g: ChainGroup): string {
  if (g.kind === 'alone') return `${g.blunder.san} at move ${g.blunder.moveNumber} was a blunder on its own.`
  const root = `${g.root.san} at move ${g.root.moveNumber}`
  if (g.blunders.length === 1) {
    return `${root} led to the blunder ${g.blunders[0].san} at move ${g.blunders[0].moveNumber}.`
  }
  return `${root} led to the blunders ${list(g.blunders.map(b => `${b.san} (move ${b.moveNumber})`))}.`
}

export function middleLabel(count: number): string {
  return `${count} ${count === 1 ? 'move' : 'moves'} in between`
}
