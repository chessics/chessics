export type MoveQuality = 'brilliant' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'

export interface AnalyzedMove {
  ply: number
  san: string
  fen: string
  quality: MoveQuality
  cpLoss: number
  bestMove?: string
  comment?: string
}

export interface GameSummary {
  id: string
  pgn: string
  white: string
  black: string
  result: '1-0' | '0-1' | '1/2-1/2' | '*'
  date: string
  blunders: number
  mistakes: number
  inaccuracies: number
  analyzedAt?: string
}

export interface RootCauseAnnotation {
  id: string
  gameId: string
  blunderPly: number
  rootPly: number
  explanation: string
  pattern?: string
  createdAt: string
}

export interface UserProfile {
  id: string
  email: string
  chesscomUsername?: string
  lichessUsername?: string
  rating?: number
  createdAt: string
}
