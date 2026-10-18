const SAN_CORE = String.raw`(?:O-O(?:-O)?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h](?:x[a-h])?[1-8](?:=[QRBN])?)`
const SAN_TOKEN = new RegExp(`^${SAN_CORE}[+#]?$`)

const ABBREVIATIONS = new Set(['e.g', 'i.e', 'vs', 'etc', 'cf'])

function bareWord(word: string): string {
  return word.replace(/^["'“‘(]+/, '').replace(/^\d+\.+/, '').replace(/["'”’),;:]+$/, '')
}

function isSan(word: string): boolean {
  return SAN_TOKEN.test(bareWord(word))
}

function sentenceEnds(text: string): number[] {
  const ends: number[] = []
  const runs = /[.!?]+(?=["'”’)]*(?:\s|$))/g
  let m: RegExpExecArray | null
  while ((m = runs.exec(text)) !== null) {
    const run = m[0]
    const start = m.index
    const after = text.slice(start + run.length)
    const closers = after.match(/^["'”’)]*/)![0]
    const end = start + run.length + closers.length
    const rest = text.slice(end)
    const atEnd = rest.trim().length === 0

    if (/^\.{2,}$/.test(run)) continue

    const before = text.slice(0, start)
    const lastWord = before.split(/\s+/).pop() ?? ''

    if (/[!?]/.test(run) && isSan(lastWord) && !atEnd) continue

    if (atEnd) {
      ends.push(end)
      continue
    }

    const nextWord = rest.trimStart().split(/\s+/)[0] ?? ''
    const next = nextWord.replace(/^["'“‘(]+/, '').charAt(0)

    if (/^\d+$/.test(lastWord.replace(/[.!?]+$/, '')) && run === '.' && isSan(nextWord)) continue
    if (run === '.' && ABBREVIATIONS.has(lastWord.toLowerCase())) continue

    if (/[A-Z]/.test(next) || /^["'“‘]/.test(nextWord)) {
      ends.push(end)
      continue
    }
    if (/[a-z]/.test(next)) ends.push(end)
  }
  return ends
}

export function sentenceCount(text: string): number {
  const t = text.trim()
  if (t.length === 0) return 0
  const ends = sentenceEnds(t)
  const tail = ends.length ? t.slice(ends[ends.length - 1]).trim() : t
  return ends.length + (tail.length > 0 ? 1 : 0)
}

export function isTerminated(text: string): boolean {
  const t = text.trim()
  if (!/[.!?]["'”’)]*$/.test(t)) return false
  const ends = sentenceEnds(t)
  return ends.length > 0 && ends[ends.length - 1] === t.length
}

export function isOneSentence(text: string): boolean {
  return text.trim().length > 0 && isTerminated(text) && sentenceCount(text) === 1
}

export function truncateToOneSentence(text: string): string {
  const t = text.trim()
  const ends = sentenceEnds(t)
  return ends.length ? t.slice(0, ends[0]).trim() : t
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function restoreSanCase(text: string, sans: readonly string[]): string {
  let out = text
  const cores = [...new Set(sans.map(s => s.replace(/[+#!?]+$/, '')).filter(s => s.length > 0))]
  cores.sort((a, b) => b.length - a.length)
  for (const core of cores) {
    out = out.replace(new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(core)}(?![A-Za-z0-9])`, 'gi'), core)
  }
  return out
}

export function capitaliseFirst(text: string): string {
  const t = text.trimStart()
  const firstWord = t.split(/\s+/)[0] ?? ''
  if (isSan(firstWord)) return t
  const i = t.search(/[A-Za-z]/)
  if (i < 0) return t
  if (/[0-9]/.test(t.slice(0, i))) return t
  return t.slice(0, i) + t.charAt(i).toUpperCase() + t.slice(i + 1)
}

export function polishSentence(text: string, sans: readonly string[]): string {
  return capitaliseFirst(restoreSanCase(text.trim(), sans))
}

export function finishSentence(text: unknown, sans: readonly string[]): string | null {
  if (typeof text !== 'string') return null
  const polished = polishSentence(text, sans)
  if (isOneSentence(polished)) return polished
  const first = truncateToOneSentence(polished)
  return isOneSentence(first) ? first : null
}

export function attributesUserMoveToOpponent(
  text: string,
  userColor: 'white' | 'black',
  sans: readonly string[]
): boolean {
  const opponent = userColor === 'white' ? 'black' : 'white'
  const cores = [...new Set(sans.map(s => s.replace(/[+#!?]+$/, '')).filter(s => s.length > 0))]
  for (const core of cores) {
    const move = `${escapeRegExp(core)}(?![A-Za-z0-9])`
    const byColour = new RegExp(
      `\\b${opponent}(?:'s|’s)?\\s+(?:(?:played|plays|playing|pawn|push|pawn push|move)\\s+)?(?:\\d+\\.{1,3}\\s*)?${move}`,
      'i'
    )
    if (byColour.test(text)) return true
    const wrongNumber =
      userColor === 'black'
        ? new RegExp(`(?<![0-9.…])\\d+\\.(?![.…])\\s*${move}`)
        : new RegExp(`\\d+(?:\\.\\.\\.|…)\\s*${move}`)
    if (wrongNumber.test(text)) return true
  }
  return false
}

const NOT_BEFORE = /[AC-JLMOPS-Zi-wyz]/
const SQUARE = /[a-h][1-8](?![0-9])/g

export function squaresNamed(text: string): string[] {
  const found: string[] = []
  for (const m of Array.from(text.matchAll(SQUARE))) {
    const before = m.index! > 0 ? text[m.index! - 1] : ''
    if (before && NOT_BEFORE.test(before)) continue
    if (!found.includes(m[0])) found.push(m[0])
  }
  return found
}

export function namesUngivenSquare(text: string, sans: readonly string[]): boolean {
  const given = new Set(sans.flatMap(s => s.match(/[a-h][1-8]/g) ?? []))
  return squaresNamed(text).some(sq => !given.has(sq))
}
