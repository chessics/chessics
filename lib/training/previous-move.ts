import { Chess } from 'chess.js'

export interface PreviousMove {
  fen: string
  from: string
  to: string
  san: string
}

export function previousMove(fen: string, row: { fen_before: string; san: string }): PreviousMove | null {
  try {
    const board = new Chess(row.fen_before)
    const move = board.move(row.san, { strict: true })
    if (!move || board.fen() !== new Chess(fen).fen()) return null
    return { fen: move.before, from: move.from, to: move.to, san: move.san }
  } catch {
    return null
  }
}
