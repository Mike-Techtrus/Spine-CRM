// Hand-written types mirroring the Supabase schema in supabase/migrations/*.sql.
// If you prefer, generate these instead with the Supabase CLI:
//   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts

export type UserRole = 'staff' | 'field_engineer'

export interface Profile {
  id: string // = auth.users.id
  full_name: string
  role: UserRole
  permissions: AppArea[] // staff only — which areas they can open
  created_at: string
}

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  staff: 'Staff',
  field_engineer: 'Contractor',
}

// Areas a staff user can be given access to. Order here is nav order.
// Keep the keys in step with supabase/migrations/0012_user_admin.sql and
// supabase/functions/admin-users/index.ts.
export const APP_AREAS = [
  { key: 'dashboard', label: 'Dashboard', path: '/staff/dashboard' },
  { key: 'opportunities', label: 'Opportunities', path: '/staff/opportunities' },
  { key: 'quotes', label: 'Quotes', path: '/staff/quotes' },
  { key: 'sales_orders', label: 'Sales Orders', path: '/staff/sales-orders' },
  { key: 'projects', label: 'Projects', path: '/staff/projects' },
  { key: 'invoices', label: 'Invoices', path: '/staff/invoices' },
  { key: 'timesheets', label: 'Timesheets', path: '/staff/timesheets' },
  { key: 'accounts', label: 'Accounts', path: '/staff/accounts' },
  { key: 'engineers', label: 'Users', path: '/staff/users' }, // contractor + staff profiles
  { key: 'admin', label: 'Admin', path: '/staff/admin' },
] as const

export type AppArea = (typeof APP_AREAS)[number]['key']

// A login as seen from the Admin area — profile plus the auth details
// (email, last sign-in) only the admin-users Edge Function can read.
export interface AdminUser {
  id: string
  email: string
  full_name: string
  role: UserRole
  permissions: AppArea[]
  created_at: string
  last_sign_in_at: string | null
  disabled: boolean // can't sign in until re-enabled from the Admin area
}

// ── Accounts / Contacts ─────────────────────────────────────────────────────

export interface Account {
  id: string
  name: string
  website: string | null
  phone: string | null
  email: string | null
  billing_name: string | null // legal name for invoices, e.g. "CDW Limited" — falls back to name
  rate_card_id: string | null // custom rate card; null = the Default rate card
  address_line_1: string | null
  address_line_2: string | null
  city: string | null
  postcode: string | null
  is_active: boolean
  created_at: string
}

export interface Contact {
  id: string
  account_id: string | null
  name: string
  email: string | null
  phone: string | null
  created_at: string
}

// ── Field engineers / timesheets ────────────────────────────────────────────

// field_engineers holds both contractor and staff profiles (migration 0015).
// Shown on screen under Users → Contractors / Staff.
export type PersonKind = 'contractor' | 'staff'

export const PERSON_KINDS: Record<
  PersonKind,
  { plural: string; singular: string; rateLabel: string; loginRole: UserRole; path: string }
> = {
  contractor: {
    plural: 'Contractors',
    singular: 'contractor',
    rateLabel: 'Day rate',
    loginRole: 'field_engineer',
    path: '/staff/users/contractors',
  },
  staff: {
    plural: 'Staff',
    singular: 'staff member',
    rateLabel: 'Cost rate', // same day_rate column, shown differently for staff
    loginRole: 'staff',
    path: '/staff/users/staff',
  },
}

export interface FieldEngineer {
  id: string
  kind: PersonKind
  user_id: string | null // linked auth user once they've been invited/activated
  name: string
  email: string
  phone: string | null
  address_line_1: string | null
  address_line_2: string | null
  city: string | null
  postcode: string | null
  day_rate: number | null // "Cost rate" on screen for staff
  is_active: boolean
  created_at: string
  cv_path: string | null // object path in the private "contractor-cvs" storage bucket
  cv_file_name: string | null
  cv_uploaded_at: string | null
}

// A login that a contractor or staff record can be linked to.
export interface PersonLogin {
  id: string
  email: string
  full_name: string
  role: UserRole
  disabled: boolean
  linked_engineer_id: string | null // the record already using this login, if any
}

// ── Skills database ─────────────────────────────────────────────────────────

export interface SkillCategory {
  id: string
  name: string
  sort_order: number
  created_at: string
}

export interface Skill {
  id: string
  category_id: string
  name: string
  description: string | null
  is_active: boolean // inactive skills stay on existing profiles but can't be newly added
  created_at: string
}

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert'

export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
}

export interface ContractorSkill {
  id: string
  field_engineer_id: string
  skill_id: string
  level: SkillLevel | null
  obtained_on: string | null
  expires_on: string | null
  notes: string | null
  created_at: string
}

export type DayType = 'full_day' | 'half_day_am' | 'half_day_pm'
export type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

export interface TimesheetEntry {
  id: string
  reference: string // human-friendly e.g. TS-000123
  field_engineer_id: string
  client_id: string
  project_reference: string | null
  work_date: string // date, 'YYYY-MM-DD'
  day_type: DayType
  work_description: string | null
  status: TimesheetStatus
  submitted_on: string | null
  approved_by: string | null // profiles.id of the approving staff member
  approved_on: string | null
  rejection_notes: string | null
  project_assignment_id: string | null // the project allocation this day draws down (0022)
  created_at: string
  updated_at: string
}

// Convenience joined shape used in staff/engineer list views
export interface TimesheetEntryWithRelations extends TimesheetEntry {
  field_engineer: Pick<FieldEngineer, 'id' | 'name' | 'email' | 'user_id' | 'kind'>
  client: Pick<Account, 'id' | 'name'>
  approver: Pick<Profile, 'id' | 'full_name'> | null
  // The project allocation it draws down, if any (projects phase 2).
  assignment: {
    id: string
    allocated_days: number
    project_line: {
      id: string
      part_code: string | null
      line_type: string
      project: { id: string; reference: string; name: string; owner_id: string | null }
    }
  } | null
}

// "PRJ-00001 · L2 Engineer" for a timesheet on a project, else null.
export function timesheetProjectLabel(ts: Pick<TimesheetEntryWithRelations, 'assignment'>): string | null {
  const line = ts.assignment?.project_line
  return line ? `${line.project.reference} · ${line.part_code || line.line_type}` : null
}

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  full_day: 'Full day',
  half_day_am: 'Half day (AM)',
  half_day_pm: 'Half day (PM)',
}

export const STATUS_LABELS: Record<TimesheetStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
}

// ── Opportunities ───────────────────────────────────────────────────────────

export type OpportunitySource = 'email' | 'web_form' | 'phone' | 'referral' | 'other'
export type OpportunityStage = 'qualifying' | 'quoting' | 'closed_won' | 'closed_lost' | 'quote_accepted' | 'po_received'

export interface Opportunity {
  id: string
  opportunity_number: string // auto-generated, e.g. "TECHOPP10000" — ours, not the customer's
  name: string // UI label: "Customer Opp Name"
  customer_opportunity_number: string | null // the customer's own number (e.g. CDW's "OPP#"), not ours
  opportunity_owner: string | null
  billing_account_id: string | null
  client_id: string | null
  contact_id: string | null
  description: string | null
  estimated_value: number | null
  expected_close_date: string | null
  source: OpportunitySource | null
  stage: OpportunityStage
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface OpportunityWithRelations extends Opportunity {
  // billing_account_id carries the "Client" label in the UI; client_id carries "End Client" —
  // kept as the underlying column names inherited from the Dataverse design, but surfaced here
  // under the same client/end_client naming the rest of the pipeline (Quote, Sales Order, Invoice) uses.
  client: Pick<Account, 'id' | 'name'> | null // = billing_account_id
  end_client: Pick<Account, 'id' | 'name'> | null // = client_id
}

export const OPPORTUNITY_SOURCE_LABELS: Record<OpportunitySource, string> = {
  email: 'Email',
  web_form: 'Web form',
  phone: 'Phone',
  referral: 'Referral',
  other: 'Other',
}

// Stages are set automatically from the opportunity's quotes (migration 0029):
// no quotes → Qualifying, a draft/sent quote → Quoting, any accepted quote →
// Closed Won, every quote expired/declined → Closed Lost. 'quote_accepted' and
// 'po_received' are old values no longer used.
export const OPPORTUNITY_STAGE_LABELS: Record<OpportunityStage, string> = {
  qualifying: 'Qualifying',
  quoting: 'Quoting',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
  quote_accepted: 'Quote accepted',
  po_received: 'PO received',
}

export const CURRENT_OPPORTUNITY_STAGES: OpportunityStage[] = ['qualifying', 'quoting', 'closed_won', 'closed_lost']

// StatusBadge colours (see STATUS_STYLES in components/ui.tsx).
export const OPPORTUNITY_STAGE_BADGE: Record<OpportunityStage, string> = {
  qualifying: 'draft',
  quoting: 'submitted',
  closed_won: 'approved',
  closed_lost: 'rejected',
  quote_accepted: 'approved',
  po_received: 'approved',
}

// ── Quotes ───────────────────────────────────────────────────────────────────

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired'

export interface Quote {
  id: string
  quote_number: string
  opportunity_id: string | null
  client_id: string | null
  end_client_id: string | null
  contact_id: string | null
  quote_date: string | null
  start_date: string | null
  end_date: string | null
  value: number | null
  vat: number | null
  total: number | null
  rebate: number | null
  net_value: number | null
  status: QuoteStatus
  comments: string | null
  created_at: string
  updated_at: string
}

// Granular breakdown of what makes up a quote's Value — mirrors the "Quote"
// sheet layout in the SharePoint quote workbooks (Line Type / Engineering
// Level / Description / Description 2 / Vendor / Qty / Expected Cost / Total).
export interface QuoteLine {
  id: string
  quote_id: string
  sort_order: number
  line_type: string
  part_code: string | null // "Engineering Level" column — e.g. L2 Engineer, Team Lead, LOGISTICS
  description: string | null
  description_2: string | null
  vendor: string | null // outsourcing/supplier code, e.g. TEC410
  qty: number
  unit_cost: number // copied from the rate card when added, then the quote's own — rate card changes never alter it
  line_total: number // = qty * unit_cost, calculated by the database
  line_item_id: string | null // the rate-card line item it was added from, if any
  created_at: string
  updated_at: string
}

// ── Projects (migration 0022) ─────────────────────────────────────────────────

export type ProjectStatus = 'active' | 'complete'

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Active',
  complete: 'Complete',
}

export interface Project {
  id: string
  reference: string // e.g. PRJ-00001
  sales_order_id: string
  name: string
  owner_id: string | null // staff profile
  status: ProjectStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ProjectWithRelations extends Project {
  sales_order: Pick<SalesOrder, 'id' | 'reference' | 'po_number'> & {
    client: Pick<Account, 'id' | 'name'> | null
    end_client: Pick<Account, 'id' | 'name'> | null
  }
  owner: Pick<Profile, 'id' | 'full_name'> | null
}

// A timesheet-billed line copied from the accepted quote; quoted days and
// day rate are the agreed basis.
export interface ProjectLine {
  id: string
  project_id: string
  quote_line_id: string | null
  line_item_id: string | null
  line_type: string
  part_code: string | null
  description: string | null
  quoted_days: number
  day_rate: number
  sort_order: number
  created_at: string
}

// A person on a project line with an allocation of days (half-day steps).
export interface ProjectAssignment {
  id: string
  project_line_id: string
  field_engineer_id: string
  allocated_days: number
  created_at: string
}

// Days a timesheet entry counts for.
export const DAY_TYPE_DAYS: Record<DayType, number> = {
  full_day: 1,
  half_day_am: 0.5,
  half_day_pm: 0.5,
}

// ── Rate cards (migration 0019, Admin → Rate cards) ──────────────────────────

// How a line type gets onto an invoice (migration 0021): "timesheet" = time &
// materials, added from approved timesheets once the timesheet module drives
// invoicing; "manual" = added to an invoice by hand.
export type LineTypeBilling = 'timesheet' | 'manual'

export const LINE_TYPE_BILLING_LABELS: Record<LineTypeBilling, string> = {
  timesheet: 'From timesheets (T&M)',
  manual: 'Added manually',
}

export interface LineType {
  id: string
  name: string
  billing: LineTypeBilling
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface LineItem {
  id: string
  line_type: string
  part_code: string
  description: string | null // optional default description for new quote lines
  is_active: boolean
  created_at: string
}

export interface RateCard {
  id: string
  name: string
  is_default: boolean
  notes: string | null
  created_at: string
}

export interface RateCardPrice {
  rate_card_id: string
  line_item_id: string
  unit_cost: number
}

// Suggestions offered in the line-item form — both lists are maintained ad
// hoc in the source spreadsheets, so these aren't enforced, just offered.
export const QUOTE_LINE_TYPE_SUGGESTIONS = ['Outsource Resource', 'EXPENSES', 'LOGISTICS']
export const QUOTE_LINE_PART_CODE_SUGGESTIONS = [
  'L1 Engineer',
  'L2 Engineer',
  'L3 Engineer',
  'L4 Engineer',
  'Team Lead',
  'Project Manager',
  'Project Co-Ordinator',
  'EXPENSES',
  'LOGISTICS',
]

export interface QuoteWithRelations extends Quote {
  client: Pick<Account, 'id' | 'name'> | null
  end_client: Pick<Account, 'id' | 'name'> | null
  opportunity: Pick<Opportunity, 'id' | 'name' | 'opportunity_number'> | null
}

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
}

// Quotes are valid for 30 days from their quote date (falling back to when
// they were created, if no quote date is set). Kept in sync with the
// `expire_old_quotes` function in supabase/migrations/0008_quote_expiry_automation.sql,
// which actually flips the stored status server-side once a day.
export const QUOTE_VALIDITY_DAYS = 30

export function quoteExpiresOn(quote: Pick<Quote, 'quote_date' | 'created_at'>): Date {
  const base = new Date(quote.quote_date ?? quote.created_at)
  const expires = new Date(base)
  expires.setDate(expires.getDate() + QUOTE_VALIDITY_DAYS)
  return expires
}

// ── Sales orders ─────────────────────────────────────────────────────────────

export interface SalesOrder {
  id: string
  reference: string
  quote_id: string | null
  client_id: string | null
  end_client_id: string | null
  po_number: string | null
  po_received_date: string | null
  advanced_without_po: boolean
  exception_notes: string | null
  start_date: string | null
  end_date: string | null
  quote_value: number | null
  po_value: number | null
  difference: number | null
  quote_match: boolean
  vat: number | null
  total: number | null
  rebate: number | null
  net_value: number | null
  invoiced_to_date: number | null
  timesheet_sent: string | null
  outstanding_comments: string | null
  closed_at: string | null // closed without (or regardless of) being fully invoiced; null = open
  closed_reason: string | null
  created_at: string
  updated_at: string
}

// How far through invoicing a sales order is. Invoiced to date is the sum
// of its invoices' net values (0017), so it's compared with the order's net
// value; a few pence either way counts as fully invoiced.
export type InvoicingStatus = 'not_invoiced' | 'part_invoiced' | 'fully_invoiced' | 'over_invoiced' | 'closed'

export const INVOICING_STATUS_LABELS: Record<InvoicingStatus, string> = {
  not_invoiced: 'Not invoiced',
  part_invoiced: 'Part invoiced',
  fully_invoiced: 'Fully invoiced',
  over_invoiced: 'Over-invoiced',
  closed: 'Closed',
}

// StatusBadge colours (see STATUS_STYLES in components/ui.tsx).
export const INVOICING_STATUS_BADGE: Record<InvoicingStatus, string> = {
  not_invoiced: 'draft',
  part_invoiced: 'submitted',
  fully_invoiced: 'approved',
  over_invoiced: 'rejected',
  closed: 'expired',
}

const INVOICING_TOLERANCE = 0.05

export function invoicingStatus(so: Pick<SalesOrder, 'net_value' | 'invoiced_to_date' | 'closed_at'>): {
  status: InvoicingStatus
  balance: number // still to invoice; negative when over-invoiced
} {
  const net = Number(so.net_value ?? 0)
  const invoiced = Number(so.invoiced_to_date ?? 0)
  const balance = Math.round((net - invoiced) * 100) / 100
  if (so.closed_at) return { status: 'closed', balance }
  if (invoiced === 0) return { status: 'not_invoiced', balance }
  if (Math.abs(balance) <= INVOICING_TOLERANCE) return { status: 'fully_invoiced', balance: 0 }
  return { status: balance > 0 ? 'part_invoiced' : 'over_invoiced', balance }
}

export interface SalesOrderWithRelations extends SalesOrder {
  client: Pick<Account, 'id' | 'name'> | null
  end_client: Pick<Account, 'id' | 'name'> | null
  quote: Pick<Quote, 'id' | 'quote_number'> | null
}

// ── Invoices ─────────────────────────────────────────────────────────────────

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'cancelled'

export interface Invoice {
  id: string
  invoice_number: string
  quote_id: string | null
  sales_order_id: string | null
  client_id: string | null
  end_client_id: string | null
  po_number: string | null
  invoice_date: string | null
  due_date: string | null
  invoice_period_from: string | null
  invoice_period_to: string | null
  value: number | null
  vat: number | null
  total: number | null
  rebate: number | null
  net_value: number | null
  status: InvoiceStatus
  created_at: string
  updated_at: string
}

export interface InvoiceWithRelations extends Invoice {
  client: Pick<Account, 'id' | 'name'> | null
  end_client: Pick<Account, 'id' | 'name'> | null
  sales_order: Pick<SalesOrder, 'id' | 'reference'> | null
}

// Product Description / Quantity / Price lines on an invoice (migration 0018).
export interface InvoiceLine {
  id: string
  invoice_id: string
  sort_order: number
  description: string | null
  qty: number
  unit_price: number
  created_at: string
}

// The single row of company details printed on every invoice — Admin →
// Invoice settings (migration 0018).
export interface CompanySettings {
  company_name: string
  vat_reg: string
  company_number: string
  registered_address: string
  payment_terms: string // short, e.g. "40 Days"
  payment_terms_text: string
  bank_account_name: string
  bank_account_number: string
  bank_sort_code: string
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  paid: 'Paid',
  cancelled: 'Cancelled',
}

// ── Payments ─────────────────────────────────────────────────────────────────

export interface Payment {
  id: string
  reference: string
  invoice_id: string
  payment_date: string | null
  original_amount: number | null
  remaining_amount: number | null
  payment_amount: number
  created_at: string
}
