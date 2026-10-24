import { revealVerdict, type RevealKind } from './reveal'
import { NOTHING_TO_TRAIN, NOTHING_TO_TRAIN_TITLE } from './empty'

export type AnnouncePhase =
  | { name: 'loading' | 'intro' | 'signin' | 'committing' }
  | { name: 'board' }
  | { name: 'punish' | 'reveal' | 'threat'; kind: RevealKind; watched: boolean }
  | { name: 'done'; openLoop?: string }
  | { name: 'error'; message: string }

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1)
}

export function announcement(p: AnnouncePhase): string {
  switch (p.name) {
    case 'board':
      return 'Your move.'
    case 'punish':
      return p.kind === 'punish' && !p.watched
        ? 'Commit recorded: same move as your game, and its line is playing.'
        : 'Your game line is playing.'
    case 'reveal':
      return p.watched || p.kind === 'punish' ? revealVerdict(p.kind) : `Commit recorded: ${lowerFirst(revealVerdict(p.kind))}`
    case 'threat':
      return 'The threat is playing.'
    case 'done':
      return p.openLoop === NOTHING_TO_TRAIN ? NOTHING_TO_TRAIN_TITLE : 'Session finished.'
    case 'error':
      return p.message
    default:
      return ''
  }
}
