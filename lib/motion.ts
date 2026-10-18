export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function boardAnimation(durationMs: number): { enabled: boolean; duration: number } {
  return prefersReducedMotion() ? { enabled: false, duration: 0 } : { enabled: true, duration: durationMs }
}

export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth'
}
