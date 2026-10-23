'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import ChessBoard from '@/components/workbench/ChessBoard'
import {
  FADED_OPACITY,
  evidenceTiming,
  initialPhase,
  type EvidenceBoard,
  type EvidencePhase,
  type Finding,
  type SourceRow,
} from '@/lib/diagnosis/finding'
import { scrollBehavior } from '@/lib/motion'
import './diagnosis.css'

export const NO_FINDING =
  'No habit appeared in 3 or more games of this batch — analyze more games to confirm or clear one.'

interface DiagnosisProps {
  findings: Finding[]
  reviewLinks: boolean
  sourcesNote?: string
  reducedMotion?: boolean
  initialTag?: string
}

export default function Diagnosis({ findings, reviewLinks, sourcesNote, reducedMotion, initialTag }: DiagnosisProps) {
  const [selected, setSelected] = useState(initialTag ?? findings[0]?.tag ?? null)
  const [doorOpen, setDoorOpen] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  const finding = findings.find((f) => f.tag === selected) ?? findings[0] ?? null
  if (!finding) {
    return (
      <section className="flex flex-col gap-1">
        <hr className="hairline" />
        <p className="text-sm py-3" style={{ color: 'var(--text-dim)' }}>
          {NO_FINDING}
        </p>
      </section>
    )
  }
  const others = findings.filter((f) => f.tag !== finding.tag)

  const show = (tag: string) => {
    setSelected(tag)
    setDoorOpen(false)
    sectionRef.current?.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : reducedMotion === false ? 'smooth' : scrollBehavior() })
  }

  return (
    <section
      ref={sectionRef}
      className="diagnosis-surface flex flex-col gap-5"
      aria-labelledby="diagnosis-finding"
      data-finding={finding.tag}
    >
      <hr className="hairline" />
      <div className="diagnosis-body">
        <div className="diagnosis-text flex flex-col gap-5">
          {finding.note && (
            <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
              {finding.note}
            </p>
          )}
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <h2 id="diagnosis-finding" className="font-headline" style={{ fontSize: 28, lineHeight: 1.2, color: 'var(--text)', fontWeight: 500 }}>
              {finding.label}
            </h2>
            <p className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>
              {finding.status}
            </p>
          </div>

          <p className="text-lg" style={{ color: 'var(--text)', lineHeight: 1.6 }} data-claim>
            {finding.claim.map((s, i) => (
              <span key={i}>
                {i > 0 && ' '}
                {s.door ? (
                  <button
                    type="button"
                    className="diagnosis-door"
                    aria-expanded={doorOpen}
                    aria-controls="diagnosis-sources"
                    onClick={() => setDoorOpen((o) => !o)}
                  >
                    {s.text}
                  </button>
                ) : (
                  s.text
                )}
              </span>
            ))}
          </p>

          {doorOpen && (
            <Sources id="diagnosis-sources" rule={finding.rule} rows={finding.sources} reviewLinks={reviewLinks} note={sourcesNote} />
          )}
        </div>

        <div className="diagnosis-proof flex flex-col gap-5">
          <EvidenceGrid key={finding.tag} boards={finding.boards} reducedMotion={reducedMotion} />
          {finding.shownNote && (
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
              {finding.shownNote}
            </p>
          )}
        </div>

        {others.length > 0 && (
          <div className="diagnosis-others flex flex-col pt-2">
            <p className="text-sm pb-2" style={{ color: 'var(--text-dim)' }}>
              Also in these games
            </p>
            {others.map((o) => (
              <button key={o.tag} type="button" className="diagnosis-other" onClick={() => show(o.tag)}>
                <span className="diagnosis-other-label text-sm" style={{ color: 'var(--text-muted)' }}>
                  {o.label}
                </span>
                <span className="diagnosis-other-status text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
                  {o.status}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const RESULT_WORD = { win: 'Won', loss: 'Lost', draw: 'Drew' } as const

function Sources({
  id,
  rule,
  rows,
  reviewLinks,
  note,
}: {
  id: string
  rule: string
  rows: SourceRow[]
  reviewLinks: boolean
  note?: string
}) {
  const anyCounted = rows.some((r) => r.counted)
  return (
    <div id={id} className="flex flex-col" data-sources>
      <p className="text-sm pb-2" style={{ color: 'var(--text-muted)' }}>
        {rule}
      </p>
      {rows.map((r) => {
        const cells = (
          <>
            <span className="text-xs font-mono" style={{ width: 96, color: 'var(--text-dim)' }}>
              {r.playedAt ? formatDate(r.playedAt) : 'Undated'}
            </span>
            <span className="text-sm flex-1 truncate" style={{ color: 'var(--text)', minWidth: 120 }}>
              {r.opponent ? `vs ${r.opponent}` : 'Unknown opponent'}
            </span>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              move {r.moveNumber}
            </span>
            <span className="text-sm" style={{ width: 40, color: 'var(--text-muted)' }}>
              {r.result ? RESULT_WORD[r.result] : '—'}
            </span>
            {anyCounted && (
              <span className="text-xs" style={{ width: 80, color: r.counted ? 'var(--brass)' : 'var(--text-dim)' }}>
                {r.counted ? 'counted' : 'not counted'}
              </span>
            )}
          </>
        )
        return reviewLinks ? (
          <Link key={r.key} href={`/games/${r.gameId}/review?chain=${r.rootPly}`} className="diagnosis-source">
            {cells}
          </Link>
        ) : (
          <div key={r.key} className="diagnosis-source">
            {cells}
          </div>
        )
      })}
      {note && (
        <p className="text-sm pt-2" style={{ color: 'var(--text-dim)' }}>
          {note}
        </p>
      )}
    </div>
  )
}

const MAX_BOARD_PX = 240
const GAP_PX = 10
const MIN_ROW_BOARD_PX = 150

export function boardLayout(width: number, boards: number): { cols: number; size: number } {
  const fit = (cols: number) => Math.floor((width - GAP_PX * (cols - 1)) / cols)
  const cols = boards <= 3 ? Math.max(boards, 1) : fit(boards) >= MIN_ROW_BOARD_PX ? boards : 3
  const size = Math.min(MAX_BOARD_PX, fit(cols))
  return { cols, size: Math.max(size, 0) }
}

export function EvidenceGrid({ boards, reducedMotion }: { boards: EvidenceBoard[]; reducedMotion?: boolean }) {
  const [phase, setPhase] = useState<EvidencePhase>(initialPhase(reducedMotion))
  const [reduced, setReduced] = useState<boolean | undefined>(reducedMotion)
  const [width, setWidth] = useState<number | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const readyCount = useRef(0)

  const start = useCallback(() => {
    if (reduced !== false || readyCount.current < boards.length) return
    requestAnimationFrame(() => setPhase((p) => (p === 'idle' ? 'run' : p)))
  }, [reduced, boards.length])

  useEffect(() => {
    if (reducedMotion !== undefined) return
    const matches = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setReduced(matches)
    if (matches) setPhase('final')
  }, [reducedMotion])

  useEffect(() => {
    start()
  }, [start])

  useEffect(() => {
    if (reduced !== false) return
    const t = window.setTimeout(() => setPhase((p) => (p === 'idle' ? 'run' : p)), 2500)
    return () => window.clearTimeout(t)
  }, [reduced])

  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver((entries) => setWidth(entries[0]!.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const timing = evidenceTiming(boards.length, reduced === true)
  const layout = width === null ? null : boardLayout(width, boards.length)
  const style = {
    '--faded': FADED_OPACITY,
    '--arrow-in': `${timing.arrowInMs}ms`,
    '--fade-delay': `${timing.fadeDelayMs}ms`,
    '--fade-ms': `${timing.fadeMs}ms`,
  } as CSSProperties

  return (
    <div ref={gridRef} className="diagnosis-evidence" data-phase={phase} data-boards={boards.length} style={style}>
      {layout &&
        boards.map((b, i) => (
          <div
            key={b.key}
            className="evidence-board"
            role="img"
            aria-label={b.label}
            style={{ '--arrow-delay': `${timing.arrowDelaysMs[i]}ms` } as CSSProperties}
          >
            <ChessBoard
              fen={b.fen}
              orientation={b.orientation}
              size={layout.size}
              coordinates={false}
              shapes={[{ orig: b.from, dest: b.to, brush: 'mistake' }]}
              onReady={() => {
                readyCount.current += 1
                start()
              }}
            />
          </div>
        ))}
    </div>
  )
}
