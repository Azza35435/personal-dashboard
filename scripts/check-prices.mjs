// Standalone Woolworths price checker — same logic as /api/shopping/check,
// but runs directly on this machine (residential IP) because Woolworths'
// bot protection blocks Vercel's datacenter IPs.
//
// Zero npm dependencies (plain Supabase REST) so a copy can run from
// anywhere — launchd agents can't read ~/Documents (macOS TCC), so the
// scheduled copy lives in ~/.shopping-check/ with its own .env file.
//
// Run from repo:   node scripts/check-prices.mjs        (reads ../.env.local)
// Scheduled copy:  ~/.shopping-check/check-prices.mjs   (reads ./.env)
// Install/update the scheduled copy after editing this file:
//   cp scripts/check-prices.mjs ~/.shopping-check/check-prices.mjs

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const envPath = [join(here, '.env'), join(here, '..', '.env.local')].find((p) => existsSync(p))
if (!envPath) {
  console.error('No env file found (.env beside script or ../.env.local)')
  process.exit(1)
}
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)

const SUPA = env.NEXT_PUBLIC_SUPABASE_URL
// Service role required since per-user RLS: the anon key sees zero rows
// without a signed-in session.
const SUPA_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('Warning: SUPABASE_SERVICE_ROLE_KEY not set — falling back to anon key, which finds no items under RLS')
}
const SUPA_HEADERS = {
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
}

async function supaGet(pathQuery) {
  const res = await fetch(`${SUPA}/rest/v1/${pathQuery}`, { headers: SUPA_HEADERS })
  if (!res.ok) throw new Error(`Supabase GET ${pathQuery} failed (${res.status})`)
  return res.json()
}

async function supaWrite(method, pathQuery, body) {
  const res = await fetch(`${SUPA}/rest/v1/${pathQuery}`, {
    method,
    headers: SUPA_HEADERS,
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Supabase ${method} ${pathQuery} failed (${res.status}): ${await res.text()}`)
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const CHROME_HINTS = {
  'User-Agent': UA,
  'Accept-Language': 'en-AU,en;q=0.9',
  'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
}

async function woolworthsCookies() {
  const res = await fetch('https://www.woolworths.com.au/', {
    headers: {
      ...CHROME_HINTS,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Dest': 'document',
      'Upgrade-Insecure-Requests': '1',
    },
  })
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
}

function wowHeaders(cookie) {
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

async function wowSearch(term, cookie) {
  const res = await fetch('https://www.woolworths.com.au/apis/ui/Search/products', {
    method: 'POST',
    headers: wowHeaders(cookie),
    body: JSON.stringify({ SearchTerm: term, PageSize: 10, PageNumber: 1, SortType: 'TraderRelevance' }),
  })
  if (!res.ok) throw new Error(`Woolworths search failed (${res.status})`)
  const json = await res.json()
  for (const group of json?.Products ?? []) {
    const p = group?.Products?.[0]
    if (p && p.IsAvailable !== false) return p
  }
  return null
}

async function wowDetail(stockcode, cookie) {
  const res = await fetch(`https://www.woolworths.com.au/apis/ui/product/detail/${stockcode}`, {
    headers: wowHeaders(cookie),
  })
  if (!res.ok) throw new Error(`Woolworths product lookup failed (${res.status})`)
  return (await res.json())?.Product ?? null
}

// mirrors lib/shopping.ts meetsRule()
function meetsRule(item, price, wasPrice, onSpecial) {
  if (price == null) return false
  switch (item.alert_type) {
    case 'price':
      return item.alert_value != null && price <= item.alert_value
    case 'percent': {
      if (wasPrice == null || wasPrice <= price) return false
      const pct = Math.round(((wasPrice - price) / wasPrice) * 100)
      return item.alert_value != null && pct >= item.alert_value
    }
    default:
      return onSpecial
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const items = await supaGet('shopping_items?status=eq.watching&select=*&order=position')
const now = new Date().toISOString()
let cookie = await woolworthsCookies().catch(() => '')
let failures = 0

for (const item of items) {
  try {
    const stockcode = item.woolworths_url?.match(/productdetails\/(\d+)/)?.[1]
    const product = stockcode
      ? await wowDetail(stockcode, cookie)
      : await wowSearch(item.search_query?.trim() || item.name, cookie)

    if (!product) {
      console.log(`✗ ${item.name}: no matching product`)
      await supaWrite('PATCH', `shopping_items?id=eq.${item.id}`, { on_sale_now: false })
      continue
    }

    const price = product.Price ?? product.InstorePrice ?? null
    const wasPrice = product.WasPrice ?? null
    const onSpecial = !!product.IsOnSpecial
    const productUrl = product.Stockcode
      ? `https://www.woolworths.com.au/shop/productdetails/${product.Stockcode}/${product.UrlFriendlyName ?? ''}`
      : item.woolworths_url

    const prevRows = await supaGet(
      `shopping_prices?item_id=eq.${item.id}&store=eq.woolworths&select=price,was_price,on_special&order=checked_at.desc&limit=1`
    )
    const prev = prevRows?.[0]
    const prevMet = prev ? meetsRule(item, prev.price, prev.was_price, prev.on_special) : false
    const newMet = meetsRule(item, price, wasPrice, onSpecial)

    await supaWrite('POST', 'shopping_prices', {
      item_id: item.id,
      user_id: item.user_id, // service role bypasses the auth.uid() default
      store: 'woolworths',
      product_name: product.DisplayName || product.Name,
      product_url: productUrl,
      price,
      was_price: wasPrice,
      on_special: onSpecial,
    })
    const update = { on_sale_now: newMet }
    if (newMet && !prevMet) update.last_sale_detected_at = now
    await supaWrite('PATCH', `shopping_items?id=eq.${item.id}`, update)

    console.log(
      `✓ ${item.name}: $${price}${wasPrice && wasPrice > price ? ` (was $${wasPrice})` : ''}${newMet ? ' — ALERT MET 🔔' : ''}`
    )
  } catch (e) {
    failures++
    console.error(`✗ ${item.name}: ${e.message}`)
  }
  await sleep(250)
}

console.log(`Done ${now} — ${items.length - failures}/${items.length} checked ok`)
process.exit(failures > 0 && failures === items.length ? 1 : 0)
