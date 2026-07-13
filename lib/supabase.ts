import { createBrowserClient } from '@supabase/ssr'

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseUrl = rawUrl.startsWith('http') ? rawUrl : 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

// Cookie-based session storage so proxy.ts and route handlers can see the
// signed-in user; all queries carry the user's JWT, making auth.uid() work
// under RLS.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)
