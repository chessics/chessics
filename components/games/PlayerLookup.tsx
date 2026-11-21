'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import OptionPicker from '@/components/ui/OptionPicker'
import { countNoun } from '@/lib/count-noun'
import { formatTimeControl } from '@/lib/review/time-control'
import {
  familiesIn,
  filterGames,
  LOOKUP_FIRST_ROWS,
  lookupMessage,
  NO_FILTERS,
  noGamesLine,
  platformName,
  recordLine,
  speedsIn,
  type LookedUpGame,
  type LookupFilters,
  type LookupPlatform,
  type Speed,
} from '@/lib/games/player-lookup'
import { RESULT_BADGE } from '@/components/workbench/GamesLibraryClient'

export interface LookupResult {
  platform: LookupPlatform
  username: string
  games: LookedUpGame[]
}

type State =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'done'; result: LookupResult }

export async function requestLookup(
  platform: LookupPlatform,
  username: string,
  { fetcher = fetch, signal }: { fetcher?: typeof fetch; signal?: AbortSignal } = {}
): Promise<{ ok: true; result: LookupResult } | { ok: false; message: string }> {
  const params = new URLSearchParams({ platform, username })
  let res: Response
  try {
    res = await fetcher(`/api/players/games?${params}`, { signal })
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') throw err
    return { ok: false, message: lookupMessage(null, platform) }
  }
  let body: { error?: string; games?: LookedUpGame[]; username?: string } | null = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  if (!res.ok) {
    const code = res.status === 429 ? 'too_many_requests' : res.status === 401 ? 'unauthorized' : body?.error
    return { ok: false, message: lookupMessage(code, platform) }
  }
  if (!body || !Array.isArray(body.games)) return { ok: false, message: lookupMessage(null, platform) }
  return { ok: true, result: { platform, username: body.username ?? username, games: body.games } }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

function Badge({ result }: { result: LookedUpGame['result'] }) {
  const s = RESULT_BADGE[result]
  return (
    <span className="lookup-badge" style={{ color: s.color, borderColor: s.border }}>
      <span aria-hidden="true">{s.letter}</span>
      <span className="sr-only">{s.word}</span>
    </span>
  )
}

export function PlayerGamesList({
  result,
  games = result.games,
  shown,
}: {
  result: LookupResult
  games?: readonly LookedUpGame[]
  shown: number
}) {
  const site = platformName(result.platform)
  if (result.games.length === 0) {
    return <p className="lookup-note">{noGamesLine(result.username)}</p>
  }
  if (games.length === 0) {
    return <p className="lookup-note">No games match these filters.</p>
  }
  return (
    <div className="lookup-list">
      {games.slice(0, shown).map((g) => (
        <a
          key={`${g.platform}:${g.id}`}
          href={g.url}
          target="_blank"
          rel="noopener noreferrer"
          className="lookup-grid games-row"
        >
          <span className="lookup-cell-date">{formatDate(g.played_at)}</span>
          <span className="lookup-cell-result">
            <Badge result={g.result} />
          </span>
          <span className="lookup-cell-color">{g.color === 'white' ? 'White' : 'Black'}</span>
          <span className="lookup-cell-opponent">
            <span className="sr-only">against </span>
            {g.opponent || 'Unknown'}
            {g.opponent_rating !== null && <span className="lookup-rating"> {g.opponent_rating}</span>}
          </span>
          <span className="lookup-cell-opening" data-empty={g.opening ? undefined : ''}>
            {g.opening ?? ''}
          </span>
          <span className="lookup-cell-time">{formatTimeControl(g.time_control) ?? ''}</span>
          <span className="lookup-cell-action">
            {site}
            <span aria-hidden="true"> ↗</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </span>
        </a>
      ))}
    </div>
  )
}

const SPEED_WORD: Record<Speed, string> = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid' }

export function summaryLine(all: readonly LookedUpGame[], shown: readonly LookedUpGame[]): string {
  const head = shown.length === all.length ? `${countNoun(all.length, 'game')} from the last 3 months` : `${shown.length} of ${countNoun(all.length, 'game')}`
  return `${head}: ${recordLine(shown)}.`
}

function FilterGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: ReadonlyArray<{ value: T; text: string }>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="lookup-filter-group">
      {options.map((o) => (
        <button key={o.value} type="button" className="games-filter" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.text}
        </button>
      ))}
    </div>
  )
}

export default function PlayerLookup({ bare = false }: { bare?: boolean }) {
  const [platform, setPlatform] = useState<LookupPlatform>('chess_com')
  const [username, setUsername] = useState('')
  const [state, setState] = useState<State>({ phase: 'idle' })
  const [looking, setLooking] = useState<{ username: string; platform: LookupPlatform } | null>(null)
  const [filters, setFilters] = useState<LookupFilters>(NO_FILTERS)
  const [shown, setShown] = useState(LOOKUP_FIRST_ROWS)
  const [announcement, setAnnouncement] = useState('')
  const inFlight = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const resultHeading = useRef<HTMLHeadingElement>(null)

  useEffect(() => () => inFlight.current?.abort(), [])

  const result = state.phase === 'done' ? state.result : null
  const filtered = useMemo(() => (result ? filterGames(result.games, filters) : []), [result, filters])
  const speeds = useMemo(() => (result ? speedsIn(result.games) : []), [result])
  const families = useMemo(() => (result ? familiesIn(result.games) : []), [result])

  useEffect(() => {
    if (result) resultHeading.current?.focus()
  }, [result])

  function setFilter(next: Partial<LookupFilters>) {
    setFilters((f) => ({ ...f, ...next }))
    setShown(LOOKUP_FIRST_ROWS)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const name = username.trim()
    if (!name || state.phase === 'loading') return
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    setState({ phase: 'loading' })
    setLooking({ username: name, platform })
    setFilters(NO_FILTERS)
    setShown(LOOKUP_FIRST_ROWS)
    setAnnouncement('')
    try {
      const out = await requestLookup(platform, name, { signal: controller.signal })
      if (controller.signal.aborted) return
      if (out.ok) {
        setState({ phase: 'done', result: out.result })
        setAnnouncement(
          out.result.games.length === 0
            ? noGamesLine(out.result.username)
            : `Found ${countNoun(out.result.games.length, 'game')} for ${out.result.username}.`
        )
      } else {
        setState({ phase: 'failed', message: out.message })
        setAnnouncement(out.message)
      }
    } catch {
    }
  }

  function clear() {
    inFlight.current?.abort()
    setState({ phase: 'idle' })
    setFilters(NO_FILTERS)
    setAnnouncement('')
    input.current?.focus()
  }

  const filtersSet = filters.speed !== 'all' || filters.color !== 'all' || filters.family !== 'all'

  return (
    <section className={bare ? 'lookup lookup-bare' : 'lookup'} aria-labelledby="lookup-heading">
      {!bare && (
        <h2 id="lookup-heading" className="lookup-heading">
          Look up a player
        </h2>
      )}
      <form className="lookup-form" onSubmit={submit}>
        <div role="group" aria-label="Site" className="lookup-platforms">
          {(['chess_com', 'lichess'] as const).map((p) => (
            <button
              key={p}
              type="button"
              className="games-filter"
              aria-pressed={platform === p}
              onClick={() => setPlatform(p)}
            >
              {platformName(p)}
            </button>
          ))}
        </div>
        <input
          ref={input}
          type="text"
          aria-label="Username"
          placeholder="Username"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={50}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="lookup-input"
        />
        <button type="submit" className="editorial-action" aria-disabled={state.phase === 'loading' || undefined}>
          {state.phase === 'loading' ? 'Looking…' : 'Look up'}
        </button>
      </form>

      {state.phase === 'idle' && <p className="lookup-note">Shows their bullet, blitz and rapid games from the last 3 months.</p>}
      {state.phase === 'loading' && looking && (
        <p className="lookup-note lookup-status">
          Looking up {looking.username} on {platformName(looking.platform)}…
        </p>
      )}

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {state.phase === 'failed' && <p className="lookup-error">{state.message}</p>}

      {result && (
        <div className="lookup-result">
          <div className="lookup-result-head">
            <h3 ref={resultHeading} tabIndex={-1} className="lookup-result-name focus-landing">
              {result.username}
              <span className="lookup-result-site"> · {platformName(result.platform)}</span>
            </h3>
            <button type="button" className="games-filter" onClick={clear}>
              Clear
            </button>
          </div>

          {result.games.length > 0 && (
            <>
              <p className="lookup-summary">{summaryLine(result.games, filtered)}</p>
              <div className="lookup-filters">
                {speeds.length > 1 && (
                  <FilterGroup<Speed | 'all'>
                    label="Filter by speed"
                    value={filters.speed}
                    onChange={(speed) => setFilter({ speed })}
                    options={[{ value: 'all', text: 'All speeds' }, ...speeds.map((sp) => ({ value: sp, text: SPEED_WORD[sp] }))]}
                  />
                )}
                <FilterGroup<'all' | 'white' | 'black'>
                  label="Filter by color"
                  value={filters.color}
                  onChange={(color) => setFilter({ color })}
                  options={[
                    { value: 'all', text: 'Both colors' },
                    { value: 'white', text: 'White' },
                    { value: 'black', text: 'Black' },
                  ]}
                />
                {families.length > 0 && (
                  <OptionPicker
                    label="Filter by opening"
                    value={filters.family}
                    emphasised={filters.family !== 'all'}
                    onChange={(family) => setFilter({ family })}
                    options={[
                      { value: 'all', label: 'All openings' },
                      ...families.map((f) => ({ value: f.family, label: f.family, detail: String(f.count) })),
                    ]}
                  />
                )}
                {filtersSet && (
                  <button type="button" className="games-filter" onClick={() => setFilter(NO_FILTERS)}>
                    Reset
                  </button>
                )}
              </div>
            </>
          )}

          <PlayerGamesList result={result} games={filtered} shown={shown} />
          {filtered.length > shown && (
            <button type="button" className="games-filter lookup-more" onClick={() => setShown(filtered.length)}>
              Show {filtered.length - shown} more
            </button>
          )}
        </div>
      )}
    </section>
  )
}
