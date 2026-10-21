import type { EvaluatedMove } from './stockfish.js'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface DetectedPattern {
  patternType: string
  patternLabel: string
  movesPly: number[]
  context: string
}

const MATE_SCORE_CP = 9000
const STILL_WINNING_CP = 500

export function isMateMissWhileWinning(
  evalBefore: number,
  evalAfter: number,
  userColor: 'white' | 'black'
): boolean {
  const before = userColor === 'white' ? evalBefore : -evalBefore
  const after = userColor === 'white' ? evalAfter : -evalAfter
  return before >= MATE_SCORE_CP && after >= STILL_WINNING_CP
}

export const OPENING_PHASE_TAGS: ReadonlySet<string> = new Set(['opening_preparation_gap'])

export function parseTimeControl(
  tc: string | null | undefined
): { baseSeconds: number; incrementSeconds: number } | null {
  if (!tc) return null
  const m = tc.trim().match(/^(\d+)(?:\+(\d+))?$/)
  if (!m) return null
  return { baseSeconds: Number(m[1]), incrementSeconds: m[2] ? Number(m[2]) : 0 }
}

export function pgnTimeControl(pgn: string): string | null {
  const m = pgn.match(/\[TimeControl\s+"([^"]*)"\]/)
  return m ? m[1]! : null
}

export function isThreeZeroBlitz(timeControl: string | null | undefined, pgn: string): boolean {
  const tc = parseTimeControl(timeControl) ?? parseTimeControl(pgnTimeControl(pgn))
  return tc !== null && tc.baseSeconds === 180 && tc.incrementSeconds === 0
}

const NO_TAGS_WITHHELD: ReadonlySet<string> = new Set()

export function withheldTagsFor(game: { time_control?: string | null; pgn: string }): ReadonlySet<string> {
  return isThreeZeroBlitz(game.time_control, game.pgn) ? OPENING_PHASE_TAGS : NO_TAGS_WITHHELD
}

export function detectGamePatterns(
  moves: EvaluatedMove[],
  userColor: 'white' | 'black'
): DetectedPattern[] {
  const patterns: DetectedPattern[] = []

  const isUserPly = (ply: number) =>
    userColor === 'white' ? ply % 2 === 1 : ply % 2 === 0
  const userEval = (whitePerspectiveCp: number) =>
    userColor === 'white' ? whitePerspectiveCp : -whitePerspectiveCp

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i]
    if (!move) continue
    if (!isUserPly(move.ply)) continue

    const effDelta = isMateMissWhileWinning(move.eval_before, move.eval_after, userColor)
      ? 0
      : move.eval_delta

    if (move.classification === 'blunder' && effDelta > 300) {
      patterns.push({
        patternType: 'hanging_piece',
        patternLabel: 'Hanging Piece',
        movesPly: [move.ply],
        context: `${move.san} lost material at move ${Math.ceil(move.ply / 2)}`,
      })
    }

    if (move.classification === 'blunder' && move.ply > 30) {
      patterns.push({
        patternType: 'weak_back_rank',
        patternLabel: 'Weak Back Rank',
        movesPly: [move.ply],
        context: `Blunder in late game at move ${Math.ceil(move.ply / 2)}`,
      })
    }

    if (move.classification === 'inaccuracy' && i + 1 < moves.length) {
      const next = moves[i + 1]
      if (next && next.eval_delta < -150) {
        patterns.push({
          patternType: 'missed_tactical_shot',
          patternLabel: 'Missed Tactical Shot',
          movesPly: [move.ply],
          context: `Missed opportunity at move ${Math.ceil(move.ply / 2)}`,
        })
      }
    }

    if (move.classification === 'blunder' && move.ply > 60) {
      patterns.push({
        patternType: 'time_pressure_blunder',
        patternLabel: 'Time Pressure Blunder',
        movesPly: [move.ply],
        context: `Blunder in move ${Math.ceil(move.ply / 2)} — likely time pressure`,
      })
    }

    if (move.ply > 70 && (move.classification === 'mistake' || move.classification === 'blunder')) {
      patterns.push({
        patternType: 'failed_endgame_conversion',
        patternLabel: 'Failed Endgame Conversion',
        movesPly: [move.ply],
        context: `${move.classification} at move ${Math.ceil(move.ply / 2)} in endgame`,
      })
    }

    if (move.san.includes('x') && move.ply >= 20 && move.ply <= 50 && move.classification === 'mistake' && effDelta > 120) {
      patterns.push({
        patternType: 'premature_piece_exchange',
        patternLabel: 'Premature Piece Exchange',
        movesPly: [move.ply],
        context: `Unfavorable exchange at move ${Math.ceil(move.ply / 2)}`,
      })
    }

    if (move.ply >= 30 && move.ply <= 70 && move.classification === 'blunder') {
      patterns.push({
        patternType: 'king_safety',
        patternLabel: 'King Safety Issue',
        movesPly: [move.ply],
        context: `King exposed at move ${Math.ceil(move.ply / 2)}`,
      })
    }

    if (i >= 4 && move.classification === 'inaccuracy') {
      const prev1 = moves[i - 2]
      const prev2 = moves[i - 4]
      if (
        prev1?.classification === 'inaccuracy' &&
        prev2?.classification === 'inaccuracy'
      ) {
        patterns.push({
          patternType: 'poor_piece_coordination',
          patternLabel: 'Poor Piece Coordination',
          movesPly: [prev2.ply, prev1.ply, move.ply],
          context: `Three consecutive inaccuracies around move ${Math.ceil(move.ply / 2)}`,
        })
      }
    }

    if (i + 1 < moves.length) {
      const next = moves[i + 1]
      if (next && userEval(move.eval_after) > 500 && userEval(next.eval_after) < 100) {
        patterns.push({
          patternType: 'missed_mating_pattern',
          patternLabel: 'Missed Mating Pattern',
          movesPly: [move.ply],
          context: `Winning position collapsed at move ${Math.ceil(move.ply / 2)}`,
        })
      }
    }

    const isPawnMove = /^[a-h]/.test(move.san)
    if (isPawnMove && move.ply >= 10 && move.ply <= 80 && effDelta >= 80 && effDelta <= 150) {
      patterns.push({
        patternType: 'pawn_structure_weakness',
        patternLabel: 'Pawn Structure Weakness',
        movesPly: [move.ply],
        context: `Pawn move ${move.san} weakened structure at move ${Math.ceil(move.ply / 2)}`,
      })
    }

    if (move.ply <= 30 && (move.classification === 'mistake' || move.classification === 'blunder')) {
      patterns.push({
        patternType: 'opening_preparation_gap',
        patternLabel: 'Opening Preparation Gap',
        movesPly: [move.ply],
        context: `${move.classification} in opening at move ${Math.ceil(move.ply / 2)}`,
      })
    }

    if (move.ply >= 20 && move.ply <= 60 && move.classification === 'blunder' && effDelta > 250) {
      if (i + 1 < moves.length) {
        const next = moves[i + 1]
        if (next && next.eval_delta < -200) {
          patterns.push({
            patternType: 'missed_knight_fork',
            patternLabel: 'Missed Knight Fork',
            movesPly: [move.ply],
            context: `Possible fork opportunity missed at move ${Math.ceil(move.ply / 2)}`,
          })
        }
      }
    }

    const isBishopCapture = move.san.startsWith('B') && move.san.includes('x')
    if (isBishopCapture && move.ply >= 20 && move.ply <= 80 && effDelta >= 80 && effDelta <= 180) {
      patterns.push({
        patternType: 'bad_bishop_trade',
        patternLabel: 'Bad Bishop Trade',
        movesPly: [move.ply],
        context: `Bishop capture ${move.san} was unfavorable at move ${Math.ceil(move.ply / 2)}`,
      })
    }

    if (move.ply > 60 && move.classification === 'inaccuracy') {
      patterns.push({
        patternType: 'passive_rook_endgame',
        patternLabel: 'Passive Rook in Endgame',
        movesPly: [move.ply],
        context: `Endgame inaccuracy at move ${Math.ceil(move.ply / 2)} — possible passive rook`,
      })
    }
  }

  return patterns
}

export interface RootCauseRecord {
  gameId: string
  blunderSan: string
  blunderPly: number
  evalSwingCp: number
  rootSan: string
  rootPly: number
  patternTag: string | null
  patternLabel: string | null
  chainPlies: number[]
}

const TAG_PRIORITY = [
  'missed_knight_fork',
  'bad_bishop_trade',
  'pawn_structure_weakness',
  'premature_piece_exchange',
  'missed_tactical_shot',
  'missed_mating_pattern',
  'hanging_piece',
  'opening_preparation_gap',
  'king_safety',
  'passive_rook_endgame',
  'poor_piece_coordination',
  'failed_endgame_conversion',
  'time_pressure_blunder',
  'weak_back_rank',
]

function bestByPriority(patterns: DetectedPattern[]): { tag: string; label: string } | null {
  if (patterns.length === 0) return null
  const sorted = [...patterns].sort(
    (a, b) => TAG_PRIORITY.indexOf(a.patternType) - TAG_PRIORITY.indexOf(b.patternType)
  )
  return { tag: sorted[0]!.patternType, label: sorted[0]!.patternLabel }
}

export function primaryTagForRoot(
  rootPly: number,
  gamePatterns: DetectedPattern[]
): { tag: string; label: string } | null {
  return bestByPriority(gamePatterns.filter(p => p.movesPly.includes(rootPly)))
}

export const CHAIN_SEVERITY_CP = 200

export interface ChainRootContext {
  rootPly: number
  chainSwingCp: number
  intermediateNodeCount: number
}

export function detectChainRootPatterns(
  moves: EvaluatedMove[],
  userColor: 'white' | 'black',
  ctx: ChainRootContext
): DetectedPattern[] {
  const i = moves.findIndex(m => m.ply === ctx.rootPly)
  if (i === -1) return []
  const root = moves[i]!
  const next = i + 1 < moves.length ? moves[i + 1] : null
  const userEval = (whitePerspectiveCp: number) =>
    userColor === 'white' ? whitePerspectiveCp : -whitePerspectiveCp

  const patterns: DetectedPattern[] = []
  const add = (patternType: string, patternLabel: string, context: string) =>
    patterns.push({ patternType, patternLabel, movesPly: [root.ply], context })
  const moveNum = Math.ceil(root.ply / 2)

  if (root.san.includes('x') && root.ply >= 20 && root.ply <= 50) {
    add('premature_piece_exchange', 'Premature Piece Exchange', `Exchange ${root.san} at move ${moveNum} started a losing sequence`)
  }
  if (root.san.startsWith('B') && root.san.includes('x') && root.ply >= 20 && root.ply <= 80 && root.eval_delta <= 180) {
    add('bad_bishop_trade', 'Bad Bishop Trade', `Bishop capture ${root.san} at move ${moveNum} started a losing sequence`)
  }
  if (/^[a-h]/.test(root.san) && root.ply >= 10 && root.ply <= 80 && root.eval_delta <= 150) {
    add('pawn_structure_weakness', 'Pawn Structure Weakness', `Pawn move ${root.san} at move ${moveNum} weakened the structure`)
  }
  if (root.ply >= 20 && root.ply <= 60 && next && next.eval_delta < -200) {
    add('missed_knight_fork', 'Missed Knight Fork', `Possible fork opportunity missed at move ${moveNum}`)
  }
  if (next && next.san.includes('x') && next.eval_delta < -150) {
    add('hanging_piece', 'Hanging Piece', `${root.san} at move ${moveNum} was punished by ${next.san}`)
  }
  if (next && next.eval_delta < -150) {
    add('missed_tactical_shot', 'Missed Tactical Shot', `Missed opportunity at move ${moveNum}`)
  }
  if (next && userEval(root.eval_after) > 500 && userEval(next.eval_after) < 100) {
    add('missed_mating_pattern', 'Missed Mating Pattern', `Winning position collapsed at move ${moveNum}`)
  }

  if (ctx.chainSwingCp >= CHAIN_SEVERITY_CP) {
    if (root.ply > 30) {
      add('weak_back_rank', 'Weak Back Rank', `Late-game decline began at move ${moveNum}`)
    }
    if (root.ply >= 30 && root.ply <= 70) {
      add('king_safety', 'King Safety Issue', `King exposed at move ${moveNum}`)
    }
    if (root.ply > 60) {
      add('time_pressure_blunder', 'Time Pressure Blunder', `Decline from move ${moveNum} — likely time pressure`)
    }
    if (root.ply > 70) {
      add('failed_endgame_conversion', 'Failed Endgame Conversion', `Endgame decline began at move ${moveNum}`)
    }
    if (root.ply <= 30) {
      add('opening_preparation_gap', 'Opening Preparation Gap', `Opening decline began at move ${moveNum}`)
    }
    if (ctx.intermediateNodeCount >= 2) {
      add('poor_piece_coordination', 'Poor Piece Coordination', `Multi-move deterioration from move ${moveNum}`)
    }
  }

  return patterns
}

export function primaryTagForChainRoot(
  moves: EvaluatedMove[],
  userColor: 'white' | 'black',
  ctx: ChainRootContext,
  gamePatterns: DetectedPattern[],
  withheld: ReadonlySet<string> = NO_TAGS_WITHHELD
): { tag: string; label: string } | null {
  const rootSpecific = detectChainRootPatterns(moves, userColor, ctx).filter(p => !withheld.has(p.patternType))
  const standalone = gamePatterns.filter(p => p.movesPly.includes(ctx.rootPly) && !withheld.has(p.patternType))
  const seen = new Set(rootSpecific.map(p => p.patternType))
  return bestByPriority([...rootSpecific, ...standalone.filter(p => !seen.has(p.patternType))])
}

export interface PatternGroup {
  tag: string
  label: string
  gameIds: string[]
  frequency: number
  occurrences: number
  totalCp: number
  avgCp: number
  score: number
  exhibit: {
    gameId: string
    rootPly: number
    rootSan: string
    blunderPly: number
    blunderSan: string
    swingCp: number
  }
}

export function aggregateRootCauses(records: RootCauseRecord[]): PatternGroup[] {
  const byTag = new Map<string, RootCauseRecord[]>()
  for (const r of records) {
    if (!r.patternTag) continue
    const list = byTag.get(r.patternTag) ?? []
    list.push(r)
    byTag.set(r.patternTag, list)
  }

  const groups: PatternGroup[] = []
  for (const [tag, recs] of byTag) {
    const gameIds = [...new Set(recs.map(r => r.gameId))]
    const totalCp = recs.reduce((sum, r) => sum + r.evalSwingCp, 0)
    const worst = recs.reduce((a, b) => (b.evalSwingCp > a.evalSwingCp ? b : a))
    groups.push({
      tag,
      label: recs[0]!.patternLabel ?? tag,
      gameIds,
      frequency: gameIds.length,
      occurrences: recs.length,
      totalCp,
      avgCp: Math.round(totalCp / recs.length),
      score: gameIds.length * totalCp,
      exhibit: {
        gameId: worst.gameId,
        rootPly: worst.rootPly,
        rootSan: worst.rootSan,
        blunderPly: worst.blunderPly,
        blunderSan: worst.blunderSan,
        swingCp: worst.evalSwingCp,
      },
    })
  }

  return groups.sort(
    (a, b) => b.score - a.score || b.frequency - a.frequency || b.avgCp - a.avgCp
  )
}

export function computeTrajectory(
  current: { frequency: number; avgCp: number; gameCount: number },
  previous: { frequency: number; avg_cp: number; game_count: number } | null
): 'improving' | 'stable' | 'declining' {
  if (!previous || previous.game_count === 0 || current.gameCount === 0) return 'stable'
  const freqNow = current.frequency / current.gameCount
  const freqPrev = previous.frequency / previous.game_count
  const freqChange = freqPrev > 0 ? (freqNow - freqPrev) / freqPrev : 0
  const costChange = previous.avg_cp > 0 ? (current.avgCp - previous.avg_cp) / previous.avg_cp : 0
  if (freqChange <= -0.25 || costChange <= -0.25) return 'improving'
  if (freqChange >= 0.25 || costChange >= 0.25) return 'declining'
  return 'stable'
}

export interface BatchSnapshot {
  batch_report_id: string
  frequency: number
  occurrences: number
  total_cp: number
  avg_cp: number
  game_count: number
  at: string
}

export async function upsertUserPatterns(
  supabase: SupabaseClient,
  userId: string,
  groups: PatternGroup[],
  batchReportId: string,
  batchGameCount: number
): Promise<void> {
  const maxScore = groups[0]?.score ?? 0

  const { data: priorReports } = await supabase
    .from('batch_reports')
    .select('pattern_groups')
    .eq('user_id', userId)
    .neq('id', batchReportId)
  const attributed = new Map<string, Set<string>>()
  for (const report of priorReports ?? []) {
    const priorGroups = (report.pattern_groups ?? []) as Array<{ tag: string; gameIds?: string[] }>
    for (const g of priorGroups) {
      const set = attributed.get(g.tag) ?? new Set<string>()
      for (const id of g.gameIds ?? []) set.add(id)
      attributed.set(g.tag, set)
    }
  }

  for (const group of groups) {
    const seen = attributed.get(group.tag)
    const newGameCount = seen ? group.gameIds.filter(id => !seen.has(id)).length : group.frequency
    const urgency = maxScore > 0 ? Math.min(10, Math.round((group.score / maxScore) * 10)) : 0
    const snapshot: BatchSnapshot = {
      batch_report_id: batchReportId,
      frequency: group.frequency,
      occurrences: group.occurrences,
      total_cp: group.totalCp,
      avg_cp: group.avgCp,
      game_count: batchGameCount,
      at: new Date().toISOString(),
    }

    const { data: existing } = await supabase
      .from('user_patterns')
      .select('id, frequency_count, batch_history')
      .eq('user_id', userId)
      .eq('pattern_type', group.tag)
      .maybeSingle()

    if (existing) {
      const history: BatchSnapshot[] = Array.isArray(existing.batch_history)
        ? existing.batch_history
        : []
      const previous = history.length > 0 ? history[history.length - 1]! : null
      const trajectory = computeTrajectory(
        { frequency: group.frequency, avgCp: group.avgCp, gameCount: batchGameCount },
        previous
      )
      await supabase
        .from('user_patterns')
        .update({
          frequency_count: existing.frequency_count + newGameCount,
          trajectory,
          urgency_score: urgency,
          batch_history: [...history, snapshot],
          last_detected_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
    } else {
      await supabase.from('user_patterns').insert({
        user_id: userId,
        pattern_type: group.tag,
        pattern_label: group.label,
        frequency_count: group.frequency,
        trajectory: 'stable',
        urgency_score: urgency,
        batch_history: [snapshot],
      })
    }
  }
}
