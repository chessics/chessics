import type { GroupFacts, InstanceFacts } from './finding'
import { makeInstance, noteStandAlone, terminalStoodAlone, type GameFacts, type MoveFacts, type StandAloneByTag } from './instance'

export interface AccountRows {
  groups: GroupFacts[]
  games: GameFacts[]
  analyses: { id: string; game_id: string }[]
  chains: { game_analysis_id: string; root_move_ply: number; terminal_blunder_ply: number }[]
  positions: { game_id: string; root_ply: number; tag: string | null }[]
  moves: (MoveFacts & { game_id: string })[]
}

export function pliesNeeded(rows: Pick<AccountRows, 'groups' | 'analyses' | 'chains' | 'positions'>): number[] {
  const terminals = earliestTerminals(rows.analyses, rows.chains)
  const plies = new Set<number>()
  for (const p of rows.positions) {
    plies.add(p.root_ply)
    const t = terminals.get(`${p.game_id}:${p.root_ply}`)
    if (t !== undefined) plies.add(t)
  }
  for (const g of rows.groups) {
    plies.add(g.exhibit.rootPly)
    plies.add(g.exhibit.blunderPly)
    const t = terminals.get(`${g.exhibit.gameId}:${g.exhibit.rootPly}`)
    if (t !== undefined) plies.add(t)
  }
  return Array.from(plies).sort((a, b) => a - b)
}

function earliestTerminals(
  analyses: AccountRows['analyses'],
  chains: AccountRows['chains']
): Map<string, number> {
  const gameOf = new Map(analyses.map((a) => [a.id, a.game_id]))
  const out = new Map<string, number>()
  for (const c of chains) {
    const gameId = gameOf.get(c.game_analysis_id)
    if (!gameId) continue
    const key = `${gameId}:${c.root_move_ply}`
    const prev = out.get(key)
    if (prev === undefined || c.terminal_blunder_ply < prev) out.set(key, c.terminal_blunder_ply)
  }
  return out
}

export function accountInstances(rows: AccountRows, standAlone?: StandAloneByTag): Map<string, InstanceFacts[]> {
  const terminals = earliestTerminals(rows.analyses, rows.chains)
  const gamesById = new Map(rows.games.map((g) => [g.id, g]))
  const movesByGame = new Map<string, Map<number, MoveFacts>>()
  for (const m of rows.moves) {
    const byPly = movesByGame.get(m.game_id) ?? new Map<number, MoveFacts>()
    byPly.set(m.ply_number, m)
    movesByGame.set(m.game_id, byPly)
  }
  const gamesWithPositions = new Set(rows.positions.map((p) => p.game_id))
  const analysed = new Set(rows.analyses.map((a) => a.game_id))

  const out = new Map<string, InstanceFacts[]>()
  for (const g of rows.groups) {
    const inGroup = new Set(g.gameIds)
    const roots = rows.positions
      .filter((p) => p.tag === g.tag && inGroup.has(p.game_id))
      .filter((p) => terminals.has(`${p.game_id}:${p.root_ply}`) || !analysed.has(p.game_id))
      .map((p) => ({ gameId: p.game_id, rootPly: p.root_ply }))
    if (!gamesWithPositions.has(g.exhibit.gameId)) {
      roots.push({ gameId: g.exhibit.gameId, rootPly: g.exhibit.rootPly })
    }
    const instances: InstanceFacts[] = []
    for (const r of roots) {
      const game = gamesById.get(r.gameId)
      if (!game) continue
      const key = `${r.gameId}:${r.rootPly}`
      const terminal =
        terminals.get(key) ?? (r.gameId === g.exhibit.gameId && r.rootPly === g.exhibit.rootPly ? g.exhibit.blunderPly : null)
      const byPly = movesByGame.get(r.gameId) ?? new Map<number, MoveFacts>()
      if (terminalStoodAlone(game, byPly, terminal)) noteStandAlone(standAlone, g.tag, r.gameId)
      const instance = makeInstance(game, byPly, r.rootPly, terminal)
      if (instance) instances.push(instance)
    }
    out.set(g.tag, instances)
  }
  return out
}
