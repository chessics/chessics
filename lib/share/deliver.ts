import { TOO_MANY_REQUESTS_MESSAGE } from '@/lib/ratelimit-message'
import { SHARE_HEADLINE } from './words'

export interface ShareNavigator {
  share?: (data: ShareData) => Promise<void>
  canShare?: (data: ShareData) => boolean
  clipboard?: { writeText: (text: string) => Promise<void> }
}

export type Delivery = 'shared' | 'cancelled' | 'copied' | 'manual'

export async function deliverLink(url: string, nav: ShareNavigator): Promise<Delivery> {
  const data: ShareData = { title: SHARE_HEADLINE, text: SHARE_HEADLINE, url }
  if (typeof nav.share === 'function' && (typeof nav.canShare !== 'function' || nav.canShare(data))) {
    try {
      await nav.share(data)
      return 'shared'
    } catch (err) {
      if ((err as { name?: string } | null)?.name === 'AbortError') return 'cancelled'
    }
  }
  try {
    if (!nav.clipboard) return 'manual'
    await nav.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'manual'
  }
}

export function shareUrl(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, '')}${path}`
}

export function shareFailureMessage(status: number, code: string | undefined): string {
  if (status === 429) return TOO_MANY_REQUESTS_MESSAGE
  if (code === 'share_revoked') return "This position's link was turned off."
  if (code === 'answer_first') return 'Commit an answer here first.'
  if (code === 'not_shareable') return "This position can't be shared."
  return "The link didn't save. Try again."
}
