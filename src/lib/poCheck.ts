// Comparing what the AI read from a PO (read-po Edge Function, 0052) with the
// sales order and its quote. Pure functions so they can be tested.

import { round2 } from './money'

// Keep in step with READING_SCHEMA in supabase/functions/read-po/index.ts.
export interface PoReading {
  is_purchase_order: boolean
  po_number: string | null
  po_date: string | null
  buyer: string | null
  supplier: string | null
  quote_reference: string | null
  currency: string | null
  value_ex_vat: number | null
  vat: number | null
  total_inc_vat: number | null
  lines: { description: string; qty: number | null; unit_price: number | null; amount: number | null }[]
  notes: string | null
}

// Same tolerance as "fully invoiced" (invoicingStatus).
export const PO_MATCH_TOLERANCE = 0.05

export type CheckResult = 'match' | 'differs' | 'unknown'

export interface PoCheck {
  key: 'value' | 'total' | 'po_number' | 'quote_reference'
  label: string
  po: string | number | null
  ours: string | number | null
  result: CheckResult
}

// The PO's value ex VAT — as printed, else total less VAT when both are shown.
export function poValueExVat(r: PoReading): number | null {
  if (r.value_ex_vat != null) return r.value_ex_vat
  if (r.total_inc_vat != null && r.vat != null) return round2(r.total_inc_vat - r.vat)
  return null
}

// PO / quote numbers compared without spaces, dashes, slashes or case ("PO-0123" = "po 0123").
export function sameReference(a: string, b: string): boolean {
  const clean = (s: string) => s.toLowerCase().replace(/[\s\-_/.#:]+/g, '')
  return clean(a) !== '' && clean(a) === clean(b)
}

function compareMoney(po: number | null, ours: number | null): CheckResult {
  if (po == null || ours == null) return 'unknown'
  return Math.abs(round2(po - ours)) <= PO_MATCH_TOLERANCE ? 'match' : 'differs'
}

export function checkPo(
  r: PoReading,
  ours: { quoteValue: number | null; total: number | null; poNumber: string; quoteNumber: string | null },
): PoCheck[] {
  const value = poValueExVat(r)
  const checks: PoCheck[] = [
    { key: 'value', label: 'Value ex VAT vs quote', po: value, ours: ours.quoteValue, result: compareMoney(value, ours.quoteValue) },
  ]
  if (r.total_inc_vat != null && ours.total != null) {
    checks.push({
      key: 'total',
      label: 'Total inc VAT',
      po: r.total_inc_vat,
      ours: ours.total,
      result: compareMoney(r.total_inc_vat, ours.total),
    })
  }
  if (ours.poNumber.trim()) {
    checks.push({
      key: 'po_number',
      label: 'PO number',
      po: r.po_number,
      ours: ours.poNumber.trim(),
      result: r.po_number ? (sameReference(r.po_number, ours.poNumber) ? 'match' : 'differs') : 'unknown',
    })
  }
  if (r.quote_reference && ours.quoteNumber) {
    checks.push({
      key: 'quote_reference',
      label: 'Quote it refers to',
      po: r.quote_reference,
      ours: ours.quoteNumber,
      result: sameReference(r.quote_reference, ours.quoteNumber) ? 'match' : 'differs',
    })
  }
  return checks
}

// What "Use these figures" puts on the sales order form. Difference is
// quote value − PO value, the way existing sales orders record it.
export function figuresFromReading(
  r: PoReading,
  quoteValue: number | null,
): { po_number?: string; po_value?: string; difference?: string; quote_match?: boolean } {
  const out: { po_number?: string; po_value?: string; difference?: string; quote_match?: boolean } = {}
  if (r.po_number) out.po_number = r.po_number.trim()
  const value = poValueExVat(r)
  if (value != null) {
    out.po_value = value.toString()
    if (quoteValue != null) {
      const diff = round2(quoteValue - value)
      out.difference = diff.toString()
      out.quote_match = Math.abs(diff) <= PO_MATCH_TOLERANCE
    }
  }
  return out
}
