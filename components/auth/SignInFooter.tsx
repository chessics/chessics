import Link from 'next/link'

export default function SignInFooter({ confirming, guestInBrowser }: { confirming: boolean; guestInBrowser: boolean }) {
  if (confirming) return null
  return (
    <p className="text-xs text-center" style={{ color: 'var(--text-dim)' }}>
      Already have an account?{' '}
      <Link href="/login" style={{ color: 'var(--gold-dim)', textDecoration: 'underline' }}>
        Sign in
      </Link>
      {guestInBrowser ? ' to keep the games you analysed as a guest.' : ''}
    </p>
  )
}
