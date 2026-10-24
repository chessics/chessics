import type { Puzzle } from './rules'

export function sourceName(source: string | null): string | null {
  if (!source) return null
  const name = source.split(':')[0].trim()
  return name.length > 0 ? name : null
}

const fold = (s: string) => s.toLowerCase().replace(/[’']/g, "'")

export function puzzleCaption(p: Puzzle): string {
  const from = sourceName(p.source)
  if (!from || fold(from) === fold(p.theme)) return `${p.theme}.`
  return `${p.theme}. ${from}.`
}
