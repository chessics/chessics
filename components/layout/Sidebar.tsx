import SectionLinks from './SectionLinks'
import SettingsMenu from './SettingsMenu'

export default function Sidebar() {
  return (
    <nav
      aria-label="Sections"
      className="flex flex-wrap items-center gap-1 border-b px-2 py-1 sm:flex-col sm:flex-nowrap sm:items-stretch sm:border-b-0 sm:border-r sm:py-4 shrink-0 sm:sticky sm:top-14 sm:self-start sm:h-[calc(100vh-3.5rem)]"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
    >
      <SectionLinks />
      <div className="hidden sm:block sm:mt-auto">
        <SettingsMenu variant="sidebar" />
      </div>
    </nav>
  )
}
