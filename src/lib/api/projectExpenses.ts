import { supabase } from '../supabaseClient'
import { unwrap } from './_shared'

// Project expenses (migration 0060). The rules — who may log, approve and
// change what — are in the database trigger project_expenses_check().

export type ExpenseStatus = 'submitted' | 'approved' | 'rejected'
export type ExpensePaidBy = 'person' | 'company'

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  submitted: 'Waiting for approval',
  approved: 'Approved',
  rejected: 'Rejected',
}

export interface ProjectExpense {
  id: string
  reference: string
  project_id: string
  field_engineer_id: string | null
  paid_by: ExpensePaidBy
  expense_date: string
  category: string
  description: string | null
  amount: number
  vat: number
  status: ExpenseStatus
  rejection_notes: string | null
  submitted_on: string
  approved_by: string | null
  approved_on: string | null
  receipt_path: string | null
  receipt_file_name: string | null
  contractor_statement_id: string | null
  created_at: string
  person: { id: string; name: string; kind: string; user_id: string | null } | null
  project: { id: string; reference: string; name: string; status: string; owner_id: string | null } | null
}

const SELECT = `*,
  person:field_engineers(id, name, kind, user_id),
  project:projects(id, reference, name, status, owner_id)`

export interface ExpenseInput {
  project_id: string
  field_engineer_id: string | null
  paid_by: ExpensePaidBy
  expense_date: string
  category: string
  description: string | null
  amount: number
  vat: number
}

const RECEIPT_BUCKET = 'expense-receipts'
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024
export const RECEIPT_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp'

export async function listProjectExpenses(projectId: string): Promise<ProjectExpense[]> {
  return unwrap(
    await supabase.from('project_expenses').select(SELECT).eq('project_id', projectId).order('expense_date', { ascending: false }),
  ) as unknown as ProjectExpense[]
}

export async function listMyExpenses(fieldEngineerId: string): Promise<ProjectExpense[]> {
  return unwrap(
    await supabase
      .from('project_expenses')
      .select(SELECT)
      .eq('field_engineer_id', fieldEngineerId)
      .order('expense_date', { ascending: false }),
  ) as unknown as ProjectExpense[]
}

// Submitted expenses; the page keeps the ones this person may approve.
export async function listSubmittedExpenses(): Promise<ProjectExpense[]> {
  return unwrap(
    await supabase.from('project_expenses').select(SELECT).eq('status', 'submitted').order('expense_date'),
  ) as unknown as ProjectExpense[]
}

// Approved expenses a contractor paid, in a date range (Contractor costs).
export async function listApprovedPersonExpensesBetween(from: string, to: string): Promise<ProjectExpense[]> {
  return unwrap(
    await supabase
      .from('project_expenses')
      .select(SELECT)
      .eq('status', 'approved')
      .eq('paid_by', 'person')
      .gte('expense_date', from)
      .lte('expense_date', to)
      .order('expense_date'),
  ) as unknown as ProjectExpense[]
}

export async function listStatementExpenses(statementId: string): Promise<ProjectExpense[]> {
  return unwrap(
    await supabase.from('project_expenses').select(SELECT).eq('contractor_statement_id', statementId).order('expense_date'),
  ) as unknown as ProjectExpense[]
}

async function uploadReceipt(folder: string, file: File): Promise<{ path: string; name: string }> {
  const path = `${folder}/${Date.now()}-${file.name.replace(/[^A-Za-z0-9._-]+/g, '_')}`
  const { error } = await supabase.storage.from(RECEIPT_BUCKET).upload(path, file, { contentType: file.type || undefined })
  if (error) throw new Error(error.message)
  return { path, name: file.name }
}

/** Adds or changes an expense; a new receipt replaces the old one. */
export async function saveExpense(id: string | null, input: ExpenseInput, receipt?: File | null, oldReceiptPath?: string | null) {
  let receiptFields = {}
  let uploaded: string | null = null
  if (receipt) {
    if (receipt.size > RECEIPT_MAX_BYTES) throw new Error('That receipt is over 10 MB — please use a smaller copy.')
    const r = await uploadReceipt(input.field_engineer_id ?? 'company', receipt)
    uploaded = r.path
    receiptFields = { receipt_path: r.path, receipt_file_name: r.name }
  }
  const row = { ...input, ...receiptFields }
  const { error } = id
    ? await supabase.from('project_expenses').update(row).eq('id', id)
    : await supabase.from('project_expenses').insert(row)
  if (error) {
    if (uploaded) await supabase.storage.from(RECEIPT_BUCKET).remove([uploaded])
    throw new Error(error.message)
  }
  if (uploaded && oldReceiptPath) await supabase.storage.from(RECEIPT_BUCKET).remove([oldReceiptPath])
}

export async function deleteExpense(e: ProjectExpense): Promise<void> {
  const { error, count } = await supabase.from('project_expenses').delete({ count: 'exact' }).eq('id', e.id)
  if (error) throw new Error(error.message)
  if (count === 0) throw new Error(`${e.reference} can’t be deleted (approved, or on a contractor statement).`)
  if (e.receipt_path) await supabase.storage.from(RECEIPT_BUCKET).remove([e.receipt_path])
}

export async function approveExpense(id: string): Promise<void> {
  const { error } = await supabase.from('project_expenses').update({ status: 'approved' }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function rejectExpense(id: string, reason: string): Promise<void> {
  const { error } = await supabase.from('project_expenses').update({ status: 'rejected', rejection_notes: reason }).eq('id', id)
  if (error) throw new Error(error.message)
}

// Short-lived link that opens the receipt in the browser.
export async function getReceiptUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(path, 300)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

// For the comparison on the project page: the quotes behind the project's
// sales orders — their Expenses/Logistics lines and price builder workings.
export async function getProjectQuoteExpenses(salesOrderIds: string[]) {
  if (salesOrderIds.length === 0) return { quotes: [], lines: [] }
  const orders = unwrap(await supabase.from('sales_orders').select('id, quote_id').in('id', salesOrderIds)) as {
    id: string
    quote_id: string | null
  }[]
  const quoteIds = [...new Set(orders.map((o) => o.quote_id).filter((q): q is string => Boolean(q)))]
  if (quoteIds.length === 0) return { quotes: [], lines: [] }
  const [quotes, lines] = await Promise.all([
    supabase.from('quotes').select('id, quote_number, price_builder').in('id', quoteIds),
    supabase.from('quote_lines').select('quote_id, line_type, qty, unit_cost').in('quote_id', quoteIds),
  ])
  return {
    quotes: unwrap(quotes) as { id: string; quote_number: string; price_builder: unknown }[],
    lines: unwrap(lines) as { quote_id: string; line_type: string; qty: number; unit_cost: number }[],
  }
}
