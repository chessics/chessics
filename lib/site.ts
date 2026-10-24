export const SITE_NAME = 'Chessics'

export const SITE_TAGLINE = "Find out why you're losing, not just where."

export const SITE_DESCRIPTION =
  'Chessics reviews 10 to 100 of your Chess.com or Lichess games at once, finds the mistake you keep repeating, and trains you on those positions. No signup for your first analysis.'

export const PUBLIC_PATHS = ['/', '/about', '/login', '/signup'] as const

export function siteJsonLd(base: URL = siteUrl()): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE_NAME,
    url: new URL('/', base).toString(),
    description: SITE_DESCRIPTION,
    applicationCategory: 'GameApplication',
    genre: 'Chess game analysis',
    operatingSystem: 'Any (runs in the browser)',
    browserRequirements: 'Requires JavaScript',
    isAccessibleForFree: true,
    license: 'https://www.gnu.org/licenses/agpl-3.0.html',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  }
}

export function jsonLdScript(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

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
