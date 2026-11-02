import { round2 } from './money'

// Reports → Rebate: works out the rebate on a set of invoices from their lines,
// under conditions picked on the page (which line types earn it, the rate, and
// what to do with invoices that have no lines). Nothing here touches the
// rebate figures stored on records — the report always calculates afresh.

export interface ReportLine {
  line_type: string | null
  amount: number // ex VAT
}

export interface ReportInvoice {
  id: string
  value: number // ex VAT
  lines: ReportLine[] // the invoice's own lines; empty for older invoices
  quoteLines: ReportLine[] // its quote's lines, for working out a share when the invoice has none
}

// How to treat invoices with no lines of their own (most invoices before 2026).
export type NoLinesRule = 'quote_share' | 'whole_value' | 'exclude'

export interface RebateConditions {
  eligibleTypes: string[] // line type names that earn rebate (any case)
  knownTypes: string[] // every line type in the list, so "other" can be told apart
  includeOther: boolean // lines with no line type, or one not in the list
  noLines: NoLinesRule
  rate: number // as a fraction, 7.5% → 0.075
}

export type Basis = 'lines' | 'quote_share' | 'whole_value' | 'excluded'

export interface RebateRow {
  id: string
  value: number
  eligible: number
  rebate: number
  basis: Basis
  share: number | null // eligible ÷ value, for the quote-share basis
}

const norm = (t: string | null) => (t ?? '').trim().toLowerCase()

export function lineEarns(lineType: string | null, c: RebateConditions): boolean {
  const name = norm(lineType)
  if (c.eligibleTypes.some((t) => norm(t) === name) && name !== '') return true
  const known = name !== '' && c.knownTypes.some((t) => norm(t) === name)
  return !known && c.includeOther
}

const sum = (lines: ReportLine[]) => lines.reduce((s, l) => s + l.amount, 0)

export function rebateRow(inv: ReportInvoice, c: RebateConditions): RebateRow {
  if (inv.lines.length > 0) {
    const eligible = round2(sum(inv.lines.filter((l) => lineEarns(l.line_type, c))))
    return { id: inv.id, value: inv.value, eligible, rebate: round2(eligible * c.rate), basis: 'lines', share: null }
  }
  if (c.noLines === 'exclude') return { id: inv.id, value: inv.value, eligible: 0, rebate: 0, basis: 'excluded', share: null }
  if (c.noLines === 'quote_share' && inv.quoteLines.length > 0) {
    const total = sum(inv.quoteLines)
    const share = total > 0 ? sum(inv.quoteLines.filter((l) => lineEarns(l.line_type, c))) / total : 0
    const eligible = round2(inv.value * share)
    return { id: inv.id, value: inv.value, eligible, rebate: round2(eligible * c.rate), basis: 'quote_share', share }
  }
  // Whole value — chosen, or no quote lines to work a share out from.
  const eligible = round2(inv.value)
  return { id: inv.id, value: inv.value, eligible, rebate: round2(eligible * c.rate), basis: 'whole_value', share: null }
}

export function rebateTotals(rows: RebateRow[]) {
  return {
    invoices: rows.filter((r) => r.basis !== 'excluded').length,
    value: round2(rows.reduce((s, r) => s + r.value, 0)),
    eligible: round2(rows.reduce((s, r) => s + r.eligible, 0)),
    rebate: round2(rows.reduce((s, r) => s + r.rebate, 0)),
  }
}
