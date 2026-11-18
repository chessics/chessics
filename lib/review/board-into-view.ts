export function boardOutOfView(rect: { top: number; bottom: number }, viewportHeight: number, topInset = 0): boolean {
  return rect.top < topInset || rect.bottom > viewportHeight
}

export function bringBoardIntoView(el: HTMLElement | null): void {
  if (!el || typeof window === 'undefined') return
  const topInset = typeof window.getComputedStyle === 'function'
    ? parseFloat(window.getComputedStyle(el).scrollMarginTop) || 0
    : 0
  if (!boardOutOfView(el.getBoundingClientRect(), window.innerHeight, topInset)) return
  el.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' })
}
