import Anthropic from '@anthropic-ai/sdk'
import type { EvaluatedMove } from './stockfish.js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MODEL = 'claude-sonnet-5'

const CALIBRATION_VOICES: Record<number, string> = {
  0: 'Use very simple language. No chess jargon. Example tone: "You left your king open and your opponent attacked it."',
  1: 'Use basic chess terms. Explain tactics simply. Assume they know how pieces move.',
  2: 'Use positional concepts: pawn structure, piece activity, king safety. Assume they know basic tactics.',
  3: 'Use full positional vocabulary: color complexes, outposts, prophylaxis, initiative.',
  4: 'Assume strong pattern recognition. Focus on subtle positional causes, tempo, transformation of advantages.',
}

function voiceFor(level: number): string {
  return CALIBRATION_VOICES[level] ?? CALIBRATION_VOICES[2]!
}

function sentenceCount(text: string): number {
  const matches = text.trim().match(/[.!?](?=\s+[A-Z"']|$)/g)
  return matches ? matches.length : (text.trim().length > 0 ? 1 : 0)
}

function truncateToOneSentence(text: string): string {
  const t = text.trim()
  const m = t.match(/^[\s\S]*?[.!?](?=\s+[A-Z"']|$)/)
  return m ? m[0].trim() : t
}

function isOneSentence(text: string): boolean {
  return text.trim().length > 0 && sentenceCount(text) === 1
}

async function jsonCall<T>(
  system: string,
  userPayload: unknown,
  validate: (parsed: T) => boolean,
  maxTokens = 700
): Promise<T> {
  let lastParsed: T | null = null

  for (let attempt = 0; attempt < 2; attempt++) {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      thinking: { type: 'disabled' },
      system:
        attempt === 0
          ? system
          : `${system}\n\nYour previous answer violated the one-sentence rule. Every string field must be EXACTLY ONE sentence.`,
      messages: [{ role: 'user', content: JSON.stringify(userPayload) }],
    })

    const content = message.content.find(block => block.type === 'text')
    const text = content?.type === 'text' ? content.text : ''
    try {
      const jsonText = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
      const parsed = JSON.parse(jsonText) as T
      lastParsed = parsed
      if (validate(parsed)) return parsed
    } catch (err) {
      console.error(`[claude] narrative attempt ${attempt + 1} failed:`, err instanceof Error ? err.message : err)
    }
  }

  if (lastParsed) return lastParsed
  throw new Error('Claude returned unparseable narrative JSON twice')
}

export interface GameReviewResult {
  narrative: string
  keyMomentExplanation: string
}

interface CausalChainInput {
  rootMovePly: number
  rootMoveSan: string
  rootMoveExplanation: string
  terminalBlunderPly: number
  terminalBlunderSan: string
  chainExplanation: string
}

export async function generateGameReview(
  gameData: {
    white: string
    black: string
    result: string
    userColor: 'white' | 'black'
    moves: EvaluatedMove[]
  },
  causalChains: CausalChainInput[],
  calibrationLevel: number
): Promise<GameReviewResult> {
  const moveNum = (ply: number) => Math.ceil(ply / 2)

  if (causalChains.length === 0) {
    const worst = [...gameData.moves]
      .filter(m => (gameData.userColor === 'white' ? m.ply % 2 === 1 : m.ply % 2 === 0))
      .sort((a, b) => b.eval_delta - a.eval_delta)[0]
    if (!worst || worst.eval_delta <= 50) {
      return { narrative: 'No significant mistakes detected in this game.', keyMomentExplanation: '' }
    }
    const { sentence } = await jsonCall<{ sentence: string }>(
      `You are a chess coach. ${voiceFor(calibrationLevel)} Respond with JSON {"sentence": "..."} — EXACTLY ONE sentence describing the given mistake, position-specific, sentence case. You are given computed engine facts only; never invent moves or evaluations.`,
      {
        result: gameData.result,
        userPlayed: gameData.userColor,
        costliestMistake: {
          move: worst.san,
          moveNumber: moveNum(worst.ply),
          pawnsLost: +(worst.eval_delta / 100).toFixed(1),
        },
      },
      p => isOneSentence(p.sentence)
    ).catch(() => ({ sentence: `${worst.san} at move ${moveNum(worst.ply)} cost ${(worst.eval_delta / 100).toFixed(1)} pawns.` }))
    const s = truncateToOneSentence(sentence)
    return { narrative: s, keyMomentExplanation: s }
  }

  const chains = causalChains.slice(0, 3)
  const { insights } = await jsonCall<{ insights: string[] }>(
    `You are a chess coach. ${voiceFor(calibrationLevel)} Respond with JSON {"insights": ["...", ...]} — EXACTLY ONE sentence per causal chain, in the given order, each explaining how the root move led to the blunder, position-specific, sentence case. You are given computed engine facts only; never invent moves or evaluations.`,
    {
      result: gameData.result,
      userPlayed: gameData.userColor,
      causalChains: chains.map(c => ({
        rootMove: c.rootMoveSan,
        rootMoveNumber: moveNum(c.rootMovePly),
        blunder: c.terminalBlunderSan,
        blunderMoveNumber: moveNum(c.terminalBlunderPly),
      })),
    },
    p => Array.isArray(p.insights) && p.insights.length === chains.length && p.insights.every(isOneSentence)
  ).catch(() => ({
    insights: chains.map(
      c => `${c.rootMoveSan} at move ${moveNum(c.rootMovePly)} led to the blunder ${c.terminalBlunderSan} at move ${moveNum(c.terminalBlunderPly)}.`
    ),
  }))

  const clean = insights.map(truncateToOneSentence)
  return {
    narrative: clean.join(' '),
    keyMomentExplanation: clean[0] ?? '',
  }
}

export interface BatchNarrativeInput {
  gameCount: number
  calibrationLevel: number
  headline: {
    label: string
    frequency: number
    occurrences: number
    avgCp: number
    exhibit: { rootSan: string; rootMoveNumber: number; blunderSan: string; blunderMoveNumber: number }
  } | null
  additional: Array<{ label: string; frequency: number; avgCp: number }>
  fallbackChain: {
    rootSan: string
    rootMoveNumber: number
    blunderSan: string
    blunderMoveNumber: number
    swingCp: number
  } | null
  trajectory: { headlineLabel: string; direction: 'improving' | 'stable' | 'declining' } | null
}

export interface BatchReportResult {
  verdict: string
  patternSentences: string[]
  trajectorySentence: string | null
  narrative: string
}

const TRAJECTORY_DISPLAY: Record<'improving' | 'stable' | 'declining', string> = {
  improving: 'improving',
  stable: 'stable',
  declining: 'worsening',
}

export async function generateBatchReport(input: BatchNarrativeInput): Promise<BatchReportResult> {
  const wantTrajectory = input.trajectory !== null
  const expectAdditional = input.additional.length

  const system = `You are a chess coach summarizing a cross-game analysis. ${voiceFor(input.calibrationLevel)}
Respond with JSON {"verdict": "...", "additional": ["...", ...], "trajectory": ${wantTrajectory ? '"..."' : 'null'}}.
Rules — non-negotiable:
- "verdict": EXACTLY ONE sentence. ${input.headline ? `It must follow the shape "You keep losing the same way — [habit], in ${input.headline.frequency} of ${input.gameCount} games." — habit-specific, grounded in the given facts.` : `No habit recurred in enough games: frame it as "not enough games to confirm a habit — here's your most expensive decision", naming the given root move and blunder.`}
- "additional": EXACTLY ${expectAdditional} strings, one per additional pattern, each EXACTLY ONE sentence.
- ${wantTrajectory ? '"trajectory": EXACTLY ONE sentence on the direction of the headline habit vs the previous batch.' : '"trajectory": must be null — this is a first analysis, never invent a comparison.'}
- Costs are pawns or centipawns, never Elo. Sentence case. No headers, no lists.
You are given computed engine facts only; never invent moves, counts, or evaluations.`

  const payload = {
    gamesAnalyzed: input.gameCount,
    headline: input.headline,
    additionalPatterns: input.additional,
    fallbackChain: input.headline ? null : input.fallbackChain,
    trajectory: input.trajectory
      ? { headlineLabel: input.trajectory.headlineLabel, direction: TRAJECTORY_DISPLAY[input.trajectory.direction] }
      : null,
  }

  const fallbackVerdict = input.headline
    ? `You keep losing the same way — ${input.headline.label.toLowerCase()}, in ${input.headline.frequency} of ${input.gameCount} games.`
    : input.fallbackChain
      ? `Not enough games to confirm a habit — your most expensive decision was ${input.fallbackChain.rootSan} at move ${input.fallbackChain.rootMoveNumber}, which led to ${input.fallbackChain.blunderSan} at move ${input.fallbackChain.blunderMoveNumber}.`
      : 'Analysis complete — no recurring weaknesses detected in this batch.'

  const result = await jsonCall<{ verdict: string; additional: string[]; trajectory: string | null }>(
    system,
    payload,
    p =>
      isOneSentence(p.verdict) &&
      Array.isArray(p.additional) &&
      p.additional.length === expectAdditional &&
      p.additional.every(isOneSentence) &&
      (wantTrajectory ? typeof p.trajectory === 'string' && isOneSentence(p.trajectory) : p.trajectory === null || p.trajectory === undefined)
  ).catch(() => ({
    verdict: fallbackVerdict,
    additional: input.additional.map(
      a => `${a.label} appeared in ${a.frequency} of ${input.gameCount} games at an average cost of ${(a.avgCp / 100).toFixed(1)} pawns.`
    ),
    trajectory: wantTrajectory && input.trajectory
      ? `Your ${input.trajectory.headlineLabel.toLowerCase()} habit is ${TRAJECTORY_DISPLAY[input.trajectory.direction]} compared to your previous batch.`
      : null,
  }))

  const verdict = truncateToOneSentence(result.verdict)
  const patternSentences = result.additional.map(truncateToOneSentence)
  const trajectorySentence = wantTrajectory && result.trajectory ? truncateToOneSentence(result.trajectory) : null

  return {
    verdict,
    patternSentences,
    trajectorySentence,
    narrative: [verdict, ...patternSentences, ...(trajectorySentence ? [trajectorySentence] : [])].join(' '),
  }
}
