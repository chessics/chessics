export const WIN_CHANCE_CLAMP_CP = 1000
const K = 0.00368208

export function winChance(cp: number): number {
  const c = Math.max(-WIN_CHANCE_CLAMP_CP, Math.min(WIN_CHANCE_CLAMP_CP, cp))
  return 50 + 50 * (2 / (1 + Math.exp(-K * c)) - 1)
}
