export const THINK = {
  JITTER: 0.25,
  NEAR_MOVES: 6,
  MIN_SAMPLES: 3,
  CLOCK_RECORD_FLOOR_MS: 200,
  CLOCK_RECORD_CAP_MS: 60_000,
  DIVISOR: 30,
  MIN_MS: 500,
  MAX_MS: 15_000,
  UNTIMED_MS: 3_000,
  MAX_SHARE_OF_REMAINING: 0.5,
} as const

export interface Spent {
  ply: number
  ms: number
}

export function opponentSpent(spent: (number | null)[], userColor: 'white' | 'black'): Spent[] {
  const opponentParity = userColor === 'white' ? 0 : 1
  const out: Spent[] = []
  spent.forEach((ms, i) => {
    const ply = i + 1
    if (ms !== null && ply % 2 === opponentParity) out.push({ ply, ms })
  })
  return out
}

export interface ThinkTimeInput {
  ply: number
  remainingMs: number | null
  opponentSpent: Spent[]
  rng: () => number
}

export interface ThinkTime {
  ms: number
  basis: 'clock_record' | 'remaining' | 'untimed'
}

const jitter = (rng: () => number) => 1 + THINK.JITTER * (2 * rng() - 1)
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

function capByClock(ms: number, remainingMs: number | null): number {
  return remainingMs === null ? ms : Math.min(ms, remainingMs * THINK.MAX_SHARE_OF_REMAINING)
}

export function thinkTimeMs({ ply, remainingMs, opponentSpent: record, rng }: ThinkTimeInput): ThinkTime {
  if (record.length >= THINK.MIN_SAMPLES) {
    const nearest = [...record]
      .sort((a, b) => Math.abs(a.ply - ply) - Math.abs(b.ply - ply) || a.ply - b.ply)
      .slice(0, THINK.NEAR_MOVES)
    const pick = nearest[Math.min(nearest.length - 1, Math.floor(rng() * nearest.length))]
    const ms = clamp(pick.ms * jitter(rng), THINK.CLOCK_RECORD_FLOOR_MS, THINK.CLOCK_RECORD_CAP_MS)
    return { ms: Math.round(capByClock(ms, remainingMs)), basis: 'clock_record' }
  }
  if (remainingMs === null) {
    return { ms: Math.round(clamp(THINK.UNTIMED_MS * jitter(rng), THINK.MIN_MS, THINK.MAX_MS)), basis: 'untimed' }
  }
  const ms = clamp((remainingMs / THINK.DIVISOR) * jitter(rng), THINK.MIN_MS, THINK.MAX_MS)
  return { ms: Math.round(capByClock(ms, remainingMs)), basis: 'remaining' }
}
