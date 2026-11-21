import type { AccountPlatform } from '@/lib/accounts/rules'

export type AnalyzeFilter = 'rapid_blitz' | 'all'

export const BATCH_CHOICES = [10, 25, 50, 100] as const

export function analyzeSession(input: {
  username: string
  platform: AccountPlatform
  batchSize: number
  timeControlFilter: AnalyzeFilter
  calibrationLevel: number
}) {
  return {
    username: input.username,
    platform: input.platform === 'chess_com' ? ('chess.com' as const) : ('lichess' as const),
    batchSize: input.batchSize,
    calibrationLevel: input.calibrationLevel,
    timeControlFilter: input.timeControlFilter,
  }
}
