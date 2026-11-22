import { Chess } from 'chess.js'
import { sideOf, type Puzzle } from './rules'

export type LichessRow = [string, string, string, number, string]

const MATE_NAMES: Array<[string, string]> = [
  ['smotheredMate', 'Smothered mate'],
  ['backRankMate', 'Back-rank mate'],
  ['anastasiaMate', "Anastasia's mate"],
  ['arabianMate', 'Arabian mate'],
  ['bodenMate', "Boden's mate"],
  ['doubleBishopMate', 'Two bishops mate'],
  ['dovetailMate', 'Dovetail mate'],
  ['hookMate', 'Hook mate'],
  ['killBoxMate', 'Box mate'],
  ['vukovicMate', 'Vukovic mate'],
  ['balestraMate', 'Balestra mate'],
  ['blindSwineMate', 'Blind swine mate'],
  ['cornerMate', 'Corner mate'],
  ['epauletteMate', 'Epaulette mate'],
  ['morphysMate', "Morphy's mate"],
  ['operaMate', 'Opera mate'],
  ['pillsburysMate', "Pillsbury's mate"],
  ['swallowstailMate', 'Swallowtail mate'],
  ['triangleMate', 'Triangle mate'],
]

const TACTIC_NAMES: Array<[string, string]> = [
  ['doubleCheck', 'Double check'],
  ['fork', 'Fork'],
  ['pin', 'Pin'],
  ['skewer', 'Skewer'],
  ['discoveredAttack', 'Discovered attack'],
  ['xRayAttack', 'X-ray attack'],
  ['deflection', 'Deflection'],
  ['attraction', 'Attraction'],
  ['interference', 'Interference'],
  ['clearance', 'Clearance'],
  ['capturingDefender', 'Removing the defender'],
  ['intermezzo', 'In-between move'],
  ['trappedPiece', 'Trapped piece'],
  ['zugzwang', 'Zugzwang'],
  ['quietMove', 'Quiet move'],
  ['promotion', 'Promotion'],
  ['underPromotion', 'Underpromotion'],
  ['advancedPawn', 'Advanced pawn'],
  ['sacrifice', 'Sacrifice'],
  ['defensiveMove', 'Defensive move'],
  ['hangingPiece', 'Hanging piece'],
  ['exposedKing', 'Exposed king'],
  ['kingsideAttack', 'Kingside attack'],
  ['queensideAttack', 'Queenside attack'],
]

export function themeFromTags(tags: string[]): string {
  const has = new Set(tags)
  const mateIn = tags.map(t => /^mateIn(\d)$/.exec(t)).find(Boolean)
  if (mateIn || has.has('mate')) {
    const named = MATE_NAMES.find(([tag]) => has.has(tag))
    if (named) return named[1]
    return mateIn ? (mateIn[1] === '1' ? 'Mate in one' : `Mate in ${['', 'one', 'two', 'three', 'four', 'five'][Number(mateIn[1])] ?? 'several moves'}`) : 'Checkmate'
  }
  const tactic = TACTIC_NAMES.find(([tag]) => has.has(tag))
  if (tactic) return tactic[1]
  return has.has('crushing') ? 'Winning a lot of material' : 'Winning material'
}

function play(chess: Chess, uci: string) {
  return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
}

export function fromLichess(row: LichessRow): Puzzle | null {
  const [id, fenBefore, movesRaw, rating, theme] = row
  if (typeof id !== 'string' || typeof fenBefore !== 'string' || typeof movesRaw !== 'string') return null
  const moves = movesRaw.trim().split(/\s+/)
  if (moves.length < 2 || moves.length % 2 !== 0) return null
  try {
    const chess = new Chess(fenBefore)
    const lead = moves[0].toLowerCase()
    play(chess, lead)
    const fen = chess.fen()
    const solution = moves.slice(1).map(m => m.toLowerCase())
    const check = new Chess(fen)
    for (const uci of solution) play(check, uci)
    return {
      id: `lichess-${id}`,
      fen,
      side: sideOf(fen),
      solution,
      theme: typeof theme === 'string' && theme.length > 0 ? theme : 'Winning material',
      source: 'From a Lichess game',
      rating: Number.isFinite(rating) ? rating : undefined,
      lead: { fen: fenBefore, move: lead },
    }
  } catch {
    return null
  }
}

export interface PuzzleEntry {
  id: string
  rating: number
  theme: string
  row: LichessRow
}

export function parseLichessSet(json: unknown): PuzzleEntry[] {
  if (!Array.isArray(json)) return []
  const out: PuzzleEntry[] = []
  const ids = new Set<string>()
  for (const row of json) {
    if (!Array.isArray(row) || row.length < 5) continue
    const [id, fen, moves, rating, theme] = row
    if (typeof id !== 'string' || typeof fen !== 'string' || typeof moves !== 'string') continue
    if (typeof rating !== 'number' || !Number.isFinite(rating) || typeof theme !== 'string') continue
    const key = `lichess-${id}`
    if (ids.has(key)) continue
    ids.add(key)
    out.push({ id: key, rating, theme, row: [id, fen, moves, rating, theme] })
  }
  return out
}

export const LICHESS_SET_URL = '/puzzles/lichess.json'
