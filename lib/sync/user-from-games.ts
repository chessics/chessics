export interface GameForName {
  pgn: string
  platform: string
  user_color: 'white' | 'black' | null
}

export function userNameFromGames(
  games: GameForName[]
): { username: string; platform: 'chess.com' | 'lichess' } | null {
  for (const g of games) {
    const platform = g.platform === 'chess_com' ? 'chess.com' : g.platform === 'lichess' ? 'lichess' : null
    if (!platform || !g.user_color) continue
    const header = g.user_color === 'white' ? 'White' : 'Black'
    const name = new RegExp(`^\\[${header} "([^"\\]]+)"\\]`, 'm').exec(g.pgn)?.[1]?.trim()
    if (name && name !== '?') return { username: name, platform }
  }
  return null
}
