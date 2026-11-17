export const SIGNED_OUT_HINT = 'New here? Analyze your last games first, then sign up to keep the results.'

export default function SignedOut({ line }: { line: string }) {
  return (
    <div className="flex flex-col gap-4 p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-base font-medium" style={{ color: 'var(--text)' }}>
        {line}
      </p>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        {SIGNED_OUT_HINT}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <a href="/login" className="px-5 py-2.5 text-sm font-medium" style={{ background: 'var(--brass)', color: 'var(--bg)' }}>
          Sign in
        </a>
        <a href="/signup" className="text-sm" style={{ color: 'var(--text)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
          Sign up
        </a>
        <a href="/" className="text-sm" style={{ color: 'var(--text)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
          Analyze my games
        </a>
      </div>
    </div>
  )
}
