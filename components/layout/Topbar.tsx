import Link from 'next/link'
import SettingsMenu from './SettingsMenu'

export default function Topbar({ signedIn, linkedAccounts = false }: { signedIn: boolean; linkedAccounts?: boolean }) {
  return (
    <header
      className="flex items-center justify-between gap-3 px-4 sm:px-6 h-14 shrink-0"
      style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      <Link href={signedIn ? '/workbench' : '/'} className="font-logo select-none" style={{ fontSize: 20, lineHeight: 1 }}>
        <span style={{ color: 'var(--text)' }}>chess</span>
        <span style={{ color: 'var(--text-muted)' }}>ics</span>
      </Link>

      <div className="flex items-center gap-3">
        {signedIn ? (
          <Link href="/analyze" className="topbar-action">
            Analyze games
          </Link>
        ) : (
          <Link href="/login" className="topbar-action">
            Sign in
          </Link>
        )}
        <div className="sm:hidden">
          <SettingsMenu linkedAccounts={linkedAccounts} signedIn={signedIn} />
        </div>
      </div>
    </header>
  )
}
