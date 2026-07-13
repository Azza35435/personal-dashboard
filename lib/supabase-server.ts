// Server-only Supabase helpers. Do not import from client components —
// next/headers is server-only.
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

/**
 * Cookie-aware client for route handlers / server components.
 * Sees the signed-in user's session, so queries run under their RLS identity.
 */
export async function createRouteHandlerClient() {
  const cookieStore = await cookies()
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: cookiesToSet => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Called from a Server Component where cookies are read-only —
          // safe to ignore, proxy.ts keeps the session refreshed.
        }
      },
    },
  })
}

/**
 * Service-role client for trusted server-side jobs (price checker, health
 * sync) that run without a user session and must span users. Bypasses RLS —
 * never expose to the browser.
 */
export function supabaseAdmin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
