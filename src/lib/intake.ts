// Opportunity intake (0054): what the AI read from an email (triage-email /
// mailbox-poll Edge Functions) and the running qualification sheet kept on
// the opportunity. Pure functions so they can be tested.

// Keep in step with SCHEMA in supabase/functions/_shared/triage.ts.
export type IntakeCategory =
  | 'new_opportunity'
  | 'existing_opportunity_update'
  | 'purchase_order'
  | 'invoice_or_finance'
  | 'timesheet_or_resourcing'
  | 'other_business'
  | 'not_relevant'

export const INTAKE_CATEGORY_LABELS: Record<IntakeCategory, string> = {
  new_opportunity: 'New opportunity',
  existing_opportunity_update: 'Update to an opportunity',
  purchase_order: 'Purchase order',
  invoice_or_finance: 'Invoice / finance',
  timesheet_or_resourcing: 'Timesheet / resourcing',
  other_business: 'Other business',
  not_relevant: 'Not relevant',
}

export type JobType =
  | 'device_rollout'
  | 'office_move_decom'
  | 'onsite_engineer'
  | 'asset_technician'
  | 'network'
  | 'installation'
  | 'other'

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  device_rollout: 'Device rollout',
  office_move_decom: 'Office move / decom',
  onsite_engineer: 'Onsite engineer',
  asset_technician: 'Asset technician',
  network: 'Network',
  installation: 'Installation',
  other: 'Other',
}

export interface QualificationItem {
  key: string
  label: string
  value: string | null
  evidence: string | null
}

export interface MissingItem {
  key: string
  label: string
  why: string
}

export interface IntakeReading {
  category: IntakeCategory
  summary: string
  match: {
    opportunity_number: string | null
    opportunity_id: string | null // added by the function from the TECHOPP number
    confidence: 'high' | 'medium' | 'low' | 'none'
    reason: string
  }
  new_opportunity: {
    name: string
    customer_opportunity_number: string | null
    client_name: string | null
    end_client_name: string | null
    description: string
  }
  job_type: JobType
  qualification: QualificationItem[]
  missing: MissingItem[]
  questions_email: string
  quote_due: string | null
  contacts: { name: string; email: string | null; phone: string | null; company: string | null; role: string | null }[]
  flags: string[]
  found_opp_numbers?: string[]
}

// Stored on opportunities.qualification.
export interface Qualification {
  job_type: JobType
  items: QualificationItem[]
  missing: MissingItem[]
  quote_due: string | null
  flags: string[]
  updated_from_intake_id: string | null
}

const blank = (v: string | null | undefined) => v == null || v.trim() === ''

// Bring an email's reading into the opportunity's sheet: what the email says
// wins; anything it doesn't mention keeps what we already knew (including
// what people typed in). Items only on the old sheet are kept too.
export function mergeQualification(
  old: Qualification | null,
  reading: Pick<IntakeReading, 'job_type' | 'qualification' | 'missing' | 'quote_due' | 'flags'>,
  intakeId: string | null,
): Qualification {
  const items: QualificationItem[] = reading.qualification.map((n) => {
    const before = old?.items.find((o) => o.key === n.key)
    return !blank(n.value) || !before ? n : before
  })
  for (const o of old?.items ?? []) if (!items.some((i) => i.key === o.key)) items.push(o)
  const known = new Set(items.filter((i) => !blank(i.value)).map((i) => i.key))
  return {
    job_type: reading.job_type,
    items,
    missing: reading.missing.filter((m) => !known.has(m.key)),
    quote_due: reading.quote_due ?? old?.quote_due ?? null,
    flags: [...new Set([...(old?.flags ?? []), ...reading.flags])],
    updated_from_intake_id: intakeId,
  }
}

// How complete a sheet is, for a quick "7 of 15 known".
export function qualificationProgress(q: Pick<Qualification, 'items'>): { known: number; total: number } {
  return { known: q.items.filter((i) => !blank(i.value)).length, total: q.items.length }
}

// The account to use for a name the AI gave: exact match first (ignoring case
// and "Ltd"/"Limited"/punctuation), so "BHFT" or "CDW Ltd" find the account.
export function findAccountByName<T extends { id: string; name: string }>(accounts: T[], name: string | null): T | null {
  if (!name) return null
  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b(ltd|limited|plc|uk|llp|inc)\b/g, '')
      .replace(/[^a-z0-9]/g, '')
  const target = clean(name)
  if (!target) return null
  return accounts.find((a) => a.name.toLowerCase() === name.toLowerCase()) ?? accounts.find((a) => clean(a.name) === target) ?? null
}
