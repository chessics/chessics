export default function LoadFailed({ what, href }: { what: string; href: string }) {
  return (
    <div className="flex flex-col gap-3 p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-base font-medium" style={{ color: 'var(--text)' }}>
        {what} didn&apos;t load.
      </p>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Nothing was lost. Reload the page to try again.
      </p>
      <a href={href} className="text-sm w-fit" style={{ color: 'var(--brass)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
        Reload the page
      </a>
    </div>
  )
}
