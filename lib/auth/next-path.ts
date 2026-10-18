export const DEFAULT_NEXT = '/workbench'

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
