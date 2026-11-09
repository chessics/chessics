import { allRows } from '../supabase/row-cap'
import { EVENT_NAMES, type EventName } from './events'

export const DAY_MS = 24 * 3600_000
export const GUEST_TTL_SECONDS = 7 * 24 * 3600
export const FUNNEL_WINDOWS = [7, 30] as const
export const MAX_PAGES = 200
const PAGE_SIZE = 1000

export interface EventRecord {
  name: string
  user_id: string | null
  guest_key: string | null
  created_at: string
}

export interface TimeRecord {
  at: string
}

export interface UserTimeRecord {
  user_id: string | null
  at: string
}

export interface ExistingTables {
  profiles: TimeRecord[]
  batchReports: UserTimeRecord[]
  interactions: UserTimeRecord[]
  games: UserTimeRecord[]
  guestGamesTtls: number[] | null
  guestResultTtls: number[] | null
}

export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function lastDays(now: number, days: number): string[] {
  const out: string[] = []
  for (let i = days - 1; i >= 0; i--) out.push(utcDay(now - i * DAY_MS))
  return out
}

function ms(iso: string): number {
  return Date.parse(iso)
}

function inWindow(iso: string, now: number, days: number): boolean {
  const t = ms(iso)
  return Number.isFinite(t) && t > now - days * DAY_MS && t <= now
}

export function guestKeyWrittenAt(ttlSeconds: number, now: number): number | null {
  if (!Number.isFinite(ttlSeconds) || ttlSeconds < 0 || ttlSeconds > GUEST_TTL_SECONDS) return null
  return now - (GUEST_TTL_SECONDS - ttlSeconds) * 1000
}

export type DailyCounts = Map<string, Map<string, number>>

export function dailyEventCounts(events: readonly EventRecord[], now: number, days: number): DailyCounts {
  const out: DailyCounts = new Map(lastDays(now, days).map((d) => [d, new Map<string, number>()]))
  for (const e of events) {
    const t = ms(e.created_at)
    if (!Number.isFinite(t)) continue
    const day = out.get(utcDay(t))
    if (!day) continue
    day.set(e.name, (day.get(e.name) ?? 0) + 1)
  }
  return out
}

export interface Funnel {
  days: number
  guestStarted: number
  reportViewed: number
  signedUp: number
  firstCommit: number
}

export function eventFunnel(events: readonly EventRecord[], now: number, days: number): Funnel {
  const started = new Set<string>()
  for (const e of events) {
    if (e.name === 'guest_analysis_started' && e.guest_key && inWindow(e.created_at, now, days)) started.add(e.guest_key)
  }
  const viewedKeys = new Set(events.filter((e) => e.name === 'report_viewed' && e.guest_key).map((e) => e.guest_key!))
  const viewed = new Set(Array.from(started).filter((k) => viewedKeys.has(k)))

  const accountOfGuest = new Map<string, string>()
  for (const e of events) {
    if (e.name === 'signup' && e.guest_key && e.user_id && viewed.has(e.guest_key)) accountOfGuest.set(e.guest_key, e.user_id)
  }
  const committed = new Set(events.filter((e) => e.name === 'training_commit' && e.user_id).map((e) => e.user_id!))
  const firstCommit = Array.from(accountOfGuest.values()).filter((u) => committed.has(u))

  return {
    days,
    guestStarted: started.size,
    reportViewed: viewed.size,
    signedUp: accountOfGuest.size,
    firstCommit: new Set(firstCommit).size,
  }
}

export interface EventTotals {
  days: number
  guestAnalyses: number
  signedInAnalyses: number
  reportsViewed: number
  signups: number
  firstCommits: number
  trainingCommits: number
  activeAccounts: number
}

export function eventTotals(events: readonly EventRecord[], now: number, days: number): EventTotals {
  const inW = events.filter((e) => inWindow(e.created_at, now, days))
  const count = (name: EventName) => inW.filter((e) => e.name === name).length

  const firstCommitAt = new Map<string, number>()
  for (const e of events) {
    if (e.name !== 'training_commit' || !e.user_id) continue
    const t = ms(e.created_at)
    if (!Number.isFinite(t)) continue
    const prev = firstCommitAt.get(e.user_id)
    if (prev === undefined || t < prev) firstCommitAt.set(e.user_id, t)
  }
  const firstCommits = Array.from(firstCommitAt.values()).filter((t) => t > now - days * DAY_MS && t <= now).length

  return {
    days,
    guestAnalyses: count('guest_analysis_started'),
    signedInAnalyses: count('analysis_started'),
    reportsViewed: count('report_viewed'),
    signups: count('signup'),
    firstCommits,
    trainingCommits: count('training_commit'),
    activeAccounts: new Set(inW.filter((e) => e.user_id).map((e) => e.user_id!)).size,
  }
}

export interface ExistingDaily {
  day: string
  guestStarted: number | null
  signups: number
  batchReports: number
  trainingCommits: number
  gamesAdded: number
}

export function existingDaily(t: ExistingTables, now: number, days: number): ExistingDaily[] {
  const guestDays = new Set(lastDays(now, 7))
  const guestStarts = new Map<string, number>()
  for (const ttl of t.guestGamesTtls ?? []) {
    const at = guestKeyWrittenAt(ttl, now)
    if (at === null) continue
    const d = utcDay(at)
    guestStarts.set(d, (guestStarts.get(d) ?? 0) + 1)
  }
  const byDay = (rows: readonly { at: string }[]) => {
    const m = new Map<string, number>()
    for (const r of rows) {
      const tm = ms(r.at)
      if (!Number.isFinite(tm)) continue
      const d = utcDay(tm)
      m.set(d, (m.get(d) ?? 0) + 1)
    }
    return m
  }
  const signups = byDay(t.profiles)
  const reports = byDay(t.batchReports)
  const commits = byDay(t.interactions)
  const games = byDay(t.games)
  return lastDays(now, days).map((day) => ({
    day,
    guestStarted: t.guestGamesTtls && guestDays.has(day) ? (guestStarts.get(day) ?? 0) : null,
    signups: signups.get(day) ?? 0,
    batchReports: reports.get(day) ?? 0,
    trainingCommits: commits.get(day) ?? 0,
    gamesAdded: games.get(day) ?? 0,
  }))
}

export interface ExistingSummary {
  days: number
  guestStarted: number | null
  guestResultsWaiting: number | null
  signups: number
  firstCommits: number
  trainingCommits: number
  accountsWithBatchReport: number
  accountsActive: number
  totalAccounts: number
}

export function existingSummary(t: ExistingTables, now: number, days: number): ExistingSummary {
  const guestStarted = t.guestGamesTtls && days <= 7
    ? t.guestGamesTtls.filter((ttl) => {
        const at = guestKeyWrittenAt(ttl, now)
        return at !== null && at > now - days * DAY_MS
      }).length
    : null
  const guestResultsWaiting = t.guestResultTtls && days <= 7
    ? t.guestResultTtls.filter((ttl) => guestKeyWrittenAt(ttl, now) !== null).length
    : null

  const firstAt = new Map<string, number>()
  for (const r of t.interactions) {
    if (!r.user_id) continue
    const tm = ms(r.at)
    if (!Number.isFinite(tm)) continue
    const prev = firstAt.get(r.user_id)
    if (prev === undefined || tm < prev) firstAt.set(r.user_id, tm)
  }
  const inW = (r: { at: string }) => inWindow(r.at, now, days)
  const reportAccounts = new Set(t.batchReports.filter(inW).filter((r) => r.user_id).map((r) => r.user_id!))
  const active = new Set(
    [...t.batchReports, ...t.interactions, ...t.games].filter(inW).filter((r) => r.user_id).map((r) => r.user_id!)
  )

  return {
    days,
    guestStarted,
    guestResultsWaiting,
    signups: t.profiles.filter(inW).length,
    firstCommits: Array.from(firstAt.values()).filter((tm) => tm > now - days * DAY_MS && tm <= now).length,
    trainingCommits: t.interactions.filter(inW).length,
    accountsWithBatchReport: reportAccounts.size,
    accountsActive: active.size,
    totalAccounts: t.profiles.length,
  }
}

function table(header: string[], rows: (string | number)[][]): string[] {
  const cells = [header, ...rows.map((r) => r.map(String))]
  const widths = header.map((_, i) => Math.max(...cells.map((r) => r[i].length)))
  return cells.map((r) => r.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ').trimEnd())
}

const dash = (n: number | null) => (n === null ? '-' : n)

export function renderEventsReport(events: readonly EventRecord[], now: number, days: number, cut: boolean): string {
  const daily = dailyEventCounts(events, now, days)
  const known = new Set<string>(EVENT_NAMES)
  const extra = Array.from(new Set(events.map((e) => e.name).filter((n) => !known.has(n)))).sort()
  const names = [...EVENT_NAMES, ...extra]
  const lines: string[] = []
  lines.push(`Chessics usage from the events table, ${new Date(now).toISOString().slice(0, 16)} UTC`)
  if (cut) lines.push(`WARNING: the read stopped at ${MAX_PAGES * PAGE_SIZE} rows; counts are cut.`)
  lines.push('')
  lines.push(`Per day (UTC), last ${days} days`)
  lines.push(...table(['date', ...names], Array.from(daily).map(([d, m]) => [d, ...names.map((n) => m.get(n) ?? 0)])))

  const funnels = FUNNEL_WINDOWS.map((w) => eventFunnel(events, now, w))
  lines.push('')
  lines.push('Funnel: the same guests, step by step')
  lines.push(
    ...table(
      ['', ...funnels.map((f) => `last ${f.days} days`)],
      [
        ['guest started an analysis', ...funnels.map((f) => f.guestStarted)],
        ['  then viewed the report', ...funnels.map((f) => f.reportViewed)],
        ['  then signed up', ...funnels.map((f) => f.signedUp)],
        ['  then made a training commit', ...funnels.map((f) => f.firstCommit)],
      ]
    )
  )

  const totals = FUNNEL_WINDOWS.map((w) => eventTotals(events, now, w))
  lines.push('')
  lines.push('Totals, everyone')
  lines.push(
    ...table(
      ['', ...totals.map((t) => `last ${t.days} days`)],
      [
        ['guest analyses started', ...totals.map((t) => t.guestAnalyses)],
        ['signed-in analyses started', ...totals.map((t) => t.signedInAnalyses)],
        ['guest reports viewed', ...totals.map((t) => t.reportsViewed)],
        ['signups', ...totals.map((t) => t.signups)],
        ['accounts with a first training commit', ...totals.map((t) => t.firstCommits)],
        ['training commits', ...totals.map((t) => t.trainingCommits)],
        ['accounts with any event', ...totals.map((t) => t.activeAccounts)],
      ]
    )
  )
  lines.push('')
  lines.push('First training commits are counted from the events table, which starts at migration 013;')
  lines.push('an account that trained before then counts again at its first commit after it.')
  lines.push('Page views are in the Vercel dashboard (Analytics tab), not here.')
  return lines.join('\n')
}

export function renderExistingReport(t: ExistingTables, now: number, days: number, cut: boolean): string {
  const lines: string[] = []
  lines.push(`Chessics usage without the events table, ${new Date(now).toISOString().slice(0, 16)} UTC`)
  lines.push('From profiles, batch_reports, interactions, games, and the guest analyses still in Redis.')
  if (cut) lines.push(`WARNING: a read stopped at ${MAX_PAGES * PAGE_SIZE} rows; counts are cut.`)
  lines.push('')
  lines.push(`Per day (UTC), last ${days} days ("-": before Redis's 7 days)`)
  lines.push(
    ...table(
      ['date', 'guest analyses', 'signups', 'batch reports', 'training commits', 'games added'],
      existingDaily(t, now, days).map((d) => [d.day, dash(d.guestStarted), d.signups, d.batchReports, d.trainingCommits, d.gamesAdded])
    )
  )

  const s = FUNNEL_WINDOWS.map((w) => existingSummary(t, now, w))
  lines.push('')
  lines.push('Steps (totals, not the same people)')
  lines.push(
    ...table(
      ['', ...s.map((x) => `last ${x.days} days`)],
      [
        ['guest analyses started (still in Redis)', ...s.map((x) => dash(x.guestStarted))],
        ['guest reports viewed', ...s.map(() => 'not recorded')],
        ['signups', ...s.map((x) => x.signups)],
        ['accounts with a first training commit', ...s.map((x) => x.firstCommits)],
      ]
    )
  )
  lines.push('')
  lines.push('Other counts')
  lines.push(
    ...table(
      ['', ...s.map((x) => `last ${x.days} days`)],
      [
        ['guest results waiting to move to an account', ...s.map((x) => dash(x.guestResultsWaiting))],
        ['training commits', ...s.map((x) => x.trainingCommits)],
        ['accounts with a batch report', ...s.map((x) => x.accountsWithBatchReport)],
        ['accounts with any report, commit or game added', ...s.map((x) => x.accountsActive)],
      ]
    )
  )
  lines.push(`Accounts, all time: ${s[0].totalAccounts}`)
  lines.push('')
  lines.push('Read with care:')
  lines.push('- a guest who signed up and moved their analysis no longer has Redis keys, so converted guests drop out of the guest count;')
  lines.push('- a signed-in user analysing another player\'s games also writes guest keys, and counts as a guest analysis here;')
  lines.push('- "games added" includes the library import on visit, so it measures visits by signed-in users with new games, not analyses.')
  lines.push('Page views are in the Vercel dashboard (Analytics tab), not here.')
  return lines.join('\n')
}

export interface ReadQuery<T> extends PromiseLike<{ data: T[] | null; error: { message: string } | null }> {
  select(columns: string): ReadQuery<T>
  gte(column: string, value: string): ReadQuery<T>
  order(column: string, opts: { ascending: boolean }): ReadQuery<T>
  range(from: number, to: number): ReadQuery<T>
}

export interface ReadClient {
  from(table: string): { select(columns: string): ReadQuery<Record<string, unknown>> }
}

export interface ReadRedis {
  scan(cursor: string | number, opts: { match: string; count: number }): Promise<[string | number, string[]]>
  ttl(key: string): Promise<number>
}

async function readAll<T>(
  client: ReadClient,
  tableName: string,
  columns: string,
  orderColumn: string,
  sinceIso: string | null
): Promise<{ rows: T[]; cut: boolean }> {
  const { data, error } = await allRows<T>(
    (from, to) => {
      let q = client.from(tableName).select(columns)
      if (sinceIso) q = q.gte(orderColumn, sinceIso)
      return q.order(orderColumn, { ascending: true }).order('id', { ascending: true }).range(from, to) as unknown as PromiseLike<{
        data: T[] | null
        error: { message: string } | null
      }>
    },
    PAGE_SIZE,
    MAX_PAGES
  )
  if (error) throw new Error(`reading ${tableName}: ${error.message}`)
  return { rows: data, cut: data.length >= PAGE_SIZE * MAX_PAGES }
}

export async function readEvents(client: ReadClient): Promise<{ events: EventRecord[]; cut: boolean }> {
  const { rows, cut } = await readAll<EventRecord>(client, 'events', 'id, name, user_id, guest_key, created_at', 'created_at', null)
  return { events: rows.map((r) => ({ name: r.name, user_id: r.user_id, guest_key: r.guest_key, created_at: r.created_at })), cut }
}

async function ttlsOf(redis: ReadRedis, pattern: string): Promise<number[]> {
  const ttls: number[] = []
  let cursor: string | number = 0
  for (let i = 0; i < 10_000; i++) {
    const [next, keys] = await redis.scan(cursor, { match: pattern, count: 1000 })
    for (const key of keys) ttls.push(await redis.ttl(key))
    cursor = next
    if (String(next) === '0') break
  }
  return ttls
}

export async function readExistingTables(
  client: ReadClient,
  redis: ReadRedis | null,
  now: number,
  days: number
): Promise<{ tables: ExistingTables; cut: boolean }> {
  const since = new Date(now - Math.max(days, ...FUNNEL_WINDOWS) * DAY_MS).toISOString()
  const [profiles, reports, interactions, games] = await Promise.all([
    readAll<{ created_at: string }>(client, 'profiles', 'id, created_at', 'created_at', null),
    readAll<{ user_id: string | null; generated_at: string }>(client, 'batch_reports', 'id, user_id, generated_at', 'generated_at', since),
    readAll<{ user_id: string | null; created_at: string }>(client, 'interactions', 'id, user_id, created_at', 'created_at', null),
    readAll<{ user_id: string | null; created_at: string }>(client, 'games', 'id, user_id, created_at', 'created_at', since),
  ])
  const [guestGamesTtls, guestResultTtls] = redis
    ? await Promise.all([ttlsOf(redis, 'guest:*:games'), ttlsOf(redis, 'guest:*:result')])
    : [null, null]
  return {
    tables: {
      profiles: profiles.rows.map((r) => ({ at: r.created_at })),
      batchReports: reports.rows.map((r) => ({ user_id: r.user_id, at: r.generated_at })),
      interactions: interactions.rows.map((r) => ({ user_id: r.user_id, at: r.created_at })),
      games: games.rows.map((r) => ({ user_id: r.user_id, at: r.created_at })),
      guestGamesTtls,
      guestResultTtls,
    },
    cut: [profiles, reports, interactions, games].some((r) => r.cut),
  }
}

export interface UsageArgs {
  mode: 'events' | 'without-migration'
  days: number
}

export function parseArgs(argv: readonly string[]): UsageArgs | string {
  let mode: UsageArgs['mode'] = 'events'
  let days = 14
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--without-migration' || a === '--today') mode = 'without-migration'
    else if (a === '--days') {
      const n = Number(argv[++i])
      if (!Number.isInteger(n) || n < 1 || n > 366) return '--days takes a whole number from 1 to 366'
      days = n
    } else return `unknown argument: ${a}`
  }
  return { mode, days }
}

export async function usageReport(
  args: UsageArgs,
  client: ReadClient,
  redis: ReadRedis | null,
  now: number = Date.now()
): Promise<string> {
  if (args.mode === 'events') {
    const { events, cut } = await readEvents(client)
    return renderEventsReport(events, now, args.days, cut)
  }
  const { tables, cut } = await readExistingTables(client, redis, now, args.days)
  const out = renderExistingReport(tables, now, args.days, cut)
  return redis ? out : `${out}\nRedis is not configured: the guest counts are not known ("-").`
}
