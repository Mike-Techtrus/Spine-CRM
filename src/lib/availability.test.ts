import { describe, expect, it } from 'vitest'
import { mondayOf, personAvailability, skillCounts, spreadOverWeeks, weekStarts } from './availability'

describe('weeks', () => {
  it('finds the Monday of any day', () => {
    expect(mondayOf('2026-11-02')).toBe('2026-11-02') // Monday
    expect(mondayOf('2026-11-06')).toBe('2026-11-02') // Friday
    expect(mondayOf('2026-11-08')).toBe('2026-11-02') // Sunday
  })
  it('lists week starts', () => {
    expect(weekStarts('2026-11-02', 3)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16'])
  })
})

describe('spreadOverWeeks', () => {
  it('spreads days evenly over the weekdays in the dates', () => {
    // 10 weekdays over two weeks → 5 days each
    const s = spreadOverWeeks(10, '2026-11-02', '2026-11-13')!
    expect([...s.entries()]).toEqual([
      ['2026-11-02', 5],
      ['2026-11-09', 5],
    ])
  })
  it('skips weekends', () => {
    const s = spreadOverWeeks(2, '2026-11-06', '2026-11-09')! // Fri + Mon
    expect([...s.entries()]).toEqual([
      ['2026-11-02', 1],
      ['2026-11-09', 1],
    ])
  })
  it('gives up when there are no weekdays to use', () => {
    expect(spreadOverWeeks(3, '2026-11-07', '2026-11-08')).toBeNull() // a weekend
    expect(spreadOverWeeks(3, '2026-11-10', '2026-11-01')).toBeNull() // end before start
  })
})

describe('personAvailability', () => {
  const weeks = ['2026-11-02', '2026-11-09']
  const today = '2026-11-02'

  it('adds logged and expected days and works out what is free', () => {
    const a = personAvailability(
      'p1',
      weeks,
      today,
      // 5 days allocated, 1 already logged; sales order runs 2–13 Nov → 4 left over 10 weekdays
      [{ fieldEngineerId: 'p1', allocatedDays: 5, loggedDays: 1, start: '2026-11-02', end: '2026-11-13' }],
      [{ fieldEngineerId: 'p1', workDate: '2026-11-03', days: 1 }],
    )
    expect(a.weeks.get('2026-11-02')).toEqual({ logged: 1, expected: 2, free: 2 })
    expect(a.weeks.get('2026-11-09')).toEqual({ logged: 0, expected: 2, free: 3 })
    expect(a.committed).toBe(4)
    expect(a.unscheduled).toBe(0)
  })

  it('only spreads from today, and counts days it cannot place', () => {
    const a = personAvailability(
      'p1',
      weeks,
      '2026-11-09',
      [
        { fieldEngineerId: 'p1', allocatedDays: 5, loggedDays: 0, start: '2026-11-02', end: '2026-11-13' }, // 5 over 9–13 Nov
        { fieldEngineerId: 'p1', allocatedDays: 3, loggedDays: 0, start: '2026-09-14', end: '2026-10-26' }, // already ended
        { fieldEngineerId: 'p1', allocatedDays: 2, loggedDays: 0, start: null, end: null }, // no dates
      ],
      [],
    )
    expect(a.weeks.get('2026-11-02')).toEqual({ logged: 0, expected: 0, free: 5 })
    expect(a.weeks.get('2026-11-09')).toEqual({ logged: 0, expected: 5, free: 0 })
    expect(a.unscheduled).toBe(5)
    expect(a.committed).toBe(10)
  })

  it('never shows negative free days, and ignores other people', () => {
    const a = personAvailability(
      'p1',
      weeks,
      today,
      [],
      [
        { fieldEngineerId: 'p1', workDate: '2026-11-02', days: 1 },
        ...['03', '04', '05', '06', '07'].map((d) => ({ fieldEngineerId: 'p1', workDate: `2026-11-${d}`, days: 1 })),
        { fieldEngineerId: 'p2', workDate: '2026-11-02', days: 1 },
      ],
    )
    expect(a.weeks.get('2026-11-02')).toEqual({ logged: 6, expected: 0, free: 0 })
  })
})

describe('skillCounts', () => {
  const today = '2026-11-02'
  it('applies a minimum level (unrated skills don’t meet one)', () => {
    expect(skillCounts({ level: 'advanced', expires_on: null }, 'intermediate', true, today)).toBe(true)
    expect(skillCounts({ level: 'beginner', expires_on: null }, 'intermediate', true, today)).toBe(false)
    expect(skillCounts({ level: null, expires_on: null }, 'beginner', true, today)).toBe(false)
    expect(skillCounts({ level: null, expires_on: null }, '', true, today)).toBe(true)
  })
  it('can leave out expired certifications', () => {
    expect(skillCounts({ level: null, expires_on: '2026-10-01' }, '', false, today)).toBe(false)
    expect(skillCounts({ level: null, expires_on: '2026-10-01' }, '', true, today)).toBe(true)
    expect(skillCounts({ level: null, expires_on: '2027-01-01' }, '', false, today)).toBe(true)
  })
})
