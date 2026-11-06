import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  approveExpense,
  deleteExpense,
  EXPENSE_STATUS_LABELS,
  getProjectQuoteExpenses,
  getReceiptUrl,
  listMyAssignments,
  listMyExpenses,
  listProjectExpenses,
  listSubmittedExpenses,
  RECEIPT_ACCEPT,
  rejectExpense,
  saveExpense,
  type ExpenseInput,
  type ProjectExpense,
} from '../lib/api'
import { calculatePriceBuilder, type PriceBuilderState } from '../lib/priceBuilder'
import { compareExpenses, EXPENSE_CATEGORIES, expenseCost, isSeparateExpenseLine } from '../lib/projectExpenses'
import { hasTouchCamera, ID_PHOTO_SHRINK, shrinkPhoto } from '../lib/photo'
import { canAccess } from '../lib/permissions'
import type { ProjectLine } from '../lib/types'
import { Button, Card, ErrorText, Input, Label, Select, StatusBadge, Textarea } from './ui'
import { showToast } from './Toast'

// Project expenses (migration 0060): logging, approving and comparing them
// with what was quoted. Used on My timesheets, the project page and Team
// timesheets.

function money(n: number) {
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function ukDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC' })
}

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const STATUS_BADGE: Record<ProjectExpense['status'], string> = { submitted: 'submitted', approved: 'approved', rejected: 'rejected' }

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

async function openReceipt(path: string, onError: (m: string) => void) {
  const tab = window.open('', '_blank') // before the await, so pop-up blockers allow it
  try {
    const url = await getReceiptUrl(path)
    if (tab) tab.location.href = url
    else window.location.href = url
  } catch (err) {
    tab?.close()
    onError(errorMessage(err, 'Failed to open the receipt.'))
  }
}

// ── Form ─────────────────────────────────────────────────────────────────────

type Option = { value: string; label: string }

function ExpenseForm({
  expense,
  projects,
  people,
  fixedPersonId,
  onDone,
  onCancel,
}: {
  expense: ProjectExpense | null // null = new
  projects: Option[] // pick a project (one entry = fixed)
  people?: Option[] // staff on the project page: who spent it ('' = Techtrus paid directly)
  fixedPersonId?: string // contractors / My timesheets: always this person
  onDone: () => void
  onCancel: () => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const camera = useMemo(hasTouchCamera, [])
  const [form, setForm] = useState({
    project_id: expense?.project_id ?? (projects.length === 1 ? projects[0].value : ''),
    person: expense ? (expense.field_engineer_id ?? '') : (fixedPersonId ?? people?.[0]?.value ?? ''),
    expense_date: expense?.expense_date ?? todayIso(),
    category: expense?.category ?? '',
    description: expense?.description ?? '',
    amount: expense ? String(expense.amount) : '',
    vat: expense && Number(expense.vat) ? String(expense.vat) : '',
  })
  const [receipt, setReceipt] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pick(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = ''
    if (cameraInput.current) cameraInput.current.value = ''
    if (file) setReceipt(await shrinkPhoto(file, ID_PHOTO_SHRINK))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const amount = Number(form.amount)
    const vat = Number(form.vat || 0)
    if (!form.project_id) return setError('Choose the project.')
    if (!form.category) return setError('Choose what it was for.')
    if (!(amount > 0)) return setError('Enter the amount paid.')
    if (vat < 0 || vat > amount) return setError('VAT can’t be more than the amount.')
    const personId = fixedPersonId ?? (form.person || null)
    const input: ExpenseInput = {
      project_id: form.project_id,
      field_engineer_id: personId,
      paid_by: personId ? 'person' : 'company',
      expense_date: form.expense_date,
      category: form.category,
      description: form.description.trim() || null,
      amount,
      vat,
    }
    setBusy(true)
    try {
      await saveExpense(expense?.id ?? null, input, receipt, expense?.receipt_path)
      showToast(expense ? `${expense.reference} saved` : 'Expense added')
      onDone()
    } catch (err) {
      setError(errorMessage(err, 'Failed to save the expense.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mb-4 border-accent/50">
      <h3 className="mb-3 text-sm font-semibold text-text">{expense ? `Change ${expense.reference}` : 'Add an expense'}</h3>
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {projects.length > 1 && (
          <div className="sm:col-span-2">
            <Label>Project</Label>
            <Select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
              <option value="">Choose…</option>
              {projects.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
        )}
        {people && !fixedPersonId && (
          <div className="sm:col-span-2">
            <Label>Who paid</Label>
            <Select value={form.person} onChange={(e) => setForm({ ...form, person: e.target.value })}>
              {people.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div>
          <Label>Date</Label>
          <Input type="date" required value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
        </div>
        <div>
          <Label>What for</Label>
          <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="">Choose…</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Amount paid inc VAT (£)</Label>
          <Input type="number" step="0.01" min="0" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </div>
        <div>
          <Label>Of which VAT (£)</Label>
          <Input type="number" step="0.01" min="0" placeholder="0 if none" value={form.vat} onChange={(e) => setForm({ ...form, vat: e.target.value })} />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <Label>Details</Label>
          <Textarea
            rows={2}
            placeholder="e.g. Premier Inn Reading, 2 nights · 84 miles Reading ↔ site"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <Label>Receipt</Label>
          <div className="flex flex-wrap items-center gap-2">
            {camera && (
              <Button type="button" variant="secondary" disabled={busy} onClick={() => cameraInput.current?.click()}>
                Take photo
              </Button>
            )}
            <Button type="button" variant="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>
              {receipt || expense?.receipt_path ? 'Replace receipt' : 'Upload receipt'}
            </Button>
            <span className="text-xs text-text-muted">
              {receipt ? receipt.name : expense?.receipt_file_name ? `Current: ${expense.receipt_file_name}` : 'PDF or photo, up to 10 MB'}
            </span>
          </div>
          <input ref={fileInput} type="file" accept={RECEIPT_ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : expense ? 'Save' : 'Add expense'}
          </Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
      <ErrorText>{error}</ErrorText>
    </Card>
  )
}

// ── List ─────────────────────────────────────────────────────────────────────

function ExpenseTable({
  expenses,
  showProject,
  showPerson,
  canEdit,
  canApprove,
  onEdit,
  onChanged,
  onError,
}: {
  expenses: ProjectExpense[]
  showProject?: boolean
  showPerson?: boolean
  canEdit: (e: ProjectExpense) => boolean
  canApprove: (e: ProjectExpense) => boolean
  onEdit: (e: ProjectExpense) => void
  onChanged: () => void
  onError: (m: string | null) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)

  async function run(id: string, action: () => Promise<unknown>, done: string, fallback: string) {
    setBusy(id)
    onError(null)
    try {
      await action()
      showToast(done)
      onChanged()
    } catch (err) {
      onError(errorMessage(err, fallback))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-surface-raised text-left text-xs font-mono-label text-text-muted">
          <tr>
            <th className="px-3 py-2">Date</th>
            {showProject && <th className="px-3 py-2">Project</th>}
            {showPerson && <th className="px-3 py-2">Paid by</th>}
            <th className="px-3 py-2">What for</th>
            <th className="px-3 py-2 text-right">Amount</th>
            <th className="px-3 py-2 text-right" title="Amount less VAT — what it cost us.">Cost ex VAT</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {expenses.map((e) => (
            <tr key={e.id} className="border-t border-border align-top">
              <td className="px-3 py-2 text-text">
                {ukDate(e.expense_date)}
                <span className="block font-mono-label text-[11px] text-text-faint">{e.reference}</span>
              </td>
              {showProject && (
                <td className="px-3 py-2 text-text">
                  {e.project ? `${e.project.reference} · ${e.project.name}` : '—'}
                </td>
              )}
              {showPerson && <td className="px-3 py-2 text-text">{e.person?.name ?? 'Techtrus (direct)'}</td>}
              <td className="px-3 py-2 text-text">
                {e.category}
                {e.description && <span className="block text-xs text-text-muted">{e.description}</span>}
                {e.status === 'rejected' && e.rejection_notes && (
                  <span className="block text-xs text-danger">Rejected: {e.rejection_notes}</span>
                )}
              </td>
              <td className="px-3 py-2 text-right text-text">{money(Number(e.amount))}</td>
              <td className="px-3 py-2 text-right text-text-muted">{money(expenseCost(e))}</td>
              <td className="px-3 py-2">
                <StatusBadge status={STATUS_BADGE[e.status]} label={EXPENSE_STATUS_LABELS[e.status]} />
                {e.contractor_statement_id && <span className="mt-1 block text-[11px] text-text-faint">On a statement</span>}
              </td>
              <td className="px-3 py-2 text-right">
                <span className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-xs">
                  {e.receipt_path && (
                    <button onClick={() => openReceipt(e.receipt_path!, onError)} className="text-accent hover:underline">
                      Receipt
                    </button>
                  )}
                  {canApprove(e) && e.status === 'submitted' && (
                    <>
                      <button
                        disabled={busy !== null}
                        onClick={() => run(e.id, () => approveExpense(e.id), `${e.reference} approved`, 'Failed to approve.')}
                        className="text-accent hover:underline"
                      >
                        Approve
                      </button>
                      <button
                        disabled={busy !== null}
                        onClick={() => {
                          const reason = window.prompt(`Why is ${e.reference} being rejected?`)?.trim()
                          if (reason) run(e.id, () => rejectExpense(e.id, reason), `${e.reference} rejected`, 'Failed to reject.')
                        }}
                        className="text-text-muted hover:text-danger"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {canEdit(e) && (
                    <>
                      <button disabled={busy !== null} onClick={() => onEdit(e)} className="text-accent hover:underline">
                        {e.status === 'rejected' ? 'Fix and resubmit' : 'Change'}
                      </button>
                      <button
                        disabled={busy !== null}
                        onClick={() => {
                          if (window.confirm(`Delete ${e.reference}?`))
                            run(e.id, () => deleteExpense(e), `${e.reference} deleted`, 'Failed to delete.')
                        }}
                        className="text-text-muted hover:text-danger"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Owner or admin, never your own (same rule as the database).
function useApproveRule() {
  const { profile } = useAuth()
  const isAdmin = canAccess(profile, 'admin')
  return (e: ProjectExpense) =>
    profile?.role === 'staff' && (isAdmin || e.project?.owner_id === profile.id) && e.person?.user_id !== profile.id
}

// ── My timesheets: my expenses ──────────────────────────────────────────────

export function MyExpensesCard({ fieldEngineerId, onChanged }: { fieldEngineerId: string; onChanged?: () => void }) {
  const [expenses, setExpenses] = useState<ProjectExpense[] | null>(null)
  const [projects, setProjects] = useState<Option[]>([])
  const [editing, setEditing] = useState<ProjectExpense | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const [mine, assignments] = await Promise.all([listMyExpenses(fieldEngineerId), listMyAssignments(fieldEngineerId)])
      setExpenses(mine)
      const seen = new Map<string, Option>()
      for (const a of assignments) {
        const p = a.project_line.project
        if (p.status !== 'cancelled') seen.set(p.id, { value: p.id, label: `${p.reference} · ${p.name}${p.status === 'active' ? '' : ' (complete)'}` })
      }
      setProjects([...seen.values()].sort((a, b) => a.label.localeCompare(b.label)))
    } catch (err) {
      setError(errorMessage(err, 'Failed to load your expenses.'))
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldEngineerId])

  const refresh = () => {
    setEditing(null)
    load()
    onChanged?.()
  }

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text">My expenses</h2>
          <p className="text-xs text-text-muted">
            Hotels, mileage, parking and so on for a project, with the receipt. Contractors&apos; expenses are approved by
            the project owner; staff expenses are approved straight away.
          </p>
        </div>
        {projects.length > 0 && editing === null && <Button onClick={() => setEditing('new')}>Add expense</Button>}
      </div>
      {editing !== null && (
        <ExpenseForm
          expense={editing === 'new' ? null : editing}
          projects={editing === 'new' ? projects : projects.filter((p) => p.value === editing.project_id)}
          fixedPersonId={fieldEngineerId}
          onDone={refresh}
          onCancel={() => setEditing(null)}
        />
      )}
      <ErrorText>{error}</ErrorText>
      {expenses === null ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : expenses.length === 0 ? (
        <Card>
          <p className="text-sm text-text-muted">
            {projects.length > 0 ? 'No expenses logged yet.' : 'You can log expenses once you’re allocated to a project.'}
          </p>
        </Card>
      ) : (
        <ExpenseTable
          expenses={expenses}
          showProject
          canEdit={(e) => e.status !== 'approved' && !e.contractor_statement_id}
          canApprove={() => false}
          onEdit={(e) => setEditing(e)}
          onChanged={refresh}
          onError={setError}
        />
      )}
    </section>
  )
}

// ── Team timesheets: expenses waiting for me ────────────────────────────────

export function ExpensesToApproveCard({ onChanged }: { onChanged?: () => void }) {
  const mayApprove = useApproveRule()
  const [expenses, setExpenses] = useState<ProjectExpense[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      setExpenses(await listSubmittedExpenses())
    } catch (err) {
      setError(errorMessage(err, 'Failed to load expenses.'))
    }
  }

  useEffect(() => {
    load()
  }, [])

  const mine = (expenses ?? []).filter(mayApprove)
  if (!error && mine.length === 0) return null
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-text">Expenses waiting for your approval ({mine.length})</h2>
      <ErrorText>{error}</ErrorText>
      {mine.length > 0 && (
        <ExpenseTable
          expenses={mine}
          showProject
          showPerson
          canEdit={() => false}
          canApprove={mayApprove}
          onEdit={() => {}}
          onChanged={() => {
            load()
            onChanged?.()
          }}
          onError={setError}
        />
      )}
    </section>
  )
}

// ── Project page: quoted vs actual, and the list ────────────────────────────

export function ProjectExpensesCard({
  projectId,
  projectStatus,
  salesOrderIds,
  lines,
  approvedDaysByLine,
  people,
}: {
  projectId: string
  projectStatus: string
  salesOrderIds: string[]
  lines: ProjectLine[]
  approvedDaysByLine: Map<string, number>
  people: { id: string; name: string }[] // allocated people
}) {
  const { profile } = useAuth()
  const mayApprove = useApproveRule()
  const [expenses, setExpenses] = useState<ProjectExpense[] | null>(null)
  const [quoteData, setQuoteData] = useState<Awaited<ReturnType<typeof getProjectQuoteExpenses>> | null>(null)
  const [editing, setEditing] = useState<ProjectExpense | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const canWrite = canAccess(profile, 'projects') || canAccess(profile, 'timesheets') || canAccess(profile, 'admin')
  const soKey = salesOrderIds.join(',')

  async function load() {
    try {
      setExpenses(await listProjectExpenses(projectId))
    } catch (err) {
      setError(errorMessage(err, 'Failed to load expenses.'))
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    getProjectQuoteExpenses(salesOrderIds)
      .then(setQuoteData)
      .catch(() => setQuoteData({ quotes: [], lines: [] }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soKey])

  const comparison = useMemo(() => {
    if (!expenses || !quoteData) return null
    return compareExpenses({
      lines: lines.map((l) => ({
        quoted_days: Number(l.quoted_days),
        expenses_included: l.expenses_included,
        approved_days: approvedDaysByLine.get(l.id) ?? 0,
      })),
      separateLines: quoteData.lines.filter((l) => isSeparateExpenseLine(l.line_type)),
      quotedCosts: quoteData.quotes.map((q) =>
        q.price_builder ? calculatePriceBuilder(q.price_builder as PriceBuilderState, 0, () => true).expensesCost : null,
      ),
      expenses,
    })
  }, [expenses, quoteData, lines, approvedDaysByLine])

  const peopleOptions: Option[] = [
    ...people.map((p) => ({ value: p.id, label: p.name })),
    { value: '', label: 'Techtrus paid directly (booking, company card)' },
  ]
  const refresh = () => {
    setEditing(null)
    load()
  }

  const over = comparison && comparison.remaining !== null && comparison.remaining < 0
  return (
    <Card className="mb-6">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text">Expenses</h2>
          <p className="text-xs text-text-muted">
            What was quoted for expenses against what&apos;s actually been spent (approved, ex VAT).
          </p>
        </div>
        {canWrite && projectStatus !== 'cancelled' && editing === null && (
          <Button variant="secondary" onClick={() => setEditing('new')}>
            Add expense
          </Button>
        )}
      </div>

      {comparison && (
        <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Figure
            label="Quoted cost"
            value={comparison.quotedCost === null ? '—' : money(comparison.quotedCost)}
            sub={comparison.quotedCost === null ? 'No price builder workings' : 'From the price builder'}
          />
          <Figure
            label="Charged to customer"
            value={money(comparison.charged)}
            sub={`${money(comparison.chargedBundled)} in day rates · ${money(comparison.chargedSeparate)} on own lines`}
          />
          <Figure
            label="Spent so far"
            value={money(comparison.actual)}
            sub={comparison.pending > 0 ? `+ ${money(comparison.pending)} waiting for approval` : 'approved'}
            tone={over ? 'bad' : undefined}
          />
          <Figure
            label="Expected by now"
            value={comparison.expectedToDate === null ? '—' : money(comparison.expectedToDate)}
            sub={comparison.progress === null ? 'no quoted days' : `${Math.round(comparison.progress * 100)}% of quoted days approved`}
          />
          <Figure
            label={over ? 'Over by' : 'Left to spend'}
            value={comparison.remaining === null ? '—' : money(Math.abs(comparison.remaining))}
            sub={comparison.quotedCost !== null ? 'against quoted cost' : 'against what was charged'}
            tone={over ? 'bad' : undefined}
          />
        </div>
      )}

      {comparison && comparison.byCategory.length > 0 && (
        <p className="mb-4 text-xs text-text-muted">
          By type:{' '}
          {comparison.byCategory.map((c, i) => (
            <span key={c.category}>
              {i > 0 && ' · '}
              {c.category} {money(c.actual)}
              {c.pending > 0 && <span className="text-text-faint"> (+{money(c.pending)} pending)</span>}
            </span>
          ))}
        </p>
      )}

      {editing !== null && (
        <ExpenseForm
          expense={editing === 'new' ? null : editing}
          projects={[{ value: projectId, label: '' }]}
          people={peopleOptions}
          onDone={refresh}
          onCancel={() => setEditing(null)}
        />
      )}
      <ErrorText>{error}</ErrorText>

      {expenses === null ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : expenses.length === 0 ? (
        <p className="text-sm text-text-muted">No expenses logged against this project yet.</p>
      ) : (
        <ExpenseTable
          expenses={expenses}
          showPerson
          canEdit={(e) => canWrite && !e.contractor_statement_id}
          canApprove={mayApprove}
          onEdit={(e) => setEditing(e)}
          onChanged={refresh}
          onError={setError}
        />
      )}
      <p className="mt-2 text-xs text-text-faint">
        Contractors log their own from Timesheets → My timesheets. Approved expenses they paid for go on their{' '}
        <Link to="/staff/invoices/contractor-costs" className="text-accent hover:underline">
          contractor statement
        </Link>
        .
      </p>
    </Card>
  )
}

function Figure({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'bad' }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${tone === 'bad' ? 'border-danger/60' : 'border-border'}`}>
      <div className="text-[11px] font-mono-label text-text-dim">{label}</div>
      <div className={`text-base font-semibold ${tone === 'bad' ? 'text-danger' : 'text-text'}`}>{value}</div>
      {sub && <div className="text-[11px] text-text-faint">{sub}</div>}
    </div>
  )
}
