import type { RevealArrow, RevealKind } from '@/lib/training/reveal'

export const SHARE_HEADLINE = 'Can you find what I missed?'

export function sideToMoveText(side: 'white' | 'black'): string {
  return side === 'black' ? 'Black to move' : 'White to move'
}

export function shareLine(gameMoveSan: string): string {
  return `I was ahead here. Then I played ${gameMoveSan}. Find the move that held.`
}

export function shareVerdict(kind: RevealKind): string {
  switch (kind) {
    case 'correct':
      return 'Correct.'
    case 'punish':
      return 'Same move as in the game.'
    case 'reveal_only':
      return 'The engine liked a different move.'
    case 'shown':
      return "Here's the answer."
  }
}

export const SHARE_ARROW_KEY: Record<RevealArrow['role'], string> = {
  held: 'Best move',
  also_held: 'Your move (also holds)',
  mistake: 'Played in the game',
  yours: 'Your move',
  unchecked: 'Your move (not checked by the engine)',
}

export const SHARE_CTA_TEXT = 'Find yours: analyse your own games'
export const SHARE_CTA_HREF = '/'

export const SHARE_BUTTON_TEXT = 'Share this position'
