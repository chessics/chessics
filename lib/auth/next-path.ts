import { isUuid } from '@/lib/uuid'

export const DEFAULT_NEXT = '/workbench'

export function loginReviewPath(next: string | null): string {
  if (!next) return DEFAULT_NEXT
  const review = /^\/games\/([^/]+)\/review(?:\?chain=(\d+))?$/.exec(next)
  if (!review || !isUuid(review[1])) return DEFAULT_NEXT
  return `/games/${review[1]}/review${review[2] ? `?chain=${review[2]}` : ''}`
}

export function safeRedirect(origin: string, next: string | null): string {
  const fallback = new URL(DEFAULT_NEXT, origin).toString()
  if (!next || !next.startsWith('/')) return fallback
  let url: URL
  try {
    url = new URL(next, origin)
  } catch {
    return fallback
  }
  return url.origin === new URL(origin).origin ? url.toString() : fallback
}
