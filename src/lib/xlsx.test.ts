import { describe, expect, it } from 'vitest'
import { buildXlsx, columnLetter, crc32, excelDate } from './xlsx'

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

describe('xlsx helpers', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('names columns like Excel', () => {
    expect([0, 25, 26, 27, 51, 52, 701, 702].map(columnLetter)).toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA'])
  })

  it('turns ISO dates into Excel day numbers', () => {
    expect(excelDate('1900-03-01')).toBe(61)
    expect(excelDate('2026-11-02')).toBe(46328)
    expect(excelDate('2026-11-02T10:00:00Z')).toBeNull()
    expect(excelDate('PO-2026-11')).toBeNull()
  })
})

describe('buildXlsx', () => {
  const file = buildXlsx('Invoices', ['Invoice', 'Date', 'Value', 'PO'], [
    ['INV12366', '2026-11-02', 21869, '0012345'],
    ['A & B <ltd>', null, 1234.5, '1-2'],
  ])
  const body = text(file)

  it('is a zip with the files Excel expects', () => {
    expect(file[0]).toBe(0x50) // "PK"
    expect(file[1]).toBe(0x4b)
    for (const name of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml'])
      expect(body).toContain(name)
  })

  it('keeps numbers as numbers, dates as dates and codes as text', () => {
    // the column has pence somewhere, so every number in it gets the money format
    expect(body).toContain('<c r="C2" s="3"><v>21869</v></c>')
    expect(body).toContain('<c r="C3" s="3"><v>1234.5</v></c>')
    expect(body).toContain('<c r="B2" s="2"><v>46328</v></c>')
    expect(body).toContain('<t xml:space="preserve">0012345</t>') // leading zeros kept
    expect(body).toContain('<t xml:space="preserve">1-2</t>') // not turned into a date
  })

  it('escapes special characters and skips empty cells', () => {
    expect(body).toContain('A &amp; B &lt;ltd&gt;')
    expect(body).not.toContain('r="B3"')
  })

  it('makes a bold header row with a filter', () => {
    expect(body).toContain('<c r="A1" t="inlineStr" s="1"><is><t>Invoice</t></is></c>')
    expect(body).toContain('<autoFilter ref="A1:D3"/>')
  })
})
