import {
  attributesUserMoveToOpponent,
  isOneSentence,
  namesUngivenSquare,
  polishSentence,
  splitSentences,
  statesEvalFigure,
} from './sentences'
import { standAloneExplanation } from '../review/chain-roots'
import { sentenceCase, type GroupFacts } from '../diagnosis/finding'
import { groupChanged } from '../diagnosis/recount'
import { countNoun } from '../count-noun'
import { habitVerdict, verdictFor, withoutEmDash, type Verdict } from '../diagnosis/verdict'

type Color = 'white' | 'black'
type Result = 'win' | 'loss' | 'draw'

export const PAYLOAD_SINCE = '2026-08-02T00:00:00Z'

export const MODEL_CHAINS = 3

export const NO_CHAIN_MIN_DELTA = 50

export type ProseRule =
  | 'not_one_sentence'
  | 'not_prose'
  | 'first_person'
  | 'figure'
  | 'opponent_colour'
  | 'ungiven_square'
  | 'result_contradicted'
  | 'stand_alone'
  | 'count_changed'

export interface ProseChange {
  old: string
  new: string | null
  rules: ProseRule[]
}

const FIRST_PERSON = [/\bI\b/, /\b(?:me|my|mine|myself|we|we're|we’re|we've|we’ve|we'll|we’ll|us|our|ours|let's|let’s)\b/i]

export function speaksInFirstPerson(text: string): boolean {
  return FIRST_PERSON.some((re) => re.test(text))
}

export function notWorkerShape(text: string): boolean {
  return /\n|\*\*|^\s*#|^\s*[-*•]\s/m.test(text)
}

const LOSS_CLAIM = [
  /\b(?:keep|keeps|kept)\s+losing\b/i,
  /\byou\s+lost\b/i,
  /\b(?:cost|costs|costing|lost|losing|lose|loses)\s+(?:you\s+)?the\s+game\b/i,
]

export function claimsLoss(text: string): boolean {
  return LOSS_CLAIM.some((re) => re.test(text))
}

export function lossClaimContradicted(text: string, results: readonly (Result | null)[]): boolean {
  return claimsLoss(text) && results.some((r) => r === 'win' || r === 'draw')
}

export interface SentenceContext {
  sans: readonly string[] | null
  userColor: Color | null
  results: readonly (Result | null)[] | null
}

export function checkSentence(text: string, ctx: SentenceContext): { text: string; rules: ProseRule[] } {
  const polished = polishSentence(text, ctx.sans ?? [])
  const rules: ProseRule[] = []
  if (!isOneSentence(polished)) rules.push('not_one_sentence')
  if (speaksInFirstPerson(polished)) rules.push('first_person')
  if (statesEvalFigure(polished)) rules.push('figure')
  if (ctx.sans && ctx.userColor && attributesUserMoveToOpponent(polished, ctx.userColor, ctx.sans)) rules.push('opponent_colour')
  if (ctx.sans && namesUngivenSquare(polished, ctx.sans)) rules.push('ungiven_square')
  if (ctx.results && lossClaimContradicted(polished, ctx.results)) rules.push('result_contradicted')
  return { text: polished, rules }
}

function payloadKnown(createdAt: string | null | undefined): boolean {
  return typeof createdAt === 'string' && !Number.isNaN(Date.parse(createdAt)) && Date.parse(createdAt) >= Date.parse(PAYLOAD_SINCE)
}

const moveNumber = (ply: number) => Math.ceil(ply / 2)
const isUserPly = (ply: number, color: Color) => (color === 'white' ? ply % 2 === 1 : ply % 2 === 0)

export interface ReviewChain {
  rootSan: string
  rootPly: number
  terminalSan: string
  terminalPly: number
  standsAlone: boolean
}

export interface ReviewMove {
  ply_number: number
  san: string
  eval_delta: number | null
}

export interface ReviewProseInput {
  narrative: string | null
  keyMoment: string | null
  createdAt: string | null
  userColor: Color | null
  result: Result | null
  chains: readonly ReviewChain[]
  moves: readonly ReviewMove[]
}

export interface ReviewProse {
  narrative: string | null
  keyMoment: string | null
  changes: ProseChange[]
}

export function chainTemplate(c: ReviewChain): string {
  return c.standsAlone
    ? standAloneExplanation(c.terminalSan, c.terminalPly)
    : `${c.rootSan} at move ${moveNumber(c.rootPly)} led to the blunder ${c.terminalSan} at move ${moveNumber(c.terminalPly)}.`
}

export function costliestUserMove(moves: readonly ReviewMove[], color: Color | null): ReviewMove | null {
  if (color !== 'white' && color !== 'black') return null
  const own = [...moves].sort((a, b) => a.ply_number - b.ply_number).filter((m) => isUserPly(m.ply_number, color))
  if (own.some((m) => typeof m.eval_delta !== 'number' || !Number.isFinite(m.eval_delta))) return null
  return [...own].sort((a, b) => (b.eval_delta as number) - (a.eval_delta as number))[0] ?? null
}

export function noChainTemplate(worst: ReviewMove | null): string | null {
  if (!worst || (worst.eval_delta as number) <= NO_CHAIN_MIN_DELTA) return null
  return `${worst.san} at move ${moveNumber(worst.ply_number)} was the costliest move you played.`
}

export function checkReviewProse(input: ReviewProseInput): ReviewProse {
  const chains = [...input.chains].sort((a, b) => a.terminalPly - b.terminalPly || a.rootPly - b.rootPly)
  const given = chains.slice(0, MODEL_CHAINS)
  const worst = chains.length === 0 ? costliestUserMove(input.moves, input.userColor) : null
  const known = payloadKnown(input.createdAt) || input.createdAt === null
  const sans = known ? (given.length > 0 ? given.flatMap((c) => [c.rootSan, c.terminalSan]) : worst ? [worst.san] : null) : null
  const plies = given.length > 0 ? given.flatMap((c) => [c.rootPly, c.terminalPly]) : worst ? [worst.ply_number] : []
  const color = input.userColor
  const ctx: SentenceContext = {
    sans,
    userColor: sans && color && plies.every((p) => isUserPly(p, color)) ? color : null,
    results: input.result ? [input.result] : null,
  }
  const changes: ProseChange[] = []
  const templateAt = (i: number) => (given.length > 0 ? chainTemplate(given[i]) : noChainTemplate(worst))

  const judge = (raw: string, i: number | null, shapeFails: boolean) => {
    const { text, rules } = checkSentence(raw, ctx)
    if (shapeFails) rules.unshift('not_prose')
    if (i !== null && given.length > 0 && given[i].standsAlone) rules.push('stand_alone')
    return { raw, text, rules }
  }

  let narrative: string | null = null
  if (input.narrative && input.narrative.trim()) {
    const shapeFails = notWorkerShape(input.narrative)
    const pieces = splitSentences(input.narrative)
    const slots = given.length > 0 ? given.length : 1
    if (pieces.length === slots) {
      const shown = pieces.map((p, i) => {
        const j = judge(p, i, shapeFails)
        if (j.rules.length === 0) return j.text
        const replacement = templateAt(i)
        changes.push({ old: j.raw, new: replacement, rules: j.rules })
        return replacement
      })
      narrative = shown.filter((s): s is string => !!s).join(' ') || null
    } else {
      const judged = pieces.map((p) => judge(p, null, shapeFails))
      const kept = judged.filter((j) => j.rules.length === 0).map((j) => j.text)
      const failed = judged.filter((j) => j.rules.length > 0)
      if (kept.length > 0) {
        narrative = kept.join(' ')
        for (const j of failed) changes.push({ old: j.raw, new: null, rules: j.rules })
      } else {
        const templates = Array.from({ length: slots }, (_, i) => templateAt(i)).filter((s): s is string => !!s)
        narrative = templates.length > 0 ? templates.join(' ') : null
        changes.push({ old: input.narrative, new: narrative, rules: Array.from(new Set(failed.flatMap((j) => j.rules))) })
      }
    }
  }

  let keyMoment: string | null = null
  if (input.keyMoment && input.keyMoment.trim()) {
    const j = judge(input.keyMoment, 0, notWorkerShape(input.keyMoment))
    if (j.rules.length === 0) keyMoment = j.text
    else {
      keyMoment = templateAt(0)
      changes.push({ old: j.raw, new: keyMoment, rules: j.rules })
    }
  }
  return { narrative, keyMoment, changes }
}

export interface StoredGroup extends GroupFacts {
  insight: string | null
}

export interface BatchProseInput {
  storedVerdict: string | null
  narrative: string | null
  generatedAt: string | null
  gameCount: number
  storedGroups: readonly StoredGroup[]
  recounted: readonly GroupFacts[]
  results: ReadonlyMap<string, Result | null> | null
}

export interface BatchProse {
  verdict: Verdict | null
  tail: string | null
  changes: ProseChange[]
}

export function patternTemplate(label: string, frequency: number, gameCount: number): string {
  return `${sentenceCase(label)} appeared in ${frequency} of ${countNoun(gameCount, 'game')}.`
}

export function checkBatchProse(input: BatchProseInput): BatchProse {
  const changes: ProseChange[] = []
  const storedHead = input.storedGroups.find((g) => g.recurring) ?? null
  const head = input.recounted.find((g) => g.recurring) ?? null
  const known = input.generatedAt === null || payloadKnown(input.generatedAt)
  const sans = known && storedHead ? [storedHead.exhibit.rootSan, storedHead.exhibit.blunderSan] : null
  const resultsOf = (ids: readonly string[]) => (input.results ? ids.map((id) => input.results!.get(id) ?? null) : null)
  const ctxFor = (ids: readonly string[] | null): SentenceContext => ({ sans, userColor: null, results: ids ? resultsOf(ids) : null })

  let verdict: Verdict | null
  if (!head) verdict = verdictFor(input.storedVerdict, false)
  else if (storedHead && storedHead.tag === head.tag && !groupChanged(storedHead, head) && input.storedVerdict) {
    const { text, rules } = checkSentence(input.storedVerdict, ctxFor(storedHead.gameIds))
    if (rules.length === 0) verdict = verdictFor(text, true)
    else {
      verdict = { text: habitVerdict(head.label, head.frequency, input.gameCount), needsMoreGames: false }
      changes.push({ old: input.storedVerdict, new: verdict.text, rules })
    }
  } else verdict = { text: habitVerdict(head.label, head.frequency, input.gameCount), needsMoreGames: false }

  const headCountChanged = !!storedHead && (!head || head.tag !== storedHead.tag || groupChanged(storedHead, head))

  let tail: string | null = null
  if (input.narrative && input.storedVerdict && input.narrative !== input.storedVerdict) {
    const rest = withoutEmDash(input.narrative.slice(input.storedVerdict.length).trim())
    const shapeFails = notWorkerShape(rest)
    const out: string[] = []
    for (const piece of splitSentences(rest)) {
      const group = input.storedGroups.find((g) => g !== storedHead && g.insight && withoutEmDash(g.insight).trim() === piece)
      const { text, rules } = checkSentence(piece, ctxFor(group ? group.gameIds : null))
      if (shapeFails) rules.unshift('not_prose')
      let shown: string | null = text
      if (group) {
        const now = input.recounted.find((g) => g.tag === group.tag)
        if (groupChanged(group, now)) rules.push('count_changed')
        if (rules.length > 0) shown = now ? patternTemplate(now.label, now.frequency, input.gameCount) : null
      } else {
        if (headCountChanged) rules.push('count_changed')
        if (rules.length > 0) shown = null
      }
      if (rules.length > 0) changes.push({ old: piece, new: shown, rules })
      if (shown) out.push(shown)
    }
    tail = out.length > 0 ? out.join(' ') : null
  }
  return { verdict, tail, changes }
}
