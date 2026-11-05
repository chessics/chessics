import type { ShareAnswer } from './answer'

export type { ShareAnswer }

export const SHARE_ANSWER_KEYS = [
  'correct',
  'kind',
  'verdict',
  'sentence',
  'best_move',
  'best_move_san',
  'chosen_move',
  'arrows',
  'grading',
] as const satisfies readonly (keyof ShareAnswer)[]

export interface ShareCreated {
  slug: string
  path: string
}

export type ShareCreateError = 'share_revoked' | 'answer_first' | 'not_shareable' | 'too_many_requests' | 'share_failed'

export type ShareMode = 'live' | 'fixture'

export function shareCreateUrl(mode: ShareMode): string {
  return mode === 'live' ? '/api/share' : '/api/dev/share'
}

export function shareCommitUrl(mode: ShareMode, slug: string): string {
  return mode === 'live' ? `/api/share/${encodeURIComponent(slug)}/commit` : `/api/dev/share/${encodeURIComponent(slug)}/commit`
}

export function shareViewUrl(slug: string): string {
  return `/api/share/${encodeURIComponent(slug)}/view`
}
