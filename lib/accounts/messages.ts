export function linkErrorMessage(code: string | undefined, platformLabel: string): string {
  switch (code) {
    case 'username_not_found':
      return `${platformLabel} has no account with that name.`
    case 'invalid_username':
      return 'That isn’t a valid username.'
    case 'too_many_accounts':
      return 'You’ve linked as many accounts as Chessics allows. Remove one to add another.'
    case 'site_unavailable':
      return `${platformLabel} didn’t answer. Try again in a minute.`
    case 'too_many_requests':
      return 'Too many requests just now. Try again in a minute.'
    case 'unauthorized':
      return 'Sign in again to link an account.'
    default:
      return 'The account wasn’t linked. Try again.'
  }
}

export function linkedMessage(r: { username: string; created: boolean; claimed: number; imported: number }): string {
  const total = r.claimed + r.imported
  if (!r.created) return `${r.username} is already linked. It’s the account shown now.`
  if (total === 0) return `Linked ${r.username}. Its recent rapid and blitz games will appear on the games page.`
  return `Linked ${r.username}, with ${total} ${total === 1 ? 'game' : 'games'} in its library. None is analysed until you ask.`
}
