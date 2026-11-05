'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import PlayBoard from './PlayBoard'
import PlayClock from './PlayClock'
import { uuid } from '@/lib/uuid'
import { takeFocusIfLost, useFocusWhenLost } from '@/components/training/focus'
import { outcomeSentence } from '@/lib/play/game'
import type { MoveAnswerBody } from '@/lib/play/move'
import type { PlaySetup } from '@/lib/play/setup'
import { TOO_MANY_REQUESTS_MESSAGE } from '@/lib/ratelimit-message'
import {
  checkFlag,
  clocksNow,
  engineClockMs,
  engineFailed,
  engineMove,
  initialState,
  resign,
  retryEngine,
  start,
  userMove,
  type PlayState,
} from '@/lib/play/session'
import '@/components/training/training.css'
import './play.css'

function useBoardSize(ref: React.RefObject<HTMLDivElement>): number {
  const [size, setSize] = useState(480)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      const side = w >= 700
      setSize(Math.min(w, Math.max(240, Math.min(560, Math.floor(side ? w - 320 : w)))))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

const colourWord = (c: 'white' | 'black') => (c === 'white' ? 'White' : 'Black')

function moveList(startPly: number, sans: string[]): { n: number; white: string | null; black: string | null }[] {
  const rows: { n: number; white: string | null; black: string | null }[] = []
  sans.forEach((san, i) => {
    const ply = startPly + i
    const n = Math.floor(ply / 2) + 1
    const isWhite = ply % 2 === 0
    let row = rows[rows.length - 1]
    if (!row || row.n !== n) {
      row = { n, white: null, black: null }
      rows.push(row)
    }
    if (isWhite) row.white = san
    else row.black = san
  })
  return rows
}

export default function PlayOut({ setup }: { setup: PlaySetup }) {
  const [s, setS] = useState<PlayState>(() => initialState(setup))
  const [now, setNow] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [announce, setAnnounce] = useState('')
  const [confirmResign, setConfirmResign] = useState(false)
  const [logged, setLogged] = useState<boolean | null>(null)
  const playId = useRef(uuid())
  const endSent = useRef(false)
  const started = useRef(false)
  const latest = useRef(s)
  latest.current = s
  const wrapRef = useRef<HTMLDivElement>(null)
  const size = useBoardSize(wrapRef)
  const outcomeRef = useFocusWhenLost<HTMLParagraphElement>(s.status === 'over' ? `${playId.current}:over` : null)

  const q = setup.devQuery ? `?${setup.devQuery}` : ''
  const moveUrl = setup.mode === 'live' ? '/api/play/move' : `/api/dev/play/move${q}`
  const endUrl = setup.mode === 'live' ? '/api/play/end' : `/api/dev/play/end${q}`

  const endPayload = useCallback(
    (st: PlayState, outcome: string) =>
      JSON.stringify({ play_id: playId.current, game_id: setup.gameId, start_ply: setup.startPly, moves: st.moves, outcome }),
    [setup.gameId, setup.startPly]
  )

  const running = s.status === 'user' || s.status === 'engine'
  useEffect(() => {
    if (!running || !s.clock) return
    let frame = 0
    const tick = () => {
      const t = performance.now()
      setNow(t)
      setS(prev => checkFlag(setup, prev, t))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [running, s.clock, setup])

  const asked = useRef<string | null>(null)
  useEffect(() => {
    if (s.status !== 'engine') return
    const key = `${playId.current}:${s.moves.length}:${s.turnSince}`
    if (asked.current === key) return
    asked.current = key
    const plies = s.moves.length
    const since = s.turnSince
    let timer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(moveUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            play_id: playId.current,
            game_id: setup.gameId,
            start_ply: setup.startPly,
            moves: s.moves,
            engine_clock_ms: engineClockMs(setup, s, performance.now()),
          }),
        })
        if (cancelled) return
        if (!res.ok) {
          setMessage(res.status === 429 ? TOO_MANY_REQUESTS_MESSAGE : "The engine didn't answer. Both clocks are stopped.")
          setS(prev => (prev.status === 'engine' && prev.moves.length === plies ? engineFailed(prev, performance.now()) : prev))
          return
        }
        const answer = (await res.json()) as MoveAnswerBody
        const wait = Math.max(0, since + answer.think_ms - performance.now())
        timer = setTimeout(() => {
          setS(prev => {
            if (prev.status !== 'engine' || prev.moves.length !== plies) return prev
            const next = engineMove(setup, prev, answer.move.uci, performance.now())
            if (next !== prev && next.status === 'user') setAnnounce(`They played ${answer.move.san}. Your move.`)
            return next
          })
        }, wait)
      } catch {
        if (cancelled) return
        setMessage("The engine didn't answer. Both clocks are stopped.")
        setS(prev => (prev.status === 'engine' && prev.moves.length === plies ? engineFailed(prev, performance.now()) : prev))
      }
    })()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      asked.current = null
    }
  }, [s.status, s.moves, s.turnSince, moveUrl, setup]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (s.status !== 'over' || !s.outcome || endSent.current) return
    endSent.current = true
    setAnnounce(outcomeSentence(s.outcome, setup.startStanding))
    fetch(endUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: endPayload(s, s.outcome), keepalive: true })
      .then(r => (r.ok ? r.json() : null))
      .then(b => setLogged(b ? b.logged === true : false))
      .catch(() => setLogged(false))
  }, [s, endUrl, endPayload, setup.startStanding])

  useEffect(() => {
    const leave = () => {
      if (!started.current || endSent.current) return
      endSent.current = true
      const body = endPayload(latest.current, 'abandoned')
      if (!navigator.sendBeacon?.(endUrl, new Blob([body], { type: 'application/json' }))) {
        fetch(endUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {})
      }
    }
    window.addEventListener('pagehide', leave)
    return () => {
      window.removeEventListener('pagehide', leave)
      leave()
    }
  }, [endUrl, endPayload])

  const onStart = () => {
    started.current = true
    const t = performance.now()
    setNow(t)
    setS(prev => {
      const next = start(setup, prev, t)
      setAnnounce(next.status === 'user' ? 'Your move.' : 'Their move.')
      return next
    })
    requestAnimationFrame(() => takeFocusIfLost(document.querySelector<HTMLElement>('[data-play-board]'), document.activeElement, document))
  }

  const onMove = (uci: string) => {
    setS(prev => {
      const next = userMove(setup, prev, uci, performance.now())
      if (next !== prev && next.status === 'engine') setAnnounce('Their move.')
      return next
    })
  }

  const onResign = () => {
    if (!confirmResign) {
      setConfirmResign(true)
      return
    }
    setConfirmResign(false)
    setS(prev => resign(prev, performance.now()))
  }
  useEffect(() => {
    if (!confirmResign) return
    const t = setTimeout(() => setConfirmResign(false), 4000)
    return () => clearTimeout(t)
  }, [confirmResign])

  const onRetry = () => {
    setMessage(null)
    setS(prev => retryEngine(setup, prev, performance.now()))
  }

  const onAgain = () => {
    playId.current = uuid()
    endSent.current = false
    started.current = false
    asked.current = null
    setLogged(null)
    setMessage(null)
    setConfirmResign(false)
    setS(initialState(setup))
  }

  const clocks = clocksNow(setup, s, now)
  const opponent = setup.userColor === 'white' ? 'black' : 'white'
  const moveNo = Math.floor(setup.startPly / 2) + 1
  const against = setup.opponentName ? ` against ${setup.opponentName}` : ''
  const rows = moveList(setup.startPly, s.sans)
  const statusLine =
    s.status === 'ready'
      ? 'The clocks start when you press Start.'
      : s.status === 'user'
        ? 'Your move.'
        : s.status === 'engine'
          ? 'Their move.'
          : s.status === 'engine_error'
            ? message
            : null

  return (
    <div className="play-root" ref={wrapRef}>
      <header className="training-header">
        <h1 className="training-title">Play it out</h1>
        <p className="training-stakes">
          From move {moveNo} of your game{against}, as {colourWord(setup.userColor)}.
        </p>
      </header>

      <div className="training-grid">
        <div className="play-board-col" style={{ width: size }}>
          <div className="play-player">
            <span className="play-name">
              {setup.opponentName ?? 'Opponent'}
              {setup.opponentElo !== null && <span className="play-elo"> {setup.opponentElo}</span>}
            </span>
            {clocks && <PlayClock ms={clocks.opponent} running={s.clock?.running === opponent} label="Their clock" />}
          </div>
          <PlayBoard
            fen={s.fen}
            orientation={setup.userColor}
            lastMove={s.lastMove}
            canMove={s.status === 'user'}
            size={size}
            onMove={onMove}
            onAnnounce={setAnnounce}
          />
          <div className="play-player">
            <span className="play-name">
              You
              {setup.userElo !== null && <span className="play-elo"> {setup.userElo}</span>}
            </span>
            {clocks && <PlayClock ms={clocks.user} running={s.clock?.running === setup.userColor} label="Your clock" />}
          </div>
        </div>

        <div className="training-panel">
          {s.status === 'over' && s.outcome ? (
            <>
              <p ref={outcomeRef} tabIndex={-1} className="training-verdict play-outcome focus-landing" data-testid="play-outcome">
                {outcomeSentence(s.outcome, setup.startStanding)}
              </p>
              <div className="training-actions">
                <a className="training-btn training-btn-primary" href={setup.gameHref}>
                  See the full game
                </a>
                <button className="training-btn training-btn-quiet" onClick={onAgain}>
                  Play it again
                </button>
                {setup.backHref && (
                  <a className="training-btn training-btn-quiet" href={setup.backHref}>
                    Back to training
                  </a>
                )}
              </div>
              {setup.mode === 'fixture' && logged !== null && (
                <p className="play-dev">dev harness: the end route checked the game; nothing was saved</p>
              )}
            </>
          ) : (
            <>
              {statusLine && (
                <p className="training-hint play-status" data-testid="play-status">
                  {statusLine}
                </p>
              )}
              <div className="training-actions">
                {s.status === 'ready' && (
                  <button className="training-btn training-btn-primary" onClick={onStart}>
                    Start
                  </button>
                )}
                {s.status === 'engine_error' && (
                  <button className="training-btn training-btn-primary" onClick={onRetry}>
                    Try again
                  </button>
                )}
                {(s.status === 'user' || s.status === 'engine' || s.status === 'engine_error') && (
                  <button className="training-btn training-btn-quiet" onClick={onResign}>
                    {confirmResign ? 'Tap again to resign' : 'Resign'}
                  </button>
                )}
              </div>
            </>
          )}

          <p className="play-engine" data-testid="play-engine">
            {setup.engineLabel}
          </p>
          {setup.notes.map(n => (
            <p key={n} className="play-note">
              {n}
            </p>
          ))}

          {rows.length > 0 && (
            <ol className="play-moves" aria-label="Moves played">
              {rows.map(r => (
                <li key={r.n}>
                  <span className="play-move-n">{r.n}.</span>
                  <span className="play-move-san">{r.white ?? '…'}</span>
                  <span className="play-move-san">{r.black ?? ''}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <p className="sr-only" aria-live="polite" data-testid="play-announcement">
        {announce}
      </p>
    </div>
  )
}
