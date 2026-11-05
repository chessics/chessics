import { Chess } from 'chess.js'
import { playHref } from '@/lib/play/links'
import type { PlayMode } from '@/lib/play/setup'

export function takeOverPlies(pgn: string, userColor: string | null): boolean[] | null {
  if (userColor !== 'white' && userColor !== 'black') return null
  const game = new Chess()
  try {
    game.loadPgn(pgn)
  } catch {
    return null
  }
  if (game.header().FEN) return null
  const board = new Chess()
  const out = [!board.isGameOver()]
  for (const m of game.history({ verbose: true })) {
    board.move(m.san)
    out.push(!board.isGameOver())
  }
  return out
}

export function takeOverHref(mode: PlayMode | null, gameId: string, ply: number, plies: boolean[] | null): string | null {
  if (!mode || plies?.[ply] !== true) return null
  return playHref(mode, gameId, ply)
}
