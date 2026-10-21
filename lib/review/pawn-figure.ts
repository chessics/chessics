const STORED_PAWN_FIGURE = /\s*\(-?\d+(?:\.\d+)?\s+pawns?\s+loss\)/g

export function withoutPawnFigure(text: string): string {
  return text.replace(STORED_PAWN_FIGURE, '')
}
