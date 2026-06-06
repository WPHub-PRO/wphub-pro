import type { SubscriptionLineRow } from '@/lib/adminSubscriptionView'
import { formatMoneyFromStripe, subscriptionLineRows } from '@/lib/adminSubscriptionView'

function lineItemTotalCents(line: Record<string, unknown>): {
  total: number
  currency: string
} | null {
  const price = line?.price
  if (typeof price !== 'object' || !price) return null
  const p = price as Record<string, unknown>
  const unit = p.unit_amount
  const q = line.quantity
  if (typeof unit !== 'number' || typeof q !== 'number') return null
  const cur = typeof p.currency === 'string' ? p.currency : 'usd'
  return { total: unit * q, currency: cur }
}

export type SubscriptionLineDisplay = SubscriptionLineRow & { lineTotalLabel: string }

export function subscriptionLineDisplayRows(sub: Record<string, unknown>): SubscriptionLineDisplay[] {
  const base = subscriptionLineRows(sub)
  const items = (sub.items as { data?: Record<string, unknown>[] } | undefined)?.data ?? []
  return base.map((b, i) => {
    const line = items[i]
    if (!line) {
      return { ...b, lineTotalLabel: '—' }
    }
    const tot = lineItemTotalCents(line)
    if (!tot) {
      return { ...b, lineTotalLabel: '—' }
    }
    return { ...b, lineTotalLabel: formatMoneyFromStripe(tot.total, tot.currency) }
  })
}
