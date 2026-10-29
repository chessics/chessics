export const FLAGS = {
  progressPage: false,
  reasonGate: false,
  standaloneBlunderPositions: false,
  waitingPuzzles: true,
  autoImport: true,
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

export function autoImportEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.AUTO_IMPORT === 'off') return false
  return FLAGS.autoImport
}
