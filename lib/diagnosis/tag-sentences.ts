export interface TagSentences {
  finding: string
  headline: string
}

export const TAG_SENTENCES: Readonly<Record<string, TagSentences>> = {
  missed_knight_fork: {
    finding: 'Each board shows a move that let your opponent hit back hard.',
    headline: 'a move let your opponent hit back hard, and a blunder followed',
  },
  bad_bishop_trade: {
    finding: 'Each board shows a bishop capture that led to a later blunder.',
    headline: 'a bishop capture led to a later blunder',
  },
  pawn_structure_weakness: {
    finding: 'Each board shows a pawn move that left you with a doubled, isolated or backward pawn.',
    headline: 'a pawn move left you with a weak pawn, and a blunder followed',
  },
  premature_piece_exchange: {
    finding: 'Each board shows a capture that led to a later blunder.',
    headline: 'a capture led to a later blunder',
  },
  missed_tactical_shot: {
    finding: 'Each board shows a move that let your opponent hit back hard.',
    headline: 'a move let your opponent hit back hard, and a blunder followed',
  },
  missed_mating_pattern: {
    finding: 'After the move on each board you were winning, and then your opponent hit back.',
    headline: 'you were winning, your opponent hit back, and a blunder followed',
  },
  hanging_piece: {
    finding: 'Each board shows a blunder that led to a second one.',
    headline: 'one blunder led to a second one',
  },
  opening_preparation_gap: {
    finding: 'Each board shows a mistake in the opening that led to a later blunder.',
    headline: 'a mistake in the opening led to a later blunder',
  },
  middlegame_slip: {
    finding: 'Each board shows a mistake in the middlegame that led to a later blunder.',
    headline: 'a mistake in the middlegame led to a later blunder',
  },
  king_safety: {
    finding: 'Each board shows a pawn move in front of your castled king.',
    headline: 'a pawn move in front of your castled king led to a later blunder',
  },
  passive_rook_endgame: {
    finding: 'Each board shows a small slip late in the game.',
    headline: 'a small slip late in the game led to a blunder',
  },
  poor_piece_coordination: {
    finding: 'Each board shows the first of several small slips in a row.',
    headline: 'several small slips added up to a blunder',
  },
  failed_endgame_conversion: {
    finding: 'Each board shows a mistake late in the game that led to a blunder.',
    headline: 'a mistake late in the game led to a blunder',
  },
  time_pressure_blunder: {
    finding: 'Each board shows a mistake late in the game that led to a blunder.',
    headline: 'a mistake late in the game led to a blunder',
  },
  weak_back_rank: {
    finding: 'Each board shows a mistake after the opening that led to a later blunder.',
    headline: 'a mistake after the opening led to a later blunder',
  },
}

export function tagSentences(tag: string): TagSentences | null {
  return Object.prototype.hasOwnProperty.call(TAG_SENTENCES, tag) ? TAG_SENTENCES[tag]! : null
}
