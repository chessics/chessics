import type { GuestSessionResult } from '@/types/guest'
import type { InstanceFacts } from './finding'
import { makeInstance, type MoveFacts } from './instance'
import { fatigueLine, type BlunderMove, type FatigueLine, type HistoryGame, type ScopeGame } from './sittings'

export function guestInstances(result: GuestSessionResult): Map<string, InstanceFacts[]> {
  const out = new Map<string, InstanceFacts[]>()
  const groupGames = new Map(result.pattern_groups.map((g) => [g.tag, new Set(g.gameIds)]))
  for (const game of result.games) {
    const data = game.analysis_data
    const gameId = data.gameId
    const byRoot = new Map<number, { tag: string | null; terminal: number }>()
    for (const r of data.root_cause_records ?? []) {
      const prev = byRoot.get(r.rootPly)
      if (!prev || r.blunderPly < prev.terminal) byRoot.set(r.rootPly, { tag: r.patternTag, terminal: r.blunderPly })
    }
    const movesByPly = new Map<number, MoveFacts>(data.moves.map((m) => [m.ply_number, m]))
    const facts = {
      id: gameId,
      played_at: game.played_at,
      opponent_username: game.opponent_username,
      result: game.result,
      user_color: game.user_color,
    }
    for (const [rootPly, { tag, terminal }] of Array.from(byRoot)) {
      if (!tag || !groupGames.get(tag)?.has(gameId)) continue
      const instance = makeInstance(facts, movesByPly, rootPly, terminal)
      if (!instance) continue
      out.set(tag, [...(out.get(tag) ?? []), instance])
    }
  }
  return out
}

export function guestFatigue(result: GuestSessionResult): FatigueLine | null {
  const history: HistoryGame[] = result.games.map((g) => ({
    id: g.analysis_data.gameId,
    platform: g.platform,
    playedAt: g.played_at,
    timeControl: g.time_control,
  }))
  const scope: ScopeGame[] = result.games.map((g) => ({
    id: g.analysis_data.gameId,
    playedAt: g.played_at,
    opponent: g.opponent_username,
    result: g.result,
    userColor: g.user_color,
    analysed: g.analysis_data.moves.length > 0,
  }))
  const blunders: BlunderMove[] = result.games.flatMap((g) =>
    g.analysis_data.moves
      .filter((m) => m.classification === 'blunder')
      .map((m) => ({ gameId: g.analysis_data.gameId, ply: m.ply_number, evalBefore: m.eval_before, evalAfter: m.eval_after }))
  )
  return fatigueLine(history, scope, blunders)
}
