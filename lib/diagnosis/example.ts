import { accountInstances, type AccountRows } from './account'
import { buildFindings, type Finding } from './finding'
import type { StandAloneByTag } from './instance'
import { recountGroups } from './recount'
import { reportVerdict } from './verdict'

export const EXAMPLE_INTRO =
  'An example report: one player\'s 10 rapid and blitz games from October 2026, with every name removed. It is written to that player, so "you" is them.'

export const EXAMPLE_SOURCES_NOTE = 'Signed in, each of these games opens its full review.'

export interface ExampleReport {
  gameCount: number
  verdict: string | null
  findings: Finding[]
}

export function exampleReport(rows: AccountRows, gameCount: number): ExampleReport {
  const standAlone: StandAloneByTag = new Map()
  const instances = accountInstances(rows, standAlone)
  const recounted = recountGroups(rows.groups, instances, standAlone)
  const findings = buildFindings(recounted, instances, gameCount)
  const verdict = reportVerdict(null, recounted, gameCount)?.text ?? null

  const order = [...rows.games].sort((a, b) =>
    (a.played_at ?? '') === (b.played_at ?? '') ? (a.id < b.id ? -1 : 1) : (a.played_at ?? '') < (b.played_at ?? '') ? -1 : 1
  )
  const alias = new Map(order.map((g, i) => [g.id, `example-${i + 1}`]))
  const anon = (id: string) => alias.get(id) ?? 'example-unknown'
  const anonKey = (key: string) => {
    const [game, ply] = key.split(':')
    return `${anon(game!)}:${ply}`
  }

  return {
    gameCount,
    verdict,
    findings: findings.map((f) => ({
      ...f,
      boards: f.boards.map((b) => ({ ...b, key: anonKey(b.key) })),
      sources: f.sources.map((s) => ({
        ...s,
        key: anonKey(s.key),
        gameId: anon(s.gameId),
        opponent: null,
        playedAt: s.playedAt ? `${s.playedAt.slice(0, 10)}T12:00:00Z` : null,
      })),
    })),
  }
}
