import SectionLinks from './SectionLinks'
import SettingsMenu from './SettingsMenu'
import AccountSwitcher, { type SwitcherAccount } from '@/components/accounts/AccountSwitcher'

export default function Sidebar({
  accounts = null,
}: {
  accounts?: { list: SwitcherAccount[]; activeId: string | null } | null
}) {
  return (
    <nav
      aria-label="Sections"
      className="flex flex-wrap items-center gap-1 border-b px-2 py-1 sm:flex-col sm:flex-nowrap sm:items-stretch sm:border-b-0 sm:border-r sm:py-4 shrink-0 sm:sticky sm:top-14 sm:self-start sm:h-[calc(100vh-3.5rem)]"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
    >
      {accounts && <AccountSwitcher accounts={accounts.list} activeId={accounts.activeId} />}
      <SectionLinks />
      <div className="hidden sm:block sm:mt-auto">
        <SettingsMenu variant="sidebar" linkedAccounts={accounts !== null} />
      </div>
    </nav>
  )
}
