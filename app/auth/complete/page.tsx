'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { transferGuestSession } from '@/lib/auth/transfer'

export default function AuthCompletePage() {
  const router = useRouter()

  useEffect(() => {
    async function transferAndRedirect() {
      await transferGuestSession()
      router.replace('/workbench')
    }

    transferAndRedirect()
  }, [router])

  return (
    <main
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--bg)' }}
    >
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-6 h-6"
          style={{
            border: '2px solid var(--gold)',
            borderTopColor: 'transparent',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Setting up your account…
        </p>
      </div>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  )
}
