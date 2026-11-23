import { Chess } from 'chess.js'
import type { CommitResponse } from './api-types'
import { boardConfirmsTag } from '@/lib/board/board-tags'

export type AnswerRow = Pick<CommitResponse,
  'best_move' | 'best_move_san' | 'pv' | 'eval_cp' | 'tag' | 'refutation_line' | 'refutation_evals' | 'root_move_san'
> & Pick<CommitResponse['receipt'], 'engine' | 'depth' | 'span_plies'> & {
  fen?: string
}

export function shownTag(row: { tag: string | null; fen?: string | null; root_move_san?: string | null }): string | null {
  if (!row.tag || !row.fen || !row.root_move_san) return row.tag
  return boardConfirmsTag(row.tag, row.fen, row.root_move_san) === false ? null : row.tag
}

export function sanToUci(fen: string, san: string): string | null {
  try {
    const chess = new Chess(fen)
    const move = chess.move(san)
    return move ? `${move.from}${move.to}${move.promotion ?? ''}` : null
  } catch {
    return null
  }
}

export function positionAnswer(row: AnswerRow, gameMove: string | null) {
  const tag = shownTag(row)
  return {
    best_move: row.best_move, best_move_san: row.best_move_san, pv: row.pv,
    eval_cp: row.eval_cp, tag,
    refutation_line: row.refutation_line, refutation_evals: row.refutation_evals,
    root_move_san: row.root_move_san, root_move_uci: gameMove,
    receipt: {
      engine: row.engine, depth: row.depth, eval_cp: row.eval_cp, tag, span_plies: row.span_plies,
    },
  }
}
