'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { landingErrorMessage } from '@/lib/sync/poll'
import { landingPlan } from '@/lib/sync/resume'
import { uuid } from '@/lib/uuid'
import styles from './landing.module.css'

type Platform = 'chess.com' | 'lichess'

interface ChessicsSession {
  username: string
  platform: Platform
  batchSize?: number
  calibrationLevel?: number
  timeControlFilter?: 'rapid_blitz' | 'all'
  sessionToken?: string
  jobId?: string
  authed?: boolean
}

type ResumeState = 'idle' | 'checking' | 'ready' | 'processing'

export default function GuestAnalysis() {
  const [username, setUsername] = useState('')
  const [platform, setPlatform] = useState<Platform>('chess.com')
  const [resumeState, setResumeState] = useState<ResumeState>('checking')
  const [resumeSession, setResumeSession] = useState<ChessicsSession | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const message = landingErrorMessage(new URLSearchParams(window.location.search).get('error'))
    setErrorMessage(message)
  }, [])

  useEffect(() => {
    async function checkResume() {
      let raw: string | null
      try { raw = localStorage.getItem('chessics_session') } catch { setResumeState('idle'); return }
      if (!raw) {
        setResumeState('idle')
        return
      }

      let session: ChessicsSession
      try {
        session = JSON.parse(raw) as ChessicsSession
      } catch {
        try { localStorage.removeItem('chessics_session') } catch {  }
        setResumeState('idle')
        return
      }

      const plan = await landingPlan(session, (url) => fetch(url))
      if (plan === 'ready') {
        setResumeSession(session)
        setResumeState('ready')
      } else if (plan === 'processing') {
        router.replace('/analyzing')
      } else {
        setResumeState('idle')
      }
    }

    checkResume()
  }, [router])

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setUsername(val)
    if (val.includes('.')) setPlatform('chess.com')
  }

  const inputRef = useRef<HTMLInputElement>(null)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) { inputRef.current?.focus(); return }
    let savedFilter: ChessicsSession['timeControlFilter']
    try {
      const prev = localStorage.getItem('chessics_session')
      if (prev) savedFilter = (JSON.parse(prev) as ChessicsSession).timeControlFilter
    } catch {  }
    const session: ChessicsSession = {
      username: username.trim(),
      platform,
      batchSize: 10,
      timeControlFilter: savedFilter ?? 'rapid_blitz',
      sessionToken: uuid(),
    }
    try {
      localStorage.setItem('chessics_session', JSON.stringify(session))
    } catch {
      setErrorMessage('Allow browser storage to start your analysis.')
      return
    }
    router.push('/analyzing')
  }

  const handleStartFresh = () => {
    try { localStorage.removeItem('chessics_session') } catch {  }
    setResumeState('idle')
    setResumeSession(null)
  }

  const showForm = resumeState === 'idle' || resumeState === 'checking'

  return (
    <div className="w-full flex flex-col gap-5">
        {errorMessage && (
          <p role="alert" className="w-full text-sm text-center" style={{ color: 'var(--text)', borderTop: '1px solid var(--oxblood)', paddingTop: 8 }}>
            {errorMessage}
          </p>
        )}

        {resumeState === 'ready' && resumeSession && (
          <div
            className="w-full p-5 flex flex-col gap-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)' }}
          >
            <div className="flex items-start gap-3">
              <div
                className="mt-1 flex-shrink-0 w-2 h-2"
                style={{ background: 'var(--gold)' }}
              />
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                  Your analysis is ready
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {resumeSession.username} · {resumeSession.platform === 'chess.com' ? 'Chess.com' : 'Lichess'} · {resumeSession.batchSize ?? 25} games
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <a
                href="/report"
                className="w-full py-2.5 text-sm font-medium text-center block"
                style={{ background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--text)' }}
              >
                View your report
              </a>
              <a
                href="/signup"
                className="w-full py-2.5 text-sm font-medium text-center block"
                style={{ background: 'var(--gold)', color: '#1a1512' }}
              >
                Sign up to save &amp; view results →
              </a>
              <a
                href="/login"
                className="w-full py-2.5 text-sm text-center block"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-strong)',
                  color: 'var(--text-muted)',
                }}
              >
                Sign in to existing account
              </a>
            </div>

            <button
              type="button"
              onClick={handleStartFresh}
              className="text-xs text-center w-full"
              style={{ color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Discard and start a new analysis
            </button>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
            <div
              className={styles.platformPicker}
              role="group"
              aria-label="Platform"
            >
              {(['chess.com', 'lichess'] as Platform[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  aria-pressed={platform === p}
                  className={styles.platformButton}
                >
                  {p === 'chess.com' ? 'Chess.com' : 'Lichess'}
                </button>
              ))}
            </div>

            <input
              ref={inputRef}
              type="text"
              placeholder={`Your ${platform === 'chess.com' ? 'Chess.com' : 'Lichess'} username`}
              value={username}
              onChange={handleUsernameChange}
              aria-label={`${platform === 'chess.com' ? 'Chess.com' : 'Lichess'} username`}
              autoComplete="off"
              className="w-full px-4 py-3 text-sm"
              spellCheck={false}
              autoCapitalize="none"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text)',
                fontFamily: 'DM Sans, sans-serif',
              }}
            />

            <button type="submit" className={`w-full ${styles.analyzeButton}`}>
              Analyze 10 games
            </button>
          </form>
        )}

    </div>
  )
}
