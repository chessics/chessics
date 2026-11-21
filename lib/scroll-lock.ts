'use client'

import { useEffect } from 'react'

let locks = 0
let saved: { overflow: string; paddingRight: string; overscroll: string } | null = null

export function lockScroll(doc: Document = document): () => void {
  const root = doc.documentElement
  if (locks === 0) {
    const bar = (doc.defaultView?.innerWidth ?? root.clientWidth) - root.clientWidth
    saved = {
      overflow: root.style.overflow,
      paddingRight: root.style.paddingRight,
      overscroll: root.style.overscrollBehavior,
    }
    root.style.overflow = 'hidden'
    root.style.overscrollBehavior = 'none'
    if (bar > 0) root.style.paddingRight = `${bar}px`
    root.setAttribute('data-scroll-locked', '')
  }
  locks++
  let released = false
  return () => {
    if (released) return
    released = true
    locks = Math.max(0, locks - 1)
    if (locks === 0 && saved) {
      root.style.overflow = saved.overflow
      root.style.paddingRight = saved.paddingRight
      root.style.overscrollBehavior = saved.overscroll
      root.removeAttribute('data-scroll-locked')
      saved = null
    }
  }
}

export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    return lockScroll()
  }, [active])
}
