'use client'

import { useEffect, useRef } from 'react'

export function focusWasLost(active: Element | null, doc: { body: Element | null; contains: (n: Node) => boolean }): boolean {
  return active === null || active === doc.body || !doc.contains(active) || active.closest('[aria-hidden="true"]') !== null
}

type Doc = Parameters<typeof focusWasLost>[1]

export function takeFocusIfLost(el: { focus: (o?: FocusOptions) => void } | null, active: Element | null, doc: Doc): boolean {
  if (!el || !focusWasLost(active, doc)) return false
  el.focus({ preventScroll: true })
  return true
}

export function useFocusWhenLost<T extends HTMLElement>(key: unknown) {
  const ref = useRef<T>(null)
  useEffect(() => {
    takeFocusIfLost(ref.current, document.activeElement, document)
  }, [key])
  return ref
}
