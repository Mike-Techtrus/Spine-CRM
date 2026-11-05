import { describe, expect, it } from 'vitest'
import { formatPercent, plannedMarginItems, standardCostFor, summariseMargin } from './margin'

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

describe('plannedMarginItems (0056 standard cost)', () => {
  const items = [
    { id: 'l2', part_code: 'L2 Engineer', standard_cost: 210 },
    { id: 'pm', part_code: 'Project Manager', standard_cost: null },
  ]
  it('finds the standard cost by rate-card item, then by part code', () => {
    expect(standardCostFor({ line_item_id: 'l2', part_code: 'x' }, items)).toBe(210)
    expect(standardCostFor({ line_item_id: null, part_code: ' l2 engineer ' }, items)).toBe(210)
    expect(standardCostFor({ line_item_id: null, part_code: 'Project Manager' }, items)).toBeNull()
    expect(standardCostFor({ line_item_id: null, part_code: 'Unknown' }, items)).toBeNull()
  })
  it('costs named people at their rate and the rest of the quoted days at the standard cost', () => {
    const line = { quoted_days: 20, day_rate: 325, expenses_included: null }
    const m = summariseMargin(plannedMarginItems(line, [{ allocated_days: 5, cost_rate: 230 }], 210))
    expect(m.revenue).toBe(6500)
    expect(m.cost).toBe(5 * 230 + 15 * 210)
    expect(m.uncostedDays).toBe(0)
  })
  it('leaves unnamed days uncosted when the role has no standard cost, and ignores over-allocation', () => {
    const line = { quoted_days: 10, day_rate: 500, expenses_included: 100 }
    expect(summariseMargin(plannedMarginItems(line, [], null)).uncostedDays).toBe(10)
    const over = plannedMarginItems(line, [{ allocated_days: 12, cost_rate: 250 }], 210)
    expect(over).toHaveLength(1)
    expect(over[0].sellRate).toBe(400)
  })
})
