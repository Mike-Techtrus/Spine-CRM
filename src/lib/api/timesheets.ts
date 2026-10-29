import { supabase } from '../supabaseClient'
import type { PersonKind, PersonLogin, DayType, FieldEngineer, TimesheetEntry, TimesheetEntryWithRelations, TimesheetStatus } from '../types'
import { unwrap } from './_shared'

const TIMESHEET_WITH_RELATIONS_SELECT = `
  *,
  field_engineer:field_engineers(id, name, email, user_id, kind),
  client:accounts(id, name),
  approver:profiles(id, full_name),
  assignment:project_assignments(id, allocated_days, project_line:project_lines(id, part_code, line_type, project:projects(id, reference, name, owner_id)))
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

// Pass a kind to get only contractors or only staff; timesheets use contractors.
export async function listFieldEngineers(kind?: PersonKind): Promise<FieldEngineer[]> {
  let query = supabase.from('field_engineers').select('*').order('name')
  if (kind) query = query.eq('kind', kind)
  return unwrap(await query)
}

export async function getFieldEngineer(id: string): Promise<FieldEngineer> {
  return unwrap(await supabase.from('field_engineers').select('*').eq('id', id).single())
}

export interface FieldEngineerInput {
  kind?: PersonKind
  name: string
  email: string
  phone: string | null
  day_rate: number | null
  user_id?: string | null
  address_line_1?: string | null
  address_line_2?: string | null
  city?: string | null
  postcode?: string | null
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
// list_people_logins() database function (0013, 0015) because emails live in
// auth.users, which the browser can't read directly.
export async function listPersonLogins(): Promise<PersonLogin[]> {
  return unwrap(await supabase.rpc('list_people_logins'))
}

// ── Project timesheets (projects phase 2, migration 0023) ──────────────────

// One of my allocations, with the project line and project it belongs to.
export interface MyAssignment {
  id: string
  allocated_days: number
  project_line: {
    id: string
    part_code: string | null
    line_type: string
    description: string | null
    project: { id: string; reference: string; name: string; status: 'active' | 'complete' }
  }
}

export async function listMyAssignments(fieldEngineerId: string): Promise<MyAssignment[]> {
  return unwrap(
    await supabase
      .from('project_assignments')
      .select('id, allocated_days, project_line:project_lines(id, part_code, line_type, description, project:projects(id, reference, name, status))')
      .eq('field_engineer_id', fieldEngineerId),
  ) as unknown as MyAssignment[]
}

export async function listMyTimesheetsBetween(
  fieldEngineerId: string,
  from: string,
  to: string,
): Promise<TimesheetEntry[]> {
  return unwrap(
    await supabase
      .from('timesheet_entries')
      .select('*')
      .eq('field_engineer_id', fieldEngineerId)
      .gte('work_date', from)
      .lte('work_date', to),
  )
}

// A draft against a project allocation; the client is filled in from the
// project by the database (timesheet_entries_check, 0023).
export async function createProjectTimesheet(
  fieldEngineerId: string,
  input: { project_assignment_id: string; work_date: string; day_type: DayType; work_description: string | null },
): Promise<TimesheetEntry> {
  return unwrap(
    await supabase
      .from('timesheet_entries')
      .insert({ field_engineer_id: fieldEngineerId, ...input, client_id: null, status: 'draft' as TimesheetStatus })
      .select()
      .single(),
  )
}

export async function updateTimesheetDay(
  id: string,
  input: { day_type: DayType; work_description?: string | null; status?: TimesheetStatus },
): Promise<TimesheetEntry> {
  return unwrap(await supabase.from('timesheet_entries').update(input).eq('id', id).select().single())
}

export async function deleteTimesheet(id: string): Promise<void> {
  const { error } = await supabase.from('timesheet_entries').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// Submits several drafts at once. The database refuses the lot if any would
// go over an allocation, so nothing is half-submitted.
export async function submitTimesheets(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase
    .from('timesheet_entries')
    .update({ status: 'submitted' as TimesheetStatus, submitted_on: new Date().toISOString() })
    .in('id', ids)
  if (error) throw new Error(error.message)
}
