export const SITE_NAME = 'Chessics'

export const SITE_TAGLINE = "Find out why you're losing, not just where."

export const SITE_DESCRIPTION = `${SITE_TAGLINE} No signup required to see your first analysis.`

export const PUBLIC_PATHS = ['/', '/login', '/signup'] as const

type Env = Record<string, string | undefined>

function origin(value: string | undefined, assumeHttps: boolean): URL | null {
  const raw = value?.trim()
  if (!raw) return null
  try {
    const url = new URL(assumeHttps && !/^[a-z]+:\/\//i.test(raw) ? `https://${raw}` : raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return new URL(url.origin)
  } catch {
    return null
  }
}

export function siteUrl(env: Env = process.env): URL {
  return (
    origin(env.NEXT_PUBLIC_SITE_URL, false) ??
    origin(env.VERCEL_PROJECT_PRODUCTION_URL, true) ??
    origin(env.VERCEL_URL, true) ??
    new URL(`http://localhost:${env.PORT || 3000}`)
  )
}
