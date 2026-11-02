// Spine's money rules in one place, used by the Quote and Invoice forms and
// covered by src/lib/money.test.ts. The database does the same sums in
// create_invoice_from_timesheets() (migration 0039) — the tests pin these
// functions to answers taken from the live database, so the two can't drift
// apart unnoticed.
//
//   VAT        = 20% of Value, to the penny
//   Total      = Value + VAT
//   Rebate     = client's rebate rate × value of rebate-eligible lines, to the penny
//   Net value  = Total − Rebate

export const VAT_RATE = 0.2

// Payment terms when the client account has none set (Customer Accounts → Edit).
export const STANDARD_PAYMENT_TERMS_DAYS = 30

// Rounds to the penny the way the database does (halves away from zero), without
// binary floating-point surprises such as 1.005 → 1.00.
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0
  const sign = n < 0 ? -1 : 1
  const shifted = Number(`${Math.abs(n)}e2`)
  const rounded = Number.isFinite(shifted) ? Math.round(shifted) : Math.round(Math.abs(n) * 100)
  return (sign * rounded) / 100 || 0 // || 0 turns -0 into 0
}

export interface MoneyTotals {
  value: number
  vat: number
  total: number
  rebate: number
  net_value: number
}

// Everything that follows from a Value, the part of it that earns rebate, and
// the client's rebate rate as a fraction (7.5% → 0.075).
export function moneyTotals(value: number, eligibleValue: number, rebateRate: number): MoneyTotals {
  const vat = round2(value * VAT_RATE)
  const total = round2(value + vat)
  const rebate = round2(eligibleValue * rebateRate)
  return { value, vat, total, rebate, net_value: round2(total - rebate) }
}

// One line: quantity × unit price, to the penny (0 if either isn't a number).
export function lineAmount(qty: number | string, unitPrice: number | string): number {
  const q = Number(qty)
  const p = Number(unitPrice)
  return Number.isNaN(q) || Number.isNaN(p) ? 0 : round2(q * p)
}

export function paymentTermsDays(account: { payment_terms_days?: number | null } | null | undefined): number {
  return account?.payment_terms_days ?? STANDARD_PAYMENT_TERMS_DAYS
}

// "2026-10-30" + 30 → "2026-11-29" (worked in UTC so time zones can't shift the day).
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
