'use client'

import { useEffect, useRef } from 'react'

export type StageStatus = 'pending' | 'active' | 'complete'

export interface FaviconStep {
  lit: number
  done: boolean
}

export function faviconStep(stages: readonly StageStatus[]): FaviconStep {
  const complete = stages.filter((s) => s === 'complete').length
  return { lit: Math.min(complete, 3), done: stages.length > 0 && complete === stages.length }
}

const ESPRESSO = '#1a1512'
const BRASS = '#c9a55c'
const DIM = '#3a3125'
const OXBLOOD = '#c0455a'

const SQUARES: Array<[number, number]> = [
  [2, 2],
  [8, 2],
  [2, 8],
  [8, 8],
]

export function progressFaviconSvg({ lit, done }: FaviconStep): string {
  const rects = SQUARES.map(([x, y], i) => {
    const fill = i < 3 ? (i < lit ? BRASS : DIM) : done ? OXBLOOD : DIM
    return `<rect x="${x}" y="${y}" width="6" height="6" fill="${fill}"/>`
  })
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">' +
    `<rect width="16" height="16" fill="${ESPRESSO}"/>${rects.join('')}</svg>`
  )
}

export function progressFaviconHref(step: FaviconStep): string {
  return `data:image/svg+xml,${encodeURIComponent(progressFaviconSvg(step))}`
}

export const DONE_MARK = '● '

const ICON_ATTRS = ['href', 'type', 'sizes'] as const

export type FaviconDoc = Pick<
  Document,
  | 'title'
  | 'hidden'
  | 'head'
  | 'defaultView'
  | 'querySelectorAll'
  | 'createElement'
  | 'addEventListener'
  | 'removeEventListener'
>

export interface FaviconTakeover {
  show: (step: FaviconStep) => void
  release: () => void
}

let pendingRestore: (() => void) | null = null

export function takeOverFavicon(doc: FaviconDoc): FaviconTakeover {
  pendingRestore?.()

  const originals = new Map<Element, Array<string | null>>()
  let added: Element | null = null
  let href: string | null = null
  let done = false

  const paint = () => {
    if (href === null) return
    const links: Element[] = Array.from(doc.querySelectorAll('link[rel~="icon"]'))
    if (links.length === 0 && added === null) {
      added = doc.createElement('link')
      added.setAttribute('rel', 'icon')
      doc.head.appendChild(added)
      links.push(added)
    }
    for (const link of links) {
      if (!originals.has(link)) originals.set(link, ICON_ATTRS.map((a) => link.getAttribute(a)))
      if (link.getAttribute('href') === href) continue
      link.setAttribute('href', href)
      link.setAttribute('type', 'image/svg+xml')
      link.setAttribute('sizes', 'any')
    }
    if (done && !doc.title.startsWith(DONE_MARK)) doc.title = DONE_MARK + doc.title
  }

  const Observer = doc.defaultView?.MutationObserver
  const observer = Observer ? new Observer(paint) : null
  observer?.observe(doc.head, { childList: true, subtree: true })

  const restore = () => {
    observer?.disconnect()
    href = null
    originals.forEach((attrs, link) =>
      ICON_ATTRS.forEach((a, j) => {
        const value = attrs[j]
        if (value === null) link.removeAttribute(a)
        else link.setAttribute(a, value)
      })
    )
    originals.clear()
    added?.remove()
    if (doc.title.startsWith(DONE_MARK)) doc.title = doc.title.slice(DONE_MARK.length)
  }

  return {
    show(step) {
      href = progressFaviconHref(step)
      done = step.done
      paint()
    },
    release() {
      if (!done || !doc.hidden) return restore()
      const flush = () => {
        doc.removeEventListener('visibilitychange', onVisible)
        if (pendingRestore === flush) pendingRestore = null
        restore()
      }
      const onVisible = () => {
        if (!doc.hidden) flush()
      }
      doc.addEventListener('visibilitychange', onVisible)
      pendingRestore = flush
    },
  }
}

export function useProgressFavicon(stages: readonly StageStatus[]) {
  const { lit, done } = faviconStep(stages)
  const takeover = useRef<FaviconTakeover | null>(null)

  useEffect(() => {
    const t = takeOverFavicon(document)
    takeover.current = t
    return () => {
      takeover.current = null
      t.release()
    }
  }, [])

  useEffect(() => {
    takeover.current?.show({ lit, done })
  }, [lit, done])
}
