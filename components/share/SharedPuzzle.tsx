'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { X } from 'lucide-react'
import TrainingBoard, { type DrawnArrow } from '@/components/training/TrainingBoard'
import ChessBoard, { type BoardShape } from '@/components/workbench/ChessBoard'
import { useFocusWhenLost } from '@/components/training/focus'
import { arrowUci } from '@/lib/training/keyboard-board'
import { keyBelongsToControl } from '@/lib/training/shortcut'
import { squaresNamed, withLitSquares } from '@/lib/board/squares'
import { failureMessage } from '@/lib/ratelimit-message'
import type { PublicShare } from '@/lib/share/payload'
import { shareCommitUrl, shareViewUrl, type ShareAnswer, type ShareMode } from '@/lib/share/api-types'
import {
  SHARE_ARROW_KEY,
  SHARE_CTA_HREF,
  SHARE_CTA_TEXT,
  shareLine,
  sideToMoveText,
} from '@/lib/share/words'
import { GRADING_TOLERANCE_CP } from '@/lib/training/grading'
import '@/components/training/training.css'

type Phase =
  | { name: 'board' }
  | { name: 'committing' }
  | { name: 'reveal'; answer: ShareAnswer }
  | { name: 'error'; message: string }

const BRUSH = {
  held: 'held',
  also_held: 'alsoHeld',
  mistake: 'mistake',
  yours: 'unchecked',
  unchecked: 'unchecked',
} as const

const NOT_LOADED = "The answer didn't load. Try again."
const GONE = 'This link no longer works.'

function useBoardSize(ref: React.RefObject<HTMLDivElement>): number {
  const [size, setSize] = useState(480)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      const side = w >= 700
      setSize(Math.min(w, Math.max(260, Math.min(560, Math.floor(side ? w - 300 : w - 24)))))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

function sanOf(fen: string, a: { from: string; to: string; promotion?: string }): string {
  try {
    return new Chess(fen).move({ from: a.from, to: a.to, promotion: a.promotion ?? 'q' })?.san ?? `${a.from}${a.to}`
  } catch {
    return `${a.from}${a.to}`
  }
}

function sanOfUci(fen: string, uci: string | null): string | null {
  return uci ? sanOf(fen, { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }) : null
}

export default function SharedPuzzle({ share, mode }: { share: PublicShare; mode: ShareMode }) {
  const [phase, setPhase] = useState<Phase>({ name: 'board' })
  const [arrows, setArrows] = useState<DrawnArrow[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [boardMessage, setBoardMessage] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const size = useBoardSize(wrapRef)
  const played = { from: share.game_move_uci.slice(0, 2), to: share.game_move_uci.slice(2, 4) }
  const fixed = useRef([played]).current

  const beaconSent = useRef(false)
  useEffect(() => {
    if (mode !== 'live' || beaconSent.current) return
    beaconSent.current = true
    fetch(shareViewUrl(share.slug), { method: 'POST', keepalive: true, cache: 'no-store' }).catch(() => {})
  }, [mode, share.slug])

  const commit = useCallback(
    async (chosen: string | null) => {
      if (phase.name !== 'board') return
      setBoardMessage(null)
      setPhase({ name: 'committing' })
      try {
        const res = await fetch(shareCommitUrl(mode, share.slug), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({ chosen_move: chosen }),
        })
        if (res.status === 404) return setPhase({ name: 'error', message: GONE })
        if (!res.ok) return setPhase({ name: 'error', message: failureMessage(res.status, NOT_LOADED) })
        setPhase({ name: 'reveal', answer: (await res.json()) as ShareAnswer })
      } catch {
        setPhase({ name: 'error', message: NOT_LOADED })
      }
    },
    [phase.name, mode, share.slug]
  )

  useEffect(() => {
    if (phase.name !== 'board') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat || keyBelongsToControl(e.target)) return
      if (selected !== null && arrows[selected]) {
        e.preventDefault()
        commit(arrowUci(arrows[selected]))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase.name, selected, arrows, commit])

  const onDraw = (a: DrawnArrow) => {
    const existing = arrows.findIndex(p => p.from === a.from && p.to === a.to)
    if (existing >= 0) return setSelected(existing)
    setArrows([...arrows, a])
    setSelected(arrows.length)
  }

  const removeArrow = (i: number) => {
    setArrows(prev => prev.filter((_, j) => j !== i))
    setSelected(sel => (sel === null || sel === i ? null : sel > i ? sel - 1 : sel))
  }

  const answering = phase.name === 'board' || phase.name === 'committing'
  const answer = phase.name === 'reveal' ? phase.answer : null
  const verdictRef = useFocusWhenLost<HTMLParagraphElement>(answer ? share.slug : null)

  const announcement = answering
    ? boardMessage ?? `${sideToMoveText(share.side_to_move)}.`
    : answer
      ? `${answer.verdict} ${answer.sentence}`
      : phase.name === 'error'
        ? phase.message
        : ''

  return (
    <div ref={wrapRef} className="training-root" data-testid="shared-puzzle">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <header className="training-header">
        <h1 className="training-title">{sideToMoveText(share.side_to_move)}</h1>
      </header>

      {answering && (
        <div className="training-grid">
          <TrainingBoard
            fen={share.fen}
            orientation={share.side_to_move}
            arrows={arrows}
            selected={selected}
            onDraw={onDraw}
            onSelectArrow={setSelected}
            size={size}
            onAnnounce={setBoardMessage}
            fixedArrows={fixed}
          />
          <div className="training-panel">
            <p className="training-sentence" data-testid="share-line">
              {shareLine(share.game_move_san)}
            </p>
            {arrows.length === 0 ? (
              <p className="training-hint">Drag a piece to draw your move. It snaps back, so you can try a few. Pick one, then press Commit.</p>
            ) : (
              <ul className="training-candidates" aria-label="Candidate moves">
                {arrows.map((a, i) => (
                  <li key={`${a.from}${a.to}`} className={i === selected ? 'is-chosen' : undefined}>
                    <button className="training-candidate" onClick={() => setSelected(i)} aria-pressed={i === selected}>
                      {sanOf(share.fen, a)}
                    </button>
                    <button className="training-remove" onClick={() => removeArrow(i)} aria-label={`Remove ${sanOf(share.fen, a)}`}>
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="training-actions">
              <button
                className="training-btn training-btn-primary"
                disabled={selected === null || phase.name === 'committing'}
                onClick={() => selected !== null && commit(arrowUci(arrows[selected]))}
              >
                {phase.name === 'committing' ? 'Committing' : 'Commit'}
              </button>
              <button className="training-btn training-btn-quiet" disabled={phase.name === 'committing'} onClick={() => commit(null)}>
                Just show me
              </button>
            </div>
          </div>
        </div>
      )}

      {answer && <ShareReveal share={share} answer={answer} size={size} verdictRef={verdictRef} />}

      {phase.name === 'error' && (
        <div className="training-done">
          <p className="training-open-loop">{phase.message}</p>
          <div className="training-actions">
            {phase.message === GONE ? (
              <a className="training-btn training-btn-primary" href={SHARE_CTA_HREF}>
                {SHARE_CTA_TEXT}
              </a>
            ) : (
              <button className="training-btn training-btn-primary" onClick={() => setPhase({ name: 'board' })}>
                Try again
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ShareReveal({
  share,
  answer,
  size,
  verdictRef,
}: {
  share: PublicShare
  answer: ShareAnswer
  size: number
  verdictRef: React.RefObject<HTMLParagraphElement>
}) {
  const arrowShapes: BoardShape[] = answer.arrows.map(a => ({ orig: a.from, dest: a.to, brush: BRUSH[a.role], hilite: true }))
  const shapes = withLitSquares(arrowShapes, squaresNamed(answer.sentence))
  const chosenSan = sanOfUci(share.fen, answer.chosen_move)
  const sanFor = (role: keyof typeof BRUSH) =>
    role === 'held' ? answer.best_move_san ?? sanOfUci(share.fen, answer.best_move) : role === 'mistake' ? share.game_move_san : chosenSan
  const g = answer.grading

  return (
    <div className="training-grid">
      <ChessBoard fen={share.fen} orientation={share.side_to_move} shapes={shapes} size={size} />
      <div className="training-panel">
        <p
          ref={verdictRef}
          tabIndex={-1}
          className={`training-verdict training-verdict-${answer.kind} focus-landing`}
          data-testid="share-verdict"
        >
          {answer.verdict}
        </p>
        <ul className="training-key" aria-label="What the arrows mean">
          {answer.arrows.map(a => (
            <li key={a.role}>
              <span className={`training-swatch training-swatch-${a.role}`} aria-hidden />
              <span className="training-key-label">{SHARE_ARROW_KEY[a.role]}</span>
              <span className="training-key-move">{sanFor(a.role)}</span>
            </li>
          ))}
        </ul>
        <div className="training-lines">
          <p className="training-sentence" data-testid="share-sentence">
            {answer.sentence}
          </p>
        </div>
        <div className="training-actions">
          <a className="training-btn training-btn-primary" href={SHARE_CTA_HREF} data-testid="share-cta">
            {SHARE_CTA_TEXT}
          </a>
        </div>
        {(g.method === 'engine' || g.method === 'unavailable') && (
          <details className="training-receipt">
            <summary>Receipt</summary>
            <dl>
              {g.method === 'engine' ? (
                <>
                  <dt>Checked by</dt>
                  <dd>
                    {g.engine}
                    {g.depth ? `, depth ${g.depth}` : ''}; a move holds within {GRADING_TOLERANCE_CP} cp of the best move
                  </dd>
                </>
              ) : (
                <>
                  <dt>Your move, checked</dt>
                  <dd>not checked: the engine gave no usable answer</dd>
                </>
              )}
            </dl>
          </details>
        )}
      </div>
    </div>
  )
}
