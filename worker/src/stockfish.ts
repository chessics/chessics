import { isMateMissWhileWinning } from './pattern-detector.js'
import type { TopLine, TopLinesResult } from './time-floor.js'

const STOCKFISH_URL = process.env.STOCKFISH_URL ?? 'https://chess-api.com/v1'

const PI_API_URL = process.env.STOCKFISH_API_URL ?? null

const IS_LOCAL_ENGINE = PI_API_URL !== null || /127\.0\.0\.1|localhost|192\.168\.|10\./.test(STOCKFISH_URL)
const REQUEST_PACING_MS = IS_LOCAL_ENGINE ? 0 : 400

export const DEFAULT_DEPTH = 15

export function engineLabel(): string {
  const named = process.env.ENGINE_LABEL?.trim()
  if (named) return named
  return PI_API_URL ? `pi:${PI_API_URL}` : STOCKFISH_URL
}

export async function checkEngineHealth(): Promise<{ engine: string; ok: boolean }> {
  if (PI_API_URL) {
    try {
      const res = await fetch(`${PI_API_URL}/health`)
      const body = await res.json() as { ok?: boolean }
      return { engine: `pi:${PI_API_URL}`, ok: res.ok && body.ok === true }
    } catch {
      return { engine: `pi:${PI_API_URL}`, ok: false }
    }
  }
  return { engine: STOCKFISH_URL, ok: true }
}

export type MoveClassification =
  | 'blunder'
  | 'mistake'
  | 'inaccuracy'
  | 'good'
  | 'excellent'
  | 'brilliant'

export interface StockfishResult {
  eval: number
  move: string
  type: 'cp' | 'mate'
  mate?: number
}

export interface EvaluatedMove {
  ply: number
  san: string
  fen_before: string
  fen_after: string
  eval_before: number
  eval_after: number
  eval_delta: number
  classification: MoveClassification
  best_move: string
}

export function classifyMove(delta: number): MoveClassification {
  if (delta > 200) return 'blunder'
  if (delta > 100) return 'mistake'
  if (delta > 50)  return 'inaccuracy'
  if (delta > 10)  return 'good'
  return 'excellent'
}

const RETRY_DELAYS_MS = [2000, 4000, 8000, 16000, 30000]

let sampleResponseLogged = false

export async function evaluatePosition(fen: string, depth = DEFAULT_DEPTH): Promise<StockfishResult> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]))
    }

    try {
      if (PI_API_URL) {
        const response = await fetch(`${PI_API_URL}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fen, depth }),
        })

        if (!response.ok) {
          throw new Error(`Pi Stockfish error: ${response.status} ${response.statusText}`)
        }

        const data = await response.json() as {
          eval_cp: number | null
          eval_mate: number | null
          bestmove: string | null
        }

        if (!sampleResponseLogged) {
          console.log('[stockfish] pi sample response:', JSON.stringify(data))
          sampleResponseLogged = true
        }

        if (data.eval_cp === null && data.eval_mate === null) {
          throw new Error(`Pi Stockfish response missing eval: ${JSON.stringify(data).slice(0, 200)}`)
        }

        const whiteToMove = fen.split(' ')[1] !== 'b'
        const sign = whiteToMove ? 1 : -1

        if (data.eval_mate !== null) {
          const mateWhite = data.eval_mate * sign
          const cp = mateWhite > 0 ? 10000 : mateWhite < 0 ? -10000 : (whiteToMove ? -10000 : 10000)
          return { eval: cp, move: data.bestmove ?? '', type: 'mate', mate: mateWhite }
        }

        return {
          eval: (data.eval_cp ?? 0) * sign,
          move: data.bestmove ?? '',
          type: 'cp',
          mate: undefined,
        }
      }

      const response = await fetch(STOCKFISH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen, depth }),
      })

      if (!response.ok) {
        throw new Error(`Stockfish API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json() as Record<string, unknown>

      if (!sampleResponseLogged) {
        console.log('[stockfish] sample response:', JSON.stringify(data))
        sampleResponseLogged = true
      }

      const hasCentipawns = data.centipawns !== undefined && data.centipawns !== null
      const hasEval = typeof data.eval === 'number'
      const isMate = data.type === 'mate' && typeof data.mate === 'number'

      if (!hasCentipawns && !hasEval && !isMate) {
        throw new Error(`Stockfish response missing eval fields: ${JSON.stringify(data).slice(0, 200)}`)
      }

      const evalCp = hasCentipawns
        ? parseInt(String(data.centipawns), 10)
        : Math.round((data.eval as number ?? 0) * 100)

      return {
        eval: evalCp,
        move: (data.move ?? data.bestMove ?? data.best_move ?? '') as string,
        type: ((data.type === 'mate' ? 'mate' : 'cp') as 'cp' | 'mate'),
        mate: data.mate as number | undefined,
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < RETRY_DELAYS_MS.length) {
        console.warn(`[stockfish] attempt ${attempt + 1} failed (${lastError.message.slice(0, 120)}), retrying...`)
      }
    }
  }

  throw lastError ?? new Error('Stockfish evaluation failed')
}

export const TOP_LINES_TIMEOUT_MS = 10_000

export function topLinesSupported(): boolean {
  return PI_API_URL === null && IS_LOCAL_ENGINE
}

export function parseTopLines(data: unknown): TopLine[] | null {
  const lines = (data as { lines?: unknown } | null)?.lines
  if (!Array.isArray(lines)) return null
  const out: TopLine[] = []
  for (const line of lines) {
    const move = (line as { move?: unknown })?.move
    const cp = Number.parseInt(String((line as { centipawns?: unknown })?.centipawns), 10)
    if (typeof move !== 'string' || move.length < 4 || !Number.isFinite(cp)) return null
    out.push({ move, cp })
  }
  return out
}

export async function evaluateTopLines(fen: string, depth = DEFAULT_DEPTH): Promise<TopLinesResult> {
  if (!topLinesSupported()) return { ok: false, reason: 'engine_unsupported' }
  try {
    const response = await fetch(STOCKFISH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen, depth, multiPv: 2 }),
      signal: AbortSignal.timeout(TOP_LINES_TIMEOUT_MS),
    })
    if (!response.ok) return { ok: false, reason: 'engine_failed' }
    const lines = parseTopLines(await response.json())
    return lines ? { ok: true, lines } : { ok: false, reason: 'engine_failed' }
  } catch {
    return { ok: false, reason: 'engine_failed' }
  }
}

export async function evaluateGame(
  positions: Array<{ ply: number; san: string; fen_before: string; fen_after: string }>,
  evaluate: (fen: string) => Promise<StockfishResult> = evaluatePosition
): Promise<EvaluatedMove[]> {
  const results: EvaluatedMove[] = []
  const evalCache = new Map<string, StockfishResult>()

  const evaluateCached = async (fen: string): Promise<StockfishResult> => {
    const cached = evalCache.get(fen)
    if (cached) return cached
    const result = await evaluate(fen)
    evalCache.set(fen, result)
    if (REQUEST_PACING_MS > 0 && evaluate === evaluatePosition) {
      await new Promise(resolve => setTimeout(resolve, REQUEST_PACING_MS))
    }
    return result
  }

  for (const pos of positions) {
    try {
      const evalBefore = await evaluateCached(pos.fen_before)
      const evalAfter = await evaluateCached(pos.fen_after)

      const isWhiteMove = pos.ply % 2 === 1
      const evalBeforeMover = isWhiteMove ? evalBefore.eval : -evalBefore.eval
      const evalAfterMover = isWhiteMove ? evalAfter.eval : -evalAfter.eval

      const delta = evalBeforeMover - evalAfterMover

      const classification = isMateMissWhileWinning(
        evalBefore.eval,
        evalAfter.eval,
        isWhiteMove ? 'white' : 'black'
      )
        ? classifyMove(0)
        : classifyMove(delta)

      if (results.length < 3) {
        console.log(`[eval] ply=${pos.ply} san=${pos.san} before=${evalBefore.eval} after=${evalAfter.eval} delta=${delta} class=${classification}`)
      }

      results.push({
        ply: pos.ply,
        san: pos.san,
        fen_before: pos.fen_before,
        fen_after: pos.fen_after,
        eval_before: evalBefore.eval,
        eval_after: evalAfter.eval,
        eval_delta: delta,
        classification,
        best_move: evalBefore.move,
      })

    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      throw new Error(
        `Engine evaluation failed at ply ${pos.ply} (${pos.san}) of ${positions.length} — game not analysed: ${reason}`
      )
    }
  }

  return results
}
