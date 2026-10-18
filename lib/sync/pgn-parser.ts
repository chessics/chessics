import { Chess } from 'chess.js'

export interface ParsedMove {
  ply: number
  san: string
  fen_before: string
  fen_after: string
}

export interface ParsedGame {
  moves: ParsedMove[]
  headers: Record<string, string>
  moveCount: number
}

export function parsePgn(pgn: string): ParsedGame | null {
  const chess = new Chess()

  try {
    chess.loadPgn(pgn)
  } catch {
    return null
  }

  const headersMap = chess.header()
  const headers: Record<string, string> = {}
  if (headersMap && typeof headersMap === 'object') {
    for (const [key, value] of Object.entries(headersMap)) {
      if (typeof value === 'string') {
        headers[key] = value
      }
    }
  }

  const history = chess.history({ verbose: true })
  const moves: ParsedMove[] = []

  const replay = new Chess()

  for (let i = 0; i < history.length; i++) {
    const fen_before = replay.fen()
    const moveData = history[i]

    try {
      replay.move(moveData.san)
    } catch {
      break
    }

    const fen_after = replay.fen()

    moves.push({
      ply: i + 1,
      san: moveData.san,
      fen_before,
      fen_after,
    })
  }

  return {
    moves,
    headers,
    moveCount: moves.length,
  }
}

export function getPgnHeader(pgn: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = pgn.match(new RegExp(`\\[${escaped} "(.+?)"\\]`))
  return match ? match[1] : null
}
