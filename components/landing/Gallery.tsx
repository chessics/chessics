'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Pause, Play } from 'lucide-react'
import styles from './landing.module.css'

interface Crop {
  width: number
  height: number
  board: readonly [number, number]
  anchor: readonly [number, number]
  sizes: readonly number[]
}

export interface Slide {
  id: string
  alt: string
  desktop: Crop
  phone: Crop
}

export const SLIDES: readonly Slide[] = [
  {
    id: 'eakins',
    alt: 'A dim parlour: two old men lean over a chessboard on a small table while a third stands between them, watching the board.',
    desktop: { width: 1920, height: 1200, board: [0.5, 0.585], anchor: [0.5, 0.45], sizes: [1280, 1920, 2880] },
    phone: { width: 960, height: 1008, board: [0.5, 0.617], anchor: [0.5, 0.55], sizes: [640, 960, 1280] },
  },
  {
    id: 'maull',
    alt: 'An old photograph: two men in frock coats bent over a chessboard on a small round table, three onlookers crowding behind them.',
    desktop: { width: 1920, height: 1376, board: [0.495, 0.579], anchor: [0.5, 0.3], sizes: [1280, 1920, 2880] },
    phone: { width: 960, height: 1008, board: [0.5, 0.579], anchor: [0.5, 0.4], sizes: [640, 960, 1280] },
  },
  {
    id: 'daumier',
    alt: 'Two men face each other across a chessboard, one resting his chin on his hand, the other leaning in, painted in loose dark strokes.',
    desktop: { width: 1920, height: 1486, board: [0.355, 0.75], anchor: [0.5, 0.5], sizes: [1280, 1920] },
    phone: { width: 960, height: 1008, board: [0.48, 0.75], anchor: [0.5, 0.6], sizes: [640, 960, 1280] },
  },
]

export const HOLD_MS = 7000
export const FADE_MS = 1800

const PHONE = '(max-width: 760px)'

export function cropVars(slide: Slide): CSSProperties {
  const vars: Record<string, string> = {}
  for (const [prefix, crop] of [['d', slide.desktop], ['p', slide.phone]] as const) {
    vars[`--${prefix}-ar`] = String(crop.width / crop.height)
    vars[`--${prefix}-ax`] = String(crop.anchor[0])
    vars[`--${prefix}-ay`] = String(crop.anchor[1])
    vars[`--${prefix}-bx`] = String(crop.board[0])
    vars[`--${prefix}-by`] = String(crop.board[1])
  }
  return vars as CSSProperties
}

const srcSet = (id: string, kind: 'desktop' | 'phone', ext: 'avif' | 'webp', sizes: readonly number[]) =>
  sizes.map(w => `/landing/${id}-${kind}-${w}.${ext} ${w}w`).join(', ')

type Phase = 'shown' | 'leaving' | 'hidden'

export default function Gallery() {
  const [active, setActive] = useState(0)
  const [leaving, setLeaving] = useState<number | null>(null)
  const [rest, setRest] = useState(false)
  const [loaded, setLoaded] = useState<ReadonlySet<number>>(() => new Set())
  const [paused, setPaused] = useState(false)
  const [still, setStill] = useState(false)
  const advanced = useRef(false)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onReduce = () => setStill(reduce.matches)
    onReduce()
    reduce.addEventListener('change', onReduce)
    return () => reduce.removeEventListener('change', onReduce)
  }, [])

  useEffect(() => {
    if (document.readyState === 'complete') { setRest(true); return }
    const onLoad = () => setRest(true)
    window.addEventListener('load', onLoad)
    return () => window.removeEventListener('load', onLoad)
  }, [])

  useEffect(() => {
    if (still || paused || !rest) return
    const next = SLIDES.map((_, step) => (active + step) % SLIDES.length).slice(1).find(i => loaded.has(i))
    if (next === undefined) return
    const timer = window.setTimeout(() => {
      advanced.current = true
      setLeaving(active)
      setActive(next)
    }, advanced.current ? HOLD_MS + FADE_MS : HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [active, paused, still, rest, loaded])

  useEffect(() => {
    if (leaving === null) return
    const timer = window.setTimeout(() => setLeaving(null), FADE_MS)
    return () => window.clearTimeout(timer)
  }, [leaving])

  const phaseOf = (i: number): Phase => (i === active ? 'shown' : i === leaving ? 'leaving' : 'hidden')
  const onLoaded = (i: number) => setLoaded(prev => (prev.has(i) ? prev : new Set(prev).add(i)))

  return (
    <>
      <div className={styles.frame} data-paused={paused || undefined}>
        {SLIDES.map((slide, i) => {
          const render = i === 0 || rest
          return (
            <div key={slide.id} className={styles.slide} data-phase={phaseOf(i)} data-slide={slide.id} aria-hidden={i !== active} style={cropVars(slide)}>
              {render && (
                <div className={styles.art}>
                  <picture>
                    <source media={PHONE} type="image/avif" sizes="100vw" srcSet={srcSet(slide.id, 'phone', 'avif', slide.phone.sizes)} />
                    <source media={PHONE} type="image/webp" sizes="100vw" srcSet={srcSet(slide.id, 'phone', 'webp', slide.phone.sizes)} />
                    <source type="image/avif" sizes="100vw" srcSet={srcSet(slide.id, 'desktop', 'avif', slide.desktop.sizes)} />
                    {/* eslint-disable-next-line @next/next/no-img-element -- art-directed <picture>; next/image cannot switch crops by media query */}
                    <img
                      className={styles.painting}
                      src={`/landing/${slide.id}-desktop-1920.webp`}
                      srcSet={srcSet(slide.id, 'desktop', 'webp', slide.desktop.sizes)}
                      sizes="100vw"
                      width={slide.desktop.width}
                      height={slide.desktop.height}
                      alt={i === active ? slide.alt : ''}
                      fetchPriority={i === 0 ? 'high' : 'low'}
                      onLoad={() => onLoaded(i)}
                      ref={el => { if (el?.complete && el.naturalWidth) onLoaded(i) }}
                    />
                  </picture>
                  <div className={styles.lamp} aria-hidden="true" />
                </div>
              )}
            </div>
          )
        })}
        <div className={styles.shade} aria-hidden="true" />
      </div>
      {!still && (
        <button
          type="button"
          className={styles.pauseButton}
          onClick={() => setPaused(v => !v)}
          aria-label={paused ? 'Play the pictures' : 'Pause the pictures'}
        >
          {paused ? <Play size={16} strokeWidth={1.75} aria-hidden="true" /> : <Pause size={16} strokeWidth={1.75} aria-hidden="true" />}
        </button>
      )}
    </>
  )
}
