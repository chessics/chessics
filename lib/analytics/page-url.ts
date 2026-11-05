const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function scrubPageUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const path = parsed.pathname
    .split('/')
    .map((segment) => (UUID_SEGMENT.test(segment) ? '[id]' : segment))
    .join('/')
  return `${parsed.origin}${path}`
}

export function scrubPageEvent<T extends { url: string }>(event: T): T | null {
  const url = scrubPageUrl(event.url)
  return url === null ? null : { ...event, url }
}
