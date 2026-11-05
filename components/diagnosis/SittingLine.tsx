'use client'

import Link from 'next/link'
import { useState } from 'react'
import { NOT_COUNTED_WORDS, type FatigueSentence, type SittingDoorGame, type SittingReport } from '@/lib/diagnosis/sittings'
import './diagnosis.css'

const RESULT_WORD = { win: 'Won', loss: 'Lost', draw: 'Drew' } as const

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function beforeWord(g: SittingDoorGame): string {
  return g.afterLoss === null ? 'no result before' : g.afterLoss ? 'after a loss' : 'otherwise'
}

interface SittingLineProps {
  line: SittingReport | null
  reviewLinks: boolean
  defaultOpen?: boolean
}

export default function SittingLine({ line, reviewLinks, defaultOpen = false }: SittingLineProps) {
  const [open, setOpen] = useState(defaultOpen)
  if (!line) return null

  const sentences = (list: FatigueSentence[], data: string) => (
    <p className="text-base" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }} {...{ [data]: true }}>
      {list.map((s, i) => (
        <span key={i}>
          {i > 0 && ' '}
          {s.door ? (
            <button
              type="button"
              className="diagnosis-door"
              style={{ textAlign: 'left' }}
              aria-expanded={open}
              aria-controls="sitting-sources"
              onClick={() => setOpen((o) => !o)}
            >
              {s.text}
            </button>
          ) : (
            s.text
          )}
        </span>
      ))}
    </p>
  )

  const row = (key: string, gameId: string, cells: React.ReactNode) =>
    reviewLinks ? (
      <Link key={key} href={`/games/${gameId}/review`} className="diagnosis-source">
        {cells}
      </Link>
    ) : (
      <div key={key} className="diagnosis-source">
        {cells}
      </div>
    )

  return (
    <section className="flex flex-col gap-2" aria-labelledby="sitting-line" data-fatigue>
      <hr className="hairline" />
      <h2 id="sitting-line" className="text-sm pt-2" style={{ color: 'var(--text-dim)', fontWeight: 400 }}>
        Within a sitting
      </h2>
      {sentences([line.coverage], 'data-coverage')}
      {line.fatigue && sentences(line.fatigue, 'data-fatigue-line')}
      {line.tilt && sentences(line.tilt, 'data-tilt-line')}
      {open && (
        <div id="sitting-sources" className="flex flex-col gap-3 pt-1" data-sitting-sources>
          <div className="flex flex-col gap-1">
            {line.rule.map((r) => (
              <p key={r} className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {r}
              </p>
            ))}
          </div>
          {line.sittings.map((s) => (
            <div key={s.key} className="flex flex-col" data-sitting>
              <p className="text-xs font-mono pb-1" style={{ color: 'var(--text-dim)' }}>
                {s.playedAt ? formatDate(s.playedAt) : 'Undated'}
              </p>
              {s.games.map((g) =>
                row(
                  g.key,
                  g.gameId,
                  <>
                    <span className="text-sm" style={{ width: 64, color: 'var(--text-muted)' }}>
                      game {g.position}
                    </span>
                    <span className="text-sm flex-1 truncate" style={{ color: 'var(--text)', minWidth: 120 }}>
                      {g.opponent ? `vs ${g.opponent}` : 'Unknown opponent'}
                    </span>
                    <span className="text-sm" style={{ width: 40, color: 'var(--text-muted)' }}>
                      {g.result ? RESULT_WORD[g.result] : '—'}
                    </span>
                    {line.tilt && (
                      <span className="text-xs" style={{ width: 104, color: 'var(--text-muted)' }} data-before>
                        {beforeWord(g)}
                      </span>
                    )}
                    <span className="text-xs" style={{ width: 80, color: g.blundered ? 'var(--brass)' : 'var(--text-dim)' }}>
                      {g.blundered ? 'blunder' : 'no blunder'}
                    </span>
                  </>
                )
              )}
            </div>
          ))}
          {line.notCounted.length > 0 && (
            <div className="flex flex-col" data-not-counted>
              <p className="text-xs font-mono pb-1" style={{ color: 'var(--text-dim)' }}>
                Not counted
              </p>
              {line.notCounted.map((g) =>
                row(
                  g.key,
                  g.gameId,
                  <>
                    <span className="text-xs font-mono" style={{ width: 96, color: 'var(--text-dim)' }}>
                      {g.playedAt ? formatDate(g.playedAt) : 'Undated'}
                    </span>
                    <span className="text-sm flex-1 truncate" style={{ color: 'var(--text)', minWidth: 120 }}>
                      {g.opponent ? `vs ${g.opponent}` : 'Unknown opponent'}
                    </span>
                    <span className="text-sm" style={{ width: 40, color: 'var(--text-muted)' }}>
                      {g.result ? RESULT_WORD[g.result] : '—'}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }} data-reason>
                      {NOT_COUNTED_WORDS[g.reason]}
                    </span>
                  </>
                )
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
