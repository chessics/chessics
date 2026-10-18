import type { TimeControlFilter } from '@/lib/sync/chess-com'

export const BATCH_SIZES = [10, 25, 50, 100] as const

export const GUEST_BATCH_SIZES: readonly number[] = [10]

export const SIGN_UP_FOR_LARGER_BATCHES = 'sign_up_for_larger_batches'

export function batchSizeAllowed(batchSize: number, signedIn: boolean): boolean {
  return signedIn || GUEST_BATCH_SIZES.includes(batchSize)
}

const PLATFORMS = ['chess_com', 'lichess'] as const
const FILTERS: readonly TimeControlFilter[] = ['rapid_blitz', 'all']
export const MAX_USERNAME_LENGTH = 50
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface SyncRequest {
  username: string
  platform: (typeof PLATFORMS)[number]
  batchSize: number
  calibrationLevel: number | undefined
  sessionToken: string | undefined
  timeControlFilter: TimeControlFilter
}

export function parseSyncBody(raw: unknown): SyncRequest | string {
  if (typeof raw !== 'object' || raw === null) return 'body must be an object'
  const b = raw as Record<string, unknown>

  const username = typeof b.username === 'string' ? b.username.trim() : ''
  if (!username || !b.platform) return 'username and platform are required'
  if (username.length > MAX_USERNAME_LENGTH) return 'username is too long'
  if (!PLATFORMS.includes(b.platform as SyncRequest['platform'])) return 'Invalid platform'

  const batchSize = b.batchSize ?? 10
  if (!BATCH_SIZES.includes(batchSize as (typeof BATCH_SIZES)[number])) {
    return `batchSize must be one of ${BATCH_SIZES.join(', ')}`
  }

  const calibrationLevel = b.calibrationLevel ?? undefined
  if (
    calibrationLevel !== undefined &&
    !(typeof calibrationLevel === 'number' && Number.isInteger(calibrationLevel) && calibrationLevel >= 0 && calibrationLevel <= 4)
  ) {
    return 'calibrationLevel must be an integer from 0 to 4'
  }

  const sessionToken = b.sessionToken ?? undefined
  if (sessionToken !== undefined && !(typeof sessionToken === 'string' && UUID.test(sessionToken))) {
    return 'sessionToken must be a UUID'
  }

  const timeControlFilter = b.timeControlFilter ?? 'rapid_blitz'
  if (!FILTERS.includes(timeControlFilter as TimeControlFilter)) return 'Invalid timeControlFilter'

  return {
    username,
    platform: b.platform as SyncRequest['platform'],
    batchSize: batchSize as number,
    calibrationLevel: calibrationLevel as number | undefined,
    sessionToken: sessionToken as string | undefined,
    timeControlFilter: timeControlFilter as TimeControlFilter,
  }
}
