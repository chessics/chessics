import { blunderStandsAlone, toUserEval } from '../chains/stands-alone'
import { isMateMissWhileWinning, isUserPly, type BlunderMove } from './sittings'
import { countNoun } from '../count-noun'

export function outOfNowhereGames(
  games: readonly { id: string; user_color: 'white' | 'black' | null }[],
  blunders: readonly BlunderMove[]
): Set<string> {
  const colour = new Map(games.map((g) => [g.id, g.user_color]))
  const out = new Set<string>()
  for (const m of blunders) {
    const c = colour.get(m.gameId)
    if (!c || !isUserPly(m.ply, c) || isMateMissWhileWinning(m, c)) continue
    if (m.evalBefore === null || !blunderStandsAlone(toUserEval(m.evalBefore, c))) continue
    if (m.evalAfter === null || blunderStandsAlone(toUserEval(m.evalAfter, c))) continue
    out.add(m.gameId)
  }
  return out
}

export function outOfNowhereSentence(games: number, gameCount: number): string | null {
  if (!(games > 0)) return null
  return `In ${games} of your ${countNoun(gameCount, 'game')}, you threw away a good position with one sudden blunder.`
}
