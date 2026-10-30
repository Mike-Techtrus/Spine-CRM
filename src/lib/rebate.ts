import type { Account, LineType } from './types'

// The rebate is the client account's agreed rate (Customer Accounts → Edit;
// only CDW has one, 7.5%) × the value of lines whose line type earns it
// (ticked under Admin → Rate cards: Resource, Outsource Resource). Blank or
// unknown line types earn it, as before. Same rules as account_rebate_rate()
// and rebate_eligible_type() in supabase/migrations/0030 and 0031.

// The client's rate as a fraction (7.5% → 0.075); 0 with no client.
export function accountRebateRate(account: Account | null | undefined): number {
  return (Number(account?.rebate_rate) || 0) / 100
}

export function isRebateEligible(lineType: string | null | undefined, lineTypes: LineType[]): boolean {
  const name = (lineType ?? '').trim().toLowerCase()
  const match = lineTypes.find((t) => t.name.toLowerCase() === name)
  return match?.rebate_eligible !== false // also true if migration 0030 hasn't run yet (no column)
}
