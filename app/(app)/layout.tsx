import Topbar from '@/components/layout/Topbar'
import Sidebar from '@/components/layout/Sidebar'
import { createClient } from '@/lib/supabase/server'
import { accountScope } from '@/lib/accounts/active'
import type { SwitcherAccount } from '@/components/accounts/AccountSwitcher'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  let accounts: { list: SwitcherAccount[]; activeId: string | null } | null = null
  if (session) {
    try {
      const scope = await accountScope(supabase, session.user.id)
      if (scope.scoped) {
        accounts = {
          list: scope.accounts.map(({ id, platform, username }) => ({ id, platform, username })),
          activeId: scope.active?.id ?? null,
        }
      }
    } catch (err) {
      console.error('[layout] linked accounts:', err)
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <Topbar signedIn={!!session} linkedAccounts={accounts !== null} />
      <div className="flex flex-1 flex-col sm:flex-row">
        <Sidebar accounts={accounts} signedIn={!!session} />
        <main className="flex-1 min-w-0 p-4 sm:p-6 overflow-auto [--review-scroll-inset:3.5rem]">
          {children}
        </main>
      </div>
    </div>
  )
}
