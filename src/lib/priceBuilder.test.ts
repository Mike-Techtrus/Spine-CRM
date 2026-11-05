import { describe, expect, it } from 'vitest'
import {
  buildQuoteLines,
  calculatePriceBuilder,
  emptyPriceBuilder,
  type PBExpense,
  type PBResource,
  type PriceBuilderState,
} from './priceBuilder'

function role(key: string, part_code: string, people: number, days: number, sell: number, cost: number): PBResource {
  return {
    key,
    part_code,
    line_item_id: '',
    line_type: 'Outsource Resource',
    description: '',
    people: String(people),
    days: String(days),
    sell_rate: String(sell),
    cost_rate: String(cost),
  }
}

function expense(item: string, qty: number, times: number, each: number, spread = 'all'): PBExpense {
  return { key: item, item, qty: String(qty), times: String(times), unit_cost: String(each), spread }
}

const all = () => true

// The 750-laptop BHFT rollout from Mike's "Quote and GP calculator" workbook:
// 1,260 resource days, expenses spread evenly at £148.50 a day.
const bhft: PriceBuilderState = {
  ...emptyPriceBuilder(),
  resources: [
    role('pm', 'PM2', 1, 65, 710, 350),
    role('pco', 'PCO', 1, 80, 400, 250),
    role('tl', 'Team Lead', 2, 70, 535, 250),
    role('l2', 'L2 Engineer', 12, 65, 325, 210),
    role('l1', 'L1 Engineer', 3, 65, 250, 180),
  ],
  expenses: [expense('Hotel and travel', 1, 1, 187110)],
}

describe('calculatePriceBuilder', () => {
  it('spreads expenses evenly over all days, like the workbook (£148.50 a day)', () => {
    const r = calculatePriceBuilder(bhft, 0.075, all)
    expect(r.totalDays).toBe(1260)
    expect(r.labourSell).toBe(455300) // workbook K46
    expect(r.resources.map((x) => x.expensesPerDay)).toEqual([148.5, 148.5, 148.5, 148.5, 148.5])
    expect(r.resources[0].price).toBe(858.5) // workbook L41
    expect(r.resources[3].price).toBe(473.5) // workbook L44
    expect(r.expensesOnQuote).toBe(187110)
    expect(r.quoteValue).toBe(642410) // workbook O46
    expect(r.rebate).toBe(34147.5) // 7.5% of labour only
    expect(r.labourCost).toBe(65 * 350 + 80 * 250 + 140 * 250 + 780 * 210 + 195 * 180)
    expect(r.profit).toBe(642410 - 34147.5 - r.labourCost - 187110)
  })

  it('spreads an expense over one role only', () => {
    const s: PriceBuilderState = {
      ...bhft,
      expenses: [expense('Hotel', 2, 80, 120, 'pco'), expense('Mileage', 1, 1260, 10)],
    }
    const r = calculatePriceBuilder(s, 0, all)
    // PCO: 19,200 hotel over its 80 days = 240 + 10 mileage
    expect(r.resources[1].expensesPerDay).toBe(250)
    expect(r.resources[0].expensesPerDay).toBe(10)
    expect(r.expensesOnQuote).toBe(19200 + 12600)
  })

  it('adds markup and rounds per day to pence, reporting the difference', () => {
    const s: PriceBuilderState = {
      ...emptyPriceBuilder(),
      markup_percent: '10',
      resources: [role('a', 'L2', 1, 3, 325, 210)],
      expenses: [expense('Parking', 1, 1, 100)],
    }
    const r = calculatePriceBuilder(s, 0, all)
    expect(r.expensesCost).toBe(100)
    expect(r.expensesCharged).toBe(110)
    expect(r.resources[0].expensesPerDay).toBe(36.67)
    expect(r.expensesOnQuote).toBe(110.01)
    expect(r.roundingDifference).toBe(0.01)
  })

  it('separate mode leaves day rates alone and charges expenses on one line', () => {
    const s: PriceBuilderState = { ...bhft, mode: 'separate', markup_percent: '20' }
    const r = calculatePriceBuilder(s, 0.075, all)
    expect(r.resources.every((x) => x.expensesPerDay === 0)).toBe(true)
    expect(r.expensesCharged).toBe(224532)
    const lines = buildQuoteLines(s, r)
    expect(lines).toHaveLength(6)
    expect(lines[5]).toMatchObject({ line_type: 'Expenses', qty: '1', unit_cost: '224532' })
    expect(lines[5].description).toBe('Travel and expenses: Hotel and travel')
  })

  it('only rebates roles whose line type earns it', () => {
    const s: PriceBuilderState = {
      ...emptyPriceBuilder(),
      resources: [role('a', 'L2', 1, 10, 325, 0), { ...role('b', 'Kit', 1, 1, 1000, 800), line_type: 'Hardware' }],
    }
    const r = calculatePriceBuilder(s, 0.075, (t) => t !== 'Hardware')
    expect(r.rebate).toBe(243.75)
  })

  it('puts expenses for a role with no days on a separate line rather than losing them', () => {
    const s: PriceBuilderState = {
      ...emptyPriceBuilder(),
      resources: [role('a', 'L2', 1, 5, 325, 210), role('b', 'PM', 0, 0, 710, 350)],
      expenses: [expense('Hotel', 1, 2, 100, 'b')],
    }
    const r = calculatePriceBuilder(s, 0, all)
    expect(r.unspread).toBe(200)
    const lines = buildQuoteLines(s, r)
    expect(lines.map((l) => l.part_code)).toEqual(['L2', 'EXPENSES'])
    expect(r.quoteValue).toBe(1825) // on its own Expenses line
  })

  it('bundled quote lines carry rate, expenses and price', () => {
    const r = calculatePriceBuilder(bhft, 0.075, all)
    const [pm] = buildQuoteLines(bhft, r)
    expect(pm).toMatchObject({ part_code: 'PM2', qty: '65', rate: '710', expenses_included: '148.5', unit_cost: '858.5' })
  })
})
