import { extractPgnHeader, openingFromEcoUrl } from '@/lib/sync/chess-com'

export function openingFromPgn(pgn: string | null | undefined): string | null {
  if (!pgn) return null
  const tag = extractPgnHeader(pgn, 'Opening')?.trim()
  if (tag && tag !== '?') return tag
  return openingFromEcoUrl(extractPgnHeader(pgn, 'ECOUrl'))
}
