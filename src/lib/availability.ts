import { round2 } from './money'
import type { SkillLevel } from './types'

// Availability for Admin → User Accounts → Find & availability.
//
// For each person and week (Monday–Friday, 5 working days):
//   logged   = timesheet days they've entered for that week (any status but
//              rejected; future drafts count as bookings)
//   expected = allocated project days not yet logged, spread evenly over the
//              working days left in the sales order's start–end dates
//              (from today). An estimate — allocations have no dates of their own.
//   free     = 5 − logged − expected, never below 0
// Allocated days that can't be placed (no end date, or the end date has
// passed) are counted as "unscheduled" instead.

export const WORKING_DAYS_PER_WEEK = 5

function parse(iso: string) {
  return new Date(`${iso}T00:00:00Z`)
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10)
}

export function addDays(isoDate: string, days: number): string {
  const d = parse(isoDate)
  d.setUTCDate(d.getUTCDate() + days)
  return iso(d)
}

// The Monday of the week a date falls in.
export function mondayOf(isoDate: string): string {
  const d = parse(isoDate)
  return addDays(isoDate, -((d.getUTCDay() + 6) % 7))
}

export function weekStarts(fromMonday: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(fromMonday, i * 7))
}

const isWeekday = (isoDate: string) => {
  const day = parse(isoDate).getUTCDay()
  return day >= 1 && day <= 5
}

// Spreads `days` evenly over the weekdays from `start` to `end` (inclusive),
// returning days per week (keyed by Monday). Null if there are no weekdays to
// spread over.
export function spreadOverWeeks(days: number, start: string, end: string): Map<string, number> | null {
  if (days <= 0) return new Map()
  if (end < start) return null
  const weekdays: string[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) if (isWeekday(d)) weekdays.push(d)
  if (weekdays.length === 0) return null
  const perDay = days / weekdays.length
  const byWeek = new Map<string, number>()
  for (const d of weekdays) {
    const w = mondayOf(d)
    byWeek.set(w, (byWeek.get(w) ?? 0) + perDay)
  }
  return byWeek
}

export interface AllocationPlan {
  fieldEngineerId: string
  allocatedDays: number
  loggedDays: number // all non-rejected timesheet days on this allocation, any date
  start: string | null // sales order start date
  end: string | null // sales order end date
}

export interface LoggedDay {
  fieldEngineerId: string
  workDate: string
  days: number
}

export interface WeekBooking {
  logged: number
  expected: number
  free: number
}

export interface PersonAvailability {
  weeks: Map<string, WeekBooking>
  unscheduled: number // allocated, not logged, and no future dates to place it in
  committed: number // allocated days not yet logged, on active projects
}

export function personAvailability(
  fieldEngineerId: string,
  weeks: string[],
  today: string,
  allocations: AllocationPlan[],
  logged: LoggedDay[],
): PersonAvailability {
  const loggedByWeek = new Map<string, number>()
  for (const l of logged) {
    if (l.fieldEngineerId !== fieldEngineerId) continue
    const w = mondayOf(l.workDate)
    loggedByWeek.set(w, (loggedByWeek.get(w) ?? 0) + l.days)
  }

  const expectedByWeek = new Map<string, number>()
  let unscheduled = 0
  let committed = 0
  for (const a of allocations) {
    if (a.fieldEngineerId !== fieldEngineerId) continue
    const remaining = Math.max(a.allocatedDays - a.loggedDays, 0)
    committed += remaining
    if (remaining === 0) continue
    const from = a.start && a.start > today ? a.start : today
    const spread = a.end ? spreadOverWeeks(remaining, from, a.end) : null
    if (!spread) {
      unscheduled += remaining
      continue
    }
    for (const [w, d] of spread) expectedByWeek.set(w, (expectedByWeek.get(w) ?? 0) + d)
  }

  const result = new Map<string, WeekBooking>()
  for (const w of weeks) {
    const l = round2(loggedByWeek.get(w) ?? 0)
    const e = round2(expectedByWeek.get(w) ?? 0)
    result.set(w, { logged: l, expected: e, free: Math.max(round2(WORKING_DAYS_PER_WEEK - l - e), 0) })
  }
  return { weeks: result, unscheduled: round2(unscheduled), committed: round2(committed) }
}

// ── Skills ──────────────────────────────────────────────────────────────────

const LEVEL_ORDER: Record<SkillLevel, number> = { beginner: 1, intermediate: 2, advanced: 3, expert: 4 }

// Does a person's skill count towards a search? A minimum level rules out
// lower levels and unrated entries; an expiry date in the past rules it out
// when expired ones aren't wanted.
export function skillCounts(
  skill: { level: SkillLevel | null; expires_on: string | null },
  minLevel: SkillLevel | '',
  includeExpired: boolean,
  today: string,
): boolean {
  if (!includeExpired && skill.expires_on && skill.expires_on < today) return false
  if (!minLevel) return true
  return skill.level !== null && LEVEL_ORDER[skill.level] >= LEVEL_ORDER[minLevel]
}
