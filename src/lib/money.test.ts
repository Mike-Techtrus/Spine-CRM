import { describe, expect, it } from 'vitest'
import { addDaysIso, lineAmount, moneyTotals, paymentTermsDays, round2 } from './money'
import { accountRebateRate, isRebateEligible } from './rebate'
import { invoicingStatus, salesOrderValueExVat, type Account, type LineType, type SalesOrder } from './types'

// Expected figures below were worked out by the live Supabase database (Nov
// 2026) with the same sums create_invoice_from_timesheets() uses:
//   vat = round(value * 0.2, 2), total = value + vat,
//   rebate = round(eligible * rate, 2), net = total - rebate
// If one of these fails, the app and the database would disagree about money.
const DATABASE_CASES: [value: number, eligible: number, rate: number, vat: number, total: number, rebate: number, net: number][] = [
  [1000.0, 1000.0, 0.075, 200.0, 1200.0, 75.0, 1125.0],
  [0.2, 0.2, 0.075, 0.04, 0.24, 0.02, 0.22],
  [1.0, 1.0, 0.075, 0.2, 1.2, 0.08, 1.12],
  [10.05, 10.05, 0.075, 2.01, 12.06, 0.75, 11.31],
  [6155.0, 6155.0, 0.075, 1231.0, 7386.0, 461.63, 6924.37],
  [1625.0, 1625.0, 0.075, 325.0, 1950.0, 121.88, 1828.12],
  [17066.5, 12000.0, 0.075, 3413.3, 20479.8, 900.0, 19579.8],
  [999.99, 0, 0.075, 200.0, 1199.99, 0, 1199.99],
  [0.01, 0.01, 0.075, 0, 0.01, 0, 0.01],
  [123.45, 67.89, 0.075, 24.69, 148.14, 5.09, 143.05],
  [1000.0, 1000.0, 0, 200.0, 1200.0, 0, 1200.0],
]

describe('moneyTotals matches the database', () => {
  it.each(DATABASE_CASES)('value %d, eligible %d at %d', (value, eligible, rate, vat, total, rebate, net) => {
    expect(moneyTotals(value, eligible, rate)).toEqual({ value, vat, total, rebate, net_value: net })
  })
})

describe('round2', () => {
  it('rounds halves up like the database, despite floating point', () => {
    expect(round2(1.005)).toBe(1.01) // plain Math.round(1.005 * 100) / 100 gives 1.00
    expect(round2(0.015)).toBe(0.02)
    expect(round2(121.875)).toBe(121.88)
    expect(round2(2.675)).toBe(2.68)
  })
  it('rounds negative halves away from zero, like the database', () => {
    expect(round2(-1.005)).toBe(-1.01)
    expect(round2(-0.015)).toBe(-0.02)
  })
  it('copes with tiny and odd numbers', () => {
    expect(round2(1e-7)).toBe(0)
    expect(round2(-0.001)).toBe(0)
    expect(Object.is(round2(-0.001), -0)).toBe(false)
    expect(round2(Number.NaN)).toBe(0)
  })
})

describe('lineAmount', () => {
  it('is quantity × price to the penny', () => {
    expect(lineAmount(3, 650)).toBe(1950)
    expect(lineAmount('0.5', '100.01')).toBe(50.01)
    expect(lineAmount('1.5', '33.33')).toBe(50)
  })
  it('treats rubbish as zero', () => {
    expect(lineAmount('abc', 100)).toBe(0)
  })
})

describe('rebate rules (same as rebate_eligible_type / account_rebate_rate in SQL)', () => {
  const lineTypes = [
    { name: 'Resource', rebate_eligible: true },
    { name: 'Outsource Resource', rebate_eligible: true },
    { name: 'Expenses', rebate_eligible: false },
    { name: 'Logistics', rebate_eligible: false },
    { name: 'Licensing', rebate_eligible: false },
    { name: 'Hardware', rebate_eligible: false },
  ] as LineType[]

  // Answers from the live database's rebate_eligible_type().
  it.each([
    ['Resource', true],
    ['resource', true],
    ['Outsource Resource', true],
    [' Resource ', true],
    ['Expenses', false],
    ['Logistics', false],
    ['Licensing', false],
    ['Hardware', false],
    ['', true],
    [null, true],
    ['Something new', true],
  ] as [string | null, boolean][])('line type %j earns rebate: %s', (lineType, expected) => {
    expect(isRebateEligible(lineType, lineTypes)).toBe(expected)
  })

  it('turns the account percentage into a fraction, 0 with no client', () => {
    expect(accountRebateRate({ rebate_rate: 7.5 } as Account)).toBe(0.075)
    expect(accountRebateRate({ rebate_rate: 0 } as Account)).toBe(0)
    expect(accountRebateRate(null)).toBe(0)
  })
})

describe('payment terms', () => {
  it('uses the account’s days, or 30', () => {
    expect(paymentTermsDays({ payment_terms_days: 60 })).toBe(60)
    expect(paymentTermsDays({ payment_terms_days: null })).toBe(30)
    expect(paymentTermsDays(undefined)).toBe(30)
  })
  it('adds days across month and year ends without time-zone slips', () => {
    expect(addDaysIso('2026-10-30', 30)).toBe('2026-11-29')
    expect(addDaysIso('2026-12-15', 30)).toBe('2027-01-14')
    expect(addDaysIso('2028-02-01', 28)).toBe('2028-02-29') // leap year
    expect(addDaysIso('2026-03-20', 14)).toBe('2026-04-03') // across the clocks going forward
  })
})

describe('sales order invoicing (ex VAT, migration 0038)', () => {
  const order = (o: Partial<SalesOrder>) =>
    ({ total: null, vat: null, po_value: null, quote_value: null, invoiced_to_date: null, closed_at: null, ...o }) as SalesOrder

  it('values the order as Total − VAT, else PO value, else quote value', () => {
    expect(salesOrderValueExVat(order({ total: 32872.8, vat: 5478.8 }))).toBe(27394)
    expect(salesOrderValueExVat(order({ po_value: 1625 }))).toBe(1625)
    expect(salesOrderValueExVat(order({ quote_value: 6500 }))).toBe(6500)
  })

  // Real orders from the live data after migration 0038.
  it('SO10588: £10,050 of £10,050 → fully invoiced', () => {
    const so = order({ total: 12060, vat: 2010, invoiced_to_date: 10050 })
    expect(invoicingStatus(so)).toEqual({ status: 'fully_invoiced', balance: 0 })
  })
  it('SO10593: £21,869 of £27,394 → part invoiced, £5,525 to go', () => {
    const so = order({ total: 32872.8, vat: 5478.8, invoiced_to_date: 21869 })
    expect(invoicingStatus(so)).toEqual({ status: 'part_invoiced', balance: 5525 })
  })
  it('allows 5p either way before calling it under/over', () => {
    expect(invoicingStatus(order({ total: 120, vat: 20, invoiced_to_date: 100.04 })).status).toBe('fully_invoiced')
    expect(invoicingStatus(order({ total: 120, vat: 20, invoiced_to_date: 100.06 })).status).toBe('over_invoiced')
  })
  it('knows not-invoiced and closed orders', () => {
    expect(invoicingStatus(order({ total: 120, vat: 20 })).status).toBe('not_invoiced')
    expect(invoicingStatus(order({ total: 120, vat: 20, closed_at: '2026-11-01T00:00:00Z' })).status).toBe('closed')
  })
})
