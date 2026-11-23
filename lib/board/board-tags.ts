import { Chess } from 'chess.js'

type Colour = 'w' | 'b'
const FILES = 'abcdefgh'

export type PawnWeakness = 'doubled' | 'isolated' | 'backward'

export interface BoardFacts {
  weakensKingShield: boolean
  pawnWeaknesses: PawnWeakness[]
}

interface Pawn {
  file: number
  rank: number
}

function pawnsOf(game: Chess, colour: Colour): Pawn[] {
  const out: Pawn[] = []
  for (const row of game.board())
    for (const sq of row)
      if (sq && sq.type === 'p' && sq.color === colour) {
        const file = FILES.indexOf(sq.square[0]!)
        const rank = Number(sq.square[1])
        out.push({ file, rank: colour === 'w' ? rank : 9 - rank })
      }
  return out
}

function doubledCount(pawns: Pawn[]): number {
  const perFile = new Map<number, number>()
  for (const p of pawns) perFile.set(p.file, (perFile.get(p.file) ?? 0) + 1)
  let n = 0
  for (const c of Array.from(perFile.values())) if (c >= 2) n += c - 1
  return n
}

function isolatedCount(pawns: Pawn[]): number {
  const files = new Set(pawns.map((p) => p.file))
  return pawns.filter((p) => !files.has(p.file - 1) && !files.has(p.file + 1)).length
}

function enemyPawnAttacks(enemy: Pawn[]): Set<string> {
  const out = new Set<string>()
  for (const e of enemy) {
    out.add(`${e.file - 1}:${e.rank - 1}`)
    out.add(`${e.file + 1}:${e.rank - 1}`)
  }
  return out
}

function backwardCount(pawns: Pawn[], enemyInOwnerFrame: Pawn[]): number {
  const attacked = enemyPawnAttacks(enemyInOwnerFrame)
  return pawns.filter((p) => {
    const supported = pawns.some((q) => Math.abs(q.file - p.file) === 1 && q.rank <= p.rank)
    return !supported && attacked.has(`${p.file}:${p.rank + 1}`)
  }).length
}

function inOwnerFrame(enemy: Pawn[]): Pawn[] {
  return enemy.map((p) => ({ file: p.file, rank: 9 - p.rank }))
}

function weaknesses(game: Chess, colour: Colour) {
  const own = pawnsOf(game, colour)
  const enemy = inOwnerFrame(pawnsOf(game, colour === 'w' ? 'b' : 'w'))
  return { doubled: doubledCount(own), isolated: isolatedCount(own), backward: backwardCount(own, enemy) }
}

function hasQueen(game: Chess, colour: Colour): boolean {
  return game.board().some((row) => row.some((sq) => sq?.type === 'q' && sq.color === colour))
}

function kingSquare(game: Chess, colour: Colour): string | null {
  for (const row of game.board()) for (const sq of row) if (sq && sq.type === 'k' && sq.color === colour) return sq.square
  return null
}

export function boardFacts(fenBefore: string, san: string): BoardFacts | null {
  let game: Chess
  try {
    game = new Chess(fenBefore)
  } catch {
    return null
  }
  const colour = game.turn() as Colour
  const before = weaknesses(game, colour)
  const king = kingSquare(game, colour)
  const enemyQueen = hasQueen(game, colour === 'w' ? 'b' : 'w')
  let move
  try {
    move = game.move(san)
  } catch {
    return null
  }
  if (!move) return null

  let weakensKingShield = false
  if (king && enemyQueen && move.piece === 'p') {
    const backRank = colour === 'w' ? '1' : '8'
    const kingFile = FILES.indexOf(king[0]!)
    const castled = king[1] === backRank && 'abcgh'.includes(king[0]!)
    const fromFile = FILES.indexOf(move.from[0]!)
    const fromRank = Number(move.from[1])
    const ownRank = colour === 'w' ? fromRank : 9 - fromRank
    weakensKingShield = castled && Math.abs(fromFile - kingFile) <= 1 && (ownRank === 2 || ownRank === 3)
  }

  const after = weaknesses(game, colour)
  const pawnWeaknesses: PawnWeakness[] = []
  if (after.doubled > before.doubled) pawnWeaknesses.push('doubled')
  if (after.isolated > before.isolated) pawnWeaknesses.push('isolated')
  if (after.backward > before.backward) pawnWeaknesses.push('backward')
  return { weakensKingShield, pawnWeaknesses }
}

export function boardConfirmsTag(tag: string, fenBefore: string, san: string): boolean | null {
  if (tag !== 'king_safety' && tag !== 'pawn_structure_weakness') return true
  const facts = boardFacts(fenBefore, san)
  if (!facts) return null
  return tag === 'king_safety' ? facts.weakensKingShield : facts.pawnWeaknesses.length > 0
}
