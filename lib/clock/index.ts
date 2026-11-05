export interface ClockTimeControl {
  baseMs: number
  incrementMs: number
}

export type Side = 'white' | 'black'

export interface GameClock {
  timeControl: ClockTimeControl | null
  remaining: (number | null)[]
  spent: (number | null)[]
  firstMover: Side
}

export function isCorrespondence(raw: string | null | undefined): boolean {
  if (typeof raw !== 'string') return false
  const tc = raw.trim()
  return tc === '-' || /^\d+\/\d+$/.test(tc)
}

export function parseTimeControl(raw: string | null | undefined): ClockTimeControl | null {
  if (typeof raw !== 'string') return null
  const m = raw.trim().match(/^(\d+)(?:\+(\d+))?$/)
  if (!m) return null
  const baseMs = Number(m[1]) * 1000
  const incrementMs = Number(m[2] ?? '0') * 1000
  if (baseMs === 0 && incrementMs === 0) return null
  return { baseMs, incrementMs }
}

const HEADER_LINE = /^\s*\[([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\s*\]\s*$/

function splitPgn(pgn: string): { headers: Map<string, string>; movetext: string } {
  const headers = new Map<string, string>()
  const lines = pgn.split(/\r?\n/)
  let i = 0
  for (; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '') continue
    const h = line.match(HEADER_LINE)
    if (!h) break
    if (!headers.has(h[1])) headers.set(h[1], h[2].replace(/\\(["\\])/g, '$1'))
  }
  return { headers, movetext: lines.slice(i).join('\n') }
}

export function pgnHeader(pgn: string, name: string): string | null {
  return splitPgn(pgn).headers.get(name) ?? null
}

export function pgnTimeControl(pgn: string): ClockTimeControl | null {
  return parseTimeControl(pgnHeader(pgn, 'TimeControl'))
}

const CLK = /\[%clk\s+(\d+):(\d{1,2}):(\d{1,2})(?:\.(\d+))?\s*\]/
const RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*'])

function clockIn(comment: string): number | null {
  const m = comment.match(CLK)
  if (!m) return null
  const [h, min, sec] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (min > 59 || sec > 59) return null
  const frac = m[4] ? Number((m[4] + '00').slice(0, 3)) : 0
  return ((h * 60 + min) * 60 + sec) * 1000 + frac
}

interface Ply {
  san: string
  clock: number | null
}

function scan(movetext: string): Ply[] {
  const plies: Ply[] = []
  let depth = 0
  const comment = (text: string) => {
    if (depth > 0 || plies.length === 0) return
    const last = plies[plies.length - 1]
    if (last.clock === null) last.clock = clockIn(text)
  }
  let i = 0
  const n = movetext.length
  while (i < n) {
    const ch = movetext[i]
    if (ch === '{') {
      const end = movetext.indexOf('}', i + 1)
      const stop = end === -1 ? n : end
      comment(movetext.slice(i + 1, stop))
      i = stop + 1
    } else if (ch === ';') {
      const end = movetext.indexOf('\n', i + 1)
      const stop = end === -1 ? n : end
      comment(movetext.slice(i + 1, stop))
      i = stop + 1
    } else if (ch === '%' && (i === 0 || movetext[i - 1] === '\n')) {
      const end = movetext.indexOf('\n', i + 1)
      i = end === -1 ? n : end + 1
    } else if (ch === '(') {
      depth++
      i++
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1)
      i++
    } else if (/\s/.test(ch)) {
      i++
    } else {
      let j = i
      while (j < n && !/[\s{}();]/.test(movetext[j])) j++
      const token = movetext.slice(i, j)
      i = j
      if (depth > 0 || token.startsWith('$') || RESULTS.has(token)) continue
      const san = token.replace(/^\d+\.+/, '').replace(/[!?]+$/, '')
      if (san === '' || /^\d+$/.test(san)) continue
      plies.push({ san, clock: null })
    }
  }
  return plies
}

export function pgnSanMoves(pgn: string): string[] {
  return scan(splitPgn(pgn).movetext).map((p) => p.san)
}

export function hasClockComments(pgn: string): boolean {
  return /\[%clk\s/.test(splitPgn(pgn).movetext)
}

export function parseClocks(pgn: string): (number | null)[] {
  const { headers, movetext } = splitPgn(pgn)
  const plies = scan(movetext)
  if (isCorrespondence(headers.get('TimeControl'))) return plies.map(() => null)
  return plies.map((p) => p.clock)
}

export function timeSpent(clocks: readonly (number | null)[], incrementMs: number): (number | null)[] {
  const incOk = Number.isFinite(incrementMs) && incrementMs >= 0
  return clocks.map((now, i) => {
    const before = clocks[i - 2] ?? null
    if (!incOk || before === null || now === null) return null
    const spent = before - now + incrementMs
    return spent >= 0 ? spent : null
  })
}

function firstMoverOf(headers: Map<string, string>): Side {
  const fen = headers.get('FEN')
  return fen && fen.trim().split(/\s+/)[1] === 'b' ? 'black' : 'white'
}

function sideOf(i: number, first: Side): Side {
  return (i % 2 === 0) === (first === 'white') ? 'white' : 'black'
}

export function readGameClock(pgn: string): GameClock | null {
  const { headers } = splitPgn(pgn)
  const remaining = parseClocks(pgn)
  if (remaining.every((c) => c === null)) return null
  const timeControl = parseTimeControl(headers.get('TimeControl'))
  const spent = timeControl ? timeSpent(remaining, timeControl.incrementMs) : remaining.map(() => null)
  return { timeControl, remaining, spent, firstMover: firstMoverOf(headers) }
}

export function clockAtPly(pgn: string, ply: number): { white: number | null; black: number | null } {
  const unknown = { white: null, black: null }
  const game = readGameClock(pgn)
  if (!game) return unknown
  if (!Number.isInteger(ply) || ply < 1 || ply > game.remaining.length + 1) return unknown
  const at = (side: Side): number | null => {
    for (let i = ply - 2; i >= 0; i--) {
      if (sideOf(i, game.firstMover) === side) return game.remaining[i]
    }
    return game.timeControl ? game.timeControl.baseMs : null
  }
  return { white: at('white'), black: at('black') }
}
