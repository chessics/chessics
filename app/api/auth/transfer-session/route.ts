import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { Redis } from '@upstash/redis'
import type { GuestSessionResult } from '@/types/guest'
import { checkLimits, RATE_LIMITS, tooManyRequests, userKey } from '@/lib/ratelimit'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

class TransferError extends Error {
  constructor(readonly step: string, detail: string) {
    super(`${step}: ${detail}`)
  }
}

function check(step: string, error: { message: string } | null): void {
  if (error) throw new TransferError(step, error.message)
}

function failed(step: string): NextResponse {
  return NextResponse.json({ error: 'transfer_failed', step }, { status: 500 })
}

const LOCK_TTL_SECONDS = 120
const GUEST_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RELEASE_IF_OWNER =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end"

type UserClient = Awaited<ReturnType<typeof createClient>>

export async function POST(req: NextRequest): Promise<NextResponse> {
  let sessionToken: string
  try {
    const body = (await req.json()) as { sessionToken?: string }
    sessionToken = body.sessionToken ?? ''
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!sessionToken) {
    return NextResponse.json({ error: 'sessionToken is required' }, { status: 400 })
  }
  if (typeof sessionToken !== 'string' || !GUEST_TOKEN.test(sessionToken)) {
    return NextResponse.json({ error: 'sessionToken must be a UUID' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = user.id

  const limited = await checkLimits([{ rule: RATE_LIMITS.transfer, key: userKey(userId) }])
  if (!limited.allowed) return tooManyRequests(limited)

  const lockKey = `guest:${sessionToken}:transfer-lock`
  const owner = crypto.randomUUID()
  let locked: unknown
  try {
    locked = await redis.set(lockKey, owner, { nx: true, ex: LOCK_TTL_SECONDS })
  } catch (err) {
    console.error('[transfer] could not take the lock:', err)
    return failed('lock')
  }
  if (locked !== 'OK') {
    return NextResponse.json({ error: 'transfer_in_progress' }, { status: 409 })
  }

  try {
    return await transfer(sessionToken, userId, supabase)
  } finally {
    try {
      await redis.eval(RELEASE_IF_OWNER, [lockKey], [owner])
    } catch (err) {
      console.error('[transfer] lock not released:', err)
    }
  }
}

const APPENDS_TTL_SECONDS = 7 * 24 * 3600

interface AppendsDone {
  batchReportId: string
  patterns: string[]
}

function readAppends(raw: unknown): AppendsDone | null {
  if (raw === null || raw === undefined) return null
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw
  const id = (value as { batchReportId?: unknown })?.batchReportId
  const patterns = (value as { patterns?: unknown })?.patterns
  if (typeof id !== 'string' || !id || !Array.isArray(patterns) || !patterns.every(p => typeof p === 'string')) {
    throw new Error('unreadable')
  }
  return { batchReportId: id, patterns }
}

async function transfer(sessionToken: string, userId: string, supabase: UserClient): Promise<NextResponse> {
  const appendsKey = `guest:${sessionToken}:transfer-appends`
  const markAppends = async (done: AppendsDone) => {
    try {
      await redis.set(appendsKey, JSON.stringify(done), { ex: APPENDS_TTL_SECONDS })
    } catch (err) {
      console.error('[transfer] append marker not written; a retry from here would append again:', err)
    }
  }

  const raw = await redis.get(`guest:${sessionToken}:result`)
  if (!raw) {
    return NextResponse.json({ error: 'no_data' }, { status: 404 })
  }

  const guestResult: GuestSessionResult =
    typeof raw === 'string' ? JSON.parse(raw) : (raw as GuestSessionResult)

  let admin: SupabaseClient
  try {
    admin = createServiceClient()
  } catch (err) {
    console.error('[transfer] no service-role client:', err)
    return failed('service client')
  }

  let positionsTransferred = 0

  try {
    const gameIdMap = new Map<string, string>()

    for (const guestGame of guestResult.games) {
      const data = guestGame.analysis_data
      const tempId = data.gameId
      const at = (step: string) => `${step} (game ${guestGame.platform_game_id ?? tempId})`

      const { data: gameRow, error: gameError } = await supabase
        .from('games')
        .upsert(
          {
            user_id: userId,
            pgn: guestGame.pgn,
            platform: guestGame.platform,
            platform_game_id: guestGame.platform_game_id,
            played_at: guestGame.played_at,
            time_control: guestGame.time_control,
            opening_name: guestGame.opening_name,
            opening_eco: guestGame.opening_eco,
            user_color: guestGame.user_color,
            opponent_username: guestGame.opponent_username,
            result: guestGame.result,
            user_rating_at_time: guestGame.user_rating_at_time,
            opponent_rating_at_time: guestGame.opponent_rating_at_time,
            is_analyzed: false,
          },
          { onConflict: 'platform,platform_game_id,user_id', ignoreDuplicates: false }
        )
        .select('id')
        .single()
      check(at('upsert games'), gameError)
      if (!gameRow) throw new TransferError(at('upsert games'), 'no row returned')
      const gameId: string = gameRow.id

      check(at('delete moves'), (await supabase.from('moves').delete().eq('game_id', gameId)).error)
      check(at('delete game_analyses'), (await supabase.from('game_analyses').delete().eq('game_id', gameId)).error)

      if (data.moves.length > 0) {
        const { error } = await supabase.from('moves').insert(data.moves.map(m => ({ ...m, game_id: gameId })))
        check(at('insert moves'), error)
      }

      const { data: gameAnalysis, error: analysisError } = await supabase
        .from('game_analyses')
        .insert({
          game_id: gameId,
          user_id: userId,
          ...data.analysis,
        })
        .select('id')
        .single()
      check(at('insert game_analyses'), analysisError)
      if (!gameAnalysis) throw new TransferError(at('insert game_analyses'), 'no row returned')

      for (const chain of data.causal_chains) {
        const step = at(`insert causal_chains (root ply ${chain.root_move_ply})`)
        const { data: chainRecord, error: chainError } = await supabase
          .from('causal_chains')
          .insert({
            game_analysis_id: gameAnalysis.id,
            root_move_ply: chain.root_move_ply,
            root_move_san: chain.root_move_san,
            root_move_explanation: chain.root_move_explanation,
            terminal_blunder_ply: chain.terminal_blunder_ply,
            terminal_blunder_san: chain.terminal_blunder_san,
            terminal_blunder_explanation: chain.terminal_blunder_explanation,
            chain_explanation: chain.chain_explanation,
          })
          .select('id')
          .single()
        check(step, chainError)
        if (!chainRecord) throw new TransferError(step, 'no row returned')

        if (chain.nodes.length > 0) {
          const { error: nodeError } = await supabase.from('causal_chain_nodes').insert(
            chain.nodes.map(n => ({
              causal_chain_id: chainRecord.id,
              move_ply: n.move_ply,
              move_san: n.move_san,
              explanation: n.explanation,
              order_index: n.order_index,
            }))
          )
          check(at(`insert causal_chain_nodes (root ply ${chain.root_move_ply})`), nodeError)
        }
      }

      if (data.training_positions.length > 0) {
        const { error: tpError } = await admin
          .from('training_positions')
          .upsert(
            data.training_positions.map(tp => ({ ...tp, game_id: gameId })),
            { onConflict: 'game_id,root_ply' }
          )
        check(at('upsert training_positions'), tpError)
        positionsTransferred += data.training_positions.length
      }

      const { data: marked, error: markError } = await supabase
        .from('games')
        .update({ is_analyzed: true })
        .eq('id', gameId)
        .select('id')
      check(at('mark is_analyzed'), markError)
      if (!marked || marked.length !== 1) {
        throw new TransferError(at('mark is_analyzed'), `${marked?.length ?? 0} rows updated, expected 1`)
      }

      gameIdMap.set(tempId, gameId)
    }

    const remap = (tempId: string) => gameIdMap.get(tempId) ?? tempId
    const remappedGroups = (guestResult.pattern_groups ?? []).map((g) => ({
      ...g,
      gameIds: g.gameIds.map(remap),
      exhibit: { ...g.exhibit, gameId: remap(g.exhibit.gameId) },
    }))
    const remappedGameIds = (guestResult.batch_report.game_ids ?? [])
      .map((tempId) => gameIdMap.get(tempId))
      .filter((id): id is string => !!id)

    let done: AppendsDone | null
    try {
      done = readAppends(await redis.get(appendsKey))
    } catch (err) {
      throw new TransferError('read append marker', err instanceof Error ? err.message : String(err))
    }

    if (!done) {
      const { data: insertedBatch, error: batchError } = await supabase
        .from('batch_reports')
        .insert({
          user_id: userId,
          game_count: guestResult.batch_report.game_count,
          calibration_level_used: guestResult.batch_report.calibration_level_used,
          claude_narrative: guestResult.batch_report.claude_narrative,
          overall_accuracy: guestResult.batch_report.overall_accuracy,
          accuracy_delta: null,
          pattern_groups: remappedGroups,
          game_ids: remappedGameIds,
        })
        .select('id')
        .single()
      check('insert batch_reports', batchError)
      if (!insertedBatch) throw new TransferError('insert batch_reports', 'no row returned')
      done = { batchReportId: insertedBatch.id, patterns: [] }
      await markAppends(done)
    }

    const maxScore = remappedGroups[0]?.score ?? 0
    for (const group of remappedGroups) {
      if (done.patterns.includes(group.tag)) continue
      const snapshot = {
        batch_report_id: done.batchReportId,
        frequency: group.frequency,
        occurrences: group.occurrences,
        total_cp: group.totalCp,
        avg_cp: group.avgCp,
        game_count: guestResult.batch_report.game_count,
        at: new Date().toISOString(),
      }
      const urgency = maxScore > 0 ? Math.min(10, Math.round((group.score / maxScore) * 10)) : 0

      const { data: existing, error: existingError } = await supabase
        .from('user_patterns')
        .select('id, frequency_count, batch_history')
        .eq('user_id', userId)
        .eq('pattern_type', group.tag)
        .maybeSingle()
      check(`select user_patterns (${group.tag})`, existingError)

      if (existing) {
        const history = Array.isArray(existing.batch_history) ? existing.batch_history : []
        const { error } = await supabase
          .from('user_patterns')
          .update({
            frequency_count: existing.frequency_count + group.frequency,
            urgency_score: urgency,
            batch_history: [...history, snapshot],
            last_detected_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
        check(`update user_patterns (${group.tag})`, error)
      } else {
        const { error } = await supabase.from('user_patterns').insert({
          user_id: userId,
          pattern_type: group.tag,
          pattern_label: group.label,
          frequency_count: group.frequency,
          trajectory: 'stable',
          urgency_score: urgency,
          batch_history: [snapshot],
        })
        check(`insert user_patterns (${group.tag})`, error)
      }
      done = { ...done, patterns: [...done.patterns, group.tag] }
      await markAppends(done)
    }

    try {
      await Promise.all([
        redis.del(`guest:${sessionToken}:games`),
        redis.del(`guest:${sessionToken}:result`),
        redis.del(appendsKey),
      ])
    } catch (err) {
      console.error('[transfer] transferred, but the guest result was not deleted:', err)
    }

    return NextResponse.json({ success: true, gamesTransferred: gameIdMap.size, positionsTransferred })
  } catch (err) {
    console.error('[transfer] failed; guest result kept for a retry:', err)
    return failed(err instanceof TransferError ? err.step : 'unexpected')
  }
}
