export interface ProofFacts {
  fen: string
  movesBefore: string[]
  move: { number: number; san: string; from: string; to: string }
  orientation: 'white'
  site: string
  timeControl: string
  date: string
  whiteRating: number
  blackRating: number
  opening: string
  evalBeforeCp: number
  evalAfterCp: number
  blunderMove: number
  mateMove: number
}

export const PROOF: ProofFacts = {
  fen: 'r2q1rk1/pp2bpp1/4pn1p/n1ppB1N1/3P4/2PQP3/PP1N1PPP/2KR3R w - - 0 12',
  movesBefore: 'd4 d5 Bf4 Bf5 e3 e6 Bd3 Bxd3 Qxd3 Nc6 c3 Nf6 Nf3 Be7 Nbd2 O-O O-O-O Na5 Ng5 c5 Be5 h6'.split(' '),
  move: { number: 12, san: 'Ngf3', from: 'g5', to: 'f3' },
  orientation: 'white',
  site: 'Chess.com',
  timeControl: '10+0',
  date: '14 August 2026',
  whiteRating: 1330,
  blackRating: 1369,
  opening: 'London System',
  evalBeforeCp: 147,
  evalAfterCp: -131,
  blunderMove: 27,
  mateMove: 36,
}

const moveName = (f: ProofFacts) => `${f.move.number}.${f.move.san}`

export const PROOF_HEADING = 'Sometimes a game turns before the blunder.'

export function proofCaption(f: ProofFacts = PROOF): string[] {
  return [
    `A real game: ${f.site}, ${f.timeControl}, ${f.date}. White, rated ${f.whiteRating}, against a ${f.blackRating}, in a ${f.opening}.`,
    `The position before White's ${f.move.number}th move. The arrow is ${moveName(f)}.`,
  ]
}

export function proofSentences(f: ProofFacts = PROOF): string[] {
  return [
    `The engine had White ahead before ${moveName(f)} and behind after it, and White was never ahead again.`,
    `The obvious blunder came ${f.blunderMove - f.move.number} moves later, on move ${f.blunderMove}, and the game ended in mate on move ${f.mateMove}.`,
    'Chessics finds the move where your game turned, across your games, and trains you on those positions.',
  ]
}

export function proofBoardLabel(f: ProofFacts = PROOF): string {
  return `Board before White's ${f.move.number}th move, from White's side, with ${moveName(f)} drawn as an arrow from ${f.move.from} to ${f.move.to}.`
}
