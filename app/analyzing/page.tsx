'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import RecurrenceStrip, { type StripBarState } from '@/components/workbench/RecurrenceStrip'
import { useProgressFavicon } from '@/components/layout/progress-favicon'
import { POLL_INTERVAL_MS, createStatusPoller } from '@/lib/sync/poll'
import { planOnLoad } from '@/lib/sync/resume'

interface ChessicsSession {
  username: string
  platform: 'chess.com' | 'lichess'
  batchSize?: number
  calibrationLevel?: number
  timeControlFilter?: 'rapid_blitz' | 'all'
  sessionToken?: string
  jobId?: string
  authed?: boolean
}

type StageStatus = 'pending' | 'active' | 'complete'

function platformLabel(platform: string): string {
  if (platform === 'chess.com') return 'Chess.com'
  if (platform === 'lichess') return 'Lichess'
  return platform
}

function platformApiValue(platform: string): 'chess_com' | 'lichess' {
  return platform === 'chess.com' ? 'chess_com' : 'lichess'
}

export default function AnalyzingPage() {
  const router = useRouter()
  const [session, setSession] = useState<ChessicsSession | null>(null)
  const [stages, setStages] = useState<StageStatus[]>(['active', 'pending', 'pending', 'pending'])
  const [gamesDone, setGamesDone] = useState(0)
  const [stageDetail, setStageDetail] = useState<string | null>(null)
  useProgressFavicon(stages)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearAll = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (pollRef.current) clearInterval(pollRef.current)
  }, [])

  const finish = useCallback(
    (authed: boolean) => {
      setStages(['complete', 'complete', 'complete', 'complete'])
      timerRef.current = setTimeout(() => {
        router.push(authed ? '/workbench' : '/report')
      }, 800)
    },
    [router]
  )

  const startPolling = useCallback(
    (jobId: string, authed: boolean) => {
      const tick = createStatusPoller<{
        status: 'queued' | 'processing' | 'complete' | 'failed'
        progress: number
        gameCount: number
        stage: 1 | 2 | 3 | 4
        stageDetail: string | null
      }>({
        fetchStatus: () => fetch(`/api/sync/status?jobId=${jobId}`),
        onGiveUp: (reason) => {
          clearInterval(pollRef.current!)
          router.push(`/?error=${reason}`)
        },
        onStatus: (data) => {
          const stageIndex = (data.stage ?? 1) - 1
          const newStages: StageStatus[] = ['pending', 'pending', 'pending', 'pending']
          for (let i = 0; i < stageIndex; i++) newStages[i] = 'complete'
          newStages[stageIndex] = 'active'
          setStages(newStages)
          setStageDetail(data.stageDetail ?? null)

          if (data.stageDetail) {
            const match = data.stageDetail.match(/^(\d+)/)
            if (match) setGamesDone(parseInt(match[1], 10))
          }
          if ((data.stage ?? 1) > 2) setGamesDone((prev) => Math.max(prev, batchSizeRef.current))

          if (data.status === 'complete') {
            clearInterval(pollRef.current!)
            finish(authed)
          }
          if (data.status === 'failed') {
            clearInterval(pollRef.current!)
            router.push('/?error=analysis_failed')
          }
        },
      })

      pollRef.current = setInterval(tick, POLL_INTERVAL_MS)
    },
    [router, finish]
  )

  const batchSizeRef = useRef(10)

  useEffect(() => {
    const raw = localStorage.getItem('chessics_session')
    if (!raw) {
      router.replace('/')
      return
    }
    try {
      setSession(JSON.parse(raw) as ChessicsSession)
    } catch {
      router.replace('/')
    }
  }, [router])

  useEffect(() => {
    if (!session) return
    const batchSize = session.batchSize ?? 10
    batchSizeRef.current = batchSize
    let cancelled = false

    async function startSync() {
      try {
        const res = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: session!.username,
            platform: platformApiValue(session!.platform),
            batchSize,
            calibrationLevel: session!.calibrationLevel,
            timeControlFilter: session!.timeControlFilter ?? 'rapid_blitz',
            sessionToken: session!.sessionToken,
          }),
        })

        if (cancelled) return
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
          if (!cancelled) router.push(`/?error=${encodeURIComponent(errData.error ?? 'sync_failed')}`)
          return
        }

        const data = (await res.json()) as { jobId: string; authed?: boolean }
        if (cancelled) return
        const authed = data.authed ?? !session!.sessionToken

        const raw = localStorage.getItem('chessics_session')
        if (raw) {
          try {
            const stored = JSON.parse(raw) as ChessicsSession
            localStorage.setItem('chessics_session', JSON.stringify({ ...stored, jobId: data.jobId, authed }))
          } catch {  }
        }

        setStages(['complete', 'active', 'pending', 'pending'])
        startPolling(data.jobId, authed)
      } catch {
        if (!cancelled) router.push('/?error=network_error')
      }
    }

    async function begin() {
      const plan = await planOnLoad(session!.jobId, (id) =>
        fetch(`/api/sync/status?jobId=${encodeURIComponent(id)}`)
      )
      if (cancelled) return
      const authed = session!.authed ?? !session!.sessionToken
      if (plan.kind === 'resume') {
        setStages(['complete', 'active', 'pending', 'pending'])
        startPolling(plan.jobId, authed)
      } else if (plan.kind === 'finished') {
        finish(authed)
      } else {
        startSync()
      }
    }

    begin()
    return () => {
      cancelled = true
      clearAll()
    }
  }, [session, startPolling, clearAll, router, finish])

  if (!session) return null

  const batchSize = session.batchSize ?? 10
  const bars: StripBarState[] = Array.from({ length: batchSize }, (_, i) =>
    i < gamesDone ? 'quiet' : 'pending'
  )

  const stageItems = [
    `Syncing games from ${platformLabel(session.platform)}`,
    'Engine analysis',
    'Clustering root causes',
    'Writing your report',
  ]

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: 'var(--bg)' }}
    >
      <div className="w-full max-w-md flex flex-col gap-10">
        <div className="text-center">
          <a href="/" className="font-logo inline-block" style={{ fontSize: 24, color: 'var(--text)' }}>
            chess<span style={{ color: 'var(--brass)' }}>ics</span>
          </a>
          <h1 className="font-headline mt-4" style={{ fontSize: 28, color: 'var(--text)' }}>
            Reading your games
          </h1>
        </div>

        <div className="flex flex-col gap-3">
          <RecurrenceStrip bars={bars} height={40} />
          <p className="text-sm text-center font-mono" style={{ color: 'var(--text-muted)' }}>
            {stages[1] === 'active' || stages[0] === 'active'
              ? `${gamesDone} of ${batchSize} games analyzed`
              : stageDetail ?? `${batchSize} games analyzed`}
          </p>
        </div>

        <div className="flex flex-col">
          {stageItems.map((label, i) => {
            const status = stages[i]
            return (
              <div
                key={i}
                className="flex items-center justify-between gap-4 py-3"
                style={{ borderTop: '1px solid var(--border)' }}
              >
                <span
                  className="text-sm"
                  style={{
                    color:
                      status === 'pending'
                        ? 'var(--text-dim)'
                        : status === 'complete'
                          ? 'var(--text-muted)'
                          : 'var(--text)',
                  }}
                >
                  {label}
                </span>
                <span
                  className="text-xs font-mono"
                  style={{
                    color: status === 'active' ? 'var(--brass)' : 'var(--text-dim)',
                  }}
                >
                  {status === 'complete' ? 'done' : status === 'active' ? 'working' : ''}
                </span>
              </div>
            )
          })}
        </div>

        <p className="text-xs text-center" style={{ color: 'var(--text-dim)' }}>
          please keep this tab open while we read your games
        </p>
      </div>
    </main>
  )
}
