import type { GameForName } from './user-from-games'

export const OWNER_SAMPLE = 50

export function userSideName(g: GameForName): string | null {
  if (!g.user_color) return null
  const header = g.user_color === 'white' ? 'White' : 'Black'
  const name = new RegExp(`^\\[${header} "([^"\\]]+)"\\]`, 'm').exec(g.pgn)?.[1]?.trim()
  return name && name !== '?' ? name : null
}

export function ownerName(games: GameForName[], platform: string): string | null {
  const counts = new Map<string, { name: string; n: number }>()
  for (const g of games) {
    if (g.platform !== platform) continue
    const name = userSideName(g)
    if (!name) continue
    const key = name.toLowerCase()
    const entry = counts.get(key) ?? { name, n: 0 }
    entry.n++
    counts.set(key, entry)
  }
  let best: { name: string; n: number } | null = null
  for (const e of Array.from(counts.values())) if (!best || e.n > best.n) best = e
  return best?.name ?? null
}

export function accountMayHold(games: GameForName[], platform: string, username: string): boolean {
  const owner = ownerName(games, platform)
  return owner === null || owner.toLowerCase() === username.trim().toLowerCase()
}

export const NOT_YOUR_USERNAME = 'not_your_username'
