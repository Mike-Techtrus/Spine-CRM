import { describe, expect, it } from 'vitest'
import { formatPercent, summariseMargin } from './margin'

describe('summariseMargin', () => {
  it('works out revenue, cost and margin from days × rates', () => {
    // The live allocation: 5 days sold at £325, costing £180.
    expect(summariseMargin([{ days: 5, sellRate: 325, costRate: 180 }])).toEqual({
      revenue: 1625,
      cost: 900,
      margin: 725,
      percent: 44.6,
      uncostedDays: 0,
    })
  })

  it('adds up several people and half days', () => {
    const s = summariseMargin([
      { days: 2.5, sellRate: 650, costRate: 400 },
      { days: 1, sellRate: 650, costRate: 450 },
    ])
    expect(s).toMatchObject({ revenue: 2275, cost: 1450, margin: 825, percent: 36.3 })
  })

  it('leaves out days with no cost rate and counts them', () => {
    const s = summariseMargin([
      { days: 3, sellRate: 500, costRate: 300 },
      { days: 2, sellRate: 500, costRate: null },
    ])
    expect(s).toEqual({ revenue: 1500, cost: 900, margin: 600, percent: 40, uncostedDays: 2 })
  })

  it('shows a loss as a negative margin', () => {
    expect(summariseMargin([{ days: 1, sellRate: 300, costRate: 350 }])).toMatchObject({ margin: -50, percent: -16.7 })
  })

  it('has no percentage when there is nothing sold', () => {
    expect(summariseMargin([])).toEqual({ revenue: 0, cost: 0, margin: 0, percent: null, uncostedDays: 0 })
    expect(formatPercent(null)).toBe('—')
    expect(formatPercent(44.6)).toBe('44.6%')
  })
})
