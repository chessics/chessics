import { nextReturn, type HistoryRow } from './session'
import type { NextStepInteraction, NextStepRow } from './next-step'

export interface SummaryGame {
  id: string
  played_at: string | null
  result: 'win' | 'loss' | 'draw' | null
}

export interface LockedIn {
  position_id: string
  fen: string
  side_to_move: 'white' | 'black'
  best_move: string
  move: string
  returns_at: string | null
  retired: boolean
}

export interface StakesBar {
  result: 'win' | 'loss' | 'draw' | null
  trained: boolean
}

export interface Stakes {
  games: number
  lost: number
  drew: number
  won: number
  strip: StakesBar[]
  older_not_shown: number
}

export interface SessionSummary {
  locked_in: LockedIn[]
  stakes: Stakes | null
}

export const STRIP_GAMES = 30

export function sessionSummary(
  rows: NextStepRow[],
  interactions: NextStepInteraction[],
  sessionId: string,
  games: SummaryGame[],
  now: number
): SessionSummary {
  const byId = new Map(rows.map(r => [r.id, r]))
  const sessionRows = interactions
    .filter(i => i.session_id === sessionId)
    .sort((a, b) => a.presentation_index - b.presentation_index)

  const historyFor = (positionId: string): HistoryRow[] =>
    interactions
      .filter(i => i.position_id === positionId)
      .map(i => ({ position_id: i.position_id, session_id: i.session_id, correct: i.correct, at: i.at }))

  const locked_in: LockedIn[] = []
  for (const i of sessionRows) {
    if (i.correct !== true) continue
    const row = byId.get(i.position_id)
    if (!row || !row.best_move) continue
    const next = nextReturn(historyFor(i.position_id), now)
    locked_in.push({
      position_id: row.id,
      fen: row.fen,
      side_to_move: row.side_to_move === 'black' ? 'black' : 'white',
      best_move: row.best_move,
      move: i.chosen_move ?? row.best_move,
      returns_at: next && !next.retired ? new Date(next.at).toISOString() : null,
      retired: next?.retired === true,
    })
  }

  const trainedGameIds = new Set(
    sessionRows.map(i => byId.get(i.position_id)?.game_id).filter((g): g is string => Boolean(g))
  )
  const trainedGames = games.filter(g => trainedGameIds.has(g.id))

  let stakes: Stakes | null = null
  if (trainedGames.length > 0 && trainedGames.length === trainedGameIds.size && trainedGames.every(g => g.result)) {
    const recent = [...games]
      .filter(g => g.played_at)
      .sort((a, b) => Date.parse(a.played_at!) - Date.parse(b.played_at!))
      .slice(-STRIP_GAMES)
    const drawn = new Set(recent.filter(g => trainedGameIds.has(g.id)).map(g => g.id))

    stakes = {
      games: trainedGames.length,
      lost: trainedGames.filter(g => g.result === 'loss').length,
      drew: trainedGames.filter(g => g.result === 'draw').length,
      won: trainedGames.filter(g => g.result === 'win').length,
      strip: recent.map(g => ({ result: g.result, trained: trainedGameIds.has(g.id) })),
      older_not_shown: trainedGames.filter(g => !drawn.has(g.id)).length,
    }
  }

  return { locked_in, stakes }
}

export function stakesSentences(s: Stakes): [string, string] {
  const n = s.games
  const first =
    n === 1
      ? 'The engine had you ahead in the game this position came from.'
      : `The engine had you ahead in all ${n} games these positions came from.`

  if (n === 1) {
    const how = s.lost ? 'You lost it.' : s.drew ? 'It ended in a draw.' : 'You won it anyway.'
    return [first, how]
  }
  if (s.lost === n) return [first, `You lost all ${n}.`]
  if (s.drew === n) return [first, `All ${n} ended in draws.`]
  if (s.won === n) return [first, `You won all ${n} anyway.`]

  const parts = [
    s.lost ? `lost ${s.lost}` : null,
    s.drew ? `drew ${s.drew}` : null,
    s.won ? `won ${s.won}` : null,
  ].filter((p): p is string => Boolean(p))
  const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  return [first, `You ${joined}.`]
}
