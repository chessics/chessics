import type { Move } from 'chess.js'

export const CAPTURE_PIECES = {
  p: ['pawn', 1], n: ['knight', 3], b: ['bishop', 3], r: ['rook', 5], q: ['queen', 9], k: ['king', 0],
} as const

export function favorableCaptureSentence(root: Move, reply: Move): string | null {
  if (!reply.captured) return null
  const [captured, value] = CAPTURE_PIECES[reply.captured]
  const [attacker, cost] = CAPTURE_PIECES[reply.piece]
  if (value < 3 || (reply.piece !== 'k' && value <= cost)) return null
  if (root.captured && CAPTURE_PIECES[root.captured][1] >= value - cost) return null
  const side = reply.color === 'w' ? 'White' : 'Black'
  return `After ${root.san}, ${side}’s ${attacker} took your ${captured} on ${reply.to}.`
}
