import { round2 } from './money'

// Reports → Rebate: works out the rebate on a set of invoices from their lines,
// under conditions picked on the page (which line types earn it, the rate, and
// what to do with invoices that have no lines). Nothing here touches the
// rebate figures stored on records — the report always calculates afresh.

export interface ReportLine {
  line_type: string | null
  amount: number // ex VAT
  expenses?: number // bundled expenses inside amount (qty × expenses per unit, 0047)
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
  excludeBundled?: boolean // take bundled expenses out of the amount that earns rebate (default true)
  noLines: NoLinesRule
  rate: number // as a fraction, 7.5% → 0.075
}

export type Basis = 'lines' | 'quote_share' | 'whole_value' | 'excluded'

export interface RebateRow {
  id: string
  value: number
  eligible: number
  rebate: number // to the penny, for showing per invoice
  rebateExact: number // unrounded, so the total is rounded once at the end (as CDW's credit notes are)
  basis: Basis
  share: number | null // eligible ÷ value, for the quote-share basis
  expensesExcluded: number // bundled expenses left out of the amount that earns rebate
}

const norm = (t: string | null) => (t ?? '').trim().toLowerCase()

export function lineEarns(lineType: string | null, c: RebateConditions): boolean {
  const name = norm(lineType)
  if (c.eligibleTypes.some((t) => norm(t) === name) && name !== '') return true
  const known = name !== '' && c.knownTypes.some((t) => norm(t) === name)
  return !known && c.includeOther
}

const sum = (lines: ReportLine[]) => lines.reduce((s, l) => s + l.amount, 0)

// The part of earning lines that earns rebate, and the bundled expenses taken out of it.
function earning(lines: ReportLine[], c: RebateConditions) {
  const earn = lines.filter((l) => lineEarns(l.line_type, c))
  const expenses = c.excludeBundled === false ? 0 : earn.reduce((s, l) => s + (l.expenses ?? 0), 0)
  return { amount: sum(earn) - expenses, expenses }
}

export function rebateRow(inv: ReportInvoice, c: RebateConditions): RebateRow {
  if (inv.lines.length > 0) {
    const e = earning(inv.lines, c)
    const eligible = round2(e.amount)
    return { id: inv.id, value: inv.value, eligible, rebate: round2(e.amount * c.rate), rebateExact: e.amount * c.rate, basis: 'lines', share: null, expensesExcluded: round2(e.expenses) }
  }
  if (c.noLines === 'exclude')
    return { id: inv.id, value: inv.value, eligible: 0, rebate: 0, rebateExact: 0, basis: 'excluded', share: null, expensesExcluded: 0 }
  if (c.noLines === 'quote_share' && inv.quoteLines.length > 0) {
    const total = sum(inv.quoteLines)
    const e = earning(inv.quoteLines, c)
    const share = total > 0 ? e.amount / total : 0
    const eligible = round2(inv.value * share)
    const expensesExcluded = total > 0 ? round2((inv.value * e.expenses) / total) : 0
    return { id: inv.id, value: inv.value, eligible, rebate: round2(eligible * c.rate), rebateExact: eligible * c.rate, basis: 'quote_share', share, expensesExcluded }
  }
  // Whole value — chosen, or no quote lines to work a share out from.
  const eligible = round2(inv.value)
  return { id: inv.id, value: inv.value, eligible, rebate: round2(eligible * c.rate), rebateExact: eligible * c.rate, basis: 'whole_value', share: null, expensesExcluded: 0 }
}

export function rebateTotals(rows: RebateRow[]) {
  return {
    invoices: rows.filter((r) => r.basis !== 'excluded').length,
    value: round2(rows.reduce((s, r) => s + r.value, 0)),
    eligible: round2(rows.reduce((s, r) => s + r.eligible, 0)),
    expensesExcluded: round2(rows.reduce((s, r) => s + r.expensesExcluded, 0)),
    rebate: round2(rows.reduce((s, r) => s + r.rebateExact, 0)),
  }
}
