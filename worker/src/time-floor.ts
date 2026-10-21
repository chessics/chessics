import { Chess } from 'chess.js'
import { CHAIN_SEVERITY_CP } from './pattern-detector.js'
import type { TrainingPositionRow } from './training-positions.js'

export const OBVIOUS_FLOOR_MS = 3000
export const DEFAULT_TIME_FLOOR_MS = 5000
export const QUIET_FLOOR_MS = 10000

export const WIDE_GAP_CP = CHAIN_SEVERITY_CP

export const NARROW_GAP_CP = 50

const MATE_RANGE_CP = 9000

export interface TopLine {
  move: string
  cp: number
}

export type TopLinesResult =
  | { ok: true; lines: TopLine[] }
  | { ok: false; reason: 'engine_unsupported' | 'engine_failed' }

export type FloorReason =
  | 'obvious'
  | 'quiet'
  | 'neither'
  | 'no_best_move'
  | 'no_second_line'
  | 'best_move_disagrees'
  | 'mate_lines'
  | 'engine_unsupported'
  | 'engine_failed'

export interface TimeFloor {
  floorMs: number
  reason: FloorReason
}

type MoveKind = 'big_capture' | 'quiet' | 'other'

function moveKind(fen: string, uci: string): MoveKind | null {
  if (uci.length < 4) return null
  try {
    const move = new Chess(fen).move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
    })
    if (!move) return null
    if (move.captured && move.captured !== 'p') return 'big_capture'
    const check = move.san.includes('+') || move.san.includes('#')
    if (!move.captured && !move.promotion && !check) return 'quiet'
    return 'other'
  } catch {
    return null
  }
}

export function timeFloorFor(fen: string, bestMove: string | null, top: TopLinesResult): TimeFloor {
  const fallback = (reason: FloorReason): TimeFloor => ({ floorMs: DEFAULT_TIME_FLOOR_MS, reason })

  const kind = bestMove ? moveKind(fen, bestMove) : null
  if (!kind) return fallback('no_best_move')
  if (!top.ok) return fallback(top.reason)

  const [first, second] = top.lines
  if (!first || !second) return fallback('no_second_line')
  if (first.move !== bestMove) return fallback('best_move_disagrees')
  if (Math.abs(first.cp) >= MATE_RANGE_CP && Math.abs(second.cp) >= MATE_RANGE_CP) return fallback('mate_lines')

  const sign = fen.split(' ')[1] === 'b' ? -1 : 1
  const gap = (first.cp - second.cp) * sign

  if (kind === 'big_capture' && gap >= WIDE_GAP_CP) return { floorMs: OBVIOUS_FLOOR_MS, reason: 'obvious' }
  if (kind === 'quiet' && gap <= NARROW_GAP_CP) return { floorMs: QUIET_FLOOR_MS, reason: 'quiet' }
  return fallback('neither')
}

export async function withTimeFloors(
  rows: TrainingPositionRow[],
  topLines: (fen: string) => Promise<TopLinesResult>
): Promise<{ rows: TrainingPositionRow[]; reasons: FloorReason[] }> {
  const out: TrainingPositionRow[] = []
  const reasons: FloorReason[] = []
  for (const row of rows) {
    let top: TopLinesResult
    try {
      top = row.best_move ? await topLines(row.fen) : { ok: false, reason: 'engine_failed' }
    } catch {
      top = { ok: false, reason: 'engine_failed' }
    }
    const floor = timeFloorFor(row.fen, row.best_move, top)
    out.push({ ...row, time_floor_ms: floor.floorMs })
    reasons.push(floor.reason)
  }
  return { rows: out, reasons }
}
