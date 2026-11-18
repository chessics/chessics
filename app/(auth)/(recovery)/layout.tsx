import Link from 'next/link'

export default function RecoveryLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm flex flex-col gap-4">
        <Link href="/" className="font-logo self-start text-text" style={{ fontSize: 28 }}>
          chess<span className="text-gold">ics</span>
        </Link>
        {children}
      </div>
    </main>
  )
}
