import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-server'

// OAuth (PKCE) landing point: Supabase redirects here with ?code= after the
// Google consent screen. Exchange it for a session cookie; when Google also
// returned provider tokens (offline access + calendar scope granted), stash
// them so /api/calendar can act on the user's behalf.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')
  const nextParam = url.searchParams.get('next')
  const next = nextParam?.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/'

  if (error) {
    const message = errorDescription || error
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, url.origin))
  }

  if (code) {
    const supabase = await createRouteHandlerClient()
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    if (exchangeError) {
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(exchangeError.message)}`, url.origin))
    }

    const session = data?.session
    if (session?.provider_refresh_token) {
      // The exchanged session authenticates this client, so RLS lets us
      // write the user's own row. provider_token has no expiry attached —
      // leave expires_at null and let /api/calendar refresh on first use.
      await supabase.from('google_tokens').upsert(
        {
          user_id: session.user.id,
          refresh_token: session.provider_refresh_token,
          access_token: session.provider_token ?? null,
          expires_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
    }
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
