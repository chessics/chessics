import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  const origin = new URL(request.url).origin
  return NextResponse.redirect(`${origin}/`, { status: 302 })
}
