import type { BoardHabit } from './board-habits'

interface CountedGame {
  id: string
  played_at: string
  occurrences: number
}

interface ProofInput {
  habit: BoardHabit
  games: readonly CountedGame[]
  triggerGameId: string
  practiceFinishedAt: string
}

interface Check {
  games: number
  expected: number
  allowed: number
}

interface Proof {
  status: 'unavailable' | 'before' | 'counting' | 'passed' | 'not-yet' | 'not-proven'
  message: string
  checks: Check[]
}

const limit = 80
const actions: Record<BoardHabit, string> = {
  'a piece you just moved': 'leave a piece you just moved where it can be taken',
  'what their last move attacks': 'leave a piece where their last move attacked it and they can take it',
}

function mostAllowed(expected: number): number {
  let logMass = -expected
  let cumulative = Math.exp(logMass)
  let count = 0
  while (cumulative <= 0.02) {
    count++
    logMass += Math.log(expected) - Math.log(count)
    cumulative += Math.exp(logMass)
  }
  return count - 1
}

function gamesText(n: number): string {
  return n === 1 ? '1 game' : `${n} games`
}

function timesText(n: number): string {
  return n === 1 ? '1 time' : `${n} times`
}

function comparison(count: number, expected: number): string {
  const rounded = Math.round(expected)
  return count < rounded ? `down from about ${rounded}` : `against about ${rounded} before`
}

export function proveIt({ habit, games, triggerGameId, practiceFinishedAt }: ProofInput): Proof {
  const finished = Date.parse(practiceFinishedAt)
  if (!Number.isFinite(finished) || games.some(g => !Number.isFinite(Date.parse(g.played_at))
    || !Number.isSafeInteger(g.occurrences) || g.occurrences < 0)) {
    throw new RangeError('Prove it requires dated games with whole, nonnegative habit counts and a practice completion date.')
  }
  const ordered = [...games].sort((a, b) => Date.parse(a.played_at) - Date.parse(b.played_at) || a.id.localeCompare(b.id))
  const trigger = ordered.findIndex(game => game.id === triggerGameId)
  const end = trigger + 1 - 20
  if (end < 40) {
    return { status: 'unavailable', message: 'Not enough earlier games to compare with.', checks: [] }
  }

  const baseline = ordered.slice(Math.max(0, end - 100), end)
  const oldCount = baseline.reduce((sum, game) => sum + game.occurrences, 0)
  const checks: Check[] = []
  for (let n = Math.ceil(8 * baseline.length / oldCount); n <= limit; n += 10) {
    const expected = n * oldCount / baseline.length
    checks.push({ games: n, expected, allowed: mostAllowed(expected) })
  }
  if (!checks.length) {
    return { status: 'unavailable', message: 'This happened too rarely in your earlier games to set a test.', checks }
  }

  const post = ordered.slice(trigger + 1).filter(g => Date.parse(g.played_at) >= finished).slice(0, limit)
  const n = post.length
  const first = checks[0]
  if (n === 0) {
    const window = gamesText(first.games)
    const message = `Your test. Over your next ${window}, ${actions[habit]} at most ${timesText(first.allowed)}. `
      + `Before this chapter you did it about ${timesText(Math.round(first.expected))} in ${window}.`
    return { status: 'before', checks, message }
  }

  let count = 0
  let index = 0
  for (let i = 0; i < n; i++) {
    count += post[i].occurrences
    const check = checks[index]
    if (i + 1 !== check?.games) continue
    if (count <= check.allowed) {
      const period = check.games === 1 ? 'game' : gamesText(check.games)
      const message = `Passed. ${count} in your first ${period} after practice. `
        + `You used to do it about ${timesText(Math.round(check.expected))} in ${check.games}. `
        + 'A drop that big happens by luck less than 2 times in 100.'
      return { status: 'passed', checks, message }
    }
    index++
  }

  if (n === limit) {
    const expected = n * oldCount / baseline.length
    const change = count < Math.round(expected) ? 'Some better, not clearly. ' : ''
    return { status: 'not-proven', checks, message: `Not proven after 80 games. ${count} in 80, against about ${Math.round(expected)} before. ${change}Reopen this chapter for fresh practice positions.` }
  }
  const next = checks[index]
  const remaining = next
    ? `${gamesText(next.games - n)} to go before the ${index === 0 ? 'first' : 'next'} check.`
    : `${gamesText(limit - n)} to go before the test ends.`
  const last = checks[index - 1]
  if (last?.games === n) {
    const target = next ? `The next check allows at most ${next.allowed} in ${next.games} games, 10 games from now.` : remaining
    return { status: 'not-yet', checks, message: `Not yet. ${count} in ${gamesText(n)}, ${comparison(count, last.expected)}. That could still be luck. ${target}` }
  }
  return { status: 'counting', checks, message: `${count} so far, in ${gamesText(n)}. ${remaining}` }
}
