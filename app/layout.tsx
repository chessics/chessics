import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Chessics — Find out why you\'re losing',
  description: 'A chess improvement workbench that traces blunders back to the earlier decision that made them inevitable.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
