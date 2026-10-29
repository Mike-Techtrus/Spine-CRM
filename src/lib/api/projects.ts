import { supabase } from '../supabaseClient'
import type {
  Profile,
  Project,
  ProjectAssignment,
  ProjectLine,
  ProjectStatus,
  ProjectWithRelations,
  TimesheetStatus,
  DayType,
} from '../types'
import { unwrap } from './_shared'

const WITH_RELATIONS_SELECT = `
  *,
  sales_order:sales_orders(
    id, reference, po_number,
    client:accounts!sales_orders_client_id_fkey(id, name),
    end_client:accounts!sales_orders_end_client_id_fkey(id, name)
  ),
  owner:profiles(id, full_name)
`

export async function listProjects(): Promise<ProjectWithRelations[]> {
  return unwrap(await supabase.from('projects').select(WITH_RELATIONS_SELECT).order('created_at', { ascending: false }))
}

export async function getProject(id: string): Promise<ProjectWithRelations> {
  return unwrap(await supabase.from('projects').select(WITH_RELATIONS_SELECT).eq('id', id).single())
}

export async function getProjectForSalesOrder(salesOrderId: string): Promise<Project | null> {
  const { data, error } = await supabase.from('projects').select('*').eq('sales_order_id', salesOrderId).maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

// Copies the accepted quote's timesheet-billed lines (create_project_from_sales_order, 0022).
export async function createProjectFromSalesOrder(salesOrderId: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_project_from_sales_order', { p_sales_order_id: salesOrderId })
  if (error) throw new Error(error.message)
  return data as string
}

export async function updateProject(
  id: string,
  input: Partial<Pick<Project, 'name' | 'owner_id' | 'status' | 'notes'>>,
): Promise<Project> {
  return unwrap(await supabase.from('projects').update(input).eq('id', id).select().single())
}

export async function listProjectLines(projectId: string): Promise<ProjectLine[]> {
  return unwrap(
    await supabase.from('project_lines').select('*').eq('project_id', projectId).order('sort_order').order('created_at'),
  )
}

// Every assignment on a set of project lines (or all of them, for the list page).
export async function listProjectAssignments(lineIds?: string[]): Promise<ProjectAssignment[]> {
  let query = supabase.from('project_assignments').select('*')
  if (lineIds) query = query.in('project_line_id', lineIds.length ? lineIds : ['00000000-0000-0000-0000-000000000000'])
  return unwrap(await query)
}

export async function addProjectAssignment(
  projectLineId: string,
  fieldEngineerId: string,
  allocatedDays: number,
): Promise<ProjectAssignment> {
  return unwrap(
    await supabase
      .from('project_assignments')
      .insert({ project_line_id: projectLineId, field_engineer_id: fieldEngineerId, allocated_days: allocatedDays })
      .select()
      .single(),
  )
}

export async function updateProjectAssignment(id: string, allocatedDays: number): Promise<ProjectAssignment> {
  return unwrap(
    await supabase.from('project_assignments').update({ allocated_days: allocatedDays }).eq('id', id).select().single(),
  )
}

export async function removeProjectAssignment(id: string): Promise<void> {
  const { error } = await supabase.from('project_assignments').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// Timesheet days logged against allocations, for burn-down.
export async function listAssignmentTimesheets(
  assignmentIds: string[],
): Promise<
  { project_assignment_id: string; day_type: DayType; status: TimesheetStatus; work_date: string; invoice_id: string | null }[]
> {
  if (assignmentIds.length === 0) return []
  return unwrap(
    await supabase
      .from('timesheet_entries')
      .select('project_assignment_id, day_type, status, work_date, invoice_id')
      .in('project_assignment_id', assignmentIds),
  )
}

// Staff who can own a project.
export async function listStaffProfiles(): Promise<Pick<Profile, 'id' | 'full_name'>[]> {
  return unwrap(await supabase.from('profiles').select('id, full_name').eq('role', 'staff').order('full_name'))
}

export const PROJECT_STATUSES: ProjectStatus[] = ['active', 'complete']

// All project lines, for totals on the Projects list.
export async function listAllProjectLines(): Promise<ProjectLine[]> {
  return unwrap(await supabase.from('project_lines').select('*'))
}

// Draft invoice from the project's approved, not-yet-invoiced timesheet days
// in a period (create_invoice_from_timesheets, 0025). Returns the invoice id.
export async function createInvoiceFromTimesheets(projectId: string, from: string, to: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_invoice_from_timesheets', {
    p_project_id: projectId,
    p_from: from,
    p_to: to,
  })
  if (error) throw new Error(error.message)
  return data as string
}

// Invoice numbers/status for the invoices a project's days were billed on.
export async function listInvoicesByIds(
  ids: string[],
): Promise<{ id: string; invoice_number: string; status: string; invoice_date: string | null; value: number | null }[]> {
  if (ids.length === 0) return []
  return unwrap(
    await supabase.from('invoices').select('id, invoice_number, status, invoice_date, value').in('id', ids).order('invoice_number'),
  )
}
