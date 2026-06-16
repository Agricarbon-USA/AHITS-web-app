import { createClient } from '@supabase/supabase-js'

/**
 * Supabase admin client using the service role key.
 * Only for server-side use — never import from client components.
 * Bypasses Row Level Security so storage uploads always succeed
 * regardless of bucket policies.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
