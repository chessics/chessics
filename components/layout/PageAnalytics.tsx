'use client'

import { Analytics } from '@vercel/analytics/next'
import { scrubPageEvent } from '@/lib/analytics/page-url'

export default function PageAnalytics() {
  return <Analytics beforeSend={scrubPageEvent} />
}
