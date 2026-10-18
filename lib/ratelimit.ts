import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { NextResponse } from 'next/server'
import { TOO_MANY_REQUESTS_CODE, TOO_MANY_REQUESTS_MESSAGE } from '@/lib/ratelimit-message'

export type Window = `${number} ${'s' | 'm' | 'h' | 'd'}`

export interface RateRule {
  readonly name: string
  readonly requests: number
  readonly window: Window
}

export const RATE_LIMITS = {
  guestAnalysis: { name: 'analysis-guest', requests: 10, window: '1 h' },
  userAnalysis: { name: 'analysis-user', requests: 20, window: '1 h' },
  gameAnalysis: { name: 'analysis-game', requests: 30, window: '1 h' },
  allAnalyses: { name: 'analysis-all', requests: 100, window: '1 d' },
  commit: { name: 'commit', requests: 60, window: '1 m' },
  transfer: { name: 'transfer', requests: 10, window: '10 m' },
} as const satisfies Record<string, RateRule>

export const LIMITER_TIMEOUT_MS = 1000

export interface LimitCheck {
  rule: RateRule
  key: string
}

export type LimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number }

interface Limiter {
  limit(key: string): Promise<{ success: boolean; reset: number; reason?: string }>
}

const limiters = new Map<string, Limiter>()
let warnedUnconfigured = false

function limiterFor(rule: RateRule, env: Record<string, string | undefined>): Limiter | null {
  const url = env.UPSTASH_REDIS_REST_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    if (!warnedUnconfigured) console.error('[ratelimit] Redis is not configured; requests are not limited')
    warnedUnconfigured = true
    return null
  }
  let limiter = limiters.get(rule.name)
  if (!limiter) {
    limiter = new Ratelimit({
      redis: new Redis({ url, token }),
      limiter: Ratelimit.slidingWindow(rule.requests, rule.window),
      prefix: `ratelimit:${rule.name}`,
      timeout: LIMITER_TIMEOUT_MS,
      analytics: false,
    })
    limiters.set(rule.name, limiter)
  }
  return limiter
}

export async function checkLimits(
  checks: readonly LimitCheck[],
  now: () => number = Date.now,
  env: Record<string, string | undefined> = process.env
): Promise<LimitResult> {
  for (const { rule, key } of checks) {
    const limiter = limiterFor(rule, env)
    if (!limiter) return { allowed: true }
    let result: Awaited<ReturnType<Limiter['limit']>>
    try {
      result = await limiter.limit(key)
    } catch (err) {
      console.error(`[ratelimit] ${rule.name}: Redis unreachable, allowing the request:`, err)
      continue
    }
    if (result.reason === 'timeout') {
      console.error(`[ratelimit] ${rule.name}: Redis timed out, allowing the request`)
      continue
    }
    if (!result.success) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((result.reset - now()) / 1000)) }
    }
  }
  return { allowed: true }
}

export function clientIp(headers: Headers): string {
  const first = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (first) return first
  return headers.get('x-real-ip')?.trim() || 'unknown'
}

export function userKey(userId: string): string {
  return `user:${userId}`
}

export function ipKey(headers: Headers): string {
  return `ip:${clientIp(headers)}`
}

export const SITE_KEY = 'all'

export function tooManyRequests(
  result: { retryAfterSeconds: number },
  headers: Record<string, string> = {}
): NextResponse {
  return NextResponse.json(
    { error: TOO_MANY_REQUESTS_CODE, message: TOO_MANY_REQUESTS_MESSAGE },
    { status: 429, headers: { ...headers, 'Retry-After': String(result.retryAfterSeconds) } }
  )
}

export function resetLimitersForTests(): void {
  limiters.clear()
  warnedUnconfigured = false
}
