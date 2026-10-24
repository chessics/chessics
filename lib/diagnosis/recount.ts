import { RECURRING_GAMES, type GroupFacts, type InstanceFacts } from './finding'

export function recountGroups<G extends GroupFacts>(
  groups: readonly G[],
  instancesByTag: ReadonlyMap<string, readonly InstanceFacts[]>,
  standAlone: ReadonlyMap<string, ReadonlySet<string>>,
): G[] {
  const out: G[] = []
  for (const g of groups) {
    const real = new Set((instancesByTag.get(g.tag) ?? []).map((i) => i.gameId))
    const alone = standAlone.get(g.tag)
    const gameIds = g.gameIds.filter((id) => real.has(id) || !alone?.has(id))
    if (gameIds.length === 0) continue
    out.push({ ...g, gameIds, frequency: gameIds.length, recurring: gameIds.length >= RECURRING_GAMES })
  }
  return out
}

export function groupChanged(stored: GroupFacts, recounted: GroupFacts | undefined): boolean {
  return !recounted || recounted.frequency !== stored.frequency || recounted.recurring !== stored.recurring
}
