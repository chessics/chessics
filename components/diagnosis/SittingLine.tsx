'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { FatigueLine } from '@/lib/diagnosis/sittings'
import './diagnosis.css'

const RESULT_WORD = { win: 'Won', loss: 'Lost', draw: 'Drew' } as const

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface SittingLineProps {
  line: FatigueLine | null
  reviewLinks: boolean
  defaultOpen?: boolean
}

export default function SittingLine({ line, reviewLinks, defaultOpen = false }: SittingLineProps) {
  const [open, setOpen] = useState(defaultOpen)
  if (!line) return null
  return (
    <section className="flex flex-col gap-2" aria-labelledby="sitting-line" data-fatigue>
      <hr className="hairline" />
      <h2 id="sitting-line" className="text-sm pt-2" style={{ color: 'var(--text-dim)', fontWeight: 400 }}>
        Within a sitting
      </h2>
      <p className="text-base" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
        {line.sentences.map((s, i) => (
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
              {s.games.map((g) => {
                const cells = (
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
                    <span className="text-xs" style={{ width: 80, color: g.blundered ? 'var(--brass)' : 'var(--text-dim)' }}>
                      {g.blundered ? 'blunder' : 'no blunder'}
                    </span>
                  </>
                )
                return reviewLinks ? (
                  <Link key={g.key} href={`/games/${g.gameId}/review`} className="diagnosis-source">
                    {cells}
                  </Link>
                ) : (
                  <div key={g.key} className="diagnosis-source">
                    {cells}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
