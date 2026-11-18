import { isUuid } from '@/lib/uuid'
import { loginReviewPath } from '@/lib/auth/next-path'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()

  const { pathname } = request.nextUrl

  const batch = /^\/workbench\/batch\/([^/]+)\/?$/.exec(pathname)
  if (batch && (!session || !isUuid(batch[1]))) {
    const response = NextResponse.rewrite(new URL('/404', request.url), { status: 404 })
    response.headers.set('Cache-Control', 'private, no-store')
    for (const cookie of supabaseResponse.cookies.getAll()) response.cookies.set(cookie)
    return response
  }

  if (session && (pathname === '/login' || pathname === '/signup')) {
    const next = pathname === '/login' ? request.nextUrl.searchParams.get('next') : null
    return NextResponse.redirect(new URL(loginReviewPath(next), request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
