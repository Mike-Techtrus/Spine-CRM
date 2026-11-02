import { describe, expect, it } from 'vitest'
import { lineEarns, rebateRow, rebateTotals, type RebateConditions } from './rebateReport'

const known = ['Resource', 'Outsource Resource', 'Expenses', 'Logistics', 'Licensing', 'Hardware']
const standard: RebateConditions = {
  eligibleTypes: ['Resource', 'Outsource Resource'],
  knownTypes: known,
  includeOther: true,
  noLines: 'quote_share',
  rate: 0.075,
}

describe('lineEarns', () => {
  it('follows the chosen line types, ignoring case and spaces', () => {
    expect(lineEarns('Resource', standard)).toBe(true)
    expect(lineEarns(' outsource resource ', standard)).toBe(true)
    expect(lineEarns('Expenses', standard)).toBe(false)
  })
  it('treats blank and unknown line types as "other"', () => {
    expect(lineEarns(null, standard)).toBe(true)
    expect(lineEarns('Something new', standard)).toBe(true)
    expect(lineEarns(null, { ...standard, includeOther: false })).toBe(false)
  })
})

describe('rebateRow', () => {
  it('uses the invoice’s own lines when it has them', () => {
    const row = rebateRow(
      {
        id: 'a',
        value: 1250,
        lines: [
          { line_type: 'Resource', amount: 1000 },
          { line_type: 'Expenses', amount: 250 },
        ],
        quoteLines: [],
      },
      standard,
    )
    expect(row).toEqual({ id: 'a', value: 1250, eligible: 1000, rebate: 75, basis: 'lines', share: null })
  })

  it('uses the quote’s mix of lines for invoices with none', () => {
    // quote: 80% resource, 20% hardware → 80% of the £2,000 invoice earns rebate
    const row = rebateRow(
      {
        id: 'b',
        value: 2000,
        lines: [],
        quoteLines: [
          { line_type: 'Resource', amount: 8000 },
          { line_type: 'Hardware', amount: 2000 },
        ],
      },
      standard,
    )
    expect(row).toMatchObject({ eligible: 1600, rebate: 120, basis: 'quote_share', share: 0.8 })
  })

  it('falls back to the whole value when there are no quote lines either', () => {
    expect(rebateRow({ id: 'c', value: 1625, lines: [], quoteLines: [] }, standard)).toMatchObject({
      eligible: 1625,
      rebate: 121.88,
      basis: 'whole_value',
    })
  })

  it('can leave line-less invoices out, or count their whole value', () => {
    const inv = { id: 'd', value: 1000, lines: [], quoteLines: [{ line_type: 'Hardware', amount: 1 }] }
    expect(rebateRow(inv, { ...standard, noLines: 'exclude' })).toMatchObject({ rebate: 0, basis: 'excluded' })
    expect(rebateRow(inv, { ...standard, noLines: 'whole_value' })).toMatchObject({ rebate: 75, basis: 'whole_value' })
  })

  it('applies a different rate and line-type choice', () => {
    const row = rebateRow(
      {
        id: 'e',
        value: 1250,
        lines: [
          { line_type: 'Resource', amount: 1000 },
          { line_type: 'Expenses', amount: 250 },
        ],
        quoteLines: [],
      },
      { ...standard, eligibleTypes: ['Resource', 'Expenses'], rate: 0.05 },
    )
    expect(row).toMatchObject({ eligible: 1250, rebate: 62.5 })
  })
})

describe('rebateTotals', () => {
  it('adds up the rows and counts only included invoices', () => {
    const rows = [
      rebateRow({ id: 'a', value: 1000, lines: [{ line_type: 'Resource', amount: 1000 }], quoteLines: [] }, standard),
      rebateRow({ id: 'b', value: 500, lines: [], quoteLines: [] }, { ...standard, noLines: 'exclude' }),
    ]
    expect(rebateTotals(rows)).toEqual({ invoices: 1, value: 1500, eligible: 1000, rebate: 75 })
  })
})
