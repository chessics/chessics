import { engineLabel, type EngineKind } from './engine'
import { standingFromEval, type Side, type StartStanding } from './game'
import type { PlayContext } from './context'

export type PlayMode = 'live' | 'fixture'

export interface PlaySetup {
  mode: PlayMode
  gameId: string
  startPly: number
  initialFen: string
  prefix: string[]
  startFen: string
  userColor: Side
  userElo: number | null
  opponentElo: number | null
  opponentName: string | null
  engine: EngineKind
  engineElo: number
  engineLabel: string
  clocks: { userMs: number; opponentMs: number; incrementMs: number } | null
  startStanding: StartStanding | null
  gameHref: string
  backHref: string | null
  notes: string[]
  devQuery: string
}

export const NOTE_NO_CLOCK_RECORD = 'This game has no clock record, so both clocks start at the full time.'
export const NOTE_UNTIMED = 'This game has no time control, so there are no clocks.'
export const noteNoRating = (elo: number) => `The opponent's rating wasn't recorded, so the engine plays at ${elo}.`

export function setupFromContext(
  ctx: PlayContext,
  o: { mode: PlayMode; engine: EngineKind; startEvalCp: number | null; gameHref: string; backHref: string | null; devQuery?: string }
): PlaySetup {
  const c = ctx.startClocks
  const user = ctx.userColor
  const notes: string[] = []
  if (!c) notes.push(NOTE_UNTIMED)
  else if (c.source === 'time_control') notes.push(NOTE_NO_CLOCK_RECORD)
  if (ctx.opponentElo === null) notes.push(noteNoRating(ctx.engineElo))
  return {
    mode: o.mode,
    gameId: ctx.gameId,
    startPly: ctx.startPly,
    initialFen: ctx.initialFen,
    prefix: ctx.prefix,
    startFen: ctx.startFen,
    userColor: user,
    userElo: ctx.userElo,
    opponentElo: ctx.opponentElo,
    opponentName: ctx.opponentName,
    engine: o.engine,
    engineElo: ctx.engineElo,
    engineLabel: engineLabel(o.engine, ctx.engineElo),
    clocks: c
      ? {
          userMs: user === 'white' ? c.white : c.black,
          opponentMs: user === 'white' ? c.black : c.white,
          incrementMs: ctx.timeControl?.incrementMs ?? 0,
        }
      : null,
    startStanding: standingFromEval(o.startEvalCp),
    gameHref: o.gameHref,
    backHref: o.backHref,
    notes,
    devQuery: o.devQuery ?? '',
  }
}

export function userSideEval(whiteCp: number | null | undefined, userColor: Side): number | null {
  if (typeof whiteCp !== 'number' || !Number.isFinite(whiteCp)) return null
  return userColor === 'white' ? whiteCp : -whiteCp
}

export { playHref, backHrefFor } from './links'
