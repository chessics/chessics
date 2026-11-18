import SectionLinks from './SectionLinks'

export default function Sidebar() {
  return (
    <nav
      aria-label="Sections"
      className="flex flex-wrap items-center gap-1 border-b px-2 py-1 sm:flex-col sm:flex-nowrap sm:items-stretch sm:border-b-0 sm:border-r sm:py-4 shrink-0"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
    >
      <SectionLinks />
    </nav>
  )
}
