import { Chess, type Move } from 'chess.js'
import { CAPTURE_PIECES, favorableCaptureSentence } from '@/lib/board/played-capture'
import type { Color, Move as StoredMove } from '@/lib/supabase/types'

type PlayedRow = Pick<StoredMove, 'ply_number' | 'san' | 'fen_before' | 'fen_after'>

function forkSentence(move: Move, after: Chess, lead: string): string | null {
  if (move.piece === 'k' || move.promotion || after.isCheck()) return null
  if (after.isAttacked(move.to, after.turn())) return null
  const fields = after.fen().split(' ')
  fields[1] = move.color
  fields[3] = '-'
  const attackerTurn = new Chess(fields.join(' '))
  const targets = attackerTurn.moves({ square: move.to, verbose: true }).filter(m =>
    m.captured && !m.promotion && CAPTURE_PIECES[m.captured][1] > CAPTURE_PIECES[move.piece][1]
  )
  const [a, b] = targets
  if (!a?.captured || !b?.captured) return null
  const first = CAPTURE_PIECES[a.captured][0]
  const second = CAPTURE_PIECES[b.captured][0]
  const pieces = first === second
    ? `your ${first}s on ${a.to} and ${b.to}`
    : `your ${first} on ${a.to} and your ${second} on ${b.to}`
  const side = move.color === 'w' ? 'White' : 'Black'
  return `${lead}, ${side}’s ${CAPTURE_PIECES[move.piece][0]} on ${move.to} attacked ${pieces}.`
}

export function turningMoveWhy(rows: readonly PlayedRow[], ply: number, userColor: Color): string | null {
  const start = rows.findIndex(row => row.ply_number === ply)
  if (start < 0) return null
  try {
    const board = new Chess(rows[start].fen_before)
    if (board.turn() !== (userColor === 'white' ? 'w' : 'b')) return null
    const play = (offset: number) => {
      const row = rows[start + offset]
      if (row?.ply_number !== ply + offset || row.fen_before !== board.fen()) return null
      const move = board.move(row.san, { strict: true })
      return move.after === row.fen_after ? move : null
    }
    const root = play(0)
    if (!root || root.promotion) return null
    const reply = play(1)
    if (!reply) return null

    if (reply.captured && reply.captured !== 'p' &&
        (!root.captured || CAPTURE_PIECES[root.captured][1] < CAPTURE_PIECES[reply.captured][1])) {
      if (!new Chess(reply.before).isAttacked(reply.to, root.color) && !board.isAttacked(reply.to, root.color)) {
        const side = reply.color === 'w' ? 'White' : 'Black'
        return `After ${root.san}, ${side}’s ${CAPTURE_PIECES[reply.piece][0]} took your undefended ${CAPTURE_PIECES[reply.captured][0]} on ${reply.to}.`
      }
      const capture = favorableCaptureSentence(root, reply)
      if (capture) return capture
    }

    const fork = forkSentence(reply, board, `After ${root.san}`)
    if (fork || !reply.captured) return fork
    const recapture = play(2)
    if (!recapture?.captured || recapture.to !== reply.to) return null
    const next = play(3)
    return next ? forkSentence(next, board, `After the exchange on ${reply.to}`) : null
  } catch {
    return null
  }
}
