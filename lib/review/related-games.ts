import type { Color, Game, Move } from '@/lib/supabase/types'
import { previousMove, type PreviousMove } from '@/lib/training/previous-move'
import type { DecidedAtChain } from './decided-at'
import { costlyMoment } from './key-moment'
import { turningMoveEvidence, type CapturePattern } from './turning-move-why'

type GameInfo = Pick<Game, 'id' | 'user_color' | 'result' | 'opponent_username'>
type PlayedRow = Pick<Move, 'ply_number' | 'san' | 'fen_before' | 'fen_after' | 'eval_before' | 'eval_after'>

export interface ComparisonPosition extends PreviousMove {
  gameId: string
  opponent: string | null
  orientation: Color
  ply: number
  capturePattern: CapturePattern | null
  opening: string | null
}

export type RelatedBoard = Omit<ComparisonPosition, 'capturePattern' | 'opening'> & { match: CapturePattern | 'opening' }

export function comparisonPosition(game: GameInfo, moves: readonly PlayedRow[], chains: readonly DecidedAtChain[]): ComparisonPosition | null {
  if (!game.user_color || (game.result !== 'loss' && game.result !== 'draw')) return null
  const moment = costlyMoment({ result: game.result, userColor: game.user_color, moves, chains })
  if (!moment) return null
  const row = moves.find(m => m.ply_number === moment.ply)
  if (!row) return null
  const played = previousMove(row.fen_after, row)
  if (!played || played.fen.split(' ')[1] !== (game.user_color === 'white' ? 'w' : 'b')) return null
  const opening = moment.ply <= 30 ? played.fen.split(' ').slice(0, 4).join(' ') + ' ' + played.san : null
  const capturePattern = turningMoveEvidence(moves, moment.ply, game.user_color)?.capturePattern ?? null
  if (!opening && !capturePattern) return null
  return { ...played, gameId: game.id, opponent: game.opponent_username, orientation: game.user_color, ply: moment.ply, opening, capturePattern }
}

export function relatedBoards(current: ComparisonPosition, peers: readonly (ComparisonPosition | null)[]): RelatedBoard[] {
  const boards: RelatedBoard[] = []
  const seen = new Set([current.gameId])
  for (const peer of peers) {
    if (!peer || seen.has(peer.gameId)) continue
    const { capturePattern, opening, ...board } = peer
    let match: RelatedBoard['match']
    if (opening && opening === current.opening) match = 'opening'
    else if (capturePattern && capturePattern === current.capturePattern) match = capturePattern
    else continue
    boards.push({ ...board, match })
    seen.add(peer.gameId)
    if (boards.length === 2) break
  }
  return boards
}
