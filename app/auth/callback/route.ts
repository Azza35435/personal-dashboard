import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-server'

// OAuth (PKCE) landing point: Supabase redirects here with ?code= after the
// Google consent screen. Exchange it for a session cookie, then head home.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')

  if (error) {
    const message = errorDescription || error
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, url.origin))
  }

  if (code) {
    const supabase = await createRouteHandlerClient()
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    if (exchangeError) {
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(exchangeError.message)}`, url.origin))
    }
  }

  return NextResponse.redirect(new URL('/', url.origin))
}
