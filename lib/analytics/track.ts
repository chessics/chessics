import { waitUntil } from '@vercel/functions'
import { Redis } from '@upstash/redis'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { eventRow, guestKey, type EventInput, type EventName, type EventRow } from './events'

export const INSERT_TIMEOUT_MS = 2000
export const ONCE_TIMEOUT_MS = 1000
export const MISSING_TABLE_BACKOFF_MS = 10 * 60_000
export const SIGNUP_WINDOW_MS = 24 * 3600_000
const FUTURE_SKEW_MS = 5 * 60_000
export const SIGNUP_ONCE_TTL_SECONDS = 2 * 24 * 3600
export const REPORT_VIEW_ONCE_TTL_SECONDS = 8 * 24 * 3600

type InsertOutcome = 'inserted' | 'duplicate' | 'failed' | 'skipped'

let client: SupabaseClient | null = null
let redis: Redis | null = null
let missingUntil = 0
const warned = new Set<string>()

function warnOnce(kind: string, message: string): void {
  if (warned.has(kind)) return
  warned.add(kind)
  console.warn(`[analytics] ${message}`)
}

export function eventsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.ANALYTICS_EVENTS !== 'off'
}

function defer(work: () => Promise<unknown>): void {
  let pending: Promise<unknown>
  try {
    pending = Promise.resolve()
      .then(work)
      .catch(err => warnOnce('unexpected', `unexpected error: ${errorText(err)}`))
  } catch {
    return
  }
  try {
    waitUntil(pending)
  } catch {
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer))
}

function serviceClient(): SupabaseClient {
  if (!client) client = createServiceClient()
  return client
}

function redisClient(): Redis {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN
    if (!url || !token) throw new Error('Redis is not configured')
    redis = new Redis({ url, token })
  }
  return redis
}

function isMissingTable(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST205' || error.code === '42P01' || /relation .*events.* does not exist/i.test(error.message ?? '')
}

async function insert(row: EventRow): Promise<InsertOutcome> {
  if (Date.now() < missingUntil) return 'skipped'
  let db: SupabaseClient
  try {
    db = serviceClient()
  } catch (err) {
    warnOnce('client', `no service client, not counted: ${errorText(err)}`)
    return 'failed'
  }
  let error: { code?: string; message?: string } | null
  try {
    ;({ error } = await withTimeout(
      Promise.resolve(db.from('events').insert(row).abortSignal(AbortSignal.timeout(INSERT_TIMEOUT_MS))),
      INSERT_TIMEOUT_MS + 250
    ))
  } catch (err) {
    warnOnce('insert-throw', `insert failed: ${errorText(err)}`)
    return 'failed'
  }
  if (!error) return 'inserted'
  if (error.code === '23505') return 'duplicate'
  if (isMissingTable(error)) {
    missingUntil = Date.now() + MISSING_TABLE_BACKOFF_MS
    warnOnce('missing-table', 'the events table does not exist (migration 013 not applied); not counted')
    return 'failed'
  }
  warnOnce(`insert:${error.code ?? 'unknown'}`, `insert failed: ${error.code ?? ''} ${error.message ?? ''}`.trim())
  return 'failed'
}

export function track(name: EventName, input: EventInput = {}): void {
  if (!eventsEnabled()) return
  let row: EventRow | null
  try {
    row = eventRow(name, input)
  } catch (err) {
    warnOnce('row', `could not build the row: ${errorText(err)}`)
    return
  }
  if (!row) return
  const ready = row
  defer(() => insert(ready))
}

function trackOnce(name: EventName, input: EventInput, onceKey: string, ttlSeconds: number): void {
  if (!eventsEnabled()) return
  let row: EventRow | null
  try {
    row = eventRow(name, input)
  } catch (err) {
    warnOnce('row', `could not build the row: ${errorText(err)}`)
    return
  }
  if (!row) return
  const ready = row
  defer(async () => {
    if (Date.now() < missingUntil) return
    let claimed: boolean
    let viaRedis = false
    try {
      claimed = (await withTimeout(redisClient().set(onceKey, '1', { nx: true, ex: ttlSeconds }), ONCE_TIMEOUT_MS)) === 'OK'
      viaRedis = true
    } catch (err) {
      warnOnce('once-redis', `once-claim skipped, relying on the unique index: ${errorText(err)}`)
      claimed = true
    }
    if (!claimed) return
    const outcome = await insert(ready)
    if (viaRedis && (outcome === 'failed' || outcome === 'skipped')) {
      try {
        await withTimeout(redisClient().del(onceKey), ONCE_TIMEOUT_MS)
      } catch {
      }
    }
  })
}

export function trackReportViewed(guestToken: string): void {
  let key: string | null
  try {
    key = guestKey(guestToken)
  } catch {
    return
  }
  if (!key) return
  trackOnce('report_viewed', { guestToken }, `analytics:once:report_viewed:${key}`, REPORT_VIEW_ONCE_TTL_SECONDS)
}

export interface SignupUser {
  id: string
  created_at?: string | null
}

export function trackSignup(user: SignupUser | null | undefined, guestToken?: string | null, now: number = Date.now()): void {
  try {
    if (!user || typeof user.id !== 'string' || typeof user.created_at !== 'string') return
    const created = Date.parse(user.created_at)
    if (!Number.isFinite(created)) return
    if (now - created > SIGNUP_WINDOW_MS || created - now > FUTURE_SKEW_MS) return
    trackOnce(
      'signup',
      { userId: user.id, guestToken: guestToken ?? null, at: user.created_at },
      `analytics:once:signup:${user.id}`,
      SIGNUP_ONCE_TTL_SECONDS
    )
  } catch {
  }
}

export const SHARE_ONCE_TTL_SECONDS = 30 * 24 * 3600

export function trackShareOnce(name: 'share_viewed' | 'share_answered', slug: string, visitor: string): void {
  let key: string | null
  try {
    key = guestKey(`${name}:${slug}:${visitor}`)
  } catch {
    return
  }
  if (!key) return
  trackOnce(name, {}, `analytics:once:${name}:${key}`, SHARE_ONCE_TTL_SECONDS)
}

export function resetAnalyticsForTests(): void {
  client = null
  redis = null
  missingUntil = 0
  warned.clear()
}
