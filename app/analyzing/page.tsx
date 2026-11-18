'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import AnalyzingView, { type StageStatus } from '@/components/analyzing/AnalyzingView'
import { useProgressFavicon } from '@/components/layout/progress-favicon'
import { POLL_INTERVAL_MS, createStatusPoller, syncErrorHref } from '@/lib/sync/poll'
import { planOnLoad } from '@/lib/sync/resume'
import { FLAGS } from '@/lib/flags'
import { finishPlan } from '@/lib/sync/finish'
import { createAnalysisWait, INITIAL_ESTIMATE, nextGamesProgress, type AnalysisWait, type GamesProgress } from '@/lib/sync/progress'

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

function platformApiValue(platform: string): 'chess_com' | 'lichess' {
  return platform === 'chess.com' ? 'chess_com' : 'lichess'
}

export default function AnalyzingPage() {
  const router = useRouter()
  const [session, setSession] = useState<ChessicsSession | null>(null)
  const [stages, setStages] = useState<StageStatus[]>(['active', 'pending', 'pending', 'pending'])
  const [progress, setProgress] = useState<GamesProgress>({ done: 0, total: null })
  const [wait, setWait] = useState<AnalysisWait | null>(null)
  const [readyHref, setReadyHref] = useState<string | null>(null)
  const touchedRef = useRef(false)
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
      const plan = finishPlan(authed, touchedRef.current)
      if (plan.kind === 'wait') {
        setReadyHref(plan.href)
        return
      }
      timerRef.current = setTimeout(() => {
        router.push(plan.href)
      }, plan.afterMs)
    },
    [router]
  )

  const startPolling = useCallback(
    (jobId: string, authed: boolean) => {
      const readWait = createAnalysisWait()
      const tick = createStatusPoller<{
        status: 'queued' | 'processing' | 'complete' | 'failed'
        progress: number
        gameCount: number
        stage: 1 | 2 | 3 | 4
        stageDetail: string | null
        updatedAt?: string | null
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
          if (data.status === 'queued') newStages[0] = 'complete'
          else newStages[stageIndex] = 'active'
          setStages(newStages)
          setWait(readWait(data))

          setProgress((prev) => nextGamesProgress(prev, data, batchSizeRef.current))

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
          if (!cancelled) router.push(syncErrorHref(errData.error ?? 'sync_failed', res.headers.get('Retry-After')))
          return
        }

        const data = (await res.json()) as { jobId: string; authed?: boolean; foreign?: boolean }
        if (cancelled) return
        const authed = data.authed ?? !session!.sessionToken

        const raw = localStorage.getItem('chessics_session')
        if (raw) {
          try {
            const stored = JSON.parse(raw) as ChessicsSession
            localStorage.setItem('chessics_session', JSON.stringify({ ...stored, jobId: data.jobId, authed, ...(data.foreign ? { foreign: true } : {}) }))
          } catch {  }
        }

        setStages(['complete', 'pending', 'pending', 'pending'])
        setWait({ message: 'Waiting for analysis to start.', estimate: INITIAL_ESTIMATE })
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
        setStages(['complete', 'pending', 'pending', 'pending'])
        setWait({ message: 'Checking the progress of your analysis.', estimate: INITIAL_ESTIMATE })
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

  return (
    <AnalyzingView
      platform={session.platform}
      batchSize={progress.total ?? session.batchSize ?? 10}
      gamesDone={progress.done}
      stages={stages}
      wait={wait}
      readyHref={readyHref}
      puzzles={FLAGS.waitingPuzzles}
      onTouched={() => {
        touchedRef.current = true
      }}
    />
  )
}
