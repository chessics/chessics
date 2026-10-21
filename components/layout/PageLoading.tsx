export default function PageLoading({ label, width = '' }: { label: string; width?: string }) {
  return (
    <div role="status" className={`${width} flex flex-col gap-4 pt-2`}>
      <hr className="hairline w-full" />
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
    </div>
  )
}
