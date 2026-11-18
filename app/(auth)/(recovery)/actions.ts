'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { INVALID_LINK_PATH, RECOVERY_ACCOUNT_COOKIE, RECOVERY_REDIRECT_PATH, RESET_PATH } from '@/lib/auth/password-recovery'

export type RecoveryState = { error: string } | { sent: true } | null

export async function requestPasswordReset(_state: RecoveryState, form: FormData): Promise<RecoveryState> {
  const email = form.get('email')
  if (typeof email !== 'string' || !email.trim()) return { error: 'Enter your email address.' }

  try {
    const origin = headers().get('origin')
    if (!origin) return { error: 'Reload the page and try again.' }
    const supabase = await createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: new URL(RECOVERY_REDIRECT_PATH, origin).href,
    })
    if (error?.status === 429) return { error: 'Please wait a little before asking for another link.' }
    if (error && error.code !== 'user_not_found') return { error: 'The email could not be sent. Try again.' }
    return { sent: true }
  } catch {
    return { error: 'The email could not be sent. Try again.' }
  }
}

export async function setNewPassword(account: string, _state: RecoveryState, form: FormData): Promise<RecoveryState> {
  const store = cookies()
  if (!account || store.get(RECOVERY_ACCOUNT_COOKIE)?.value !== account) redirect(INVALID_LINK_PATH)
  const password = form.get('password')
  if (typeof password !== 'string' || password.length < 6) return { error: 'Use at least 6 characters.' }

  const supabase = await createClient()
  const { data: { user }, error: readError } = await supabase.auth.getUser()
  if (readError && (!readError.status || readError.status >= 500)) {
    return { error: 'Your account could not be checked. Try again.' }
  }
  if (user?.id !== account) redirect(INVALID_LINK_PATH)

  try {
    const { error } = await supabase.auth.updateUser({ password })
    if (error?.code === 'same_password') return { error: 'Choose a different password from your old one.' }
    if (error?.code === 'weak_password') return { error: 'Choose a stronger password and try again.' }
    if (error) return { error: 'Your password could not be saved. Try again.' }
  } catch {
    return { error: 'Your password could not be saved. Try again.' }
  }

  store.set(RECOVERY_ACCOUNT_COOKIE, '', { path: RESET_PATH, maxAge: 0 })
  redirect(RESET_PATH + '?updated=1')
}
