import { countNoun } from '@/lib/count-noun'

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

interface WaitStatus {
  status: 'queued' | 'processing' | 'complete' | 'failed'
  stage: number
  stageDetail: string | null
  updatedAt?: string | null
}

export const INITIAL_ESTIMATE = 'Analysis can take several minutes.'

export interface AnalysisWait {
  message: string
  estimate: string | null
}

export function createAnalysisWait() {
  let first: { done: number; total: number; at: number } | null = null
  let lastDone = 0
  return ({ status, stage, stageDetail, updatedAt }: WaitStatus): AnalysisWait => {
    const inMoves = status === 'processing' && stage === 2
    const match = inMoves && stageDetail?.match(DONE_OF)
    const done = match ? Number(match[1]) : 0
    const total = match ? Number(match[2]) : 0
    const at = Date.parse(updatedAt ?? '')
    let estimate: string | null = null
    if (!match || !Number.isFinite(at) || done >= total) {
      first = null
    } else if (!first || total !== first.total || done < lastDone || at < first.at) {
      first = { done, total, at }
    } else if (done > first.done && at > first.at) {
      const remainingMs = (at - first.at) / (done - first.done) * (total - done)
      const duration = remainingMs < 60_000
        ? 'less than a minute'
        : `about ${countNoun(Math.round(remainingMs / 60_000), 'minute')}`
      estimate = `At this pace, the remaining games should take ${duration} to check.`
    }
    lastDone = done

    if (status === 'complete') return { message: 'Your report is ready.', estimate: null }
    if (status === 'failed') return { message: 'Analysis stopped.', estimate: null }
    if (status === 'queued') return { message: 'Waiting for analysis to start.', estimate: INITIAL_ESTIMATE }
    if (stage === 4) return { message: 'Putting your report together.', estimate: null }
    if (stage === 3) return { message: 'Checking which mistakes repeat.', estimate: null }
    if (inMoves) {
      const message = total > 1 && done < total ? `Checking the moves in game ${done + 1}.` : 'Checking your moves.'
      return { message, estimate: estimate ?? INITIAL_ESTIMATE }
    }
    return { message: 'Getting your games ready to check.', estimate: INITIAL_ESTIMATE }
  }
}
