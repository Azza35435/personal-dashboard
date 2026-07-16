'use client'

import { supabase } from '@/lib/supabase'
import type { SharedTool } from '@/lib/types'

// First group the current user belongs to that shares the given tool —
// new rows in shareable widgets are stamped with it (null = private).
// Backed by the SECURITY DEFINER my_shared_groups() SQL function.
export async function firstSharedGroup(tool: SharedTool): Promise<string | null> {
  const { data } = await supabase.rpc('my_shared_groups', { p_tool: tool })
  return (data as string[] | null)?.[0] ?? null
}
