import Topbar from '@/components/layout/Topbar'
import Sidebar from '@/components/layout/Sidebar'
import { createClient } from '@/lib/supabase/server'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <Topbar signedIn={!!session} />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 min-w-0 p-4 sm:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
