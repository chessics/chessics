import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  POSITION_PUBLIC_SELECT,
  toPublicPosition,
  NO_STORE_HEADERS,
  type PublicPositionRow,
} from '@/lib/training/position-payload'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    )
  }

  const { data, error } = await supabase
    .from('training_positions')
    .select(POSITION_PUBLIC_SELECT)
    .eq('id', params.id)
    .returns<PublicPositionRow[]>()
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      { error: 'Lookup failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    )
  }

  if (!data) {
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404, headers: NO_STORE_HEADERS }
    )
  }

  return NextResponse.json(toPublicPosition(data), { headers: NO_STORE_HEADERS })
}
