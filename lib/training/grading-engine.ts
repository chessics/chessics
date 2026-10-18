import { MATE_CP, MIN_GRADING_DEPTH, SHALLOW_GRADING_DEPTH, type EngineEval, type GradingEngine } from './grading'

export const DEFAULT_GRADING_ENGINE_URL = 'https://chess-api.com/v1'

export const GRADING_DEPTHS = [18, 14, 12] as const
export const GRADING_THINKING_MS = 100

export const GRADING_BUDGET_MS = 4500
export const GRADING_REQUEST_TIMEOUT_MS = 2000

export function gradingEngineUrl(): string {
  return process.env.GRADING_ENGINE_URL?.trim() || DEFAULT_GRADING_ENGINE_URL
}

function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function parseEngineResponse(body: unknown): EngineEval | null {
  if (typeof body !== 'object' || body === null) return null
  const d = body as Record<string, unknown>
  if (d.type === 'error' || d.error) return null

  const depth = num(d.depth)
  if (depth === null || depth < SHALLOW_GRADING_DEPTH) return null

  if (typeof d.debug === 'string' && /\b(lowerbound|upperbound)\b/.test(d.debug)) return null

  const mate = num(d.mate)
  if (mate !== null && mate !== 0) return { cp: mate > 0 ? MATE_CP : -MATE_CP, depth }

  const cp = num(d.centipawns)
  if (cp === null) return null
  return { cp: Math.round(cp), depth }
}

export function createGradingEngine(
  url: string = gradingEngineUrl(),
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now
): GradingEngine {
  const deadline = now() + GRADING_BUDGET_MS

  const once = async (fen: string, depth: number): Promise<EngineEval | null> => {
    const remaining = deadline - now()
    if (remaining <= 0) return null
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen, depth, maxThinkingTime: GRADING_THINKING_MS }),
        signal: AbortSignal.timeout(Math.min(GRADING_REQUEST_TIMEOUT_MS, remaining)),
        cache: 'no-store',
      })
      if (!res.ok) return null
      return parseEngineResponse(await res.json())
    } catch {
      return null
    }
  }

  return {
    label: url,
    evaluate: async fen => {
      let deepest: EngineEval | null = null
      for (const depth of GRADING_DEPTHS) {
        const e = await once(fen, depth)
        if (e && e.depth >= MIN_GRADING_DEPTH) return e
        if (e && (!deepest || e.depth > deepest.depth)) deepest = e
      }
      return deepest
    },
  }
}
