import { STABLE_CP, toUserEval } from '../chains/stands-alone'
import { pgnSanMoves } from '../clock'
import type { Color, Game, Move } from '../supabase/types'
import { boardHabit, type BoardHabit } from './board-habits'

type CourseGame = Pick<Game, 'id' | 'user_color' | 'result' | 'pgn'>
type CourseMove = Pick<Move, 'game_id' | 'ply_number' | 'san' | 'fen_before' | 'fen_after' | 'eval_before' | 'eval_after'>

interface Instance {
  gameId: string
  ply: number
  inLoss: boolean
  turnedLoss: boolean
}

export interface Chapter {
  habit: BoardHabit
  instances: Instance[]
  games: number
  lossesTurned: number
  open: boolean
}

function turningPly(moves: readonly CourseMove[], color: Color, finalPly: number): number | null {
  let expected = finalPly
  for (let i = moves.length - 1; i >= 0; i--) {
    const m = moves[i]
    if (m.ply_number !== expected || m.eval_after === null || m.eval_before === null) return null
    if (toUserEval(m.eval_after, color) >= STABLE_CP) return null
    if (toUserEval(m.eval_before, color) >= STABLE_CP) return m.ply_number
    expected--
  }
  return null
}

export function buildChapters(games: readonly CourseGame[], moves: readonly CourseMove[]): Chapter[] {
  const byGame = new Map<string, Map<number, CourseMove>>()
  for (const move of moves) {
    let rows = byGame.get(move.game_id)
    if (!rows) {
      rows = new Map()
      byGame.set(move.game_id, rows)
    }
    rows.set(move.ply_number, move)
  }

  const evidence: Record<BoardHabit, Instance[]> = {
    'a piece you just moved': [],
    'what their last move attacks': [],
  }
  for (const game of games) {
    const rows = byGame.get(game.id)
    if (!rows || !game.user_color) continue
    byGame.delete(game.id)
    const ordered = Array.from(rows.values()).sort((a, b) => a.ply_number - b.ply_number)
    const inLoss = game.result === 'loss'
    const turn = inLoss ? turningPly(ordered, game.user_color, pgnSanMoves(game.pgn).length) : null
    const parity = game.user_color === 'white' ? 1 : 0
    for (const move of ordered) {
      if (move.ply_number % 2 !== parity) continue
      const habit = boardHabit(move, rows.get(move.ply_number - 1))
      if (habit) evidence[habit].push({ gameId: game.id, ply: move.ply_number, inLoss, turnedLoss: move.ply_number === turn })
    }
  }

  return (Object.keys(evidence) as BoardHabit[]).map(habit => {
    const instances = evidence[habit]
    const losses = instances.filter(i => i.inLoss)
    return {
      habit,
      instances,
      games: new Set(instances.map(i => i.gameId)).size,
      lossesTurned: losses.filter(i => i.turnedLoss).length,
      open: losses.length >= 4 && new Set(losses.map(i => i.gameId)).size >= 3,
    }
  }).sort((a, b) => b.lossesTurned - a.lossesTurned || b.games - a.games)
}
