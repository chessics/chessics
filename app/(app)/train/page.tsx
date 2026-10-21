import type { Metadata } from 'next'
import TrainingSession from '@/components/training/TrainingSession'
import GuestTransferRetry from '@/components/auth/GuestTransferRetry'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Train' }

export const dynamic = 'force-dynamic'

export default async function TrainPage() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  return (
    <>
      <GuestTransferRetry signedIn={!!session} />
      <TrainingSession mode="live" />
    </>
  )
}
