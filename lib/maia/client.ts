import { Chess } from 'chess.js'

export interface MaiaPolicyRequest {
  fen: string
  elo_self: number
  elo_oppo: number
}

export interface MaiaMove {
  uci: string
  p: number
}

export interface MaiaPolicy {
  moves: MaiaMove[]
  model: string
  ms: number | null
}

export interface MaiaClient {
  policy(req: MaiaPolicyRequest): Promise<MaiaPolicy>
}

export type MaiaErrorCode = 'invalid_fen' | 'game_over' | 'bad_elo' | 'unauthorized' | 'unavailable' | 'bad_response'

export class MaiaError extends Error {
  readonly code: MaiaErrorCode
  constructor(code: MaiaErrorCode, message: string) {
    super(message)
    this.name = 'MaiaError'
    this.code = code
  }
}

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/
const SERVICE_400 = new Set<MaiaErrorCode>(['invalid_fen', 'game_over', 'bad_elo'])

export const MAIA_TIMEOUT_MS = 3000

function parsePolicy(raw: unknown): MaiaPolicy {
  if (typeof raw !== 'object' || raw === null) throw new MaiaError('bad_response', 'policy is not an object')
  const b = raw as Record<string, unknown>
  if (!Array.isArray(b.moves) || b.moves.length === 0) throw new MaiaError('bad_response', 'policy has no moves')
  if (typeof b.model !== 'string' || b.model.length === 0) throw new MaiaError('bad_response', 'policy names no model')
  const moves: MaiaMove[] = []
  for (const m of b.moves) {
    const uci = typeof (m as MaiaMove)?.uci === 'string' ? (m as MaiaMove).uci.toLowerCase() : ''
    const p = (m as MaiaMove)?.p
    if (!UCI.test(uci)) throw new MaiaError('bad_response', `not a UCI move: ${String((m as MaiaMove)?.uci)}`)
    if (typeof p !== 'number' || !Number.isFinite(p) || p < 0) throw new MaiaError('bad_response', `bad probability for ${uci}`)
    moves.push({ uci, p })
  }
  if (!moves.some(m => m.p > 0)) throw new MaiaError('bad_response', 'every probability is zero')
  const ms = typeof b.ms === 'number' && Number.isFinite(b.ms) && b.ms >= 0 ? b.ms : null
  return { moves, model: b.model, ms }
}

export interface HttpMaiaOptions {
  url: string
  token?: string | null
  fetch?: typeof fetch
  timeoutMs?: number
}

function base(url: string): string {
  return url.replace(/\/+$/, '')
}

export function createHttpMaiaClient({ url, token, fetch: doFetch = fetch, timeoutMs = MAIA_TIMEOUT_MS }: HttpMaiaOptions): MaiaClient {
  return {
    async policy(req) {
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (token) headers.authorization = `Bearer ${token}`
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let res: Response
      try {
        res = await doFetch(`${base(url)}/v1/policy`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ fen: req.fen, elo_self: req.elo_self, elo_oppo: req.elo_oppo }),
          signal: controller.signal,
          cache: 'no-store',
        })
      } catch (err) {
        throw new MaiaError('unavailable', `no answer: ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        clearTimeout(timer)
      }

      let body: unknown = null
      try {
        body = await res.json()
      } catch {
        body = null
      }

      if (res.status === 200) {
        if (body === null) throw new MaiaError('bad_response', 'policy is not JSON')
        return parsePolicy(body)
      }
      if (res.status === 401) throw new MaiaError('unauthorized', 'the Maia service refused the token')
      if (res.status === 400) {
        const code = (body as { error?: unknown } | null)?.error
        if (typeof code === 'string' && SERVICE_400.has(code as MaiaErrorCode)) {
          throw new MaiaError(code as MaiaErrorCode, `the Maia service answered ${code}`)
        }
        throw new MaiaError('bad_response', `400 with an unknown error: ${String(code)}`)
      }
      throw new MaiaError('unavailable', `the Maia service answered ${res.status}`)
    },
  }
}

export async function maiaHealth({ url, token, fetch: doFetch = fetch, timeoutMs = MAIA_TIMEOUT_MS }: HttpMaiaOptions): Promise<{ ok: boolean; model: string | null }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await doFetch(`${base(url)}/health`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
      cache: 'no-store',
    })
    const body = (await res.json().catch(() => null)) as { ok?: unknown; model?: unknown } | null
    return { ok: res.ok && body?.ok === true, model: typeof body?.model === 'string' ? body.model : null }
  } catch {
    return { ok: false, model: null }
  } finally {
    clearTimeout(timer)
  }
}

export const FAKE_MAIA_MODEL = 'fake-legal-weighted'

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

function fakeWeight(m: { captured?: string; promotion?: string; san: string; flags: string }): number {
  let w = 1
  if (m.captured) w += 2 * PIECE_VALUE[m.captured]
  if (m.san.includes('#')) w += 40
  else if (m.san.includes('+')) w += 3
  if (m.promotion) w += m.promotion === 'q' ? 8 : 1
  if (m.flags.includes('k') || m.flags.includes('q')) w += 1
  return w
}

function loadFen(fen: string): Chess {
  try {
    return new Chess(fen)
  } catch {
    throw new MaiaError('invalid_fen', 'not a FEN chess.js accepts')
  }
}

export function createFakeMaiaClient(): MaiaClient {
  return {
    async policy(req) {
      if (!Number.isInteger(req.elo_self) || !Number.isInteger(req.elo_oppo)) {
        throw new MaiaError('bad_elo', 'ratings must be whole numbers')
      }
      const chess = loadFen(req.fen)
      if (chess.isGameOver()) throw new MaiaError('game_over', 'the game is over in this position')
      const legal = chess.moves({ verbose: true })
      const weights = legal.map(fakeWeight)
      const total = weights.reduce((s, w) => s + w, 0)
      const moves = legal
        .map((m, i) => ({ uci: m.from + m.to + (m.promotion ?? ''), p: weights[i] / total }))
        .sort((a, b) => b.p - a.p || (a.uci < b.uci ? -1 : 1))
      return { moves, model: FAKE_MAIA_MODEL, ms: 0 }
    },
  }
}

export function sampleMove(policy: MaiaPolicy, rng: () => number, temperature = 1): MaiaMove {
  if (!Number.isFinite(temperature) || temperature <= 0) {
    throw new RangeError('temperature must be a positive number')
  }
  const moves = policy.moves.filter(m => Number.isFinite(m.p) && m.p > 0)
  if (moves.length === 0) throw new MaiaError('bad_response', 'no move has any probability')
  const weights = moves.map(m => Math.pow(m.p, 1 / temperature))
  const total = weights.reduce((s, w) => s + w, 0)
  let r = rng() * total
  for (let i = 0; i < moves.length; i++) {
    r -= weights[i]
    if (r < 0) return moves[i]
  }
  return moves[moves.length - 1]
}

export function legalPolicy(policy: MaiaPolicy, fen: string): MaiaPolicy {
  const legal = new Set(new Chess(fen).moves({ verbose: true }).map(m => m.from + m.to + (m.promotion ?? '')))
  return { ...policy, moves: policy.moves.filter(m => legal.has(m.uci)) }
}
