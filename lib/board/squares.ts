export const LIT_BRUSH = 'yellow'

export interface LitShape {
  orig: string
  dest?: string
  brush: string
  hilite?: boolean
}

const NOT_BEFORE = /[AC-JLMOPS-Zi-wyz]/
const SQUARE = /[a-h][1-8](?![0-9])/g

export function squaresNamed(text: string): string[] {
  const found: string[] = []
  for (const m of Array.from(text.matchAll(SQUARE))) {
    const before = m.index! > 0 ? text[m.index! - 1] : ''
    if (before && NOT_BEFORE.test(before)) continue
    if (!found.includes(m[0])) found.push(m[0])
  }
  return found
}

export function withLitSquares<T extends LitShape>(base: T[], squares: string[]): Array<T | LitShape> {
  const marked = new Set(base.map((s) => s.dest ?? s.orig))
  const extra = squares.filter((sq) => !marked.has(sq)).map((sq) => ({ orig: sq, brush: LIT_BRUSH }))
  return extra.length ? [...base, ...extra] : base
}

export function splitSentences(text: string): string[] {
  const parts: string[] = []
  const re = /[.!?]["')\]]?\s+/g
  let start = 0
  for (const m of Array.from(text.matchAll(re))) {
    const end = m.index! + m[0].length
    parts.push(text.slice(start, end))
    start = end
  }
  if (start < text.length) parts.push(text.slice(start))
  return parts
}
