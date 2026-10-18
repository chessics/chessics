'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { X } from 'lucide-react'
import TrainingBoard, { type DrawnArrow } from './TrainingBoard'
import LosingBranch from './LosingBranch'
import Reveal from './Reveal'
import TrainingIntro, { IntroSteps } from './TrainingIntro'
import SessionEnd from './SessionEnd'
import type { SessionSummary } from '@/lib/training/summary'
import type { PublicPosition } from '@/lib/training/position-payload'
import {
  commitUrl,
  nextUrl,
  type CommitResponse,
  type NextResponse,
  type TrainingMode,
} from '@/lib/training/api-types'
import { nextButtonLabel, planReveal, type RevealKind } from '@/lib/training/reveal'
import type { Goal } from '@/lib/training/reason'
import { announcement } from '@/lib/training/announce'
import ReasonChips from './ReasonChips'
import { useFocusWhenLost } from './focus'
import {
  loadSession as loadStoredSession,
  markAnswered,
  newSession as newStoredSession,
  type SessionStore,
  type StoredSession,
} from '@/lib/training/session-store'
import './training.css'
import { failureMessage } from '@/lib/ratelimit-message'

type Phase =
  | { name: 'loading' }
  | { name: 'board'; position: PublicPosition }
  | { name: 'committing'; position: PublicPosition }
  | { name: 'intro' }
  | { name: 'punish'; position: PublicPosition; commit: CommitResponse; chosen: string | null; kind: RevealKind; watched: boolean }
  | { name: 'reveal'; position: PublicPosition; commit: CommitResponse; chosen: string | null; kind: RevealKind; watched: boolean }
  | { name: 'threat'; position: PublicPosition; commit: CommitResponse; chosen: string | null; kind: RevealKind; watched: boolean }
  | { name: 'done'; openLoop: string; summary?: SessionSummary }
  | { name: 'signin' }
  | { name: 'error'; message: string }

const INTRO_KEY = 'chessics_train_intro_seen'
const COMMIT_NOT_RECORDED = 'The commit was not recorded, so the answer stays hidden.'

function introSeen(): boolean {
  try {
    return localStorage.getItem(INTRO_KEY) === '1'
  } catch {
    return false
  }
}

function markIntroSeen() {
  try {
    localStorage.setItem(INTRO_KEY, '1')
  } catch {
  }
}

function sessionStore(): SessionStore | null {
  try {
    return sessionStorage
  } catch {
    return null
  }
}

const loadSession = () => loadStoredSession(sessionStore(), Date.now(), () => crypto.randomUUID())
const newSession = () => newStoredSession(sessionStore(), Date.now(), () => crypto.randomUUID())

type NextFetch = { kind: 'ok'; body: NextResponse } | { kind: 'signin' } | { kind: 'error' }

async function fetchNext(mode: TrainingMode, s: StoredSession): Promise<NextFetch> {
  try {
    const res = await fetch(nextUrl(mode, s.id, s.startedAt), { cache: 'no-store' })
    if (res.status === 401) return { kind: 'signin' }
    if (!res.ok) return { kind: 'error' }
    return { kind: 'ok', body: (await res.json()) as NextResponse }
  } catch {
    return { kind: 'error' }
  }
}

function arrowUci(a: DrawnArrow): string {
  return `${a.from}${a.to}${a.promotion ?? ''}`
}

function arrowSan(fen: string, a: DrawnArrow): string {
  try {
    return new Chess(fen).move({ from: a.from, to: a.to, promotion: a.promotion ?? 'q' })?.san ?? arrowUci(a)
  } catch {
    return arrowUci(a)
  }
}

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

export default function TrainingSession({ mode }: { mode: TrainingMode }) {
  const [session, setSession] = useState<StoredSession | null>(null)
  const [phase, setPhase] = useState<Phase>({ name: 'loading' })
  const [arrows, setArrows] = useState<DrawnArrow[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [goal, setGoal] = useState<Goal | null>(null)
  const [upcoming, setUpcoming] = useState<NextResponse | null>(null)
  const answered = useRef(false)
  const [showStakes, setShowStakes] = useState(true)
  const [showHelp, setShowHelp] = useState(false)
  const startedAt = useRef(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const size = useBoardSize(wrapRef)

  const begin = (s: StoredSession) => {
    answered.current = s.answered
    setSession(s)
  }

  useEffect(() => {
    if (introSeen()) begin(loadSession())
    else setPhase({ name: 'intro' })
  }, [])

  const startFromIntro = () => {
    markIntroSeen()
    begin(loadSession())
  }

  const show = useCallback((body: NextResponse) => {
    setArrows([])
    setSelected(null)
    setGoal(null)
    if ('done' in body) return setPhase({ name: 'done', openLoop: body.open_loop, summary: body.summary })
    startedAt.current = performance.now()
    setShowStakes(!answered.current)
    setPhase({ name: 'board', position: body.position })
  }, [])

  const loadNext = useCallback(async (s: StoredSession) => {
    setPhase({ name: 'loading' })
    setArrows([])
    setSelected(null)
    setUpcoming(null)
    const r = await fetchNext(mode, s)
    if (r.kind === 'signin') return setPhase({ name: 'signin' })
    if (r.kind === 'error') return setPhase({ name: 'error', message: 'The next position did not load.' })
    show(r.body)
  }, [mode, show])

  useEffect(() => {
    if (session) loadNext(session)
  }, [session, loadNext])

  const commit = useCallback(
    async (chosen: string | null) => {
      if (phase.name !== 'board' || !session) return
      const position = phase.position
      const timeToCommit = Math.round(performance.now() - startedAt.current)
      setPhase({ name: 'committing', position })
      try {
        const res = await fetch(commitUrl(mode, position.position_id), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({
            session_id: session.id,
            chosen_move: chosen,
            drawn_moves: arrows.map(a => ({ from: a.from, to: a.to })),
            time_to_commit_ms: timeToCommit,
            ...(position.ask_reason ? { declared_goal: goal } : {}),
          }),
        })
        if (res.status === 401) return setPhase({ name: 'signin' })
        if (!res.ok) return setPhase({ name: 'error', message: failureMessage(res.status, COMMIT_NOT_RECORDED) })
        const result = (await res.json()) as CommitResponse
        answered.current = true
        markAnswered(sessionStore(), session)
        const after = await fetchNext(mode, session)
        setUpcoming(after.kind === 'ok' ? after.body : null)
        const kind = planReveal(chosen, result)
        const canPlay = kind === 'punish' && result.refutation_line.length > 0 && result.eval_cp !== null
        const shown = { position, commit: result, chosen, kind, watched: false }
        setPhase(canPlay ? { name: 'punish', ...shown } : { name: 'reveal', ...shown })
      } catch {
        setPhase({ name: 'error', message: COMMIT_NOT_RECORDED })
      }
    },
    [phase, session, mode, arrows, goal]
  )

  const needsReason = (phase.name === 'board' || phase.name === 'committing') && phase.position.ask_reason === true && goal === null

  useEffect(() => {
    if (phase.name !== 'board') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat || needsReason) return
      if (selected !== null && arrows[selected]) {
        e.preventDefault()
        commit(arrowUci(arrows[selected]))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase.name, selected, arrows, commit, needsReason])

  const onDraw = (a: DrawnArrow) => {
    const existing = arrows.findIndex(p => p.from === a.from && p.to === a.to)
    if (existing >= 0) {
      setSelected(existing)
      return
    }
    setArrows([...arrows, a])
    setSelected(arrows.length)
  }

  const removeArrow = (i: number) => {
    setArrows(prev => prev.filter((_, j) => j !== i))
    setSelected(sel => (sel === null || sel === i ? null : sel > i ? sel - 1 : sel))
  }

  const next = useCallback(() => {
    if (upcoming) {
      setUpcoming(null)
      show(upcoming)
    } else if (session) loadNext(session)
  }, [upcoming, session, show, loadNext])

  const restart = () => {
    setUpcoming(null)
    begin(newSession())
  }

  const orientation = (p: PublicPosition) => p.side_to_move
  const answering = phase.name === 'board' || phase.name === 'committing'
  const onPosition = answering || phase.name === 'punish' || phase.name === 'reveal' || phase.name === 'threat'
  const titleRef = useFocusWhenLost<HTMLHeadingElement>(phase.name === 'board' ? phase.position.position_id : null)

  return (
    <div ref={wrapRef} className="training-root">
      <p className="sr-only" aria-live="polite" data-testid="training-announcement">
        {announcement(phase)}
      </p>
      {onPosition && (
        <header className="training-header">
          <div className="training-header-row">
            <h1
              ref={titleRef}
              tabIndex={-1}
              className="training-title"
              style={{ visibility: answering ? 'visible' : 'hidden' }}
              aria-hidden={!answering}
            >
              Your move.
            </h1>
            <button className="training-btn training-btn-quiet" onClick={() => setShowHelp(v => !v)} aria-expanded={showHelp}>
              {showHelp ? 'Hide help' : 'How it works'}
            </button>
          </div>
          {showHelp && (
            <div className="training-help">
              <IntroSteps />
            </div>
          )}
          {showStakes && (
            <p className="training-stakes">
              Positions from your own games. In each one the engine had you ahead, and your next move started a slide.
            </p>
          )}
        </header>
      )}

      {answering && (
        <>
          <div className="training-grid">
            <TrainingBoard
              key={phase.position.position_id}
              fen={phase.position.fen}
              orientation={orientation(phase.position)}
              arrows={arrows}
              selected={selected}
              onDraw={onDraw}
              onSelectArrow={setSelected}
              size={size}
              locked={needsReason}
            />
            <div className="training-panel">
              {phase.position.ask_reason && (
                <ReasonChips
                  positionId={phase.position.position_id}
                  goal={goal}
                  disabled={phase.name === 'committing'}
                  onPick={setGoal}
                />
              )}
              {needsReason ? null : arrows.length === 0 ? (
                <div className="training-instructions">
                  <p className="training-instructions-main">Find the best move.</p>
                  <p className="training-hint">
                    Drag a piece to draw an arrow. It snaps back, so you can try a few. Pick one, then press Commit.
                  </p>
                </div>
              ) : (
                <ul className="training-candidates" aria-label="Candidate moves">
                  {arrows.map((a, i) => (
                    <li key={`${a.from}${a.to}`} className={i === selected ? 'is-chosen' : undefined}>
                      <button className="training-candidate" onClick={() => setSelected(i)} aria-pressed={i === selected}>
                        {arrowSan(phase.position.fen, a)}
                      </button>
                      <button className="training-remove" onClick={() => removeArrow(i)} aria-label={`Remove ${arrowSan(phase.position.fen, a)}`}>
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
        </>
      )}

      {phase.name === 'punish' && (
        <div className="training-grid">
          <LosingBranch
            fen={phase.position.fen}
            orientation={orientation(phase.position)}
            rootMoveUci={phase.commit.root_move_uci ?? phase.chosen ?? ''}
            line={phase.commit.refutation_line}
            evals={phase.commit.refutation_evals}
            startEvalCp={phase.commit.eval_cp ?? 0}
            size={size}
            context={phase.kind === 'punish' && !phase.watched ? 'same-move' : 'watch'}
            onDone={() => setPhase({ ...phase, name: 'reveal', watched: true })}
          />
        </div>
      )}

      {phase.name === 'reveal' && (
        <Reveal
          fen={phase.position.fen}
          orientation={orientation(phase.position)}
          kind={phase.kind}
          commit={phase.commit}
          chosenMove={phase.chosen}
          size={size}
          onNext={next}
          watched={phase.watched}
          nextLabel={nextButtonLabel(upcoming)}
          onWatch={() => setPhase({ ...phase, name: 'punish' })}
          onThreat={() => setPhase({ ...phase, name: 'threat' })}
        />
      )}

      {phase.name === 'threat' && phase.chosen && phase.commit.reason?.checks?.threat && (
        <div className="training-grid">
          <LosingBranch
            fen={phase.position.fen}
            orientation={orientation(phase.position)}
            rootMoveUci={phase.chosen}
            line={[phase.commit.reason.checks.threat.move]}
            evals={[phase.commit.reason.checks.threat.eval_after_cp]}
            startEvalCp={phase.commit.reason.checks.evals.before?.cp ?? phase.commit.eval_cp ?? 0}
            size={size}
            context="threat"
            onDone={() => setPhase({ ...phase, name: 'reveal' })}
          />
        </div>
      )}

      {phase.name === 'intro' && <TrainingIntro onStart={startFromIntro} />}

      {phase.name === 'loading' && <p className="training-hint training-loading">Setting up the board</p>}

      {phase.name === 'done' && <SessionEnd openLoop={phase.openLoop} summary={phase.summary} onAgain={restart} />}

      {phase.name === 'signin' && (
        <div className="training-done">
          <p className="training-open-loop">Training runs on your own games, so it needs an account.</p>
          <div className="training-actions">
            <a className="training-btn training-btn-primary" href="/login">Sign in</a>
          </div>
        </div>
      )}

      {phase.name === 'error' && (
        <div className="training-done">
          <p className="training-open-loop">{phase.message}</p>
          <div className="training-actions">
            <button className="training-btn training-btn-primary" onClick={next}>
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
