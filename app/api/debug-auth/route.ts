import { NextResponse } from 'next/server'

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? 'NOT SET'
  const nextauthUrl = process.env.NEXTAUTH_URL ?? 'NOT SET'
  const redirectUri = `${nextauthUrl}/api/auth/callback/google`

  return NextResponse.json({
    nextauth_url: nextauthUrl,
    redirect_uri: redirectUri,
    client_id_set: !!process.env.GOOGLE_CLIENT_ID,
    client_id_prefix: clientId.slice(0, 12) + '...',
    client_secret_set: !!process.env.GOOGLE_CLIENT_SECRET,
    nextauth_secret_set: !!process.env.NEXTAUTH_SECRET,
  })
}
