'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { landingErrorMessage } from '@/lib/sync/poll'
import { DAILY_CAP_CODE } from '@/lib/ratelimit-message'
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

const exampleLink = <a href="/example">See an example report</a>

export default function GuestAnalysis() {
  const [username, setUsername] = useState('')
  const [platform, setPlatform] = useState<Platform>('chess.com')
  const [resumeState, setResumeState] = useState<ResumeState>('checking')
  const [resumeSession, setResumeSession] = useState<ChessicsSession | null>(null)
  const [error, setError] = useState<{ message: string; showExample?: boolean } | null>(null)
  const router = useRouter()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('error')
    const message = landingErrorMessage(code, params.get('retryAt'))
    setError(message ? { message, showExample: code === DAILY_CAP_CODE } : null)

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

      if (code && typeof session?.username === 'string') {
        setUsername(session.username)
        if (session.platform === 'lichess' || session.platform === 'chess.com') setPlatform(session.platform)
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
      setError({ message: 'Allow browser storage to start your analysis.' })
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
  const platformName = platform === 'chess.com' ? 'Chess.com' : 'Lichess'

  return (
    <div className={styles.access}>
        {error && (
          <p role="alert" className={styles.alert}>
            {error.message}
            {error.showExample && exampleLink}
          </p>
        )}

        {resumeState === 'ready' && resumeSession && (
          <div className={styles.resume}>
            <div className={styles.resumeText}>
              <p className={styles.resumeTitle}>Your analysis is ready</p>
              <p className={styles.resumeMeta}>
                {resumeSession.username} · {resumeSession.platform === 'chess.com' ? 'Chess.com' : 'Lichess'} · {resumeSession.batchSize ?? 25} games
              </p>
            </div>
            <div className={styles.resumeActions}>
              <a href="/report" className={styles.primary}>View your report</a>
              <a href="/signup" className={styles.secondary}>Sign up to save &amp; view results →</a>
              <a href="/login" className={styles.secondary}>Sign in to existing account</a>
            </div>
            <button type="button" onClick={handleStartFresh} className={styles.textButton}>
              Discard and start a new analysis
            </button>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.fields}>
              <div className={styles.platformPicker} role="group" aria-label="Platform">
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
                placeholder={`Your ${platformName} username`}
                value={username}
                onChange={handleUsernameChange}
                aria-label={`${platformName} username`}
                autoComplete="off"
                className={styles.username}
                spellCheck={false}
                autoCapitalize="none"
              />

              <button type="submit" className={styles.analyzeButton}>
                Analyze 10 games
              </button>
            </div>
            <p className={styles.note}>
              <span>Your last 10 games, analyzed for free. No signup needed.</span>
              {!error?.showExample && exampleLink}
              <a href="/signup">Create an account</a>
            </p>
          </form>
        )}

    </div>
  )
}
