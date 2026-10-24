export interface GamesProgress {
  done: number
  total: number | null
}

const FOUND = /^Found (\d+) games?\b/
const DONE_OF = /^(\d+) \/ (\d+) games?\b/
const DONE = /^(\d+)/

export function nextGamesProgress(
  prev: GamesProgress,
  status: { stage?: number | null; stageDetail?: string | null },
  batchSize: number
): GamesProgress {
  let { done, total } = prev
  const detail = status.stageDetail ?? ''

  const doneOf = detail.match(DONE_OF)
  const found = detail.match(FOUND)
  if (doneOf) {
    const t = parseInt(doneOf[2], 10)
    if (t > 0) total = t
    done = Math.max(done, parseInt(doneOf[1], 10))
  } else if (found) {
    const t = parseInt(found[1], 10)
    if (t > 0) total = t
  } else {
    const d = detail.match(DONE)
    if (d) done = Math.max(done, parseInt(d[1], 10))
  }

  if ((status.stage ?? 1) > 2) done = Math.max(done, total ?? batchSize)
  return { done, total }
}
