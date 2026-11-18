import type { Metadata } from 'next'
import { PUBLIC_PATHS, SITE_NAME, SITE_TAGLINE } from './site'

export const SOCIAL_CARD_SIZE = { width: 1200, height: 630 } as const
export const SOCIAL_CARD_ALT = `${SITE_NAME}: ${SITE_TAGLINE}`

export function publicPageMetadata(
  path: typeof PUBLIC_PATHS[number],
  title: string,
  description: string,
  image = { url: '/opengraph-image', alt: SOCIAL_CARD_ALT },
): Metadata {
  const images = [{ ...image, ...SOCIAL_CARD_SIZE }]
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'website', siteName: SITE_NAME, locale: 'en_US', url: path, images },
    twitter: { card: 'summary_large_image', images },
  }
}
