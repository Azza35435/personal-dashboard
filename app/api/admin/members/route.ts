import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient, supabaseAdmin } from '@/lib/supabase-server'

// Admin-only: remove a member (or pending invite) by email. Deleting the
// auth user cascades through every user_id FK, wiping their data.
export async function DELETE(req: NextRequest) {
  const supa = await createRouteHandlerClient()
  const {
    data: { user },
  } = await supa.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let admin: ReturnType<typeof supabaseAdmin>
  try {
    admin = supabaseAdmin()
  } catch {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured' }, { status: 500 })
  }

  const { data: me } = await admin.from('profiles').select('email, is_admin').eq('id', user.id).maybeSingle()
  if (!me?.is_admin) return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  let body: { email?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const email = body.email?.trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })
  if (email === me.email.toLowerCase()) {
    return NextResponse.json({ error: "You can't remove your own account" }, { status: 400 })
  }

  await admin.from('allowed_users').delete().ilike('email', email)

  const { data: target } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle()
  if (target) {
    const { error } = await admin.auth.admin.deleteUser(target.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, deletedAccount: !!target })
}
