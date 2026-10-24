'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ANALYZE_MORE_ID } from '@/lib/diagnosis/verdict'
import { uuid } from '@/lib/uuid'

type TimeControlFilter = 'rapid_blitz' | 'all'

const FILTER_OPTIONS: Array<{ value: TimeControlFilter; label: string }> = [
  { value: 'rapid_blitz', label: 'Rapid & blitz only' },
  { value: 'all', label: 'All games' },
]

const COACHING_LEVELS = [
  'complete beginners',
  'casual players',
  'club players',
  'serious improvers',
  'advanced players',
]

interface BatchControlsProps {
  username: string | null
  platform: 'chess.com' | 'lichess' | null
  calibrationLevel: number
  isGuest: boolean
}

export default function BatchControls({
  username,
  platform,
  calibrationLevel,
  isGuest,
}: BatchControlsProps) {
  const router = useRouter()
  const [level, setLevel] = useState(calibrationLevel)
  const [filter, setFilter] = useState<TimeControlFilter>('rapid_blitz')
  const [saving, setSaving] = useState(false)
  const [starting, setStarting] = useState<number | null>(null)
  const [saved, setSaved] = useState<{ username: string; platform: 'chess.com' | 'lichess' } | null>(null)
  const who = username && platform ? { username, platform } : saved

  useEffect(() => {
    try {
      const raw = localStorage.getItem('chessics_session')
      if (raw && (JSON.parse(raw) as { timeControlFilter?: TimeControlFilter }).timeControlFilter === 'all') {
        setFilter('all')
      }
      const s = raw ? (JSON.parse(raw) as { username?: string; platform?: 'chess.com' | 'lichess' }) : null
      if (s?.username && s.platform) setSaved({ username: s.username, platform: s.platform })
    } catch {  }
  }, [])

  const changeFilter = (next: TimeControlFilter) => {
    setFilter(next)
    let session: Record<string, unknown> = {}
    try {
      const raw = localStorage.getItem('chessics_session')
      if (raw) session = JSON.parse(raw) as Record<string, unknown>
    } catch {  }
    session.timeControlFilter = next
    localStorage.setItem('chessics_session', JSON.stringify(session))
  }

  const startBatch = (batchSize: number) => {
    if (!who) return
    setStarting(batchSize)
    const raw = localStorage.getItem('chessics_session')
    let sessionToken: string | undefined
    try {
      sessionToken = raw ? (JSON.parse(raw) as { sessionToken?: string }).sessionToken : undefined
    } catch {  }
    localStorage.setItem(
      'chessics_session',
      JSON.stringify({
        username: who.username,
        platform: who.platform,
        batchSize,
        calibrationLevel: level,
        timeControlFilter: filter,
        ...(isGuest ? { sessionToken: sessionToken ?? uuid() } : {}),
      })
    )
    router.push('/analyzing')
  }

  const changeLevel = async (next: number) => {
    setLevel(next)
    if (isGuest) {
      const raw = localStorage.getItem('chessics_session')
      try {
        const session = raw ? JSON.parse(raw) : {}
        localStorage.setItem('chessics_session', JSON.stringify({ ...session, calibrationLevel: next }))
      } catch {  }
      return
    }
    setSaving(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      await supabase
        .from('profiles')
        .update({ preferred_calibration_override: next })
        .eq('id', session.user.id)
    }
    setSaving(false)
  }

  return (
    <div id={ANALYZE_MORE_ID} className="flex flex-col gap-5 p-5" style={{ borderTop: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {isGuest ? 'Sign up to analyze more games' : 'Analyze more games'}
        </p>
        <div className="flex flex-wrap gap-2">
          {[25, 50, 100].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => (isGuest ? router.push('/signup') : startBatch(n))}
              disabled={starting !== null || (!isGuest && !who)}
              className="px-4 py-2 text-sm transition-colors hover:bg-[rgba(201,165,92,0.22)] active:bg-[rgba(201,165,92,0.34)] disabled:opacity-40"
              style={{
                background: starting === n ? 'rgba(201,165,92,0.34)' : 'rgba(201,165,92,0.08)',
                border: '1px solid var(--brass)',
                color: 'var(--brass)',
                cursor: isGuest || who ? 'pointer' : 'not-allowed',
              }}
            >
              {starting === n ? 'Starting…' : `Analyze ${n} more`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          This report is written for{' '}
          <span style={{ color: 'var(--text)' }}>{COACHING_LEVELS[level]}</span>
          {saving && <span style={{ color: 'var(--text-dim)' }}> (saving…)</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          {COACHING_LEVELS.map((label, i) => (
            <button
              key={i}
              type="button"
              onClick={() => changeLevel(i)}
              title={`Write for ${label}`}
              className="px-2.5 py-1.5 text-xs transition-colors hover:bg-[rgba(201,165,92,0.18)]"
              style={{
                background: level === i ? 'rgba(201,165,92,0.28)' : 'rgba(232,224,208,0.06)',
                border: level === i ? '1px solid var(--brass)' : '1px solid var(--border-strong)',
                color: level === i ? 'var(--brass)' : 'var(--text)',
                cursor: 'pointer',
              }}
            >
              {i}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Analyze{' '}
          <span style={{ color: 'var(--text)' }}>
            {filter === 'rapid_blitz' ? 'rapid & blitz games only' : 'all games'}
          </span>
          {filter === 'rapid_blitz' && (
            <span style={{ color: 'var(--text-dim)' }}> (bullet and daily excluded)</span>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => changeFilter(opt.value)}
              className="px-2.5 py-1.5 text-xs transition-colors hover:bg-[rgba(201,165,92,0.18)]"
              style={{
                background: filter === opt.value ? 'rgba(201,165,92,0.28)' : 'rgba(232,224,208,0.06)',
                border: filter === opt.value ? '1px solid var(--brass)' : '1px solid var(--border-strong)',
                color: filter === opt.value ? 'var(--brass)' : 'var(--text)',
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
        Level and filter apply to your next analysis.
      </p>

      {isGuest && (
        <div
          className="flex items-center justify-between gap-4 flex-wrap p-4"
          style={{ border: '1px solid var(--border-strong)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text)' }}>
            Save this so you don&apos;t lose it across devices.
          </p>
          <a
            href="/signup"
            className="px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
            style={{ background: 'var(--brass)', color: '#1a1512', textDecoration: 'none' }}
          >
            Sign up and keep your report →
          </a>
        </div>
      )}
    </div>
  )
}
