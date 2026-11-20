export const FLAGS = {
  progressPage: false,
  reviewMoveWhy: false,
  reviewTryFirst: false,
  reviewTheirReply: false,
  reviewSlideBoards: false,
  reviewRelatedGames: false,
  reviewEvalGraph: false,
  trainingMoveReplay: false,
  reasonGate: false,
  standaloneBlunderPositions: false,
  waitingPuzzles: true,
  linkedAccounts: false,
  autoImport: true,
  playerLookup: true,
  sharePositions: false,
} as const

export function reasonGateEnabled(
  where: 'live' | 'fixture',
  env: Record<string, string | undefined> = process.env
): boolean {
  if (env.REASON_GATE === 'on') return true
  if (where === 'fixture') return env.NODE_ENV === 'development'
  return FLAGS.reasonGate
}

export function standaloneBlunderPositionsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.STANDALONE_BLUNDER_POSITIONS === 'on') return true
  return FLAGS.standaloneBlunderPositions
}

export function linkedAccountsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.LINKED_ACCOUNTS === 'on') return true
  return FLAGS.linkedAccounts
}

export function autoImportEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.AUTO_IMPORT === 'off') return false
  return FLAGS.autoImport
}

export function playerLookupEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.PLAYER_LOOKUP === 'off') return false
  return FLAGS.playerLookup
}

export function sharePositionsEnabled(
  where: 'live' | 'fixture',
  env: Record<string, string | undefined> = process.env
): boolean {
  if (where === 'fixture') return env.NODE_ENV === 'development'
  if (env.SHARE_POSITIONS === 'on') return true
  return FLAGS.sharePositions
}

export function trainingMoveReplayEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.TRAINING_MOVE_REPLAY === 'on' || FLAGS.trainingMoveReplay
}

export function reviewMoveWhyEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.REVIEW_MOVE_WHY === 'on' || FLAGS.reviewMoveWhy
}

export function reviewTryFirstEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.REVIEW_TRY_FIRST === 'on' || FLAGS.reviewTryFirst
}

export function reviewTheirReplyEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.REVIEW_THEIR_REPLY === 'on' || FLAGS.reviewTheirReply
}

export function reviewSlideBoardsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.REVIEW_SLIDE_BOARDS === 'on' || FLAGS.reviewSlideBoards
}

export function reviewEvalGraphEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.REVIEW_EVAL_GRAPH === 'on' || FLAGS.reviewEvalGraph
}

export function reviewRelatedGamesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.REVIEW_RELATED_GAMES === 'on' || FLAGS.reviewRelatedGames
}
