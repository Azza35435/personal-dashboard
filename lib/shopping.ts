import type { ShoppingItem, ShoppingStore } from './types'

export const STORE_LABEL: Record<ShoppingStore, string> = {
  woolworths: 'Woolworths',
  coles: 'Coles',
  chemist: 'Chemist Warehouse',
}

export const STORE_SHORT: Record<ShoppingStore, string> = {
  woolworths: 'WW',
  coles: 'C',
  chemist: 'CW',
}

/** % saved vs the was-price, or null if there is no meaningful discount. */
export function discountPct(price: number | null, wasPrice: number | null): number | null {
  if (price == null || wasPrice == null || wasPrice <= price) return null
  return Math.round(((wasPrice - price) / wasPrice) * 100)
}

/** Does a price snapshot satisfy the item's alert rule? */
export function meetsRule(
  item: Pick<ShoppingItem, 'alert_type' | 'alert_value'>,
  price: number | null,
  wasPrice: number | null,
  onSpecial: boolean
): boolean {
  if (price == null) return false
  switch (item.alert_type) {
    case 'price':
      return item.alert_value != null && price <= item.alert_value
    case 'percent': {
      const pct = discountPct(price, wasPrice)
      return item.alert_value != null && pct != null && pct >= item.alert_value
    }
    default:
      return onSpecial
  }
}

/** An alert is active until dismissed; a *new* sale detection re-activates it. */
export function alertActive(
  item: Pick<ShoppingItem, 'status' | 'on_sale_now' | 'dismissed_at' | 'last_sale_detected_at'>
): boolean {
  if (item.status !== 'watching' || !item.on_sale_now) return false
  if (!item.dismissed_at) return true
  if (!item.last_sale_detected_at) return false
  return Date.parse(item.last_sale_detected_at) > Date.parse(item.dismissed_at)
}
