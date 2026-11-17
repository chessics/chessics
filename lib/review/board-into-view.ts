export function boardOutOfView(rect: { top: number; bottom: number }, viewportHeight: number): boolean {
  return rect.top < 0 || rect.bottom > viewportHeight
}

export function bringBoardIntoView(el: HTMLElement | null): void {
  if (!el || typeof window === 'undefined') return
  if (!boardOutOfView(el.getBoundingClientRect(), window.innerHeight)) return
  el.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' })
}
