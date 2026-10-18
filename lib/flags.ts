export const FLAGS = {
  progressPage: false,
  reasonGate: false,
} as const

export function reasonGateEnabled(
  where: 'live' | 'fixture',
  env: Record<string, string | undefined> = process.env
): boolean {
  if (env.REASON_GATE === 'on') return true
  if (where === 'fixture') return env.NODE_ENV === 'development'
  return FLAGS.reasonGate
}
