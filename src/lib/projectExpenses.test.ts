import { describe, expect, it } from 'vitest'
import { compareExpenses, expenseCost, isSeparateExpenseLine } from './projectExpenses'

describe('expenseCost', () => {
  it('is the amount less the VAT', () => {
    expect(expenseCost({ amount: 120, vat: 20 })).toBe(100)
    expect(expenseCost({ amount: 45.5, vat: 0 })).toBe(45.5)
  })
})

describe('isSeparateExpenseLine', () => {
  it('matches Expenses and Logistics lines, any case', () => {
    expect(isSeparateExpenseLine('Expenses')).toBe(true)
    expect(isSeparateExpenseLine(' logistics ')).toBe(true)
    expect(isSeparateExpenseLine('Outsource Resource')).toBe(false)
    expect(isSeparateExpenseLine(null)).toBe(false)
  })
})

describe('compareExpenses', () => {
  // T11448-style job: PM 60 days + £356.16/day bundled, L2 150 days + £181.16/day.
  const lines = [
    { quoted_days: 60, expenses_included: 356.16, approved_days: 30 },
    { quoted_days: 150, expenses_included: 181.16, approved_days: 75 },
  ]

  it('adds bundled and separate charges, and splits actual from pending', () => {
    const r = compareExpenses({
      lines,
      separateLines: [{ qty: 1, unit_cost: 500 }],
      quotedCosts: [null],
      expenses: [
        { amount: 1200, vat: 200, status: 'approved', category: 'Hotel' },
        { amount: 90, vat: 15, status: 'submitted', category: 'Parking' },
        { amount: 999, vat: 0, status: 'rejected', category: 'Hotel' },
      ],
    })
    expect(r.chargedBundled).toBe(round(60 * 356.16 + 150 * 181.16))
    expect(r.chargedSeparate).toBe(500)
    expect(r.charged).toBe(round(48543.6 + 500))
    expect(r.quotedCost).toBeNull()
    expect(r.actual).toBe(1000)
    expect(r.pending).toBe(75)
    expect(r.byCategory).toEqual([
      { category: 'Hotel', actual: 1000, pending: 0 },
      { category: 'Parking', actual: 0, pending: 75 },
    ])
  })

  it('uses the price builder cost when every quote has one, pro rata to days approved', () => {
    const r = compareExpenses({ lines, separateLines: [], quotedCosts: [40000], expenses: [] })
    expect(r.quotedCost).toBe(40000)
    expect(r.progress).toBe(0.5)
    expect(r.expectedToDate).toBe(20000)
    expect(r.remaining).toBe(40000)
  })

  it('falls back to what was charged when a quote has no price builder workings', () => {
    const r = compareExpenses({ lines, separateLines: [], quotedCosts: [40000, null], expenses: [] })
    expect(r.quotedCost).toBeNull()
    expect(r.expectedToDate).toBe(round(48543.6 / 2))
  })

  it('handles a project with no quoted expenses or days', () => {
    const r = compareExpenses({ lines: [], separateLines: [], quotedCosts: [], expenses: [] })
    expect(r.charged).toBe(0)
    expect(r.progress).toBeNull()
    expect(r.expectedToDate).toBeNull()
    expect(r.remaining).toBeNull()
  })
})

function round(n: number) {
  return Math.round(n * 100) / 100
}
