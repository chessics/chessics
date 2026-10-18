'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { googleSignInEnabled } from '@/lib/auth/google'
import { EMAIL_CONFIRM_REDIRECT_PATH, signUpOutcome } from '@/lib/auth/signup'
import { GUEST_SESSION_KEY, transferGuestSession } from '@/lib/auth/transfer'
import SignInFooter from '@/components/auth/SignInFooter'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmFor, setConfirmFor] = useState<string | null>(null)
  const [guestInBrowser, setGuestInBrowser] = useState(false)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(GUEST_SESSION_KEY)
      setGuestInBrowser(Boolean(raw && (JSON.parse(raw) as { sessionToken?: string }).sessionToken))
    } catch {
      setGuestInBrowser(false)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin + EMAIL_CONFIRM_REDIRECT_PATH },
    })

    if (authError) {
      if (authError.message.toLowerCase().includes('already registered')) {
        setError('An account with this email already exists. Try signing in.')
      } else if (authError.message.toLowerCase().includes('password')) {
        setError('Password must be at least 6 characters.')
      } else {
        setError('Something went wrong. Please try again.')
      }
      setLoading(false)
      return
    }

    if (signUpOutcome(data.session) === 'confirm_email') {
      setConfirmFor(email)
      setLoading(false)
      return
    }

    const user = data.user
    if (user) {
      await supabase.from('profiles').insert({ id: user.id })

      await transferGuestSession()
    }

    router.push('/workbench')
    router.refresh()
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div>
          <Link href="/" className="font-logo" style={{ fontSize: 28, color: 'var(--text)' }}>
            chess<span style={{ color: 'var(--gold)' }}>ics</span>
          </Link>
          <h2 className="mt-4 text-xl font-semibold" style={{ color: 'var(--text)' }}>Create your account</h2>
        </div>

        {confirmFor ? (
          <div role="status" className="flex flex-col gap-3" style={{ borderTop: '1px solid var(--brass)', paddingTop: 16 }}>
            <p className="text-sm" style={{ color: 'var(--text)' }}>
              Check your email. We sent a confirmation link to {confirmFor}.
            </p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Click it to finish signing up, then come back here. You are not signed in until you do, and games you
              analyse before that are not saved to your account.
            </p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Already confirmed?{' '}
              <Link href="/login" style={{ color: 'var(--brass)', textDecoration: 'underline' }}>
                Sign in
              </Link>
            </p>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            className="w-full px-4 py-3 rounded-lg text-sm outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', color: 'var(--text)' }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            className="w-full px-4 py-3 rounded-lg text-sm outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', color: 'var(--text)' }}
          />

          {error && (
            <p className="text-xs px-1" style={{ color: 'var(--blunder)' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg text-sm font-medium transition-opacity"
            style={{
              background: 'var(--gold)',
              color: '#1a1512',
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        )}

        {googleSignInEnabled() && (
          <>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>or</span>
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            </div>

            <button
              type="button"
              onClick={async () => {
                const supabase = createClient()
                await supabase.auth.signInWithOAuth({
                  provider: 'google',
                  options: {
                    redirectTo: window.location.origin + '/api/auth/callback?next=/auth/complete',
                  },
                })
              }}
              className="w-full py-3 rounded-lg text-sm font-medium flex items-center justify-center gap-3 transition-opacity hover:opacity-80"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text)',
                cursor: 'pointer',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
          </>
        )}

        <SignInFooter confirming={confirmFor !== null} guestInBrowser={guestInBrowser} />
      </div>
    </main>
  )
}
