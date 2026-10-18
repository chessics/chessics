import { Chess } from 'chess.js'
import { standing } from './reveal'

export interface ReplayPly {
  san: string
  label: string
  mover: 'you' | 'opponent'
  standing: string | null
  event: string | null
}

export interface ReplayFrame {
  fen: string
  lastMove: [string, string] | null
  cp: number
  ply: ReplayPly | null
}

const PIECE: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }

function article(piece: string): string {
  return `a ${piece}`
}

function eventFor(mover: 'you' | 'opponent', captured?: string, promotion?: string): string | null {
  const parts: string[] = []
  if (captured) parts.push(mover === 'you' ? `you take ${article(PIECE[captured])}` : `takes your ${PIECE[captured]}`)
  if (promotion) parts.push(mover === 'you' ? `you promote to ${article(PIECE[promotion])}` : `promotes to ${article(PIECE[promotion])}`)
  return parts.length ? parts.join(', ') : null
}

export function buildReplay(
  fen: string,
  rootUci: string,
  line: string[],
  evals: number[],
  startEvalCp: number
): ReplayFrame[] {
  const frames: ReplayFrame[] = [{ fen, lastMove: null, cp: startEvalCp, ply: null }]
  let chess: Chess
  try {
    chess = new Chess(fen)
  } catch {
    return frames
  }
  const me = chess.turn()

  const moves = [rootUci, ...line]
  for (let i = 0; i < moves.length; i++) {
    const uci = moves[i]
    const number = chess.moveNumber()
    const turn = chess.turn()
    let m
    try {
      m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' })
    } catch {
      break
    }
    if (!m) break

    const mover = turn === me ? 'you' : 'opponent'
    const cp = i === 0 ? startEvalCp : evals[i - 1] ?? frames[frames.length - 1].cp
    frames.push({
      fen: chess.fen(),
      lastMove: [m.from, m.to],
      cp,
      ply: {
        san: m.san,
        label: turn === 'w' ? `${number}.` : `${number}...`,
        mover,
        standing: i === 0 || evals[i - 1] === undefined ? null : standing(evals[i - 1]),
        event: eventFor(mover, m.captured, m.promotion),
      },
    })
  }
  return frames
}
