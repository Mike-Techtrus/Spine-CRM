import { supabase } from '../supabaseClient'
import type { DayType } from '../types'
import { unwrap } from './_shared'

// Contractor costs (migration 0043): approved contractor days priced at their
// cost rate, recorded on statements (CS-00001…) that lock those days.

export type StatementStatus = 'recorded' | 'paid'

export interface ContractorStatement {
  id: string
  reference: string
  field_engineer_id: string
  period_month: string // first of the month
  days: number
  amount: number // days + expenses
  expenses?: number // approved expenses they paid, included in amount (0060)
  status: StatementStatus
  paid_on: string | null
  payment_reference: string | null
  notes: string | null
  created_at: string
}

// An approved day, with what it costs.
export interface CostDay {
  id: string
  reference: string
  field_engineer_id: string
  work_date: string
  day_type: DayType
  contractor_statement_id: string | null
  contractor_rate: number | null // stamped when it went on a statement
  client: { name: string } | null
  project_assignment: {
    cost_rate: number | null
    project_line: { part_code: string | null; line_type: string; project: { reference: string; name: string } }
  } | null
}

const DAY_SELECT = `
  id, reference, field_engineer_id, work_date, day_type, contractor_statement_id, contractor_rate,
  client:accounts(name),
  project_assignment:project_assignments(cost_rate, project_line:project_lines(part_code, line_type, project:projects(reference, name)))
`

export async function listApprovedDaysBetween(from: string, to: string): Promise<CostDay[]> {
  return unwrap<CostDay[]>(
    (await supabase
      .from('timesheet_entries')
      .select(DAY_SELECT)
      .eq('status', 'approved')
      .gte('work_date', from)
      .lte('work_date', to)
      .order('work_date')) as unknown as { data: CostDay[] | null; error: { message: string } | null },
  )
}

export async function listStatementDays(statementId: string): Promise<CostDay[]> {
  return unwrap<CostDay[]>(
    (await supabase
      .from('timesheet_entries')
      .select(DAY_SELECT)
      .eq('contractor_statement_id', statementId)
      .order('work_date')) as unknown as { data: CostDay[] | null; error: { message: string } | null },
  )
}

export async function listContractorStatements(periodMonth: string): Promise<ContractorStatement[]> {
  return unwrap(
    await supabase.from('contractor_statements').select('*').eq('period_month', periodMonth).order('reference'),
  )
}

export async function createContractorStatement(fieldEngineerId: string, month: string): Promise<string> {
  return unwrap<string>(
    await supabase.rpc('create_contractor_statement', { p_field_engineer_id: fieldEngineerId, p_month: month }),
  )
}

export async function markStatementPaid(id: string, paidOn: string, paymentReference: string | null): Promise<void> {
  const { error } = await supabase
    .from('contractor_statements')
    .update({ status: 'paid', paid_on: paidOn, payment_reference: paymentReference })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function markStatementUnpaid(id: string): Promise<void> {
  const { error } = await supabase
    .from('contractor_statements')
    .update({ status: 'recorded', paid_on: null, payment_reference: null })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// Only unpaid statements can be deleted (database rule); their days are freed.
export async function deleteContractorStatement(id: string): Promise<void> {
  const { error, count } = await supabase.from('contractor_statements').delete({ count: 'exact' }).eq('id', id)
  if (error) throw new Error(error.message)
  if (count === 0) throw new Error('Only statements that aren’t marked paid can be deleted.')
}
