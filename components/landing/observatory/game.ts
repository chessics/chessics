import { Chess } from 'chess.js'

// The Opera Game: Paul Morphy vs. Duke Karl of Brunswick and Count Isouard, Paris 1858.
// Morphy develops with tempo and mates with his last two pieces, while Black's f8 bishop and
// h8 rook never leave their squares. That gives the replay one concrete answer to "why".
export const GAME_DESCRIPTION = 'Replay of the Opera Game, Morphy, Paris 1858, ending in checkmate.'
export const SAN = 'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#'.split(' ')
export const LESSON = 'Black’s f8 bishop and h8 rook never moved.'
export const IDLE_SQUARES = ['f8', 'h8']
export const LESSON_ANCHOR = 'g8'

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
export type Color = 'w' | 'b'
export interface PlacedPiece { type: PieceType; color: Color; square: string }
export interface Ply {
  san: string
  from: string
  to: string
  /** Square of the captured piece, if any (differs from `to` only for en passant). */
  capture?: string
  /** Rook hop that accompanies castling. */
  rook?: { from: string; to: string }
}

export function startingPieces(): PlacedPiece[] {
  const chess = new Chess()
  return chess.board().flat().flatMap(cell => (cell ? [{ type: cell.type, color: cell.color, square: cell.square }] : []))
}

export function plies(): Ply[] {
  const chess = new Chess()
  return SAN.map(san => {
    const move = chess.move(san)
    const ply: Ply = { san: move.san, from: move.from, to: move.to }
    // chess.js flags: e = en passant, k / q = king- / queenside castling.
    if (move.captured) ply.capture = move.flags.includes('e') ? move.to[0] + move.from[1] : move.to
    if (move.flags.includes('k')) ply.rook = { from: 'h' + move.from[1], to: 'f' + move.from[1] }
    if (move.flags.includes('q')) ply.rook = { from: 'a' + move.from[1], to: 'd' + move.from[1] }
    return ply
  })
}
