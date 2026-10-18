'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { landingErrorMessage } from '@/lib/sync/poll'
import SourceLink from '@/components/layout/SourceLink'

type Platform = 'chess.com' | 'lichess'

interface ChessicsSession {
  username: string
  platform: Platform
  batchSize?: number
  calibrationLevel?: number
  timeControlFilter?: 'rapid_blitz' | 'all'
  sessionToken?: string
  jobId?: string
}

type ResumeState = 'idle' | 'checking' | 'ready' | 'processing'

export default function LandingPage() {
  const [username, setUsername] = useState('')
  const [platform, setPlatform] = useState<Platform>('chess.com')
  const [resumeState, setResumeState] = useState<ResumeState>('checking')
  const [resumeSession, setResumeSession] = useState<ChessicsSession | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    setErrorMessage(landingErrorMessage(new URLSearchParams(window.location.search).get('error')))
  }, [])

  useEffect(() => {
    async function checkResume() {
      const raw = localStorage.getItem('chessics_session')
      if (!raw) {
        setResumeState('idle')
        return
      }

      let session: ChessicsSession
      try {
        session = JSON.parse(raw) as ChessicsSession
      } catch {
        localStorage.removeItem('chessics_session')
        setResumeState('idle')
        return
      }

      if (!session.sessionToken) {
        setResumeState('idle')
        return
      }

      try {
        const params = new URLSearchParams({ sessionToken: session.sessionToken })
        if (session.jobId) params.set('jobId', session.jobId)

        const res = await fetch(`/api/guest/check?${params}`)
        const { status } = (await res.json()) as { status: 'ready' | 'processing' | 'failed' | 'lost' | 'not_found' }

        if (status === 'ready') {
          setResumeSession(session)
          setResumeState('ready')
        } else if (status === 'processing') {
          router.replace('/analyzing')
        } else {
          setResumeState('idle')
        }
      } catch {
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) return
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
      sessionToken: crypto.randomUUID(),
    }
    localStorage.setItem('chessics_session', JSON.stringify(session))
    router.push('/analyzing')
  }

  const handleStartFresh = () => {
    localStorage.removeItem('chessics_session')
    setResumeState('idle')
    setResumeSession(null)
  }

  const showForm = resumeState === 'idle' || resumeState === 'checking'

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: 'var(--bg)' }}
    >
      <div className="w-full max-w-md flex flex-col items-center gap-8">
        <div className="text-center">
          <h1 className="font-logo" style={{ fontSize: 48, letterSpacing: '-0.02em', lineHeight: 1 }}>
            <span style={{ color: 'var(--text)' }}>chess</span>
            <span style={{ color: 'var(--gold)' }}>ics</span>
          </h1>
          <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
            find out why you&apos;re losing, not just where.
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-dim)' }}>
            no signup required to see your first analysis
          </p>
        </div>

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
              className="flex p-1 gap-1"
              role="group"
              aria-label="Platform"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              {(['chess.com', 'lichess'] as Platform[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  aria-pressed={platform === p}
                  className="flex-1 py-2 text-sm"
                  style={{
                    background: platform === p ? 'var(--gold)' : 'transparent',
                    color: platform === p ? '#1a1512' : 'var(--text-muted)',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: platform === p ? 600 : 400,
                  }}
                >
                  {p === 'chess.com' ? 'Chess.com' : 'Lichess'}
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder={`Your ${platform === 'chess.com' ? 'Chess.com' : 'Lichess'} username`}
              value={username}
              onChange={handleUsernameChange}
              aria-label={`${platform === 'chess.com' ? 'Chess.com' : 'Lichess'} username`}
              autoComplete="off"
              className="w-full px-4 py-3 text-sm outline-none"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text)',
                fontFamily: 'DM Sans, sans-serif',
              }}
            />

            <button
              type="submit"
              disabled={!username.trim()}
              className="w-full py-3 text-sm font-medium transition-opacity disabled:opacity-40"
              style={{
                background: 'var(--gold)',
                color: '#1a1512',
                cursor: username.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Analyze my games →
            </button>
          </form>
        )}

        <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
          No account required to start.{' '}
          <a href="/login" style={{ color: 'var(--gold-dim)', textDecoration: 'underline' }}>
            Sign in
          </a>{' '}
          to save your progress.
        </p>

        <p className="text-xs">
          <SourceLink />
        </p>
      </div>
    </main>
  )
}
