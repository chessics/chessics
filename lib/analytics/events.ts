import { createHash } from 'node:crypto'

export const EVENT_NAMES = [
  'guest_analysis_started',
  'analysis_started',
  'report_viewed',
  'signup',
  'training_commit',
  'play_started',
  'share_created',
  'share_viewed',
  'share_answered',
] as const
export type EventName = (typeof EVENT_NAMES)[number]

export const PROP_PLATFORMS = ['chess_com', 'lichess'] as const
export const PROP_TIME_CLASSES = ['rapid_blitz', 'all', 'bullet', 'blitz', 'rapid', 'classical', 'daily'] as const
export const MAX_PROP_GAME_COUNT = 1000

export interface EventProps {
  platform?: (typeof PROP_PLATFORMS)[number]
  game_count?: number
  time_class?: (typeof PROP_TIME_CLASSES)[number]
}

export const PROP_KEYS = ['platform', 'game_count', 'time_class'] as const

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v)

export function cleanProps(raw: unknown): EventProps {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const r = raw as Record<string, unknown>
  const out: EventProps = {}
  if (isOneOf(PROP_PLATFORMS, r.platform)) out.platform = r.platform
  if (
    typeof r.game_count === 'number' &&
    Number.isInteger(r.game_count) &&
    r.game_count >= 0 &&
    r.game_count <= MAX_PROP_GAME_COUNT
  ) {
    out.game_count = r.game_count
  }
  if (isOneOf(PROP_TIME_CLASSES, r.time_class)) out.time_class = r.time_class
  return out
}

export const DEV_SALT = 'chessics-dev-analytics-salt'

let warnedNoSalt = false

export function analyticsSalt(env: Record<string, string | undefined> = process.env): string {
  const salt = env.ANALYTICS_SALT
  if (salt) return salt
  if (env.NODE_ENV === 'production' && !warnedNoSalt) {
    warnedNoSalt = true
    console.warn('[analytics] ANALYTICS_SALT is not set; guest keys use the development salt')
  }
  return DEV_SALT
}

export function guestKey(token: unknown, salt: string = analyticsSalt()): string | null {
  if (typeof token !== 'string' || token.length === 0) return null
  return createHash('sha256').update(`${salt}:${token}`).digest('hex')
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface EventInput {
  userId?: string | null
  guestToken?: string | null
  props?: EventProps
  at?: string
}

export interface EventRow {
  name: EventName
  user_id: string | null
  guest_key: string | null
  props: EventProps
  created_at?: string
}

export function eventRow(name: string, input: EventInput, salt?: string): EventRow | null {
  if (!isOneOf(EVENT_NAMES, name)) return null
  const userId = typeof input.userId === 'string' && UUID.test(input.userId) ? input.userId.toLowerCase() : null
  const row: EventRow = {
    name,
    user_id: userId,
    guest_key: guestKey(input.guestToken, salt ?? analyticsSalt()),
    props: cleanProps(input.props),
  }
  if (typeof input.at === 'string' && Number.isFinite(Date.parse(input.at))) {
    row.created_at = new Date(Date.parse(input.at)).toISOString()
  }
  return row
}

export function resetSaltWarningForTests(): void {
  warnedNoSalt = false
}
