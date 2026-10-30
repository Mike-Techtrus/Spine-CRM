import type {
  InvoiceWithRelations,
  OpportunityWithRelations,
  QuoteWithRelations,
  SalesOrderWithRelations,
} from '../../../lib/types'
import { invoicingStatus, quoteExpiresOn } from '../../../lib/types'
import type { Column } from './charts'

// Figures for the Dashboard, worked out in the browser from the same lists the
// list pages load. Money bases differ by record and are labelled on screen:
// invoices and quotes use Value (ex VAT); sales-order balances use net value
// (as invoiced to date does, 0017).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

// 'YYYY-MM-DD' for a local date.
export function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function monthKey(d: Date) {
  return isoDate(d).slice(0, 7)
}

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000)
}

export function shortDate(iso: string | null) {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y.slice(2)}`
}

// The last n months, oldest first, ending with the current month.
export function lastMonths(n: number, today = new Date()) {
  const out: { key: string; label: string; fullLabel: string }[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    out.push({
      key: monthKey(d),
      label: MONTHS[d.getMonth()],
      fullLabel: `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`,
    })
  }
  return out
}

// Sum a value into month buckets → columns for ColumnChart.
export function monthlyColumns<T>(
  rows: T[],
  dateOf: (r: T) => string | null,
  valueOf: (r: T) => number,
  noun: [string, string],
  months = 12,
): Column[] {
  const buckets = lastMonths(months)
  const totals = new Map(buckets.map((b) => [b.key, { value: 0, count: 0 }]))
  for (const r of rows) {
    const d = dateOf(r)
    const t = d ? totals.get(d.slice(0, 7)) : undefined
    if (t) {
      t.value += valueOf(r)
      t.count += 1
    }
  }
  return buckets.map((b) => {
    const t = totals.get(b.key)!
    return {
      label: b.label,
      fullLabel: b.fullLabel,
      value: t.value,
      detail: `${t.count} ${t.count === 1 ? noun[0] : noun[1]}`,
    }
  })
}

export const num = (n: number | null | undefined) => Number(n ?? 0)

// ── Invoices ────────────────────────────────────────────────────────────────

// Raised invoices: drafts aren't sent yet and cancelled ones don't count.
export function isRaised(inv: InvoiceWithRelations) {
  return inv.status === 'sent' || inv.status === 'paid'
}

export function invoiceValue(inv: InvoiceWithRelations) {
  return num(inv.value)
}

export interface Outstanding {
  invoice: InvoiceWithRelations
  amount: number // total inc VAT
  daysOverdue: number // ≤ 0 = not yet due
}

export function outstandingInvoices(invoices: InvoiceWithRelations[], todayIso: string): Outstanding[] {
  return invoices
    .filter((i) => i.status === 'sent')
    .map((i) => ({
      invoice: i,
      amount: num(i.total),
      daysOverdue: i.due_date ? daysBetween(i.due_date, todayIso) : 0,
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
}

export const AGE_BUCKETS = [
  { key: 'current', label: 'Not yet due', test: (d: number) => d <= 0 },
  { key: '1-30', label: '1–30 days overdue', test: (d: number) => d >= 1 && d <= 30 },
  { key: '31-60', label: '31–60 days overdue', test: (d: number) => d >= 31 && d <= 60 },
  { key: '61-90', label: '61–90 days overdue', test: (d: number) => d >= 61 && d <= 90 },
  { key: '90+', label: 'Over 90 days overdue', test: (d: number) => d > 90 },
]

// ── Sales orders ────────────────────────────────────────────────────────────

export interface OpenOrder {
  order: SalesOrderWithRelations
  balance: number // net still to invoice
}

// Open orders with something left to invoice, biggest balance first.
export function ordersToInvoice(orders: SalesOrderWithRelations[]): OpenOrder[] {
  return orders
    .map((order) => ({ order, ...invoicingStatus(order) }))
    .filter((o) => (o.status === 'not_invoiced' || o.status === 'part_invoiced') && o.balance > 0)
    .map(({ order, balance }) => ({ order, balance }))
    .sort((a, b) => b.balance - a.balance)
}

// ── Quotes & opportunities ──────────────────────────────────────────────────

export function quoteValue(q: QuoteWithRelations) {
  return num(q.value)
}

export function isOpenQuote(q: QuoteWithRelations) {
  return q.status === 'draft' || q.status === 'sent'
}

export function quoteDate(q: QuoteWithRelations) {
  return q.quote_date ?? q.created_at.slice(0, 10)
}

export function expiresWithin(q: QuoteWithRelations, days: number, today = new Date()) {
  if (!isOpenQuote(q)) return false
  const expires = quoteExpiresOn(q)
  const limit = new Date(today)
  limit.setDate(limit.getDate() + days)
  return expires >= today && expires <= limit
}

// Won / (won + lost) for opportunities created in the period.
export function winRate(opps: OpportunityWithRelations[], sinceIso: string) {
  const recent = opps.filter((o) => o.created_at.slice(0, 10) >= sinceIso)
  const won = recent.filter((o) => o.stage === 'closed_won').length
  const lost = recent.filter((o) => o.stage === 'closed_lost').length
  return { won, lost, rate: won + lost > 0 ? won / (won + lost) : null }
}

// Sum values by a name, biggest first.
export function topBy<T>(rows: T[], nameOf: (r: T) => string | null | undefined, valueOf: (r: T) => number, n = 8) {
  const totals = new Map<string, { value: number; count: number }>()
  for (const r of rows) {
    const name = nameOf(r) || 'No account'
    const t = totals.get(name) ?? { value: 0, count: 0 }
    t.value += valueOf(r)
    t.count += 1
    totals.set(name, t)
  }
  return [...totals.entries()]
    .map(([name, t]) => ({ name, ...t }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n)
}
