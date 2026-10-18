'use client'

import { useEffect } from 'react'
import { Chess } from 'chess.js'
import ChessBoard, { type BoardShape } from '@/components/workbench/ChessBoard'
import type { CommitResponse } from '@/lib/training/api-types'
import {
  ARROW_KEY,
  revealArrows,
  revealLines,
  revealVerdict,
  squaresNamed,
  type RevealKind,
} from '@/lib/training/reveal'
import { tagLabel } from '@/lib/training/session'

interface RevealProps {
  fen: string
  orientation: 'white' | 'black'
  kind: RevealKind
  commit: CommitResponse
  chosenMove: string | null
  size: number
  watched: boolean
  nextLabel: string
  onNext: () => void
  onWatch: () => void
}

const BRUSH = {
  held: 'held',
  also_held: 'alsoHeld',
  mistake: 'mistake',
  yours: 'unchecked',
  unchecked: 'unchecked',
} as const

function sanOf(fen: string, uci: string | null): string | null {
  if (!uci) return null
  try {
    const m = new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' })
    return m?.san ?? null
  } catch {
    return null
  }
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function Reveal({ fen, orientation, kind, commit, chosenMove, size, watched, nextLabel, onNext, onWatch }: RevealProps) {
  const chosenSan = sanOf(fen, chosenMove)
  const lines = revealLines(kind, commit, chosenSan)

  const arrows = revealArrows(kind, commit, chosenMove)
  const shapes: BoardShape[] = arrows.map(a => ({ orig: a.from, dest: a.to, brush: BRUSH[a.role], hilite: true }))

  const arrowheads = new Set(arrows.map(a => a.to))
  for (const sq of squaresNamed(lines.join(' '))) {
    if (!arrowheads.has(sq)) shapes.push({ orig: sq, brush: 'yellow' })
  }

  const hasLine = commit.refutation_line.length > 0 && commit.root_move_uci !== null
  const watchFirst = hasLine && !watched && kind !== 'correct'

  useEffect(() => {
    const mountedAt = performance.now()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat || performance.now() - mountedAt < 400) return
      e.preventDefault()
      if (watchFirst) onWatch()
      else onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onNext, onWatch, watchFirst])

  const r = commit.recurrence
  const sanFor = (role: keyof typeof BRUSH) => {
    if (role === 'held') return commit.best_move_san
    if (role === 'mistake') return commit.root_move_san
    return chosenSan
  }
  const g = commit.grading
  const signed = (cp: number) => `${cp > 0 ? '+' : ''}${cp} cp`

  return (
    <div className="training-grid">
      <ChessBoard fen={fen} orientation={orientation} shapes={shapes} size={size} />

      <div className="training-panel">
        <p className={`training-verdict training-verdict-${kind}`}>{revealVerdict(kind)}</p>

        <ul className="training-key" aria-label="What the arrows mean">
          {arrows.map(a => (
            <li key={a.role}>
              <span className={`training-swatch training-swatch-${a.role}`} aria-hidden />
              <span className="training-key-label">{ARROW_KEY[a.role]}</span>
              <span className="training-key-move">{sanFor(a.role)}</span>
            </li>
          ))}
        </ul>

        <div className="training-lines">
          {lines.map(line => (
            <p key={line} className="training-sentence">{line}</p>
          ))}
        </div>

        {r && r.games_analysed > 0 && (
          <p className="training-recurrence">
            {capitalise(tagLabel(r.tag))}: the same kind of slip shows up in {r.games_with_tag} of your {r.games_analysed} games.
            {r.exposure_ordinal > 1 && ` You've seen this position ${r.exposure_ordinal} times now.`}
          </p>
        )}

        <div className="training-actions">
          {watchFirst ? (
            <>
              <button className="training-btn training-btn-primary" onClick={onWatch}>
                See what happened in your game
              </button>
              <button className="training-btn training-btn-quiet" onClick={onNext}>
                {nextLabel}
              </button>
            </>
          ) : (
            <>
              <button className="training-btn training-btn-primary" onClick={onNext}>
                {nextLabel}
              </button>
              {hasLine && (
                <button className="training-btn training-btn-quiet" onClick={onWatch}>
                  {watched ? 'Watch again' : 'See what happened in your game'}
                </button>
              )}
            </>
          )}
        </div>

        <details className="training-receipt">
          <summary>Receipt</summary>
          <dl>
            <dt>Engine</dt>
            <dd>{commit.receipt.engine ?? 'unknown'}</dd>
            <dt>Depth</dt>
            <dd>{commit.receipt.depth ?? 'unknown'}</dd>
            <dt>Eval here, your side</dt>
            <dd>{commit.receipt.eval_cp === null ? 'unknown' : `${commit.receipt.eval_cp > 0 ? '+' : ''}${commit.receipt.eval_cp} cp`}</dd>
            <dt>Eval at the end of the line</dt>
            <dd>
              {commit.refutation_evals.length > 0
                ? `${commit.refutation_evals[commit.refutation_evals.length - 1] > 0 ? '+' : ''}${commit.refutation_evals[commit.refutation_evals.length - 1]} cp`
                : 'no line stored'}
            </dd>
            <dt>Best move</dt>
            <dd>{commit.best_move_san ?? 'none'}</dd>
            {g?.method === 'engine' && g.chosen_eval_cp !== null && g.best_eval_cp !== null && (
              <>
                <dt>Your move, checked</dt>
                <dd>
                  {chosenSan}: {signed(g.chosen_eval_cp)} against {signed(g.best_eval_cp)} for{' '}
                  {commit.best_move_san ?? 'the best move'}, your side
                </dd>
                <dt>Checked by</dt>
                <dd>
                  {g.engine}
                  {g.depth ? `, depth ${g.depth}` : ''}; counts as right within 50 cp of the best move
                </dd>
              </>
            )}
            {g?.method === 'unavailable' && (
              <>
                <dt>Your move, checked</dt>
                <dd>not checked: the engine gave no usable answer</dd>
              </>
            )}
            <dt>Your game</dt>
            <dd>{commit.root_move_san}</dd>
            <dt>Pattern</dt>
            <dd>{commit.receipt.tag ? tagLabel(commit.receipt.tag) : 'untagged'}</dd>
            <dt>Chain span</dt>
            <dd>{commit.receipt.span_plies} plies</dd>
            {r && (
              <>
                <dt>Recurrence</dt>
                <dd>
                  pattern at a chain root in {r.games_with_tag} of {r.games_analysed} analysed games;
                  this position served {r.exposure_ordinal} {r.exposure_ordinal === 1 ? 'time' : 'times'}
                </dd>
              </>
            )}
          </dl>
        </details>
      </div>
    </div>
  )
}
