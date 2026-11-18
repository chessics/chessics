import { rootSquares } from '@/lib/diagnosis/instance'
import { reviewClock } from '@/lib/review/clock-view'
import { isTurningMove, keyMoment, type KeyMoment } from '@/lib/review/key-moment'
import type { GuestGameResult } from '@/types/guest'

export interface GuestGameRow {
  game: GuestGameResult
  preview: { moment: KeyMoment; fen: string; from: string; to: string } | null
}

function momentPreview(game: GuestGameResult): GuestGameRow['preview'] {
  const { moves, causal_chains } = game.analysis_data
  const moment = keyMoment({
    moves, chains: causal_chains, result: game.result, userColor: game.user_color, pgn: game.pgn,
  })
  if (!moment) return null
  const fen = moves.find(m => m.ply_number === moment.ply)?.fen_before
  const squares = fen && rootSquares(fen, moment.san)
  return fen && squares ? { moment, fen, ...squares } : null
}

export function guestGameRows(games: GuestGameResult[], gameIds: string[]): GuestGameRow[] {
  const byId = new Map(games.map(game => [game.analysis_data.gameId, game]))
  return Array.from(new Set(gameIds)).flatMap(id => {
    const game = byId.get(id)
    return game ? [{ game, preview: momentPreview(game) }] : []
  })
}

export function turningMoveTimes(rows: GuestGameRow[]) {
  const games = rows.flatMap(({ game, preview }) => {
    if (game.result !== 'loss' || !preview || !isTurningMove(preview.moment)) return []
    const mover = game.user_color === 'white' ? 'w' : 'b'
    if (preview.fen.split(' ')[1] !== mover) return []
    const { ply, moveNumber, san } = preview.moment
    const spentMs = reviewClock(game.pgn, game.analysis_data.moves)?.spent.get(ply)
    if (spentMs === undefined || !Number.isFinite(spentMs)) return []
    return [{ id: game.analysis_data.gameId, opponent: game.opponent_username, moveNumber, san, spentMs }]
  })
  if (games.length < 5) return null
  const times = games.map(game => game.spentMs).sort((a, b) => a - b)
  const mid = Math.floor(times.length / 2)
  const medianMs = times.length % 2 === 1 ? times[mid] : (times[mid - 1] + times[mid]) / 2
  return { games, medianMs }
}
