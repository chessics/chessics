export type PuzzleOutcome = 'clean' | 'struggled' | 'shown'

export interface Ladder {
  level: number
  step: number
  lastDir: -1 | 0 | 1
  recent: string[]
  lastTheme: string | null
}

export const LADDER_START: Ladder = { level: 1200, step: 200, lastDir: 0, recent: [], lastTheme: null }
export const STEP_MIN = 50
export const DOWN_FACTOR = 1.5
export const LEVEL_MIN = 600
export const LEVEL_MAX = 2700
export const RECENT_MAX = 400
export const WINDOWS = [75, 150, 300, 600, Infinity]

export const LADDER_STORAGE_KEY = 'chessics_puzzle_ladder'
export const OLD_SEEN_STORAGE_KEY = 'chessics_puzzles_seen'

export interface Pickable {
  id: string
  rating: number
  theme: string
}

const clamp = (n: number) => Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, n))

export function climb(ladder: Ladder, outcome: PuzzleOutcome): Ladder {
  if (outcome === 'struggled') return ladder
  const dir: 1 | -1 = outcome === 'clean' ? 1 : -1
  const turned = ladder.lastDir !== 0 && ladder.lastDir !== dir
  const step = turned ? Math.max(STEP_MIN, Math.round(ladder.step / 2)) : ladder.step
  const delta = dir === 1 ? step : -Math.round(step * DOWN_FACTOR)
  return { ...ladder, level: clamp(ladder.level + delta), step, lastDir: dir }
}

export function served(ladder: Ladder, p: Pickable): Ladder {
  const recent = [...ladder.recent.filter(id => id !== p.id), p.id].slice(-RECENT_MAX)
  return { ...ladder, recent, lastTheme: p.theme }
}

export function pickPuzzle<T extends Pickable>(set: T[], ladder: Ladder, random: () => number, current: string | null = null): T | null {
  if (set.length === 0) return null
  const recent = new Set(ladder.recent)
  const passes: Array<(p: T) => boolean> = [
    p => !recent.has(p.id) && p.theme !== ladder.lastTheme,
    p => !recent.has(p.id),
    p => p.theme !== ladder.lastTheme,
    () => true,
  ]
  for (const keep of passes) {
    for (const width of WINDOWS) {
      const pool = set.filter(p => p.id !== current && Math.abs(p.rating - ladder.level) <= width && keep(p))
      if (pool.length > 0) return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]
    }
  }
  return set[0]
}

export function parseLadder(raw: string | null): Ladder {
  if (!raw) return LADDER_START
  try {
    const v = JSON.parse(raw)
    if (!v || typeof v !== 'object') return LADDER_START
    const level = Number.isFinite(v.level) ? clamp(v.level) : LADDER_START.level
    const step = Number.isFinite(v.step) ? Math.min(LADDER_START.step, Math.max(STEP_MIN, v.step)) : LADDER_START.step
    const lastDir = v.lastDir === 1 || v.lastDir === -1 ? v.lastDir : 0
    const recent = Array.isArray(v.recent) ? v.recent.filter((s: unknown): s is string => typeof s === 'string').slice(-RECENT_MAX) : []
    const lastTheme = typeof v.lastTheme === 'string' ? v.lastTheme : null
    return { level, step, lastDir, recent, lastTheme }
  } catch {
    return LADDER_START
  }
}

export function outcomeOf(status: 'solved' | 'shown', misses: number): PuzzleOutcome {
  if (status === 'shown') return 'shown'
  return misses > 0 ? 'struggled' : 'clean'
}
