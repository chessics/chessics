'use client'

import { useEffect, useRef, useState } from 'react'
import { GAME_DESCRIPTION, LESSON } from './observatory/game'
import type { Observatory } from './observatory/scene'
import styles from './observatory.module.css'

export default function ObservatoryBoard() {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const captionRef = useRef<HTMLSpanElement>(null)
  const sceneRef = useRef<Observatory | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')

  useEffect(() => {
    const stage = stageRef.current, canvas = canvasRef.current, caption = captionRef.current
    if (!stage || !canvas || !caption) return
    let cancelled = false
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return
      observer.disconnect()
      import('./observatory/scene')
        .then(({ mountObservatory }) => {
          if (cancelled) return
          sceneRef.current = mountObservatory({ stage, canvas, caption })
          setStatus('ready')
        })
        .catch(error => {
          console.error(error)
          if (!cancelled) setStatus('failed')
        })
    }, { rootMargin: '200px' })
    observer.observe(stage)
    return () => {
      cancelled = true
      observer.disconnect()
      sceneRef.current?.dispose()
      sceneRef.current = null
    }
  }, [])

  return (
    <div className={styles.stage} ref={stageRef} data-status={status}>
      <canvas ref={canvasRef} className={styles.scene} role="img" aria-label={`${GAME_DESCRIPTION} ${LESSON}`} />
      <span ref={captionRef} className={styles.caption} aria-hidden="true">{LESSON}</span>
      {status === 'failed' && <p className={styles.fallback}>{LESSON}</p>}
    </div>
  )
}
