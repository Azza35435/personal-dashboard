import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { meetsRule } from '@/lib/shopping'
import type { ShoppingItem } from '@/lib/types'

export const dynamic = 'force-dynamic'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

interface WowProduct {
  Stockcode: number
  Name: string
  DisplayName: string
  UrlFriendlyName: string | null
  Price: number | null
  InstorePrice: number | null
  WasPrice: number | null
  IsOnSpecial: boolean
  IsAvailable: boolean
}

// Akamai bot protection fingerprints more than the UA — send the full set of
// headers a real Chrome navigation/XHR would, or datacenter IPs get 403'd.
const CHROME_HINTS: Record<string, string> = {
  'User-Agent': UA,
  'Accept-Language': 'en-AU,en;q=0.9',
  'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
}

// Woolworths' search/detail APIs reject cookieless requests intermittently,
// so warm up a session against the homepage first.
async function woolworthsCookies(): Promise<string> {
  const res = await fetch('https://www.woolworths.com.au/', {
    headers: {
      ...CHROME_HINTS,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Dest': 'document',
      'Upgrade-Insecure-Requests': '1',
    },
    cache: 'no-store',
  })
  const setCookies = res.headers.getSetCookie?.() ?? []
  return setCookies.map((c) => c.split(';')[0]).join('; ')
}

function wowHeaders(cookie: string): Record<string, string> {
  return {
    ...CHROME_HINTS,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Origin: 'https://www.woolworths.com.au',
    Referer: 'https://www.woolworths.com.au/',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    ...(cookie ? { Cookie: cookie } : {}),
  }
}

async function wowSearch(term: string, cookie: string): Promise<WowProduct | null> {
  const res = await fetch('https://www.woolworths.com.au/apis/ui/Search/products', {
    method: 'POST',
    headers: wowHeaders(cookie),
    body: JSON.stringify({ SearchTerm: term, PageSize: 10, PageNumber: 1, SortType: 'TraderRelevance' }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Woolworths search failed (${res.status})`)
  const json = await res.json()
  const groups: { Products?: WowProduct[] }[] = json?.Products ?? []
  for (const group of groups) {
    const p = group?.Products?.[0]
    if (p && p.IsAvailable !== false) return p
  }
  return null
}

async function wowDetail(stockcode: string, cookie: string): Promise<WowProduct | null> {
  const res = await fetch(`https://www.woolworths.com.au/apis/ui/product/detail/${stockcode}`, {
    headers: wowHeaders(cookie),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Woolworths product lookup failed (${res.status})`)
  const json = await res.json()
  return json?.Product ?? null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function POST() {
  // Service role: the checker spans every user's watched items and runs
  // without a session (RLS would otherwise scope it to the caller).
  let supabase: ReturnType<typeof supabaseAdmin>
  try {
    supabase = supabaseAdmin()
  } catch {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server' },
      { status: 500 }
    )
  }

  const { data: items, error } = await supabase
    .from('shopping_items')
    .select('*')
    .eq('status', 'watching')
    .order('position')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: { item: string; price: number | null; wasPrice: number | null; onSpecial: boolean; met: boolean }[] = []
  const errors: { item: string; store: string; error: string }[] = []
  const now = new Date().toISOString()

  let cookie = ''
  try {
    cookie = await woolworthsCookies()
  } catch {
    // proceed cookieless; individual requests may still succeed
  }

  // One fresh-cookie retry per run when Woolworths blocks us (403/429).
  let retriedBlock = false
  const fetchProduct = async (item: ShoppingItem): Promise<WowProduct | null> => {
    const stockcode = item.woolworths_url?.match(/productdetails\/(\d+)/)?.[1]
    const attempt = () =>
      stockcode
        ? wowDetail(stockcode, cookie)
        : wowSearch(item.search_query?.trim() || item.name, cookie)
    try {
      return await attempt()
    } catch (e) {
      const blocked = e instanceof Error && /\((403|429)\)/.test(e.message)
      if (!blocked || retriedBlock) throw e
      retriedBlock = true
      await sleep(1200)
      cookie = await woolworthsCookies().catch(() => cookie)
      return attempt()
    }
  }

  for (const item of (items ?? []) as ShoppingItem[]) {
    try {
      const product = await fetchProduct(item)

      if (!product) {
        errors.push({ item: item.name, store: 'woolworths', error: 'No matching product found' })
        await supabase.from('shopping_items').update({ on_sale_now: false }).eq('id', item.id)
        continue
      }

      const price = product.Price ?? product.InstorePrice ?? null
      const wasPrice = product.WasPrice ?? null
      const onSpecial = !!product.IsOnSpecial
      const productUrl = product.Stockcode
        ? `https://www.woolworths.com.au/shop/productdetails/${product.Stockcode}/${product.UrlFriendlyName ?? ''}`
        : item.woolworths_url

      const { data: prevRows } = await supabase
        .from('shopping_prices')
        .select('price, was_price, on_special')
        .eq('item_id', item.id)
        .eq('store', 'woolworths')
        .order('checked_at', { ascending: false })
        .limit(1)
      const prev = prevRows?.[0]
      const prevMet = prev ? meetsRule(item, prev.price, prev.was_price, prev.on_special) : false
      const newMet = meetsRule(item, price, wasPrice, onSpecial)

      await supabase.from('shopping_prices').insert({
        item_id: item.id,
        user_id: item.user_id, // service role bypasses the auth.uid() default
        store: 'woolworths',
        product_name: product.DisplayName || product.Name,
        product_url: productUrl,
        price,
        was_price: wasPrice,
        on_special: onSpecial,
      })

      const update: Record<string, unknown> = { on_sale_now: newMet }
      if (newMet && !prevMet) update.last_sale_detected_at = now
      await supabase.from('shopping_items').update(update).eq('id', item.id)

      results.push({ item: item.name, price, wasPrice, onSpecial, met: newMet })
    } catch (e) {
      let msg = e instanceof Error ? e.message : String(e)
      if (/\((403|429)\)/.test(msg)) {
        msg += ' — Woolworths bot protection blocked the server; wait a few minutes and try again'
      }
      errors.push({ item: item.name, store: 'woolworths', error: msg })
    }
    await sleep(250)
  }

  const unsupported = (items ?? []).some((i: ShoppingItem) => i.coles_url || i.chemist_url)
  // Every item bot-blocked → the server IP is blocked (typical on Vercel);
  // the client shows a "checks run locally instead" note rather than errors.
  const blocked =
    errors.length > 0 && errors.length === (items ?? []).length && errors.every((e) => /\((403|429)\)/.test(e.error))
  return NextResponse.json({
    checkedAt: now,
    checked: results.length,
    onSale: results.filter((r) => r.met).length,
    results,
    errors,
    blocked,
    ...(unsupported ? { note: 'Coles and Chemist Warehouse checking is not supported yet — only Woolworths prices were fetched.' } : {}),
  })
}
