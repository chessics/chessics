import { Chess } from 'chess.js'

export function setUpFromPosition(pgn: string | null | undefined): boolean {
  return /\[SetUp "1"\]/.test(pgn ?? '')
}

export function pgnAnalysable(pgn: string | null | undefined): boolean {
  if (!pgn) return true
  const variant = pgn.match(/\[Variant "([^"]*)"\]/)
  if (variant && variant[1].toLowerCase() !== 'standard') return false
  return !setUpFromPosition(pgn)
}

export function pgnParses(pgn: string | null | undefined): boolean {
  if (!pgn) return true
  try {
    new Chess().loadPgn(pgn)
    return true
  } catch {
    return false
  }
}
