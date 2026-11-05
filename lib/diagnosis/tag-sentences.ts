export interface TagSentences {
  finding: string
  headline: string
}

export const TAG_SENTENCES: Readonly<Record<string, TagSentences>> = {
  missed_knight_fork: {
    finding: "The move on each board came between moves 10 and 30, and your opponent's reply made the engine rate your position much worse.",
    headline: "your opponent's reply to one of your moves between moves 10 and 30 made the engine rate your position much worse, and a blunder of yours followed",
  },
  bad_bishop_trade: {
    finding: 'The move on each board was a bishop capture between moves 10 and 40 that lost ground, but less than a blunder.',
    headline: 'a bishop capture between moves 10 and 40 began a slide that ended in a blunder',
  },
  pawn_structure_weakness: {
    finding: 'The move on each board was a pawn move between moves 5 and 40 that lost ground, but less than a blunder.',
    headline: 'a pawn move between moves 5 and 40 began a slide that ended in a blunder',
  },
  premature_piece_exchange: {
    finding: 'The move on each board was a capture between moves 10 and 25.',
    headline: 'a capture between moves 10 and 25 began a slide that ended in a blunder',
  },
  missed_tactical_shot: {
    finding: "After the move on each board, your opponent's reply made the engine rate your position much worse.",
    headline: "your opponent's reply to one of your moves made the engine rate your position much worse, and a blunder of yours followed",
  },
  missed_mating_pattern: {
    finding: "After the move on each board the engine had you winning, and after your opponent's reply no better than a bit better.",
    headline: "the engine had you winning after one of your moves and no better than a bit better after your opponent's reply, and a blunder of yours followed",
  },
  hanging_piece: {
    finding: 'The engine rated the move on each board a blunder, and a second blunder later ended the slide it began.',
    headline: 'one blunder began a slide that a second blunder ended',
  },
  opening_preparation_gap: {
    finding: 'The move on each board came in the first 15 moves of the game.',
    headline: 'a move in the first 15 began a slide that ended in a blunder',
  },
  king_safety: {
    finding: 'The move on each board came between moves 15 and 35.',
    headline: 'a move between moves 15 and 35 began a slide that ended in a blunder',
  },
  passive_rook_endgame: {
    finding: 'The move on each board was an inaccuracy after move 30.',
    headline: 'an inaccuracy after move 30 began a slide that ended in a blunder',
  },
  poor_piece_coordination: {
    finding: 'The move on each board either was one of three inaccuracies in a row or began a slide that ran through two or more smaller losses.',
    headline: 'a slide that ended in a blunder either began with one of three inaccuracies in a row or ran through two or more smaller losses',
  },
  failed_endgame_conversion: {
    finding: 'The move on each board came after move 35.',
    headline: 'a move after move 35 began a slide that ended in a blunder',
  },
  time_pressure_blunder: {
    finding: 'The move on each board came after move 30.',
    headline: 'a move after move 30 began a slide that ended in a blunder',
  },
  weak_back_rank: {
    finding: 'The move on each board came after move 15.',
    headline: 'a move after move 15 began a slide that ended in a blunder',
  },
}

export function tagSentences(tag: string): TagSentences | null {
  return Object.prototype.hasOwnProperty.call(TAG_SENTENCES, tag) ? TAG_SENTENCES[tag]! : null
}
