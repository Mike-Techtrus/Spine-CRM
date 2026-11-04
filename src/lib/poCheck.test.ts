import { describe, expect, it } from 'vitest'
import { checkPo, figuresFromReading, poValueExVat, sameReference, type PoReading } from './poCheck'
import { hasRealPoNumber, poStatus } from './types'

const reading = (over: Partial<PoReading> = {}): PoReading => ({
  is_purchase_order: true,
  po_number: 'PO-004512',
  po_date: '2026-11-03',
  buyer: 'CDW Ltd',
  supplier: 'Techtrus Ltd',
  quote_reference: 'Q-1234',
  currency: 'GBP',
  value_ex_vat: 2675,
  vat: 535,
  total_inc_vat: 3210,
  lines: [],
  notes: null,
  ...over,
})

describe('poValueExVat', () => {
  it('uses the printed value ex VAT', () => expect(poValueExVat(reading())).toBe(2675))
  it('falls back to total less VAT', () =>
    expect(poValueExVat(reading({ value_ex_vat: null, total_inc_vat: 1200.1, vat: 200.02 }))).toBe(1000.08))
  it('is unknown with only a total', () => expect(poValueExVat(reading({ value_ex_vat: null, vat: null }))).toBeNull())
})

describe('sameReference', () => {
  it('ignores case, spaces and dashes', () => expect(sameReference('PO-004512', 'po 004512')).toBe(true))
  it('keeps leading zeros meaningful', () => expect(sameReference('PO-004512', 'PO-4512')).toBe(false))
  it('never matches blanks', () => expect(sameReference(' ', '-')).toBe(false))
})

describe('checkPo', () => {
  const ours = { quoteValue: 2675, total: 3210, poNumber: 'PO 004512', quoteNumber: 'Q1234' }

  it('all match', () => {
    const checks = checkPo(reading(), ours)
    expect(checks.map((c) => [c.key, c.result])).toEqual([
      ['value', 'match'],
      ['total', 'match'],
      ['po_number', 'match'],
      ['quote_reference', 'match'],
    ])
  })

  it('within 5p still matches; more does not', () => {
    expect(checkPo(reading({ value_ex_vat: 2675.05 }), ours)[0].result).toBe('match')
    expect(checkPo(reading({ value_ex_vat: 2675.06 }), ours)[0].result).toBe('differs')
  })

  it('skips the PO number check until one is typed, and the total when either side lacks it', () => {
    const checks = checkPo(reading({ total_inc_vat: null }), { ...ours, poNumber: '' })
    expect(checks.map((c) => c.key)).toEqual(['value', 'quote_reference'])
  })

  it('value is unknown when the PO shows none', () =>
    expect(checkPo(reading({ value_ex_vat: null, vat: null, total_inc_vat: null }), ours)[0].result).toBe('unknown'))
})

describe('figuresFromReading', () => {
  it('difference is quote value minus PO value', () =>
    expect(figuresFromReading(reading({ value_ex_vat: 2500 }), 2675)).toEqual({
      po_number: 'PO-004512',
      po_value: '2500',
      difference: '175',
      quote_match: false,
    }))
  it('leaves out what the PO does not show', () =>
    expect(figuresFromReading(reading({ po_number: null, value_ex_vat: null, vat: null }), 2675)).toEqual({}))
})

describe('poStatus', () => {
  it('tells received, received late, outstanding and missing apart', () => {
    expect(poStatus({ po_number: '123', advanced_without_po: false })).toBe('received')
    expect(poStatus({ po_number: '123', advanced_without_po: true })).toBe('received_late')
    expect(poStatus({ po_number: ' ', advanced_without_po: true })).toBe('outstanding')
    expect(poStatus({ po_number: null, advanced_without_po: false })).toBe('missing')
  })
})

describe('hasRealPoNumber', () => {
  it('treats stand-ins as no PO yet', () => {
    for (const v of ['TBC', ' tba ', 'N/A', 'na', '-', '', null]) expect(hasRealPoNumber(v)).toBe(false)
    expect(hasRealPoNumber('4500123')).toBe(true)
  })
})
