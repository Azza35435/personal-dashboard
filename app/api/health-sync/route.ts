import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const secret = process.env.HEALTH_SYNC_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // The iOS shortcut authenticates with a shared secret, not a user session,
  // so rows are stamped with the admin's (Aaron's) user id.
  const supabase = supabaseAdmin()
  const { data: admin } = await supabase
    .from('profiles')
    .select('id')
    .eq('is_admin', true)
    .limit(1)
    .maybeSingle()
  if (!admin) return NextResponse.json({ error: 'No admin profile found' }, { status: 500 })

  const raw = body as Record<string, unknown>
  const records: unknown[] = Array.isArray(raw.records) ? raw.records : [raw]

  const rows = records
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .filter(r => typeof r.date === 'string' && r.date)
    .map(r => ({
      user_id: admin.id as string,
      date: r.date as string,
      steps: (r.steps as number) ?? null,
      active_energy_kcal: (r.active_energy_kcal as number) ?? null,
      resting_hr: (r.resting_hr as number) ?? null,
      hrv_ms: (r.hrv_ms as number) ?? null,
      sleep_total_min: (r.sleep_total_min as number) ?? null,
      sleep_deep_min: (r.sleep_deep_min as number) ?? null,
      sleep_rem_min: (r.sleep_rem_min as number) ?? null,
      sleep_core_min: (r.sleep_core_min as number) ?? null,
      sleep_awake_min: (r.sleep_awake_min as number) ?? null,
      blood_oxygen_pct: (r.blood_oxygen_pct as number) ?? null,
      respiratory_rate: (r.respiratory_rate as number) ?? null,
      vo2_max: (r.vo2_max as number) ?? null,
      exercise_min: (r.exercise_min as number) ?? null,
      stand_hours: (r.stand_hours as number) ?? null,
      weight_kg: (r.weight_kg as number) ?? null,
      updated_at: new Date().toISOString(),
    }))

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No valid records' }, { status: 400 })
  }

  const { error } = await supabase
    .from('apple_health_logs')
    .upsert(rows, { onConflict: 'user_id,date' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, synced: rows.length })
}
