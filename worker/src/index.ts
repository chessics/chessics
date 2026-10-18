import { createClient } from '@supabase/supabase-js'
import { Redis } from '@upstash/redis'
import { checkEngineHealth, engineLabel } from './stockfish.js'
import { buildGameAnalysis, saveGameAnalysis, processGame } from './analysis-processor.js'
import { aggregateRootCauses, upsertUserPatterns } from './pattern-detector.js'
import type { PatternGroup, RootCauseRecord } from './pattern-detector.js'
import { computeTrajectory } from './pattern-detector.js'
import { generateBatchReport } from './claude-service.js'
import type { BatchNarrativeInput } from './claude-service.js'
import type { GameAnalysisData } from './analysis-processor.js'
import { IDLE_POLL_MS, analyseEach, selectGamesForJob } from './job-games.js'

const RECURRING_THRESHOLD = 3
const MAX_HEADLINED = 3

const moveNum = (ply: number) => Math.ceil(ply / 2)

export interface StoredPatternGroup extends PatternGroup {
  recurring: boolean
  insight: string | null
}

async function buildBatchNarrative(
  records: RootCauseRecord[],
  groups: PatternGroup[],
  gameCount: number,
  calibrationLevel: number,
  trajectory: BatchNarrativeInput['trajectory']
): Promise<{ narrative: string; verdict: string; storedGroups: StoredPatternGroup[] }> {
  const recurring = groups.filter(g => g.frequency >= RECURRING_THRESHOLD)
  const headline = recurring[0] ?? null
  const additional = recurring.slice(1, MAX_HEADLINED)

  const costliest = records.length > 0
    ? records.reduce((a, b) => (b.evalSwingCp > a.evalSwingCp ? b : a))
    : null

  const result = await generateBatchReport({
    gameCount,
    calibrationLevel,
    headline: headline
      ? {
          label: headline.label,
          frequency: headline.frequency,
          occurrences: headline.occurrences,
          avgCp: headline.avgCp,
          exhibit: {
            rootSan: headline.exhibit.rootSan,
            rootMoveNumber: moveNum(headline.exhibit.rootPly),
            blunderSan: headline.exhibit.blunderSan,
            blunderMoveNumber: moveNum(headline.exhibit.blunderPly),
          },
        }
      : null,
    additional: additional.map(g => ({ label: g.label, frequency: g.frequency, avgCp: g.avgCp })),
    fallbackChain: costliest
      ? {
          rootSan: costliest.rootSan,
          rootMoveNumber: moveNum(costliest.rootPly),
          blunderSan: costliest.blunderSan,
          blunderMoveNumber: moveNum(costliest.blunderPly),
          swingCp: costliest.evalSwingCp,
        }
      : null,
    trajectory: headline ? trajectory : null,
  })

  const storedGroups: StoredPatternGroup[] = groups.map((g, i) => ({
    ...g,
    recurring: g.frequency >= RECURRING_THRESHOLD,
    insight:
      headline && g.tag === headline.tag
        ? result.verdict
        : additional.some(a => a.tag === g.tag)
          ? result.patternSentences[additional.findIndex(a => a.tag === g.tag)] ?? null
          : null,
  }))

  return { narrative: result.narrative, verdict: result.verdict, storedGroups }
}

const required = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
]
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`)
    process.exit(1)
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

interface AnalysisJob {
  jobId: string
  username: string
  platform: string
  batchSize: number
  calibrationLevel: number
  userId: string | null
  sessionToken: string | null
  gameCount: number
  queuedAt: string
  retryCount?: number
  gameId?: string | null
}

interface GuestGameResult {
  pgn: string
  platform: string
  platform_game_id: string | null
  played_at: string | null
  time_control: string | null
  opening_name: string | null
  opening_eco: string | null
  user_color: 'white' | 'black'
  opponent_username: string | null
  result: 'win' | 'loss' | 'draw'
  user_rating_at_time: number | null
  opponent_rating_at_time: number | null
  analysis_data: GameAnalysisData
}

export interface GuestSessionResult {
  sessionToken: string
  platform: string
  calibration_level: number
  games: GuestGameResult[]
  pattern_groups: StoredPatternGroup[]
  batch_report: {
    game_count: number
    calibration_level_used: number
    claude_narrative: string
    verdict: string
    overall_accuracy: number
    game_ids: string[]
  }
}

interface RawSyncedGame {
  pgn: string
  platform: string
  platform_game_id: string | null
  played_at: string | null
  time_control: string | null
  opening_name: string | null
  opening_eco: string | null
  user_color: 'white' | 'black'
  opponent_username: string | null
  result: 'win' | 'loss' | 'draw'
  user_rating_at_time: number | null
  opponent_rating_at_time: number | null
}

async function updateJobStatus(
  jobId: string,
  status: string,
  stage: number,
  progress: number,
  stageDetail?: string,
  errorMessage?: string
) {
  await redis.set(
    `job:${jobId}`,
    JSON.stringify({ status, stage, progress, stageDetail, errorMessage }),
    { ex: 3600 }
  )
}

async function processGuestJob(job: AnalysisJob): Promise<void> {
  const { sessionToken } = job
  if (!sessionToken) throw new Error('Guest job missing sessionToken')

  await updateJobStatus(job.jobId, 'processing', 1, 5, 'Loading games...')

  const rawGamesJson = await redis.get(`guest:${sessionToken}:games`)
  if (!rawGamesJson) {
    throw new Error('Guest games not found in Redis — sessionToken may have expired')
  }

  const rawGames: RawSyncedGame[] =
    typeof rawGamesJson === 'string' ? JSON.parse(rawGamesJson) : (rawGamesJson as RawSyncedGame[])

  await updateJobStatus(job.jobId, 'processing', 1, 15, `Found ${rawGames.length} games`)

  const allRecords: RootCauseRecord[] = []
  const guestGameResults: GuestGameResult[] = []
  const orderedTempIds: string[] = []

  const { analysed } = await analyseEach(
    rawGames.map(raw => ({ raw, tempId: crypto.randomUUID() })),
    g => g.tempId,
    ({ raw, tempId }) =>
      buildGameAnalysis(
        {
          id: tempId,
          user_id: '',
          pgn: raw.pgn,
          user_color: raw.user_color,
          result: raw.result,
          opening_name: raw.opening_name,
          time_control: raw.time_control,
        },
        job.calibrationLevel
      ),
    (done, total) =>
      updateJobStatus(job.jobId, 'processing', 2, Math.round(15 + (done / total) * 60), `${done} / ${total} games`)
  )
  for (const { item, result } of analysed) {
    allRecords.push(...result.root_cause_records)
    guestGameResults.push({ ...item.raw, analysis_data: result })
    orderedTempIds.push(item.tempId)
  }

  await updateJobStatus(job.jobId, 'processing', 3, 80, 'Clustering root causes...')
  const groups = aggregateRootCauses(allRecords)

  await updateJobStatus(job.jobId, 'processing', 4, 90, 'Generating report...')

  const { narrative, verdict, storedGroups } = await buildBatchNarrative(
    allRecords,
    groups,
    guestGameResults.length,
    job.calibrationLevel,
    null
  )

  const overallAccuracy =
    guestGameResults.length > 0
      ? Math.round(
          guestGameResults.reduce(
            (sum, g) => sum + (g.analysis_data.analysis.overall_accuracy ?? 0),
            0
          ) / guestGameResults.length
        )
      : 0

  const guestResult: GuestSessionResult = {
    sessionToken,
    platform: job.platform,
    calibration_level: job.calibrationLevel,
    games: guestGameResults,
    pattern_groups: storedGroups,
    batch_report: {
      game_count: guestGameResults.length,
      calibration_level_used: job.calibrationLevel,
      claude_narrative: narrative,
      verdict,
      overall_accuracy: overallAccuracy,
      game_ids: orderedTempIds,
    },
  }

  await redis.set(
    `guest:${sessionToken}:result`,
    JSON.stringify(guestResult),
    { ex: 7 * 24 * 3600 }
  )

  await updateJobStatus(job.jobId, 'complete', 4, 100, 'Done!')
  console.log(`Guest job ${job.jobId} complete.`)
}

async function processAuthJob(job: AnalysisJob): Promise<void> {
  const { userId } = job
  if (!userId) throw new Error('Auth job missing userId')

  await updateJobStatus(job.jobId, 'processing', 1, 5, 'Fetching games...')

  const games = await selectGamesForJob(supabase, userId, job)

  await updateJobStatus(job.jobId, 'processing', 1, 15, `Found ${games.length} games`)

  const allRecords: RootCauseRecord[] = []
  const gameAccuracies: number[] = []
  const analyzedGameIds: string[] = []

  const { analysed, failures } = await analyseEach(
    games,
    g => g.id,
    game => processGame(supabase, game, job.calibrationLevel, job.jobId),
    (done, total) =>
      updateJobStatus(job.jobId, 'processing', 2, Math.round(15 + (done / total) * 60), `${done} / ${total} games`)
  )
  for (const { item, result } of analysed) {
    allRecords.push(...result.rootCauseRecords)
    gameAccuracies.push(result.overallAccuracy)
    analyzedGameIds.push(item.id)
  }
  if (failures.length > 0) {
    console.warn(`[worker] job ${job.jobId}: ${failures.length} of ${games.length} games failed and stay unanalysed`)
  }

  await updateJobStatus(job.jobId, 'processing', 3, 80, 'Clustering root causes...')
  const groups = aggregateRootCauses(allRecords)

  await updateJobStatus(job.jobId, 'processing', 4, 90, 'Generating report...')

  const overallAccuracy =
    gameAccuracies.length > 0
      ? Math.round(gameAccuracies.reduce((sum, a) => sum + a, 0) / gameAccuracies.length)
      : null

  const { data: prevBatch } = await supabase
    .from('batch_reports')
    .select('id, overall_accuracy')
    .eq('user_id', userId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const accuracyDelta =
    prevBatch && prevBatch.overall_accuracy !== null && overallAccuracy !== null
      ? Math.round((overallAccuracy - prevBatch.overall_accuracy) * 10) / 10
      : null

  let trajectoryInput: BatchNarrativeInput['trajectory'] = null
  const headlineGroup = groups.find(g => g.frequency >= RECURRING_THRESHOLD) ?? null
  if (prevBatch && headlineGroup) {
    const { data: existingPattern } = await supabase
      .from('user_patterns')
      .select('batch_history')
      .eq('user_id', userId)
      .eq('pattern_type', headlineGroup.tag)
      .maybeSingle()
    const history = Array.isArray(existingPattern?.batch_history) ? existingPattern.batch_history : []
    const previous = history.length > 0 ? history[history.length - 1] : null
    trajectoryInput = {
      headlineLabel: headlineGroup.label,
      direction: computeTrajectory(
        { frequency: headlineGroup.frequency, avgCp: headlineGroup.avgCp, gameCount: analyzedGameIds.length },
        previous
      ),
    }
  }

  let narrative = 'Analysis complete.'
  let storedGroups: StoredPatternGroup[] = []
  try {
    const result = await buildBatchNarrative(
      allRecords,
      groups,
      analyzedGameIds.length,
      job.calibrationLevel,
      trajectoryInput
    )
    narrative = result.narrative
    storedGroups = result.storedGroups
  } catch (err) {
    console.error('Failed to generate batch narrative:', err)
    storedGroups = groups.map(g => ({ ...g, recurring: g.frequency >= RECURRING_THRESHOLD, insight: null }))
  }

  const { data: insertedBatch, error: batchError } = await supabase
    .from('batch_reports')
    .insert({
      user_id: userId,
      game_count: analyzedGameIds.length,
      calibration_level_used: job.calibrationLevel,
      claude_narrative: narrative,
      overall_accuracy: overallAccuracy,
      accuracy_delta: accuracyDelta,
      pattern_groups: storedGroups,
      game_ids: analyzedGameIds,
    })
    .select('id')
    .single()

  if (batchError || !insertedBatch) {
    throw new Error(`Failed to insert batch report: ${batchError?.message}`)
  }

  if (groups.length > 0) {
    await upsertUserPatterns(supabase, userId, groups, insertedBatch.id, analyzedGameIds.length)
  }

  await updateJobStatus(job.jobId, 'complete', 4, 100, 'Done!')

  await supabase
    .from('analysis_jobs')
    .update({
      status: 'complete',
      completed_at: new Date().toISOString(),
    })
    .eq('id', job.jobId)

  console.log(`Auth job ${job.jobId} complete.`)
}

async function processJob(job: AnalysisJob): Promise<void> {
  console.log(`\n=== Processing job ${job.jobId} ===`)
  console.log(`User: ${job.username} | Platform: ${job.platform} | Games: ${job.gameCount}`)
  console.log(`Mode: ${job.userId ? 'auth' : 'guest'}`)

  if (job.userId) {
    await processAuthJob(job)
  } else {
    await processGuestJob(job)
  }
}

async function runWorker() {
  console.log('Chessics analysis worker started.')
  console.log(`Engine: ${engineLabel()}`)
  const health = await checkEngineHealth()
  if (!health.ok) {
    console.error(`[worker] WARNING: engine health check failed for ${health.engine} — jobs will fail until it is reachable`)
  }

  while (true) {
    try {
      const raw = await redis.rpop('analysis:queue')

      if (!raw) {
        await new Promise(r => setTimeout(r, IDLE_POLL_MS))
        continue
      }

      const job: AnalysisJob = typeof raw === 'string' ? JSON.parse(raw) : raw as AnalysisJob
      const retryCount = job.retryCount ?? 0

      try {
        await processJob(job)
      } catch (err) {
        console.error(`Job ${job.jobId} failed:`, err)

        if (retryCount < 2) {
          console.log(`Requeueing job ${job.jobId} (attempt ${retryCount + 1}/2)`)
          await redis.lpush('analysis:queue', JSON.stringify({ ...job, retryCount: retryCount + 1 }))
        } else {
          await updateJobStatus(
            job.jobId,
            'failed',
            0,
            0,
            undefined,
            err instanceof Error ? err.message : 'Unknown error'
          )

          await supabase
            .from('analysis_jobs')
            .update({
              status: 'failed',
              error_message: err instanceof Error ? err.message : 'Unknown error',
              completed_at: new Date().toISOString(),
            })
            .eq('id', job.jobId)
        }
      }
    } catch (err) {
      console.error('Worker loop error:', err)
      await new Promise(r => setTimeout(r, 5000))
    }
  }
}

runWorker()
