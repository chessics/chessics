import { notFound } from 'next/navigation'
import { FLAGS } from '@/lib/flags'

export default function ProgressPage() {
  if (!FLAGS.progressPage) notFound()
  return null
}
