import { round2 } from './money'

// Project expenses (migration 0060): what was quoted for expenses vs what was
// actually spent. Tested in projectExpenses.test.ts.

export const EXPENSE_CATEGORIES = [
  'Hotel',
  'Mileage',
  'Train / flights',
  'Tolls',
  'Parking',
  'Subsistence',
  'Packaging',
  'Courier / logistics',
  'Equipment hire',
  'Other',
] as const

// Quote line types that are expenses charged on their own line.
export const SEPARATE_EXPENSE_LINE_TYPES = ['expenses', 'logistics']

export function isSeparateExpenseLine(lineType: string | null | undefined): boolean {
  return SEPARATE_EXPENSE_LINE_TYPES.includes((lineType ?? '').trim().toLowerCase())
}

export interface ExpenseLike {
  amount: number
  vat: number
  status: 'submitted' | 'approved' | 'rejected'
  category: string
}

/** What an expense cost us: amount less the VAT we can reclaim. */
export function expenseCost(e: Pick<ExpenseLike, 'amount' | 'vat'>): number {
  return round2(Number(e.amount) - Number(e.vat || 0))
}

export interface ExpenseComparisonInput {
  // Project lines: expenses bundled into each day, quoted days, approved days so far.
  lines: { quoted_days: number; expenses_included: number | null; approved_days: number }[]
  // Quote lines charged as expenses on their own (Expenses / Logistics).
  separateLines: { qty: number; unit_cost: number }[]
  // What the price builder said expenses would cost us, per quote (null = not used).
  quotedCosts: (number | null)[]
  expenses: ExpenseLike[]
}

export interface ExpenseComparison {
  chargedBundled: number // expenses inside the day rates × quoted days
  chargedSeparate: number // Expenses / Logistics lines on the quote(s)
  charged: number
  quotedCost: number | null // price builder's expected cost, when every quote had one
  actual: number // approved, ex VAT
  pending: number // submitted, not approved yet, ex VAT
  progress: number | null // approved days ÷ quoted days (0–1+)
  expectedToDate: number | null // what you'd expect to have spent by now, pro rata
  remaining: number | null // quoted cost (or charged) − actual
  byCategory: { category: string; actual: number; pending: number }[]
}

export function compareExpenses(input: ExpenseComparisonInput): ExpenseComparison {
  const chargedBundled = round2(
    input.lines.reduce((s, l) => s + Number(l.quoted_days) * Number(l.expenses_included ?? 0), 0),
  )
  const chargedSeparate = round2(input.separateLines.reduce((s, l) => s + Number(l.qty) * Number(l.unit_cost), 0))
  const charged = round2(chargedBundled + chargedSeparate)
  const known = input.quotedCosts.filter((c): c is number => c !== null)
  const quotedCost = known.length > 0 && known.length === input.quotedCosts.length ? round2(known.reduce((a, b) => a + b, 0)) : null

  const cats = new Map<string, { actual: number; pending: number }>()
  let actual = 0
  let pending = 0
  for (const e of input.expenses) {
    if (e.status === 'rejected') continue
    const c = cats.get(e.category) ?? { actual: 0, pending: 0 }
    const cost = expenseCost(e)
    if (e.status === 'approved') {
      actual += cost
      c.actual = round2(c.actual + cost)
    } else {
      pending += cost
      c.pending = round2(c.pending + cost)
    }
    cats.set(e.category, c)
  }

  const quotedDays = input.lines.reduce((s, l) => s + Number(l.quoted_days), 0)
  const approvedDays = input.lines.reduce((s, l) => s + Number(l.approved_days), 0)
  const progress = quotedDays > 0 ? approvedDays / quotedDays : null
  const basis = quotedCost ?? (charged > 0 ? charged : null)
  return {
    chargedBundled,
    chargedSeparate,
    charged,
    quotedCost,
    actual: round2(actual),
    pending: round2(pending),
    progress,
    expectedToDate: basis !== null && progress !== null ? round2(basis * Math.min(progress, 1)) : null,
    remaining: basis !== null ? round2(basis - actual) : null,
    byCategory: [...cats.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.actual + b.pending - (a.actual + a.pending)),
  }
}
