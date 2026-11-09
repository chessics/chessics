import {
  dailyEventCounts,
  eventFunnel,
  eventTotals,
  existingDaily,
  existingSummary,
  FUNNEL_WINDOWS,
  readEvents,
  readExistingTables,
  type EventTotals,
  type ExistingDaily,
  type ExistingSummary,
  type Funnel,
  type ReadClient,
  type ReadRedis,
} from '@/lib/analytics/usage-report'
import { EVENT_NAMES } from '@/lib/analytics/events'

export const STATS_DAYS = 14

export type EventsSection =
  | {
      status: 'ok'
      week: EventTotals
      month: EventTotals
      funnels: Funnel[]
      daily: { day: string; counts: Record<string, number> }[]
      names: string[]
      cut: boolean
    }
  | { status: 'not_applied' }
  | { status: 'error' }

export interface StatsData {
  now: number
  week: ExistingSummary
  month: ExistingSummary
  daily: ExistingDaily[]
  cut: boolean
  guestsKnown: boolean
  events: EventsSection
}

export function isMissingTable(message: string): boolean {
  return /does not exist|could not find the table/i.test(message)
}

export async function loadStats(client: ReadClient, redis: ReadRedis | null, now: number): Promise<StatsData> {
  const [existing, events] = await Promise.all([
    readExistingTables(client, redis, now, STATS_DAYS),
    readEvents(client).then(
      (r) => ({ ok: true as const, ...r }),
      (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) })
    ),
  ])

  let section: EventsSection
  if (events.ok) {
    const known = new Set<string>(EVENT_NAMES)
    const extra = Array.from(new Set(events.events.map((e) => e.name).filter((n) => !known.has(n)))).sort()
    section = {
      status: 'ok',
      week: eventTotals(events.events, now, 7),
      month: eventTotals(events.events, now, 30),
      funnels: FUNNEL_WINDOWS.map((d) => eventFunnel(events.events, now, d)),
      daily: Array.from(dailyEventCounts(events.events, now, STATS_DAYS)).map(([day, m]) => ({
        day,
        counts: Object.fromEntries(m),
      })),
      names: [...EVENT_NAMES, ...extra],
      cut: events.cut,
    }
  } else {
    section = isMissingTable(events.message) ? { status: 'not_applied' } : { status: 'error' }
    if (section.status === 'error') console.error('[stats] events read failed')
  }

  return {
    now,
    week: existingSummary(existing.tables, now, 7),
    month: existingSummary(existing.tables, now, 30),
    daily: existingDaily(existing.tables, now, STATS_DAYS),
    cut: existing.cut,
    guestsKnown: redis !== null,
    events: section,
  }
}
