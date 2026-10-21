import { Chess } from 'chess.js'

export type BoardSide = 'white' | 'black'

export interface DrawnMove {
  from: string
  to: string
  promotion?: 'q'
}

export function legalDests(fen: string): Map<string, string[]> {
  const dests = new Map<string, string[]>()
  try {
    for (const m of new Chess(fen).moves({ verbose: true })) {
      const list = dests.get(m.from) ?? []
      list.push(m.to)
      dests.set(m.from, list)
    }
  } catch {
  }
  return dests
}

function pieceAt(fen: string, square: string): { type: string; color: 'w' | 'b' } | null {
  try {
    return (new Chess(fen).get(square as never) as { type: string; color: 'w' | 'b' } | undefined) ?? null
  } catch {
    return null
  }
}

export function arrowFromMove(fen: string, from: string, to: string): DrawnMove {
  const piece = pieceAt(fen, from)
  const promotes = piece?.type === 'p' && (to[1] === '8' || to[1] === '1')
  return { from, to, ...(promotes ? { promotion: 'q' as const } : {}) }
}

export function arrowUci(a: DrawnMove): string {
  return `${a.from}${a.to}${a.promotion ?? ''}`
}

const PIECE_NAME: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}

const FILES = 'abcdefgh'

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function isSquare(s: string): boolean {
  return /^[a-h][1-8]$/.test(s)
}

export interface KeyboardState {
  cursor: string
  picked: string | null
}

export interface KeyContext {
  fen: string
  orientation: BoardSide
  locked: boolean
}

export interface KeyOutcome {
  handled: boolean
  state: KeyboardState
  say: string | null
  select?: string | null
  draw?: { from: string; to: string }
}

export function initialCursor(fen: string, orientation: BoardSide, arrows: { to: string }[] = []): string {
  const last = arrows[arrows.length - 1]
  if (last && isSquare(last.to)) return last.to
  const colour = orientation === 'white' ? 'w' : 'b'
  try {
    const board = new Chess(fen).board()
    for (const row of board) {
      for (const sq of row) {
        if (sq && sq.type === 'k' && sq.color === colour) return sq.square
      }
    }
  } catch {
  }
  return orientation === 'white' ? 'a1' : 'h8'
}

export function stepCursor(square: string, key: string, orientation: BoardSide): string | null {
  const f = FILES.indexOf(square[0])
  const r = Number(square[1]) - 1
  const s = orientation === 'white' ? 1 : -1
  const [df, dr] =
    key === 'ArrowUp' ? [0, s] : key === 'ArrowDown' ? [0, -s] : key === 'ArrowRight' ? [s, 0] : key === 'ArrowLeft' ? [-s, 0] : [0, 0]
  const nf = f + df
  const nr = r + dr
  if (nf < 0 || nf > 7 || nr < 0 || nr > 7) return null
  return `${FILES[nf]}${nr + 1}`
}

function ownColour(orientation: BoardSide): 'w' | 'b' {
  return orientation === 'white' ? 'w' : 'b'
}

export function describeSquare(ctx: KeyContext, state: KeyboardState): string {
  const piece = pieceAt(ctx.fen, state.cursor)
  const content = !piece
    ? 'empty'
    : `${piece.color === ownColour(ctx.orientation) ? 'your' : "your opponent's"} ${PIECE_NAME[piece.type]}`
  const base = `${state.cursor}, ${content}`
  if (state.picked === null) return `${base}.`
  if (state.picked === state.cursor) return `${base}, picked up.`
  const reaches = (legalDests(ctx.fen).get(state.picked) ?? []).includes(state.cursor)
  const held = pieceAt(ctx.fen, state.picked)
  return reaches && held ? `${base}. Your ${PIECE_NAME[held.type]} can move here.` : `${base}.`
}

export const LOCKED_MESSAGE = 'Pick a reason first.'
export const CANCELLED_MESSAGE = 'Cancelled.'
export const EDGE_MESSAGE = 'Edge of the board.'

const CURSOR_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])
const ACTIVATE_KEYS = new Set(['Enter', ' '])

export function isBoardKey(key: string): boolean {
  return CURSOR_KEYS.has(key) || ACTIVATE_KEYS.has(key) || key === 'Escape'
}

function pickUp(ctx: KeyContext, state: KeyboardState, square: string): KeyOutcome {
  const name = PIECE_NAME[pieceAt(ctx.fen, square)?.type ?? 'p']
  return {
    handled: true,
    state: { cursor: state.cursor, picked: square },
    say: `${capitalise(name)} on ${square} picked up.`,
    select: square,
  }
}

function activate(ctx: KeyContext, state: KeyboardState): KeyOutcome {
  const sq = state.cursor
  const piece = pieceAt(ctx.fen, sq)
  const mine = piece !== null && piece.color === ownColour(ctx.orientation)
  const dests = legalDests(ctx.fen)
  const stay = (say: string): KeyOutcome => ({ handled: true, state, say })

  if (state.picked !== null) {
    if (sq === state.picked) return { handled: true, state: { ...state, picked: null }, say: CANCELLED_MESSAGE, select: null }
    if ((dests.get(state.picked) ?? []).includes(sq)) {
      const arrow = arrowFromMove(ctx.fen, state.picked, sq)
      return {
        handled: true,
        state: { cursor: sq, picked: null },
        say: `Arrow drawn: ${state.picked} to ${sq}${arrow.promotion ? ', promoting to a queen' : ''}.`,
        draw: { from: state.picked, to: sq },
      }
    }
    if (mine && (dests.get(sq) ?? []).length > 0) return pickUp(ctx, state, sq)
    if (mine) return stay(`Your ${PIECE_NAME[piece.type]} on ${sq} has no legal move.`)
    const held = PIECE_NAME[pieceAt(ctx.fen, state.picked)?.type ?? 'p']
    return stay(`Your ${held} on ${state.picked} can't move to ${sq}.`)
  }

  if (!piece) return stay(`No piece of yours on ${sq}.`)
  if (!mine) return stay(`The ${PIECE_NAME[piece.type]} on ${sq} is your opponent's.`)
  if ((dests.get(sq) ?? []).length === 0) return stay(`Your ${PIECE_NAME[piece.type]} on ${sq} has no legal move.`)
  return pickUp(ctx, state, sq)
}

export function boardKey(state: KeyboardState, key: string, ctx: KeyContext): KeyOutcome {
  if (!isBoardKey(key)) return { handled: false, state, say: null }
  if (ctx.locked) return { handled: true, state, say: LOCKED_MESSAGE }

  if (CURSOR_KEYS.has(key)) {
    const next = stepCursor(state.cursor, key, ctx.orientation)
    if (next === null) return { handled: true, state, say: EDGE_MESSAGE }
    const moved = { ...state, cursor: next }
    return { handled: true, state: moved, say: describeSquare(ctx, moved) }
  }

  if (key === 'Escape') {
    if (state.picked === null) return { handled: false, state, say: null }
    return { handled: true, state: { ...state, picked: null }, say: CANCELLED_MESSAGE, select: null }
  }

  return activate(ctx, state)
}
