import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
