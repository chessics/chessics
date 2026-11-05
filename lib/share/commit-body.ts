const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/

export function parseShareCommitBody(raw: unknown): { chosen_move: string | null } | string {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'body must be an object'
  const b = raw as Record<string, unknown>
  if (!('chosen_move' in b)) return 'chosen_move is required (UCI, or null for "just show me")'
  if (b.chosen_move === null) return { chosen_move: null }
  if (typeof b.chosen_move !== 'string' || !UCI.test(b.chosen_move.toLowerCase())) {
    return 'chosen_move must be UCI, e.g. g1f3 or e7e8q, or null'
  }
  return { chosen_move: b.chosen_move.toLowerCase() }
}
