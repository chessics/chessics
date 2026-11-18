import type { Metadata } from 'next'
import RecoveryForm from '../RecoveryForm'

export const metadata: Metadata = { title: 'Reset your password' }

export default function ForgotPasswordPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <>
      <h1 className="text-xl font-semibold">Reset your password</h1>
      <RecoveryForm invalidLink={searchParams.error === 'link'} />
    </>
  )
}
