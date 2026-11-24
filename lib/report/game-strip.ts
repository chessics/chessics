import type { Finding, GameResult, GroupFacts } from '@/lib/diagnosis/finding'
import { resultsSentence } from '@/lib/diagnosis/finding'

export interface StripGame {
  id: string
  result: GameResult | null
  opponent: string | null
  playedAt: string | null
}

export type StripRowKey = 'loss' | 'draw' | 'win' | 'unknown' | 'rest'

export interface StripRow {
  key: StripRowKey
  label: string
  gameIds: string[]
}

export function inPlayOrder<T extends { playedAt: string | null }>(games: readonly T[]): T[] {
  return games
    .map((g, i) => ({ g, i }))
    .sort((a, b) => {
      if (a.g.playedAt && b.g.playedAt) return a.g.playedAt.localeCompare(b.g.playedAt) || a.i - b.i
      if (a.g.playedAt) return -1
      if (b.g.playedAt) return 1
      return a.i - b.i
    })
    .map(({ g }) => g)
}

export function headlineGameIds(input: {
  suddenLeads: boolean
  suddenGameIds: readonly string[]
  recounted: readonly Pick<GroupFacts, 'recurring' | 'gameIds'>[]
  chainGameIds: readonly string[]
}): Set<string> {
  if (input.suddenLeads) return new Set(input.suddenGameIds)
  const head = input.recounted.find((g) => g.recurring)
  return new Set(head ? head.gameIds : input.chainGameIds)
}

const ROW_LABEL: Record<Exclude<StripRowKey, 'rest'>, string> = {
  loss: 'you lost',
  draw: 'you drew',
  win: 'you won',
  unknown: 'result unknown',
}

export function stripRows(games: readonly StripGame[], headline: ReadonlySet<string>): StripRow[] {
  const rows: StripRow[] = (['loss', 'draw', 'win', 'unknown'] as const).map((key) => ({
    key,
    label: ROW_LABEL[key],
    gameIds: games.filter((g) => headline.has(g.id) && (g.result ?? 'unknown') === key).map((g) => g.id),
  }))
  const rest = games.filter((g) => !headline.has(g.id)).map((g) => g.id)
  const shown = rows.filter((r) => r.gameIds.length > 0)
  if (rest.length > 0) shown.push({ key: 'rest', label: shown.length > 0 ? 'other games' : 'games', gameIds: rest })
  return shown
}

export function headlineCount(text: string, marked: number): { before: string; count: number; after: string } | null {
  const m = /^(In )(\d+)( of your .+)$/.exec(text)
  if (!m || Number(m[2]) !== marked) return null
  return { before: m[1]!, count: marked, after: m[3]! }
}

export function withoutStripResults(findings: readonly Finding[], headline: ReadonlySet<string>): Finding[] {
  const [lead, ...rest] = findings
  if (!lead) return [...findings]
  const counted = lead.sources.filter((s) => s.counted)
  const ids = new Set(counted.map((s) => s.gameId))
  if (ids.size === 0 || ids.size !== headline.size || Array.from(ids).some((id) => !headline.has(id))) return [...findings]
  const perGame = Array.from(new Map(counted.map((s) => [s.gameId, { result: s.result }])).values())
  const sentence = resultsSentence(perGame, counted.length)
  if (!sentence) return [...findings]
  const claim = lead.claim.filter((c) => c.door || c.text !== sentence)
  return claim.length === lead.claim.length ? [...findings] : [{ ...lead, claim }, ...rest]
}

export interface Spot {
  x: number
  y: number
}

export interface StageLayout {
  cell: number
  gap: number
  grid: Spot[]
  shelf: Map<string, Spot>
  labels: Map<StripRowKey, Spot>
  height: number
  stacked: boolean
}

export const GRID_COLUMNS = 10
export const STAGE_GAP = 5
const LABEL_HEIGHT = 34
const ROW_GAP = 16
const SIDE_GAP = 44
export const STACK_BELOW = 640

export function stageLayout(width: number, playOrder: readonly string[], rows: readonly StripRow[]): StageLayout {
  const gap = STAGE_GAP
  const stacked = width < STACK_BELOW
  const cell = stacked ? Math.max(12, Math.min(24, Math.floor((width - gap * (GRID_COLUMNS - 1)) / GRID_COLUMNS))) : 30
  const gridWidth = GRID_COLUMNS * cell + (GRID_COLUMNS - 1) * gap
  const gridRows = Math.ceil(playOrder.length / GRID_COLUMNS)
  const gridHeight = gridRows * cell + Math.max(0, gridRows - 1) * gap

  const x0 = stacked ? 0 : gridWidth + SIDE_GAP
  const rowWidth = Math.max(cell, width - x0)
  const perLine = Math.max(1, Math.floor((rowWidth + gap) / (cell + gap)))
  const shelf = new Map<string, Spot>()
  const labels = new Map<StripRowKey, Spot>()
  let y = 0
  rows.forEach((row, r) => {
    if (r > 0) y += ROW_GAP
    labels.set(row.key, { x: x0, y })
    y += LABEL_HEIGHT
    row.gameIds.forEach((id, i) => {
      shelf.set(id, { x: x0 + (i % perLine) * (cell + gap), y: y + Math.floor(i / perLine) * (cell + gap) })
    })
    const lines = Math.ceil(row.gameIds.length / perLine)
    y += lines * cell + Math.max(0, lines - 1) * gap
  })
  const shelvesHeight = y

  const gridTop = stacked ? shelvesHeight + 22 : 0
  const grid = playOrder.map((_, i) => ({
    x: (i % GRID_COLUMNS) * (cell + gap),
    y: gridTop + Math.floor(i / GRID_COLUMNS) * (cell + gap),
  }))
  return {
    cell,
    gap,
    grid,
    shelf,
    labels,
    height: stacked ? gridTop + gridHeight : Math.max(gridHeight, shelvesHeight),
    stacked,
  }
}

export function stripTimings(games: number, marked: number) {
  return {
    start: 350,
    read: Math.max(8, Math.min(60, Math.round(2600 / Math.max(1, games)))),
    afterRead: 600,
    sort: Math.max(14, Math.round(900 / Math.max(1, marked))),
    afterRow: 220,
    afterSort: 300,
    rest: Math.max(8, Math.round(500 / Math.max(1, games - marked))),
    beforeSettle: 1000,
    settle: 720,
  }
}

export const STRIP_SEEN_KEY = 'chessics_report_strip_seen'
export const STRIP_SEEN_MAX = 100

export function parseSeen(raw: string | null): string[] {
  if (!raw) return []
  try {
    const v: unknown = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-STRIP_SEEN_MAX) : []
  } catch {
    return []
  }
}

export function withSeen(seen: readonly string[], id: string): string[] {
  return [...seen.filter((x) => x !== id), id].slice(-STRIP_SEEN_MAX)
}

export function stripBootScript(): string {
  return `(function(){try{var s=document.currentScript,r=s&&s.parentElement;if(!r)return;var id=r.getAttribute('data-strip-id');var raw=localStorage.getItem(${JSON.stringify(STRIP_SEEN_KEY)});var seen=[];try{seen=JSON.parse(raw||'[]')}catch(e){}if(!Array.isArray(seen))seen=[];if(seen.indexOf(id)===-1&&!matchMedia('(prefers-reduced-motion: reduce)').matches)r.setAttribute('data-anim','pending')}catch(e){}})()`
}
