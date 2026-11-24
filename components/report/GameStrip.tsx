'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { VERDICT_FONT_SIZE } from '@/components/report/column'
import { countNoun } from '@/lib/count-noun'
import {
  STRIP_SEEN_KEY,
  headlineCount,
  inPlayOrder,
  parseSeen,
  stageLayout,
  stripBootScript,
  stripRows,
  stripTimings,
  withSeen,
  type Spot,
  type StripGame,
  type StripRowKey,
} from '@/lib/report/game-strip'
import './game-strip.css'

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

interface GameStripProps {
  reportId: string
  verdict: string | null
  games: StripGame[]
  headlineIds: string[]
  reviewLinks: boolean
  restTarget: string
  children?: ReactNode
}

type Phase = 'reading' | 'sorting' | 'rest' | 'settling'

interface Settle {
  marks: Map<string, Spot & { sx: number; sy: number }>
  labels: Map<StripRowKey, Spot>
  height: number
}

const RESULT_LETTER: Record<string, string> = { loss: 'L', draw: 'D', win: 'W' }
const RESULT_WORD: Record<string, string> = { loss: 'loss', draw: 'draw', win: 'win' }

function dayLabel(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Undated'
}

function markSeen(id: string) {
  try { localStorage.setItem(STRIP_SEEN_KEY, JSON.stringify(withSeen(parseSeen(localStorage.getItem(STRIP_SEEN_KEY)), id))) } catch {  }
}

function markTitle(g: StripGame): string {
  return `${dayLabel(g.playedAt)} · ${g.opponent || 'Unknown opponent'} · ${g.result ? RESULT_WORD[g.result] : 'result unknown'}`
}

export default function GameStrip({ reportId, verdict, games, headlineIds, reviewLinks, restTarget, children }: GameStripProps) {
  const ordered = useMemo(() => inPlayOrder(games), [games])
  const headline = useMemo(() => new Set(headlineIds), [headlineIds])
  const rows = useMemo(() => stripRows(ordered, headline), [ordered, headline])
  const byId = useMemo(() => new Map(ordered.map((g) => [g.id, g])), [ordered])
  const hitOrder = useMemo(() => rows.filter((r) => r.key !== 'rest').flatMap((r) => r.gameIds), [rows])
  const restOrder = useMemo(() => rows.find((r) => r.key === 'rest')?.gameIds ?? [], [rows])
  const marked = hitOrder.length
  const parts = verdict ? headlineCount(verdict, marked) : null

  const rootRef = useRef<HTMLElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const staticRef = useRef<HTMLDivElement>(null)
  const run = useRef(0)

  const [animating, setAnimating] = useState(false)
  const [phase, setPhase] = useState<Phase>('reading')
  const [read, setRead] = useState(0)
  const [sorted, setSorted] = useState(0)
  const [restMoved, setRestMoved] = useState(0)
  const [width, setWidth] = useState(0)
  const [settle, setSettle] = useState<Settle | null>(null)
  const [fade, setFade] = useState(false)
  const [canReplay, setCanReplay] = useState(false)

  const layout = useMemo(() => (width > 0 ? stageLayout(width, ordered.map((g) => g.id), rows) : null), [width, ordered, rows])

  const measureSettle = useCallback((): Settle | null => {
    const frame = frameRef.current, still = staticRef.current
    if (!frame || !still || !layout) return null
    const f = frame.getBoundingClientRect()
    const marks = new Map<string, Spot & { sx: number; sy: number }>()
    still.querySelectorAll<HTMLElement>('[data-mark]').forEach((el) => {
      const r = el.getBoundingClientRect()
      marks.set(el.dataset.mark!, { x: r.left - f.left, y: r.top - f.top, sx: r.width / layout.cell, sy: r.height / layout.cell })
    })
    const labels = new Map<StripRowKey, Spot>()
    still.querySelectorAll<HTMLElement>('[data-row-label]').forEach((el) => {
      const r = el.getBoundingClientRect()
      labels.set(el.dataset.rowLabel as StripRowKey, { x: r.left - f.left, y: r.top - f.top })
    })
    return { marks, labels, height: still.getBoundingClientRect().height }
  }, [layout])

  const play = useCallback(async () => {
    const token = ++run.current
    const alive = () => token === run.current
    const wait = (ms: number) => new Promise<void>((done) => window.setTimeout(done, ms))
    const t = stripTimings(ordered.length, marked)
    setSettle(null)
    setPhase('reading'); setRead(0); setSorted(0); setRestMoved(0)
    setAnimating(true); setCanReplay(false)
    await wait(t.start); if (!alive()) return
    for (let i = 1; i <= ordered.length; i++) { setRead(i); await wait(t.read); if (!alive()) return }
    await wait(t.afterRead); if (!alive()) return
    setPhase('sorting')
    let k = 0
    for (const row of rows.filter((r) => r.key !== 'rest')) {
      for (let i = 0; i < row.gameIds.length; i++) { setSorted(++k); await wait(t.sort); if (!alive()) return }
      await wait(t.afterRow); if (!alive()) return
    }
    await wait(t.afterSort); if (!alive()) return
    setPhase('rest')
    for (let i = 1; i <= restOrder.length; i++) { setRestMoved(i); await wait(t.rest); if (!alive()) return }
    await wait(t.beforeSettle); if (!alive()) return
    setPhase('settling')
    await wait(t.settle + 60); if (!alive()) return
    setAnimating(false); setCanReplay(true)
    markSeen(reportId)
  }, [ordered.length, marked, rows, restOrder.length, reportId])

  useIsoLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    setWidth(frame.getBoundingClientRect().width)
    const ro = new ResizeObserver((entries) => setWidth(entries[0]!.contentRect.width))
    ro.observe(frame)
    return () => ro.disconnect()
  }, [])

  useIsoLayoutEffect(() => {
    if (animating && phase === 'settling' && !settle) setSettle(measureSettle())
  }, [animating, phase, settle, measureSettle])

  useIsoLayoutEffect(() => {
    const root = rootRef.current
    if (!root || ordered.length === 0) { root?.removeAttribute('data-anim'); return }
    let seen: string[] = []
    try { seen = parseSeen(localStorage.getItem(STRIP_SEEN_KEY)) } catch {  }
    const first = !seen.includes(reportId)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (first && !reduced) void play()
    else {
      if (first) { setFade(true); markSeen(reportId) }
      setCanReplay(!reduced)
    }
    root.removeAttribute('data-anim')
    return () => { run.current++ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId])

  const readHits = useMemo(() => ordered.slice(0, read).filter((g) => headline.has(g.id)).length, [ordered, read, headline])
  const movedHit = useMemo(() => new Set(hitOrder.slice(0, phase === 'reading' ? 0 : sorted)), [hitOrder, sorted, phase])
  const movedRest = useMemo(() => new Set(phase === 'rest' || phase === 'settling' ? restOrder.slice(0, restMoved) : []), [restOrder, restMoved, phase])

  const headlineNode = verdict && (
    <h1 className="font-headline gs-headline" style={{ fontSize: VERDICT_FONT_SIZE }}>
      {animating && parts && phase === 'reading'
        ? <>{parts.before}<span className="gs-count">{readHits}</span>{parts.after}</>
        : verdict}
    </h1>
  )

  const settling = animating && phase === 'settling' && settle

  return (
    <section
      ref={rootRef}
      className="gs"
      data-strip-id={reportId}
      aria-label="Headline"
      suppressHydrationWarning
    >
      {headlineNode}
      {children}
      {ordered.length > 0 && (
        <div ref={frameRef} className="gs-frame">
          {animating && layout && (
            <div className="gs-stage" aria-hidden style={{ height: settling ? settle.height : layout.height }}>
              {rows.map((row) => {
                const started = row.key === 'rest'
                  ? movedRest.size > 0
                  : row.gameIds.some((id) => movedHit.has(id))
                const count = row.gameIds.filter((id) => movedHit.has(id) || movedRest.has(id)).length
                const at = settling ? settle.labels.get(row.key) : layout.labels.get(row.key)
                if (!at) return null
                return (
                  <div
                    key={row.key}
                    className={`gs-stage-label${row.key === 'rest' ? ' gs-rest' : ''}`}
                    style={{ transform: `translate(${at.x}px, ${at.y}px)`, opacity: started && !settling ? 1 : 0 }}
                  >
                    <b>{count}</b> {row.label}
                  </div>
                )
              })}
              {ordered.map((g, i) => {
                const hit = headline.has(g.id)
                const onRow = movedHit.has(g.id) || movedRest.has(g.id)
                const s = settling ? settle.marks.get(g.id) : null
                const spot = s ?? (onRow ? layout.shelf.get(g.id) : layout.grid[i])
                if (!spot) return null
                const shown = phase !== 'reading' || i < read
                const dim = !hit && !onRow && phase !== 'reading'
                const transform = `translate(${spot.x}px, ${spot.y}px)` + (s ? ` scale(${s.sx}, ${s.sy})` : shown ? '' : ' scale(0.5)')
                return (
                  <span
                    key={g.id}
                    className={`gs-sq${hit && shown ? ' gs-hit' : ''}${onRow && !hit ? ' gs-muted' : ''}`}
                    style={{ width: layout.cell, height: layout.cell, transform, opacity: shown ? (dim ? 0.3 : 1) : 0 }}
                  >
                    {onRow && !settling && g.result && <i>{RESULT_LETTER[g.result]}</i>}
                  </span>
                )
              })}
            </div>
          )}
          <div
            ref={staticRef}
            className={`gs-static${animating ? ' gs-under' : ''}${fade ? ' gs-fade' : ''}`}
            role="group"
            aria-label={`Your ${countNoun(ordered.length, 'game')}, by result`}
          >
            {rows.map((row) => (
              <div key={row.key} className={`gs-row${row.key === 'rest' ? ' gs-rest' : ''}`}>
                <a className="gs-label" data-row-label={row.key} href={row.key === 'rest' ? `#${restTarget}` : '#diagnosis-finding'}>
                  <b>{row.gameIds.length}</b> {row.label}
                </a>
                <div className="gs-marks">
                  {row.gameIds.map((id) => {
                    const g = byId.get(id)!
                    const cls = `gs-mark${row.key === 'rest' ? '' : ' gs-hit'}`
                    return reviewLinks ? (
                      <a key={id} data-mark={id} className={cls} href={`/games/${id}/review`} title={markTitle(g)} tabIndex={-1} aria-hidden />
                    ) : (
                      <span key={id} data-mark={id} className={cls} title={markTitle(g)} aria-hidden />
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          {canReplay && !animating && (
            <button type="button" className="gs-replay" onClick={() => void play()}>
              Replay
            </button>
          )}
        </div>
      )}
      {ordered.length > 0 && <script dangerouslySetInnerHTML={{ __html: stripBootScript() }} />}
    </section>
  )
}
