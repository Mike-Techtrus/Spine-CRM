import { describe, expect, it } from 'vitest'
import { findAccountByName, mergeQualification, qualificationProgress, type Qualification } from './intake'

const item = (key: string, value: string | null) => ({ key, label: key, value, evidence: null })

describe('mergeQualification', () => {
  const old: Qualification = {
    job_type: 'device_rollout',
    items: [item('sites', 'Reading'), item('device_count', '750 laptops'), item('notes_by_person', 'Asked for L2s')],
    missing: [{ key: 'dates', label: 'dates', why: 'scheduling' }],
    quote_due: '2026-11-20',
    flags: ['Large volume'],
    updated_from_intake_id: 'a',
  }

  it('new values win; blanks keep what we knew; extra items survive', () => {
    const merged = mergeQualification(
      old,
      {
        job_type: 'device_rollout',
        qualification: [item('sites', 'Reading and Slough'), item('device_count', null), item('dates', 'From 1 Dec')],
        missing: [
          { key: 'dates', label: 'dates', why: 'x' },
          { key: 'imaging', label: 'imaging', why: 'y' },
        ],
        quote_due: null,
        flags: ['Large volume', 'Out of hours'],
      },
      'b',
    )
    expect(merged.items.map((i) => [i.key, i.value])).toEqual([
      ['sites', 'Reading and Slough'],
      ['device_count', '750 laptops'],
      ['dates', 'From 1 Dec'],
      ['notes_by_person', 'Asked for L2s'],
    ])
    expect(merged.missing.map((m) => m.key)).toEqual(['imaging'])
    expect(merged.quote_due).toBe('2026-11-20')
    expect(merged.flags).toEqual(['Large volume', 'Out of hours'])
    expect(merged.updated_from_intake_id).toBe('b')
    expect(qualificationProgress(merged)).toEqual({ known: 4, total: 4 })
  })

  it('works with no earlier sheet', () => {
    const merged = mergeQualification(
      null,
      { job_type: 'network', qualification: [item('sites', null)], missing: [], quote_due: null, flags: [] },
      null,
    )
    expect(qualificationProgress(merged)).toEqual({ known: 0, total: 1 })
  })
})

describe('findAccountByName', () => {
  const accounts = [
    { id: '1', name: 'CDW' },
    { id: '2', name: 'BHFT' },
    { id: '3', name: 'ARM France SAS' },
    { id: '4', name: 'Barclays Payments Ltd' },
  ]
  it('matches exactly, ignoring case and company suffixes', () => {
    expect(findAccountByName(accounts, 'cdw')?.id).toBe('1')
    expect(findAccountByName(accounts, 'CDW Ltd')?.id).toBe('1')
    expect(findAccountByName(accounts, 'Barclays Payments Limited')?.id).toBe('4')
  })
  it('never guesses a near miss', () => {
    expect(findAccountByName(accounts, 'ARM')).toBeNull()
    expect(findAccountByName(accounts, null)).toBeNull()
  })
})
