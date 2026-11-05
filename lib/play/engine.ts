import { createFakeMaiaClient, createHttpMaiaClient, type MaiaClient } from '@/lib/maia/client'

export type EngineKind = 'fake' | 'maia2'

export function engineKind(env: Record<string, string | undefined> = process.env): EngineKind {
  return env.MAIA_URL ? 'maia2' : 'fake'
}

export function maiaFromEnv(
  env: Record<string, string | undefined> = process.env,
  doFetch: typeof fetch = fetch
): { client: MaiaClient; engine: EngineKind } {
  const url = env.MAIA_URL
  if (url) return { client: createHttpMaiaClient({ url, token: env.MAIA_TOKEN || null, fetch: doFetch }), engine: 'maia2' }
  return { client: createFakeMaiaClient(), engine: 'fake' }
}

export function livePlayEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return engineKind(env) === 'maia2'
}

export function playFromPosition(
  gameId: string,
  rootPly: number,
  env: Record<string, string | undefined> = process.env
): { game_id: string; ply: number } | null {
  return livePlayEnabled(env) ? { game_id: gameId, ply: rootPly - 1 } : null
}

export function engineLabel(engine: EngineKind, elo: number): string {
  return engine === 'maia2'
    ? `Played by Maia-2, a human-like engine, at ${elo}.`
    : 'Played by a stand-in engine: legal moves, weighted, no rating. Maia is not connected.'
}
