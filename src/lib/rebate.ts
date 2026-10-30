import type { LineType } from './types'

// The rebate is 7.5% of the value of lines whose line type earns it (ticked
// under Admin → Rate cards: Resource, Outsource Resource). Blank or unknown
// line types keep the old rule and earn it — same as rebate_eligible_type()
// in supabase/migrations/0030_rebate_by_line_type.sql.
export const REBATE_RATE = 0.075

export function isRebateEligible(lineType: string | null | undefined, lineTypes: LineType[]): boolean {
  const name = (lineType ?? '').trim().toLowerCase()
  const match = lineTypes.find((t) => t.name.toLowerCase() === name)
  return match?.rebate_eligible !== false // also true if migration 0030 hasn't run yet (no column)
}
