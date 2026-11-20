'use client'

import { useEffect, useRef, useState } from 'react'
import { countNoun } from '@/lib/count-noun'
import { formatTimeControl } from '@/lib/review/time-control'
import {
  LOOKUP_FIRST_ROWS,
  lookupMessage,
  noGamesLine,
  platformName,
  type LookedUpGame,
  type LookupPlatform,
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

export function PlayerGamesList({ result, shown }: { result: LookupResult; shown: number }) {
  const site = platformName(result.platform)
  if (result.games.length === 0) {
    return <p className="lookup-note">{noGamesLine(result.username)}</p>
  }
  return (
    <div className="lookup-list">
      {result.games.slice(0, shown).map((g) => (
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

export default function PlayerLookup({ bare = false }: { bare?: boolean }) {
  const [platform, setPlatform] = useState<LookupPlatform>('chess_com')
  const [username, setUsername] = useState('')
  const [state, setState] = useState<State>({ phase: 'idle' })
  const [shown, setShown] = useState(LOOKUP_FIRST_ROWS)
  const [announcement, setAnnouncement] = useState('')
  const inFlight = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => () => inFlight.current?.abort(), [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const name = username.trim()
    if (!name || state.phase === 'loading') return
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    setState({ phase: 'loading' })
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
            : `${countNoun(out.result.games.length, 'game')} found for ${out.result.username}.`
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
    setAnnouncement('')
    input.current?.focus()
  }

  const result = state.phase === 'done' ? state.result : null

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
      <p className="lookup-note">Their last 3 months of rapid and blitz games. Nothing is saved to your account.</p>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {state.phase === 'failed' && <p className="lookup-error">{state.message}</p>}

      {result && (
        <div className="lookup-result">
          <div className="lookup-result-head">
            <h3 className="lookup-result-name">
              {result.username}
              <span className="lookup-result-site"> · {platformName(result.platform)}</span>
            </h3>
            <button type="button" className="games-filter" onClick={clear}>
              Clear
            </button>
          </div>
          <PlayerGamesList result={result} shown={shown} />
          {result.games.length > shown && (
            <button type="button" className="games-filter lookup-more" onClick={() => setShown(result.games.length)}>
              Show {result.games.length - shown} more
            </button>
          )}
        </div>
      )}
    </section>
  )
}
