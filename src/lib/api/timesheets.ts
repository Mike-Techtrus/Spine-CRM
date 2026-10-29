import { supabase } from '../supabaseClient'
import type { ContractorLogin, DayType, FieldEngineer, TimesheetEntry, TimesheetEntryWithRelations, TimesheetStatus } from '../types'
import { unwrap } from './_shared'

const TIMESHEET_WITH_RELATIONS_SELECT = `
  *,
  field_engineer:field_engineers(id, name, email),
  client:accounts(id, name),
  approver:profiles(id, full_name)
`

export async function getMyFieldEngineer(userId: string): Promise<FieldEngineer | null> {
  const { data, error } = await supabase
    .from('field_engineers')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

// ── Field engineer: their own timesheets ───────────────────────────────────

export async function listMyTimesheets(fieldEngineerId: string): Promise<TimesheetEntryWithRelations[]> {
  return unwrap(
    await supabase
      .from('timesheet_entries')
      .select(TIMESHEET_WITH_RELATIONS_SELECT)
      .eq('field_engineer_id', fieldEngineerId)
      .order('work_date', { ascending: false }),
  )
}

export async function getTimesheet(id: string): Promise<TimesheetEntryWithRelations> {
  return unwrap(
    await supabase.from('timesheet_entries').select(TIMESHEET_WITH_RELATIONS_SELECT).eq('id', id).single(),
  )
}

export interface TimesheetInput {
  client_id: string
  project_reference: string | null
  work_date: string
  day_type: DayType
  work_description: string | null
}

export async function createTimesheet(
  fieldEngineerId: string,
  input: TimesheetInput,
): Promise<TimesheetEntry> {
  return unwrap(
    await supabase
      .from('timesheet_entries')
      .insert({ field_engineer_id: fieldEngineerId, ...input, status: 'draft' as TimesheetStatus })
      .select()
      .single(),
  )
}

export async function updateTimesheet(id: string, input: Partial<TimesheetInput>): Promise<TimesheetEntry> {
  return unwrap(await supabase.from('timesheet_entries').update(input).eq('id', id).select().single())
}

export async function submitTimesheet(id: string): Promise<TimesheetEntry> {
  return unwrap(
    await supabase
      .from('timesheet_entries')
      .update({ status: 'submitted' as TimesheetStatus, submitted_on: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single(),
  )
}

// ── Staff: all timesheets + approvals ──────────────────────────────────────

export interface TimesheetFilters {
  status?: TimesheetStatus
  fieldEngineerId?: string
  clientId?: string
}

export async function listAllTimesheets(filters: TimesheetFilters = {}): Promise<TimesheetEntryWithRelations[]> {
  let query = supabase
    .from('timesheet_entries')
    .select(TIMESHEET_WITH_RELATIONS_SELECT)
    .order('work_date', { ascending: false })

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.fieldEngineerId) query = query.eq('field_engineer_id', filters.fieldEngineerId)
  if (filters.clientId) query = query.eq('client_id', filters.clientId)

  return unwrap(await query)
}

export async function approveTimesheet(id: string, approverId: string): Promise<TimesheetEntry> {
  return unwrap(
    await supabase
      .from('timesheet_entries')
      .update({
        status: 'approved' as TimesheetStatus,
        approved_by: approverId,
        approved_on: new Date().toISOString(),
        rejection_notes: null,
      })
      .eq('id', id)
      .select()
      .single(),
  )
}

export async function rejectTimesheet(id: string, approverId: string, notes: string): Promise<TimesheetEntry> {
  return unwrap(
    await supabase
      .from('timesheet_entries')
      .update({
        status: 'rejected' as TimesheetStatus,
        approved_by: approverId,
        approved_on: new Date().toISOString(),
        rejection_notes: notes,
      })
      .eq('id', id)
      .select()
      .single(),
  )
}

// ── Staff: field engineers ─────────────────────────────────────────────────

export async function listFieldEngineers(): Promise<FieldEngineer[]> {
  return unwrap(await supabase.from('field_engineers').select('*').order('name'))
}

export interface FieldEngineerInput {
  name: string
  email: string
  phone: string | null
  day_rate: number | null
  user_id?: string | null
}

export async function createFieldEngineer(input: FieldEngineerInput): Promise<FieldEngineer> {
  return unwrap(await supabase.from('field_engineers').insert(input).select().single())
}

export async function updateFieldEngineer(
  id: string,
  input: Partial<FieldEngineerInput & { is_active: boolean; user_id: string | null }>,
): Promise<FieldEngineer> {
  return unwrap(await supabase.from('field_engineers').update(input).eq('id', id).select().single())
}

// Contractor logins for the "link a login" dropdowns. Comes from the
// list_contractor_logins() database function (0013) because emails live in
// auth.users, which the browser can't read directly.
export async function listContractorLogins(): Promise<ContractorLogin[]> {
  return unwrap(await supabase.rpc('list_contractor_logins'))
}
