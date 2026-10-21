import { standing } from '@/lib/training/reveal'

export const MATE_CP = 9000

export function evalWords(cpWhite: number | null, userColor: 'white' | 'black' | null): string | null {
  if (cpWhite === null || !Number.isFinite(cpWhite)) return null
  if (userColor === 'white' || userColor === 'black') {
    return `You're ${standing(userColor === 'white' ? cpWhite : -cpWhite)}`
  }
  return `White is ${standing(cpWhite)}`
}

export function evalReceipt(cpWhite: number | null): string | null {
  if (cpWhite === null || !Number.isFinite(cpWhite)) return null
  if (cpWhite >= MATE_CP) return 'Engine: White mates'
  if (cpWhite <= -MATE_CP) return 'Engine: Black mates'
  const p = cpWhite / 100
  const n = p > 0 ? `+${p.toFixed(1)}` : p < 0 ? `−${Math.abs(p).toFixed(1)}` : '0.0'
  return `Engine: ${n} from White's side`
}
