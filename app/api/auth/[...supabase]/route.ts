import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { safeRedirect } from '@/lib/auth/next-path'
import { INVALID_LINK_PATH, RECOVERY_ACCOUNT_COOKIE, RESET_PATH } from '@/lib/auth/password-recovery'
import { trackSignup } from '@/lib/analytics/track'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next')

  const recovering = next === RESET_PATH
  if (code && !(recovering && searchParams.has('error'))) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      if (recovering) {
        if (!data?.user) return NextResponse.redirect(origin + INVALID_LINK_PATH)
        const response = NextResponse.redirect(origin + RESET_PATH)
        response.cookies.set(RECOVERY_ACCOUNT_COOKIE, data.user.id, {
          path: RESET_PATH, maxAge: 15 * 60, httpOnly: true, sameSite: 'lax', secure: origin.startsWith('https://'),
        })
        return response
      }
      trackSignup(data?.user)
      return NextResponse.redirect(safeRedirect(origin, next))
    }
  }

  return NextResponse.redirect(origin + (recovering ? INVALID_LINK_PATH : '/login?error=auth'))
}
