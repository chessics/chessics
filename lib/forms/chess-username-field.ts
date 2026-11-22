export const CHESS_USERNAME_FIELD = {
  type: 'search',
  name: 'chess-player-search',
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'none',
  spellCheck: false,
  'data-1p-ignore': 'true',
  'data-lpignore': 'true',
  'data-bwignore': 'true',
  'data-form-type': 'other',
} as const

export const WORD_JOINER = '\u2060'

export function chessUsernameText(text: string): string {
  return text.replace(/(user)(\s?name)/gi, `$1${WORD_JOINER}$2`)
}
