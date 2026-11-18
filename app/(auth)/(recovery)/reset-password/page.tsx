import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { INVALID_LINK_PATH, RECOVERY_ACCOUNT_COOKIE } from '@/lib/auth/password-recovery'
import RecoveryForm from '../RecoveryForm'

export const metadata: Metadata = { title: 'Set a new password' }

export default function ResetPasswordPage({ searchParams }: { searchParams: { updated?: string } }) {
  if (searchParams.updated === '1') {
    return (
      <>
        <h1 className="text-xl font-semibold">Password updated</h1>
        <Link href="/workbench" className="self-start text-sm text-gold underline">Go to the workbench</Link>
      </>
    )
  }

  const account = cookies().get(RECOVERY_ACCOUNT_COOKIE)?.value
  if (!account) redirect(INVALID_LINK_PATH)
  return (
    <>
      <h1 className="text-xl font-semibold">Set a new password</h1>
      <RecoveryForm account={account} />
    </>
  )
}
