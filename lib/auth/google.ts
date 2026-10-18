export function googleSignInEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true'
}
