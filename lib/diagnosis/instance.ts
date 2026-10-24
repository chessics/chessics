import { Chess } from 'chess.js'
import { userCp, type GameResult, type InstanceFacts } from './finding'
import { blunderStandsAlone } from '@/lib/chains/stands-alone'

export interface MoveFacts {
  ply_number: number
  san: string
  fen_before: string
  eval_before: number | null
  eval_after: number | null
}

export interface GameFacts {
  id: string
  played_at: string | null
  opponent_username: string | null
  result: GameResult | null
  user_color: 'white' | 'black'
}

export function rootSquares(fen: string, san: string): { from: string; to: string } | null {
  try {
    const move = new Chess(fen).move(san)
    return move ? { from: move.from, to: move.to } : null
  } catch {
    return null
  }
}

export function terminalStoodAlone(
  game: Pick<GameFacts, 'user_color'>,
  movesByPly: Map<number, MoveFacts>,
  terminalPly: number | null
): boolean {
  if (terminalPly === null) return false
  const before = userCp(movesByPly.get(terminalPly)?.eval_before, game.user_color)
  return before !== null && blunderStandsAlone(before)
}

export type StandAloneByTag = Map<string, Set<string>>

export function noteStandAlone(out: StandAloneByTag | undefined, tag: string, gameId: string): void {
  if (!out) return
  const set = out.get(tag) ?? new Set<string>()
  set.add(gameId)
  out.set(tag, set)
}

export function makeInstance(
  game: GameFacts,
  movesByPly: Map<number, MoveFacts>,
  rootPly: number,
  terminalPly: number | null
): InstanceFacts | null {
  const root = movesByPly.get(rootPly)
  if (!root) return null
  if (terminalStoodAlone(game, movesByPly, terminalPly)) return null
  const terminal = terminalPly === null ? undefined : movesByPly.get(terminalPly)
  const squares = rootSquares(root.fen_before, root.san)
  return {
    gameId: game.id,
    rootPly,
    rootSan: root.san,
    fenBefore: root.fen_before,
    from: squares?.from ?? null,
    to: squares?.to ?? null,
    userColor: game.user_color,
    playedAt: game.played_at,
    opponent: game.opponent_username,
    result: game.result,
    beforeCp: userCp(root.eval_before, game.user_color),
    afterCp: userCp(terminal?.eval_after, game.user_color),
  }
}
