export interface TagSentences {
  finding: string
  headline: string
}

export const TAG_SENTENCES: Readonly<Record<string, TagSentences>> = {
  missed_knight_fork: {
    finding: 'Each board shows a move between moves 10 and 30 that let your opponent hit back hard.',
    headline: 'a move between moves 10 and 30 let your opponent hit back hard, and you blundered after it',
  },
  bad_bishop_trade: {
    finding: 'Each board shows a bishop capture between moves 10 and 40 that cost you ground, but less than a blunder.',
    headline: 'a bishop capture between moves 10 and 40 cost you ground, and you blundered after it',
  },
  pawn_structure_weakness: {
    finding: 'Each board shows a pawn move between moves 5 and 40 that cost you ground, but less than a blunder.',
    headline: 'a pawn move between moves 5 and 40 cost you ground, and you blundered after it',
  },
  premature_piece_exchange: {
    finding: 'Each board shows a capture between moves 10 and 25.',
    headline: 'a capture between moves 10 and 25 cost you ground, and you blundered after it',
  },
  missed_tactical_shot: {
    finding: 'Each board shows a move that let your opponent hit back hard.',
    headline: 'one of your moves let your opponent hit back hard, and you blundered after it',
  },
  missed_mating_pattern: {
    finding: "After the move on each board you were winning, and your opponent's reply took most of that away.",
    headline: "you were winning, your opponent's reply took most of that away, and you blundered after it",
  },
  hanging_piece: {
    finding: 'Each board shows a blunder that led to a second one.',
    headline: 'one blunder led to a second one',
  },
  opening_preparation_gap: {
    finding: 'Each board shows a move from the first 15 moves of the game.',
    headline: 'a move in the first 15 cost you ground, and you blundered after it',
  },
  king_safety: {
    finding: 'Each board shows a move between moves 15 and 35.',
    headline: 'a move between moves 15 and 35 cost you ground, and you blundered after it',
  },
  passive_rook_endgame: {
    finding: 'Each board shows a small slip after move 30.',
    headline: 'a small slip after move 30 led to a blunder',
  },
  poor_piece_coordination: {
    finding: 'Each board shows one of three small slips in a row, or the first of several small losses in a row.',
    headline: 'several small slips added up to a blunder',
  },
  failed_endgame_conversion: {
    finding: 'Each board shows a move after move 35.',
    headline: 'a move after move 35 cost you ground, and you blundered after it',
  },
  time_pressure_blunder: {
    finding: 'Each board shows a move after move 30.',
    headline: 'a move after move 30 cost you ground, and you blundered after it',
  },
  weak_back_rank: {
    finding: 'Each board shows a move after move 15.',
    headline: 'a move after move 15 cost you ground, and you blundered after it',
  },
}

export function tagSentences(tag: string): TagSentences | null {
  return Object.prototype.hasOwnProperty.call(TAG_SENTENCES, tag) ? TAG_SENTENCES[tag]! : null
}
