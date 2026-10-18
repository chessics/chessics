export const EMAIL_CONFIRM_REDIRECT_PATH = '/api/auth/callback?next=/auth/complete'

export type SignUpOutcome = 'signed_in' | 'confirm_email'

export function signUpOutcome(session: unknown): SignUpOutcome {
  return session ? 'signed_in' : 'confirm_email'
}
