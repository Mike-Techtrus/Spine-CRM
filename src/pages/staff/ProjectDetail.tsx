import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  addProjectAssignment,
  createInvoiceFromTimesheets,
  getProject,
  listAssignmentTimesheets,
  listFieldEngineers,
  listInvoicesByIds,
  listProjectAssignments,
  listProjectLines,
  listStaffProfiles,
  removeProjectAssignment,
  updateProject,
  updateProjectAssignment,
} from '../../lib/api'
import {
  DAY_TYPE_DAYS,
  PERSON_KINDS,
  PROJECT_STATUS_LABELS,
  type FieldEngineer,
  type Profile,
  type ProjectAssignment,
  type ProjectLine,
  type ProjectStatus,
  type ProjectWithRelations,
} from '../../lib/types'
import { Button, Card, ErrorText, Input, Label, Select, Textarea } from '../../components/ui'

// Timesheeted days per allocation, split by timesheet status. Rejected days
// don't count.
interface Usage {
  approved: number
  submitted: number
  draft: number
}
const NO_USAGE: Usage = { approved: 0, submitted: 0, draft: 0 }
const usedDays = (u: Usage) => u.approved + u.submitted + u.draft

function days(n: number) {
  return n.toLocaleString('en-GB', { maximumFractionDigits: 1 })
}

function money(n: number) {
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function isHalfDayStep(n: number) {
  return n > 0 && Number.isInteger(n * 2)
}

function errorMessage(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : fallback
  if (message.includes('project_assignments_project_line_id_field_engineer_id_key'))
    return 'That person is already on this line — change their days instead.'
  if (message.includes('project_assignments_allocated_days_check')) return 'Days must be in half-day steps (e.g. 2.5).'
  if (message.includes('timesheet_entries_project_assignment_id_fkey'))
    return 'This person has timesheets against this line, so they can’t be removed.'
  return message
}

// Burn-down bar: approved (solid), submitted (lighter), draft (faint), over the allocation.
function BurnBar({ allocated, usage }: { allocated: number; usage: Usage }) {
  const total = Math.max(allocated, usedDays(usage), 0.0001)
  const pct = (n: number) => `${(n / total) * 100}%`
  const over = usedDays(usage) > allocated
  return (
    <div
      className={`flex h-2 w-full overflow-hidden rounded-full bg-sunken ${over ? 'ring-1 ring-danger' : ''}`}
      title={`${days(usage.approved)} approved, ${days(usage.submitted)} submitted, ${days(usage.draft)} draft of ${days(allocated)} allocated`}
    >
      <div className="bg-accent" style={{ width: pct(usage.approved) }} />
      <div className="bg-accent/60" style={{ width: pct(usage.submitted) }} />
      <div className="bg-accent/25" style={{ width: pct(usage.draft) }} />
    </div>
  )
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<ProjectWithRelations | null>(null)
  const [lines, setLines] = useState<ProjectLine[]>([])
  const [assignments, setAssignments] = useState<ProjectAssignment[]>([])
  const [usage, setUsage] = useState<Map<string, Usage>>(new Map())
  const [billing, setBilling] = useState<Billing>({ uninvoiced: [], invoicedDays: 0, invoices: [] })
  const [people, setPeople] = useState<FieldEngineer[]>([])
  const [staff, setStaff] = useState<Pick<Profile, 'id' | 'full_name'>[]>([])
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    if (!id) return
    const [p, l, everyone, owners] = await Promise.all([
      getProject(id),
      listProjectLines(id),
      listFieldEngineers(),
      listStaffProfiles(),
    ])
    const a = await listProjectAssignments(l.map((line) => line.id))
    const entries = await listAssignmentTimesheets(a.map((x) => x.id))
    const u = new Map<string, Usage>()
    for (const e of entries) {
      if (e.status === 'rejected') continue
      const cur = u.get(e.project_assignment_id) ?? { ...NO_USAGE }
      if (e.status === 'approved') cur.approved += DAY_TYPE_DAYS[e.day_type]
      else if (e.status === 'submitted') cur.submitted += DAY_TYPE_DAYS[e.day_type]
      else cur.draft += DAY_TYPE_DAYS[e.day_type]
      u.set(e.project_assignment_id, cur)
    }
    setProject(p)
    setLines(l)
    setAssignments(a)
    setUsage(u)
    const approved = entries.filter((e) => e.status === 'approved')
    const invoiceIds = [...new Set(approved.map((e) => e.invoice_id).filter((x): x is string => Boolean(x)))]
    setBilling({
      uninvoiced: approved
        .filter((e) => !e.invoice_id)
        .map((e) => ({ date: e.work_date, days: DAY_TYPE_DAYS[e.day_type] })),
      invoicedDays: approved.filter((e) => e.invoice_id).reduce((s, e) => s + DAY_TYPE_DAYS[e.day_type], 0),
      invoices: await listInvoicesByIds(invoiceIds),
    })
    setPeople(everyone)
    setStaff(owners)
  }

  useEffect(() => {
    refresh().catch((err) => setError(errorMessage(err, 'Failed to load.')))
  }, [id])

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(null)
    try {
      await action()
      await refresh()
      return true
    } catch (err) {
      setError(errorMessage(err, fallback))
      return false
    }
  }

  const personById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const usageOf = (assignmentId: string) => usage.get(assignmentId) ?? NO_USAGE

  const totals = useMemo(() => {
    const quoted = lines.reduce((s, l) => s + Number(l.quoted_days), 0)
    const value = lines.reduce((s, l) => s + Number(l.quoted_days) * Number(l.day_rate), 0)
    const allocated = assignments.reduce((s, a) => s + Number(a.allocated_days), 0)
    const u = assignments.reduce(
      (acc, a) => {
        const x = usageOf(a.id)
        return { approved: acc.approved + x.approved, submitted: acc.submitted + x.submitted, draft: acc.draft + x.draft }
      },
      { ...NO_USAGE },
    )
    return { quoted, value, allocated, usage: u }
  }, [lines, assignments, usage])

  if (!project) {
    return (
      <div>
        <BackLink />
        {error ? <ErrorText>{error}</ErrorText> : <p className="text-sm text-text-muted">Loading…</p>}
      </div>
    )
  }

  const so = project.sales_order

  return (
    <div>
      <BackLink />
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text">
          <span className="font-mono-label text-text-muted">{project.reference}</span> · {project.name}
        </h1>
        <p className="text-sm text-text-muted">
          From sales order{' '}
          <Link to={`/staff/sales-orders/${so.id}`} className="font-mono-label text-accent hover:underline">
            {so.reference}
          </Link>
          {so.client?.name && ` · ${so.client.name}`}
          {so.end_client?.name && ` → ${so.end_client.name}`}
          {so.po_number && ` · PO ${so.po_number}`}
        </p>
      </div>

      <ErrorText>{error}</ErrorText>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <DetailsCard project={project} staff={staff} onSaved={() => refresh()} onError={setError} />
        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-text">Effort</h2>
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Quoted days" value={days(totals.quoted)} sub={money(totals.value)} />
            <Stat
              label="Allocated"
              value={days(totals.allocated)}
              sub={
                totals.allocated > totals.quoted
                  ? `${days(totals.allocated - totals.quoted)} over quote`
                  : `${days(totals.quoted - totals.allocated)} unallocated`
              }
              warn={totals.allocated > totals.quoted}
            />
            <Stat
              label="Timesheeted"
              value={days(usedDays(totals.usage))}
              sub={`${days(totals.usage.approved)} approved`}
            />
            <Stat
              label="Remaining"
              value={days(Math.max(totals.allocated - usedDays(totals.usage), 0))}
              sub="of allocated"
            />
          </div>
          <BurnBar allocated={totals.allocated} usage={totals.usage} />
          <p className="mt-2 text-xs text-text-faint">
            Bar: approved (solid), submitted, draft (faint). Timesheets are logged against these allocations from phase
            2; until then everything shows 0.
          </p>
        </Card>
      </div>

      {lines.length > 0 && <InvoicingCard projectId={project.id} billing={billing} onError={setError} />}

      {lines.length === 0 ? (
        <Card>
          <p className="text-sm text-text-muted">
            This project has no lines. Only quote lines whose line type is billed <strong>From timesheets</strong> are
            copied in — check the quote’s lines and the line types in Admin → Rate cards.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {lines.map((line) => (
            <LineCard
              key={line.id}
              line={line}
              assignments={assignments.filter((a) => a.project_line_id === line.id)}
              people={people}
              personById={personById}
              usageOf={usageOf}
              run={run}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Invoicing (phase 3) ──────────────────────────────────────────────────────

interface Billing {
  uninvoiced: { date: string; days: number }[] // approved days not yet on an invoice
  invoicedDays: number
  invoices: { id: string; invoice_number: string; status: string; invoice_date: string | null; value: number | null }[]
}

function InvoicingCard({
  projectId,
  billing,
  onError,
}: {
  projectId: string
  billing: Billing
  onError: (m: string | null) => void
}) {
  const navigate = useNavigate()
  const dates = billing.uninvoiced.map((u) => u.date).sort()
  const [from, setFrom] = useState(dates[0] ?? '')
  const [to, setTo] = useState(dates[dates.length - 1] ?? '')
  const [creating, setCreating] = useState(false)

  // Default the period to the uninvoiced days once they've loaded.
  useEffect(() => {
    if (dates.length) {
      setFrom((f) => f || dates[0])
      setTo((t) => t || dates[dates.length - 1])
    }
  }, [dates.length])

  const uninvoicedDays = billing.uninvoiced.reduce((s, u) => s + u.days, 0)
  const inPeriod = billing.uninvoiced.filter((u) => from && to && u.date >= from && u.date <= to).reduce((s, u) => s + u.days, 0)

  async function handleCreate() {
    if (!window.confirm(`Create a draft invoice for ${days(inPeriod)} approved day(s) from ${from} to ${to}?`)) return
    setCreating(true)
    onError(null)
    try {
      const invoiceId = await createInvoiceFromTimesheets(projectId, from, to)
      navigate(`/staff/invoices/${invoiceId}`)
    } catch (err) {
      onError(errorMessage(err, 'Failed to create invoice.'))
      setCreating(false)
    }
  }

  return (
    <Card className="mb-6">
      <h2 className="mb-1 text-sm font-semibold text-text">Invoicing</h2>
      <p className="mb-4 text-xs text-text-muted">
        Builds a <strong>draft</strong> invoice from approved timesheet days in the period — one line per project line, at
        the quoted day rate. Add expenses and other manual lines on the invoice before sending. Invoiced days are locked.
      </p>
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="Approved, not invoiced"
          value={days(uninvoicedDays)}
          sub={dates.length ? `${dates[0]} to ${dates[dates.length - 1]}` : 'none yet'}
        />
        <Stat label="Invoiced" value={days(billing.invoicedDays)} sub={`on ${billing.invoices.length} invoice(s)`} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button type="button" onClick={handleCreate} disabled={creating || inPeriod === 0 || !from || !to}>
          {creating ? 'Creating…' : `Create draft invoice (${days(inPeriod)} day${inPeriod === 1 ? '' : 's'})`}
        </Button>
      </div>
      {billing.invoices.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm">
          {billing.invoices.map((inv) => (
            <li key={inv.id}>
              <Link to={`/staff/invoices/${inv.id}`} className="font-mono-label text-accent hover:underline">
                {inv.invoice_number}
              </Link>
              <span className="text-text-muted">
                {' '}
                · {inv.status} · {inv.invoice_date ?? '—'} · {money(Number(inv.value ?? 0))} net
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function BackLink() {
  return (
    <Link to="/staff/projects" className="mb-4 inline-block text-xs font-mono-label text-text-muted hover:text-accent">
      ← Projects
    </Link>
  )
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-xs font-mono-label text-text-muted">{label}</p>
      <p className="text-lg font-semibold text-text">{value}</p>
      {sub && <p className={`text-xs ${warn ? 'text-danger' : 'text-text-faint'}`}>{sub}</p>}
    </div>
  )
}

// ── Details ──────────────────────────────────────────────────────────────────

function DetailsCard({
  project,
  staff,
  onSaved,
  onError,
}: {
  project: ProjectWithRelations
  staff: Pick<Profile, 'id' | 'full_name'>[]
  onSaved: () => void
  onError: (m: string | null) => void
}) {
  const initial = {
    name: project.name,
    owner_id: project.owner_id ?? '',
    status: project.status,
    notes: project.notes ?? '',
  }
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    onError(null)
    try {
      await updateProject(project.id, {
        name: form.name.trim() || project.name,
        owner_id: form.owner_id || null,
        status: form.status,
        notes: form.notes.trim() || null,
      })
      onSaved()
    } catch (err) {
      onError(errorMessage(err, 'Failed to save project.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold text-text">Details</h2>
      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <Label>Name</Label>
          <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <Label>Owner</Label>
          <Select value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })}>
            <option value="">—</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name || 'Unnamed'}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}>
            {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <Button type="submit" disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save details'}
        </Button>
      </form>
    </Card>
  )
}

// ── A project line with its people ───────────────────────────────────────────

function LineCard({
  line,
  assignments,
  people,
  personById,
  usageOf,
  run,
}: {
  line: ProjectLine
  assignments: ProjectAssignment[]
  people: FieldEngineer[]
  personById: Map<string, FieldEngineer>
  usageOf: (assignmentId: string) => Usage
  run: (action: () => Promise<unknown>, fallback: string) => Promise<boolean>
}) {
  const [personId, setPersonId] = useState('')
  const [allocate, setAllocate] = useState('')
  const quoted = Number(line.quoted_days)
  const allocated = assignments.reduce((s, a) => s + Number(a.allocated_days), 0)
  const onLine = new Set(assignments.map((a) => a.field_engineer_id))
  const available = people.filter((p) => p.is_active && !onLine.has(p.id))
  const lineUsage = assignments.reduce(
    (acc, a) => {
      const x = usageOf(a.id)
      return { approved: acc.approved + x.approved, submitted: acc.submitted + x.submitted, draft: acc.draft + x.draft }
    },
    { ...NO_USAGE },
  )

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    const n = Number(allocate)
    if (!personId || !isHalfDayStep(n)) return
    if (await run(() => addProjectAssignment(line.id, personId, n), 'Failed to add person.')) {
      setPersonId('')
      setAllocate('')
    }
  }

  function remove(a: ProjectAssignment) {
    const name = personById.get(a.field_engineer_id)?.name ?? 'this person'
    if (!window.confirm(`Remove ${name} from this line?`)) return
    run(() => removeProjectAssignment(a.id), 'Failed to remove.')
  }

  const unallocated = quoted - allocated

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text">
            {line.part_code || line.line_type}
            <span className="ml-2 text-xs font-normal text-text-faint">{line.line_type}</span>
          </h3>
          {line.description && <p className="text-xs text-text-muted">{line.description}</p>}
        </div>
        <div className="text-right text-xs text-text-muted">
          <p>
            {days(quoted)} days quoted @ {money(Number(line.day_rate))} = {money(quoted * Number(line.day_rate))}
          </p>
          <p className={unallocated < 0 ? 'text-danger' : ''}>
            {days(allocated)} allocated
            {unallocated > 0 && ` · ${days(unallocated)} unallocated`}
            {unallocated < 0 && ` · ${days(-unallocated)} over quote`}
          </p>
        </div>
      </div>

      <div className="mb-3">
        <BurnBar allocated={allocated} usage={lineUsage} />
      </div>

      {assignments.length > 0 && (
        <div className="mb-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-raised text-left text-xs font-mono-label text-text-muted">
              <tr>
                <th className="px-3 py-2">Person</th>
                <th className="w-28 px-3 py-2">Allocated</th>
                <th className="px-3 py-2">Timesheeted</th>
                <th className="px-3 py-2">Remaining</th>
                <th className="w-40 px-3 py-2">Burn-down</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => {
                const person = personById.get(a.field_engineer_id)
                const u = usageOf(a.id)
                const remaining = Number(a.allocated_days) - usedDays(u)
                return (
                  <tr key={a.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <p className="text-text">{person?.name ?? 'Unknown'}</p>
                      {person && <p className="text-xs text-text-faint">{PERSON_KINDS[person.kind].singular}</p>}
                    </td>
                    <td className="px-3 py-2">
                      <DaysInput
                        key={`${a.id}:${a.allocated_days}`}
                        value={Number(a.allocated_days)}
                        onSave={(n) => run(() => updateProjectAssignment(a.id, n), 'Failed to update days.')}
                      />
                    </td>
                    <td className="px-3 py-2 text-text-muted">
                      {days(usedDays(u))}
                      {usedDays(u) > 0 && (
                        <span className="block text-xs text-text-faint">
                          {days(u.approved)} approved · {days(u.submitted)} submitted · {days(u.draft)} draft
                        </span>
                      )}
                    </td>
                    <td className={`px-3 py-2 ${remaining < 0 ? 'text-danger' : 'text-text-muted'}`}>{days(remaining)}</td>
                    <td className="px-3 py-2">
                      <BurnBar allocated={Number(a.allocated_days)} usage={u} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => remove(a)} className="text-xs text-text-muted hover:text-danger">
                        Remove
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <Label>Assign</Label>
          <Select value={personId} onChange={(e) => setPersonId(e.target.value)}>
            <option value="">Choose a contractor or staff member…</option>
            {(['contractor', 'staff'] as const).map((kind) => (
              <optgroup key={kind} label={PERSON_KINDS[kind].plural}>
                {available
                  .filter((p) => p.kind === kind)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
        </div>
        <div className="w-28">
          <Label>Days</Label>
          <Input
            type="number"
            step="0.5"
            min="0.5"
            placeholder={unallocated > 0 ? days(unallocated) : ''}
            value={allocate}
            onChange={(e) => setAllocate(e.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={!personId || !isHalfDayStep(Number(allocate))}>
          Add
        </Button>
      </form>
    </Card>
  )
}

// Days box that saves on blur, in half-day steps.
function DaysInput({ value, onSave }: { value: number; onSave: (n: number) => Promise<unknown> }) {
  const [text, setText] = useState(String(value))
  async function commit() {
    const n = Number(text)
    if (n === value) return
    if (!isHalfDayStep(n)) {
      setText(String(value))
      return
    }
    await onSave(n)
  }
  return (
    <Input
      type="number"
      step="0.5"
      min="0.5"
      aria-label="Allocated days"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="py-1"
    />
  )
}
