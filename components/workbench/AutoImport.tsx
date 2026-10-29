'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

let inflight: Promise<number> | null = null

export function requestImport(fetcher: typeof fetch = fetch): Promise<number> {
  inflight ??= fetcher('/api/import', { method: 'POST' })
    .then(async (res) => {
      if (!res.ok) return 0
      const body = (await res.json()) as { imported?: unknown }
      return typeof body.imported === 'number' ? body.imported : 0
    })
    .catch(() => 0)
    .finally(() => {
      setTimeout(() => {
        inflight = null
      }, 0)
    })
  return inflight
}

export async function runAutoImport({
  signedIn,
  enabled,
  request,
  refresh,
}: {
  signedIn: boolean
  enabled: boolean
  request: () => Promise<number>
  refresh: () => void
}): Promise<void> {
  if (!signedIn || !enabled) return
  if ((await request()) > 0) refresh()
}

export default function AutoImport({ signedIn, enabled }: { signedIn: boolean; enabled: boolean }) {
  const router = useRouter()
  useEffect(() => {
    void runAutoImport({ signedIn, enabled, request: () => requestImport(), refresh: () => router.refresh() })
  }, [signedIn, enabled, router])
  return null
}
