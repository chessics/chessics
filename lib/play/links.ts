import type { PlayMode } from './setup'

export function playHref(mode: PlayMode, gameId: string, ply: number, from?: 'train'): string {
  const base = mode === 'live' ? '/play' : '/dev/play'
  return `${base}?game=${encodeURIComponent(gameId)}&ply=${ply}${from ? `&from=${from}` : ''}`
}

export function backHrefFor(mode: PlayMode, from: string | undefined): string | null {
  if (from !== 'train') return null
  return mode === 'live' ? '/train' : '/dev/train'
}
