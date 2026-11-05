import { round2 } from './money'

// Price builder (quote page): roles × days at a sell and a cost rate, plus
// expenses (travel, hotels, subsistence…) with an optional markup. Works out
// profit, then turns it into quote lines — expenses either as one separate
// Expenses line, or bundled into the day rates (expenses_included per day),
// each expense spread over all roles' days or over one role's days.
// Saved on quotes.price_builder (migration 0055). Tested in priceBuilder.test.ts.
// Numbers are kept as strings, like the quote form, so inputs can hold "" or "1.".

export interface PBResource {
  key: string
  part_code: string // role, e.g. "L2 Engineer" — from the rate card or typed
  line_item_id: string // rate-card item it came from ('' = typed)
  line_type: string
  description: string
  people: string
  days: string // days each person works
  sell_rate: string // per day, before expenses
  cost_rate: string // per day: what the person costs us
}

export interface PBExpense {
  key: string
  item: string // "Hotel", "Mileage", …
  qty: string // how many (people, cars, rooms)
  times: string // nights, days, trips, miles
  unit_cost: string // £ each, what it costs us
  spread: string // 'all' or a PBResource key — only used when bundling
}

export type PBMode = 'bundle' | 'separate'

export interface PriceBuilderState {
  resources: PBResource[]
  expenses: PBExpense[]
  markup_percent: string // added to expenses' cost to give what we charge
  mode: PBMode
  notes: string
}

export const EXPENSE_SUGGESTIONS = [
  'Hotel',
  'Mileage',
  'Train / flights',
  'Tolls',
  'Parking',
  'Subsistence',
  'Packaging',
  'Courier / logistics',
  'Equipment hire',
]

export function emptyPriceBuilder(): PriceBuilderState {
  return { resources: [], expenses: [], markup_percent: '0', mode: 'bundle', notes: '' }
}

const n = (v: string | undefined | null) => Number(v) || 0

export function resourceDays(r: PBResource): number {
  return n(r.people) * n(r.days)
}

export function expenseCost(e: PBExpense): number {
  return n(e.qty) * n(e.times) * n(e.unit_cost)
}

export interface ResourceResult {
  key: string
  days: number
  sell: number // labour only
  cost: number
  expensesPerDay: number // bundled, rounded to pence (0 when separate)
  price: number // sell rate + expensesPerDay: unit price on the quote
}

export interface PriceBuilderResult {
  resources: ResourceResult[]
  totalDays: number
  labourSell: number
  labourCost: number
  expensesCost: number
  expensesCharged: number // after markup, exact
  expensesOnQuote: number // what the quote lines actually carry (pence rounding when bundled)
  roundingDifference: number // expensesOnQuote − expensesCharged
  unspread: number // bundled expenses with nowhere to go (role has no days)
  quoteValue: number
  rebate: number
  totalCost: number
  profit: number
  marginPercent: number | null // profit ÷ quote value
}

/**
 * Works out the price builder's figures. `rebateRate` is the client's rate
 * as a fraction (0.075 for CDW); `rebateEligible(lineType)` says whether a
 * role's labour earns it. Expenses never earn rebate.
 */
export function calculatePriceBuilder(
  s: PriceBuilderState,
  rebateRate: number,
  rebateEligible: (lineType: string) => boolean,
): PriceBuilderResult {
  const markup = 1 + n(s.markup_percent) / 100
  const totalDays = s.resources.reduce((a, r) => a + resourceDays(r), 0)
  const expensesCost = round2(s.expenses.reduce((a, e) => a + expenseCost(e), 0))
  const expensesCharged = round2(s.expenses.reduce((a, e) => a + expenseCost(e) * markup, 0))

  // Bundled: each expense's charge goes to its role's days, or all days.
  const share = new Map<string, number>()
  let unspread = 0
  if (s.mode === 'bundle') {
    for (const e of s.expenses) {
      const charge = expenseCost(e) * markup
      if (!charge) continue
      const targets =
        e.spread && e.spread !== 'all' ? s.resources.filter((r) => r.key === e.spread) : s.resources
      const days = targets.reduce((a, r) => a + resourceDays(r), 0)
      if (days <= 0) {
        unspread += charge
        continue
      }
      for (const r of targets) share.set(r.key, (share.get(r.key) ?? 0) + (charge * resourceDays(r)) / days)
    }
  }

  const resources: ResourceResult[] = s.resources.map((r) => {
    const days = resourceDays(r)
    const expensesPerDay = days > 0 ? round2((share.get(r.key) ?? 0) / days) : 0
    return {
      key: r.key,
      days,
      sell: round2(days * n(r.sell_rate)),
      cost: round2(days * n(r.cost_rate)),
      expensesPerDay,
      price: round2(n(r.sell_rate) + expensesPerDay),
    }
  })

  const labourSell = round2(resources.reduce((a, r) => a + r.sell, 0))
  const labourCost = round2(resources.reduce((a, r) => a + r.cost, 0))
  const expensesOnQuote =
    s.mode === 'bundle'
      ? round2(resources.reduce((a, r) => a + r.days * r.expensesPerDay, 0) + round2(unspread))
      : expensesCharged
  const quoteValue = round2(labourSell + expensesOnQuote)
  const rebate = round2(
    s.resources.reduce((a, r, i) => a + (rebateEligible(r.line_type) ? resources[i].sell : 0), 0) * rebateRate,
  )
  const totalCost = round2(labourCost + expensesCost)
  const profit = round2(quoteValue - rebate - totalCost)
  return {
    resources,
    totalDays,
    labourSell,
    labourCost,
    expensesCost,
    expensesCharged,
    expensesOnQuote,
    roundingDifference: round2(expensesOnQuote - expensesCharged),
    unspread: round2(unspread),
    quoteValue,
    rebate,
    totalCost,
    profit,
    marginPercent: quoteValue > 0 ? round2((profit / quoteValue) * 100) : null,
  }
}

/** A quote line the builder produces (the quote form adds key/vendor etc.). */
export interface BuiltLine {
  line_type: string
  part_code: string
  description: string
  line_item_id: string
  qty: string
  rate: string
  expenses_included: string
  unit_cost: string
}

export const EXPENSES_LINE_TYPE = 'Expenses'

export function buildQuoteLines(s: PriceBuilderState, result: PriceBuilderResult): BuiltLine[] {
  const lines: BuiltLine[] = s.resources
    .map((r, i) => ({ r, res: result.resources[i] }))
    .filter(({ res }) => res.days > 0)
    .map(({ r, res }) => ({
      line_type: r.line_type || 'Outsource Resource',
      part_code: r.part_code,
      description: r.description,
      line_item_id: r.line_item_id,
      qty: res.days.toString(),
      rate: round2(n(r.sell_rate)).toString(),
      expenses_included: res.expensesPerDay > 0 ? res.expensesPerDay.toString() : '',
      unit_cost: res.price.toString(),
    }))
  const separate = s.mode === 'separate' ? result.expensesCharged : result.unspread
  if (separate > 0) {
    lines.push({
      line_type: EXPENSES_LINE_TYPE,
      part_code: 'EXPENSES',
      description: expensesDescription(s),
      line_item_id: '',
      qty: '1',
      rate: separate.toString(),
      expenses_included: '',
      unit_cost: separate.toString(),
    })
  }
  return lines
}

// "Travel and expenses: Hotel, Mileage, Parking"
function expensesDescription(s: PriceBuilderState): string {
  // Rows called "Expenses (…)" (made from an existing quote) add nothing to the wording.
  const items = [
    ...new Set(
      s.expenses
        .filter((e) => expenseCost(e) > 0)
        .map((e) => e.item.trim())
        .filter((x) => x && !/^expenses\b/i.test(x)),
    ),
  ]
  return items.length ? `Travel and expenses: ${items.join(', ')}` : 'Travel and expenses'
}
