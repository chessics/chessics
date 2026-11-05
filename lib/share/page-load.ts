import * as React from 'react'
import { createServiceClient } from '@/lib/supabase/service'
import { sharePositionsEnabled } from '@/lib/flags'
import { isShareSlug } from './slug'
import { loadPublicShare, type ShareRead } from './read'
import type { PublicShare } from './payload'

type Cache = <F extends (...args: never[]) => unknown>(fn: F) => F
const cache: Cache = (React as unknown as { cache?: Cache }).cache ?? (fn => fn)

export const loadShareForPage = cache(async (slug: string): Promise<ShareRead<PublicShare>> => {
  if (!sharePositionsEnabled('live') || !isShareSlug(slug)) return { kind: 'missing' }
  let db
  try {
    db = createServiceClient()
  } catch {
    console.error('[share] no service client for /p')
    return { kind: 'error' }
  }
  return loadPublicShare(db as never, slug)
})
