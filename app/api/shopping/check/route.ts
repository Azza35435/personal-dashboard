import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
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

// Woolworths' search/detail APIs reject cookieless requests intermittently,
// so warm up a session against the homepage first.
async function woolworthsCookies(): Promise<string> {
  const res = await fetch('https://www.woolworths.com.au/', {
    headers: { 'User-Agent': UA },
    cache: 'no-store',
  })
  const setCookies = res.headers.getSetCookie?.() ?? []
  return setCookies.map((c) => c.split(';')[0]).join('; ')
}

function wowHeaders(cookie: string): Record<string, string> {
  return {
    'User-Agent': UA,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Origin: 'https://www.woolworths.com.au',
    Referer: 'https://www.woolworths.com.au/',
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

  for (const item of (items ?? []) as ShoppingItem[]) {
    try {
      const stockcode = item.woolworths_url?.match(/productdetails\/(\d+)/)?.[1]
      const product = stockcode
        ? await wowDetail(stockcode, cookie)
        : await wowSearch(item.search_query?.trim() || item.name, cookie)

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
      errors.push({ item: item.name, store: 'woolworths', error: e instanceof Error ? e.message : String(e) })
    }
    await sleep(250)
  }

  const unsupported = (items ?? []).some((i: ShoppingItem) => i.coles_url || i.chemist_url)
  return NextResponse.json({
    checkedAt: now,
    checked: results.length,
    onSale: results.filter((r) => r.met).length,
    results,
    errors,
    ...(unsupported ? { note: 'Coles and Chemist Warehouse checking is not supported yet — only Woolworths prices were fetched.' } : {}),
  })
}
