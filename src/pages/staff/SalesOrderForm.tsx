import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  addSalesOrderToProject,
  createProjectFromSalesOrder,
  createSalesOrder,
  getProjectForSalesOrder,
  getSalesOrderFileUrl,
  getQuoteForConversion,
  getSalesOrder,
  listAccounts,
  listInvoicesForSalesOrder,
  listProjectCandidates,
  listSalesOrderFiles,
  PO_FILE_ACCEPT,
  PO_FILE_MAX_BYTES,
  readPoWithAi,
  removeSalesOrderFile,
  updateSalesOrder,
  uploadSalesOrderFile,
  type ProjectCandidate,
  type SalesOrderFile,
  type SalesOrderInvoice,
} from '../../lib/api'
import type { Account, Project } from '../../lib/types'
import {
  INVOICE_STATUS_BADGE,
  INVOICE_STATUS_LABELS,
  INVOICING_STATUS_BADGE,
  INVOICING_STATUS_LABELS,
  invoicingStatus,
} from '../../lib/types'
import { Button, Card, ErrorText, Input, Label, Select, StatusBadge, Textarea } from '../../components/ui'
import { preventEnterSubmit } from '../../lib/preventEnterSubmit'
import { useUnsavedChangesGuard } from '../../lib/useUnsavedChangesGuard'
import HistoryCard from '../../components/HistoryCard'
import { hasTouchCamera, ID_PHOTO_SHRINK, shrinkPhoto } from '../../lib/photo'
import { checkPo, figuresFromReading, type CheckResult, type PoReading } from '../../lib/poCheck'

const emptyForm = {
  quote_id: '',
  client_id: '',
  end_client_id: '',
  po_number: '',
  po_received_date: '',
  advanced_without_po: false,
  exception_notes: '',
  start_date: '',
  end_date: '',
  quote_value: '',
  po_value: '',
  difference: '',
  quote_match: false,
  vat: '',
  total: '',
  rebate: '',
  net_value: '',
  invoiced_to_date: '',
  outstanding_comments: '',
}

export default function SalesOrderForm() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const quoteIdFromQuery = searchParams.get('quoteId')
  const isEditing = Boolean(id)
  const navigate = useNavigate()

  const [accounts, setAccounts] = useState<Account[]>([])
  const [reference, setReference] = useState<string | null>(null)
  const [sourceQuoteNumber, setSourceQuoteNumber] = useState<string | null>(null)
  // Sales Orders can only be created from an accepted Quote. Set when the
  // source quote (new-from-quote flow) isn't accepted, or there's no quote
  // at all — either way the form below is replaced with an explanation.
  const [blocked, setBlocked] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Closing is its own action (not part of the form save) — see 0020.
  const [closed, setClosed] = useState<{ at: string | null; reason: string | null }>({ at: null, reason: null })
  const [closing, setClosing] = useState(false)
  const [project, setProject] = useState<Project | null>(null)
  const [creatingProject, setCreatingProject] = useState(false)
  const [showAddToProject, setShowAddToProject] = useState(false)
  const [invoices, setInvoices] = useState<SalesOrderInvoice[]>([])

  const [initialSnapshot, setInitialSnapshot] = useState(() => JSON.stringify(emptyForm))
  const isDirty = !loading && !blocked && JSON.stringify(form) !== initialSnapshot
  const { allowNextNavigation } = useUnsavedChangesGuard(isDirty)

  useEffect(() => {
    ;(async () => {
      try {
        setAccounts(await listAccounts(true))

        if (id) {
          const so = await getSalesOrder(id)
          setReference(so.reference)
          setSourceQuoteNumber(so.quote?.quote_number ?? null)
          const loaded = {
            quote_id: so.quote_id ?? '',
            client_id: so.client_id ?? '',
            end_client_id: so.end_client_id ?? '',
            po_number: so.po_number ?? '',
            po_received_date: so.po_received_date ?? '',
            advanced_without_po: so.advanced_without_po,
            exception_notes: so.exception_notes ?? '',
            start_date: so.start_date ?? '',
            end_date: so.end_date ?? '',
            quote_value: so.quote_value?.toString() ?? '',
            po_value: so.po_value?.toString() ?? '',
            difference: so.difference?.toString() ?? '',
            quote_match: so.quote_match,
            vat: so.vat?.toString() ?? '',
            total: so.total?.toString() ?? '',
            rebate: so.rebate?.toString() ?? '',
            net_value: so.net_value?.toString() ?? '',
            invoiced_to_date: so.invoiced_to_date?.toString() ?? '',
            outstanding_comments: so.outstanding_comments ?? '',
          }
          setForm(loaded)
          setInitialSnapshot(JSON.stringify(loaded))
          setClosed({ at: so.closed_at, reason: so.closed_reason })
          const [proj, soInvoices] = await Promise.all([getProjectForSalesOrder(id), listInvoicesForSalesOrder(id)])
          setProject(proj)
          setInvoices(soInvoices)
        } else if (quoteIdFromQuery) {
          const q = await getQuoteForConversion(quoteIdFromQuery)
          setSourceQuoteNumber(q.quote_number)
          if (q.status !== 'accepted') {
            setBlocked(
              `Quote ${q.quote_number} hasn't been accepted yet — a Sales Order can only be created once a quote is accepted.`,
            )
          } else {
            const loaded = {
              ...emptyForm,
              quote_id: q.id,
              client_id: q.client_id ?? '',
              end_client_id: q.end_client_id ?? '',
              start_date: q.start_date ?? '',
              end_date: q.end_date ?? '',
              quote_value: q.value?.toString() ?? '',
              vat: q.vat?.toString() ?? '',
              total: q.total?.toString() ?? '',
              rebate: q.rebate?.toString() ?? '',
              net_value: q.net_value?.toString() ?? '',
            }
            setForm(loaded)
            setInitialSnapshot(JSON.stringify(loaded))
          }
        } else {
          setBlocked('Sales Orders can only be created from an accepted quote — open the quote and use "Create Sales Order from this Quote".')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load.')
      } finally {
        setLoading(false)
      }
    })()
  }, [id, quoteIdFromQuery])

  function n(v: string): number | null {
    return v === '' ? null : Number(v)
  }

  async function handleSave(e: SyntheticEvent) {
    e.preventDefault()
    setError(null)

    if (!form.po_number && !form.advanced_without_po) {
      setError('Provide a PO number, or confirm proceeding without a PO.')
      return
    }

    setSaving(true)
    try {
      const input = {
        quote_id: form.quote_id || null,
        client_id: form.client_id || null,
        end_client_id: form.end_client_id || null,
        po_number: form.po_number || null,
        po_received_date: form.po_received_date || null,
        advanced_without_po: form.advanced_without_po,
        exception_notes: form.advanced_without_po ? form.exception_notes || null : null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        quote_value: n(form.quote_value),
        po_value: n(form.po_value),
        difference: n(form.difference),
        quote_match: form.quote_match,
        vat: n(form.vat),
        total: n(form.total),
        rebate: n(form.rebate),
        net_value: n(form.net_value),
        outstanding_comments: form.outstanding_comments || null,
      }

      let savedId = id
      if (isEditing && id) {
        await updateSalesOrder(id, input)
      } else {
        const created = await createSalesOrder(input)
        savedId = created.id
      }
      allowNextNavigation()
      navigate(`/staff/sales-orders/${savedId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save sales order.')
    } finally {
      setSaving(false)
    }
  }

  async function handleClose() {
    if (!id) return
    const reason = window.prompt(
      `Close sales order ${reference ?? ''}? It will show as Closed instead of part-invoiced. You can reopen it later.\n\nReason (optional):`,
      '',
    )
    if (reason === null) return
    setClosing(true)
    setError(null)
    try {
      const so = await updateSalesOrder(id, { closed_at: new Date().toISOString(), closed_reason: reason.trim() || null })
      setClosed({ at: so.closed_at, reason: so.closed_reason })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close sales order.')
    } finally {
      setClosing(false)
    }
  }

  // Builds a project from this order's accepted quote (its timesheet-billed lines).
  async function handleCreateProject() {
    if (!id) return
    if (isDirty && !window.confirm('You have unsaved changes on this sales order. Create the project anyway?')) return
    setCreatingProject(true)
    setError(null)
    try {
      const projectId = await createProjectFromSalesOrder(id)
      allowNextNavigation()
      navigate(`/staff/projects/${projectId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project.')
      setCreatingProject(false)
    }
  }

  async function handleReopen() {
    if (!id) return
    setClosing(true)
    setError(null)
    try {
      await updateSalesOrder(id, { closed_at: null, closed_reason: null })
      setClosed({ at: null, reason: null })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reopen sales order.')
    } finally {
      setClosing(false)
    }
  }

  if (loading) return <p className="text-sm text-text-muted">Loading…</p>

  if (blocked) {
    return (
      <div className="max-w-xl">
        <h1 className="mb-6 text-xl font-semibold text-text">New sales order</h1>
        <Card>
          <p className="text-sm text-text-muted">{blocked}</p>
        </Card>
      </div>
    )
  }

  // Invoicing status + balance still to invoice, ex VAT (order value ex VAT − invoiced to date, 0038).
  const invoicing = invoicingStatus({
    total: n(form.total),
    vat: n(form.vat),
    po_value: n(form.po_value),
    quote_value: n(form.quote_value),
    invoiced_to_date: n(form.invoiced_to_date),
    closed_at: closed.at,
  })
  const money = (v: number) => `£${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const invoicingPanel = (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <StatusBadge
            status={INVOICING_STATUS_BADGE[invoicing.status]}
            label={INVOICING_STATUS_LABELS[invoicing.status]}
          />
          <p className="text-sm text-text">
            {invoicing.status === 'fully_invoiced' && 'Fully invoiced.'}
            {(invoicing.status === 'not_invoiced' || invoicing.status === 'part_invoiced') &&
              `${money(invoicing.balance)} still to invoice (ex VAT).`}
            {invoicing.status === 'over_invoiced' && `Invoiced ${money(-invoicing.balance)} more than the order value (ex VAT).`}
            {invoicing.status === 'closed' &&
              (invoicing.balance > 0.05
                ? `Closed with ${money(invoicing.balance)} not invoiced.`
                : 'Closed.')}
          </p>
        </div>
        {closed.at ? (
          <Button type="button" variant="secondary" onClick={handleReopen} disabled={closing}>
            {closing ? 'Reopening…' : 'Reopen'}
          </Button>
        ) : (
          invoicing.status !== 'fully_invoiced' && (
            <Button type="button" variant="secondary" onClick={handleClose} disabled={closing}>
              {closing ? 'Closing…' : 'Close sales order'}
            </Button>
          )
        )}
      </div>
      {closed.at && (
        <p className="mt-2 text-xs text-text-muted">
          Closed {new Date(closed.at).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
          {closed.reason ? ` — ${closed.reason}` : ''}
        </p>
      )}

      {/* Linked invoices. Invoiced to date adds up the Value (ex VAT) of Sent and Paid ones only. */}
      <div className="mt-4 border-t border-hair pt-3">
        <p className="mb-2 text-xs font-mono-label text-text-muted">
          Invoices ({invoices.length})
        </p>
        {invoices.length === 0 ? (
          <p className="text-sm text-text-muted">No invoices yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left font-mono-label text-xs text-text-dim">
                <tr>
                  <th className="py-1.5 pr-2 font-normal">Invoice</th>
                  <th className="py-1.5 pr-2 font-normal">Date</th>
                  <th className="py-1.5 pr-2 font-normal">Status</th>
                  <th className="py-1.5 pr-2 text-right font-normal">Value</th>
                  <th className="py-1.5 text-right font-normal">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-hair">
                    <td className="whitespace-nowrap py-1.5 pr-2">
                      <Link to={`/staff/invoices/${inv.id}`} className="text-text hover:text-accent hover:underline">
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-2 text-text-muted">
                      {inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString('en-GB') : '—'}
                    </td>
                    <td className="py-1.5 pr-2">
                      <StatusBadge status={INVOICE_STATUS_BADGE[inv.status]} label={INVOICE_STATUS_LABELS[inv.status]} />
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-2 text-right font-mono-label text-xs text-text-dim">
                      {inv.value == null ? '—' : money(Number(inv.value))}
                    </td>
                    <td className="whitespace-nowrap py-1.5 text-right font-mono-label text-xs text-text">
                      {inv.total == null ? '—' : money(Number(inv.total))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-text-faint">
              Value is ex VAT, Total inc VAT. Invoiced to date adds up the Value of Sent and Paid invoices (not
              drafts or cancelled).
            </p>
          </div>
        )}
      </div>
    </Card>
  )

  return (
    <div className="max-w-xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">
          {isEditing ? `Edit sales order ${reference ?? ''}` : 'New sales order'}
          {sourceQuoteNumber && (
            <span className="ml-2 font-mono-label text-xs font-normal text-text-faint">
              from quote {sourceQuoteNumber}
            </span>
          )}
        </h1>
        {isEditing && id && (
          <div className="flex flex-wrap justify-end gap-2">
            {project ? (
              <Button variant="secondary" onClick={() => navigate(`/staff/projects/${project.id}`)}>
                Open {project.reference}
              </Button>
            ) : (
              !closed.at && (
                <>
                  <Button variant="secondary" onClick={handleCreateProject} disabled={creatingProject}>
                    {creatingProject ? 'Creating…' : 'Create project'}
                  </Button>
                  <Button variant="secondary" onClick={() => setShowAddToProject((v) => !v)}>
                    Add to existing project
                  </Button>
                </>
              )
            )}
            {!closed.at && (
              <Button variant="secondary" onClick={() => navigate(`/staff/invoices/new?salesOrderId=${id}`)}>
                Create Invoice from this Sales Order
              </Button>
            )}
          </div>
        )}
      </div>

      {isEditing && id && showAddToProject && !project && (
        <AddToProjectPanel
          salesOrderId={id}
          isDirty={isDirty}
          onCancel={() => setShowAddToProject(false)}
          onAdded={(projectId) => {
            allowNextNavigation()
            navigate(`/staff/projects/${projectId}`)
          }}
        />
      )}

      {isEditing && id && invoicingPanel}

      {isEditing && id && (
        <PoFilesCard
          salesOrderId={id}
          poNumber={form.po_number}
          quoteNumber={sourceQuoteNumber}
          quoteValue={n(form.quote_value)}
          total={n(form.total)}
          onUseFigures={(r) => {
            const figs = figuresFromReading(r, n(form.quote_value))
            setForm((f) => ({ ...f, ...figs, advanced_without_po: figs.po_number ? false : f.advanced_without_po }))
          }}
        />
      )}

      <Card>
        <form onSubmit={handleSave} onKeyDown={preventEnterSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Client</Label>
              <Select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
                <option value="">—</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>End client</Label>
              <Select
                value={form.end_client_id}
                onChange={(e) => setForm({ ...form, end_client_id: e.target.value })}
              >
                <option value="">—</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>PO number</Label>
              <Input
                value={form.po_number}
                onChange={(e) => setForm({ ...form, po_number: e.target.value })}
                disabled={form.advanced_without_po}
              />
            </div>
            <div>
              <Label>PO received date</Label>
              <Input
                type="date"
                value={form.po_received_date}
                onChange={(e) => setForm({ ...form, po_received_date: e.target.value })}
                disabled={form.advanced_without_po}
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={form.advanced_without_po}
                onChange={(e) =>
                  setForm({
                    ...form,
                    advanced_without_po: e.target.checked,
                    po_number: e.target.checked ? '' : form.po_number,
                    po_received_date: e.target.checked ? '' : form.po_received_date,
                  })
                }
              />
              Proceeding without a PO
            </label>
            {form.advanced_without_po && (
              <div className="mt-2">
                <Label>Exception notes (who approved proceeding without a PO, and why)</Label>
                <Textarea
                  rows={2}
                  value={form.exception_notes}
                  onChange={(e) => setForm({ ...form, exception_notes: e.target.value })}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start date</Label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <Label>End date</Label>
              <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Quote value (£)</Label>
              <Input type="number" step="0.01" value={form.quote_value} onChange={(e) => setForm({ ...form, quote_value: e.target.value })} />
            </div>
            <div>
              <Label>PO value (£)</Label>
              <Input type="number" step="0.01" value={form.po_value} onChange={(e) => setForm({ ...form, po_value: e.target.value })} />
            </div>
            <div>
              <Label>Difference (£)</Label>
              <Input type="number" step="0.01" value={form.difference} onChange={(e) => setForm({ ...form, difference: e.target.value })} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={form.quote_match}
              onChange={(e) => setForm({ ...form, quote_match: e.target.checked })}
            />
            Quote matches PO
          </label>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>VAT (£)</Label>
              <Input type="number" step="0.01" value={form.vat} onChange={(e) => setForm({ ...form, vat: e.target.value })} />
            </div>
            <div>
              <Label>Total (£)</Label>
              <Input type="number" step="0.01" value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} />
            </div>
            {/* Rebate and Net value are still stored (kept as loaded) but no longer shown — see Reports → Rebate. */}
            <div>
              <Label>Invoiced to date, ex VAT (£)</Label>
              {/* Worked out by the database from this order's invoices (migrations 0017, 0038), so not editable. */}
              <Input type="number" value={form.invoiced_to_date} readOnly disabled placeholder="No invoices yet" />
              <p className="mt-1 text-xs text-text-faint">Value (ex VAT) of linked invoices, excluding drafts and cancelled.</p>
            </div>
          </div>

          <div>
            <Label>Outstanding / comments</Label>
            <Textarea
              rows={3}
              value={form.outstanding_comments}
              onChange={(e) => setForm({ ...form, outstanding_comments: e.target.value })}
            />
          </div>

          <ErrorText>{error}</ErrorText>

          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save sales order'}
          </Button>
        </form>
      </Card>
      <HistoryCard table="sales_orders" recordId={id} />
    </div>
  )
}

// Extra days on a project: this order's day-rate lines go onto an existing project (0050).
function AddToProjectPanel({
  salesOrderId,
  isDirty,
  onCancel,
  onAdded,
}: {
  salesOrderId: string
  isDirty: boolean
  onCancel: () => void
  onAdded: (projectId: string) => void
}) {
  const [candidates, setCandidates] = useState<ProjectCandidate[] | null>(null)
  const [projectId, setProjectId] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listProjectCandidates(salesOrderId)
      .then((list) => {
        setCandidates(list)
        setProjectId(list[0]?.id ?? '')
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load projects.'))
  }, [salesOrderId])

  async function handleAdd() {
    const chosen = candidates?.find((c) => c.id === projectId)
    if (!chosen) return
    if (isDirty && !window.confirm('You have unsaved changes on this sales order. Add it to the project anyway?')) return
    if (!window.confirm(`Add this sales order's day-rate lines to ${chosen.reference}?`)) return
    setAdding(true)
    setError(null)
    try {
      await addSalesOrderToProject(chosen.id, salesOrderId)
      onAdded(chosen.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add to the project.')
      setAdding(false)
    }
  }

  return (
    <Card className="mb-6">
      <h2 className="mb-1 text-sm font-semibold text-text">Add to an existing project</h2>
      <p className="mb-4 text-xs text-text-muted">
        For extra days on work that already has a project. This order&apos;s day-rate lines are added to the project as new
        lines, marked with this sales order and PO, so they&apos;re invoiced against this PO. Then assign people their days on
        the project page.
      </p>
      <ErrorText>{error}</ErrorText>
      {!candidates && !error && <p className="text-sm text-text-muted">Loading…</p>}
      {candidates && candidates.length === 0 && (
        <p className="text-sm text-text-muted">There are no active projects for this client.</p>
      )}
      {candidates && candidates.length > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <Label>Project</Label>
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.reference} · {c.name}
                  {c.same_opportunity ? ' (same opportunity)' : ''}
                </option>
              ))}
            </Select>
          </div>
          <Button type="button" onClick={handleAdd} disabled={adding || !projectId}>
            {adding ? 'Adding…' : 'Add lines to project'}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </Card>
  )
}

// The customer's PO (and any amended copies) attached to this order (0051).
function PoFilesCard({
  salesOrderId,
  poNumber,
  quoteNumber,
  quoteValue,
  total,
  onUseFigures,
}: {
  salesOrderId: string
  poNumber: string
  quoteNumber: string | null
  quoteValue: number | null
  total: number | null
  onUseFigures: (reading: PoReading) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const camera = useMemo(hasTouchCamera, [])
  const [files, setFiles] = useState<SalesOrderFile[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState<string | null>(null) // file id the AI is reading
  const [used, setUsed] = useState<string | null>(null)

  async function load() {
    try {
      setFiles(await listSalesOrderFiles(salesOrderId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load PO copies.')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesOrderId])

  async function run(action: () => Promise<unknown>, fallback: string) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback)
    } finally {
      setBusy(false)
    }
  }

  function handleFile(picked: File | undefined) {
    if (fileInput.current) fileInput.current.value = ''
    if (cameraInput.current) cameraInput.current.value = ''
    if (!picked) return
    run(async () => {
      const file = await shrinkPhoto(picked, ID_PHOTO_SHRINK)
      if (file.size > PO_FILE_MAX_BYTES) throw new Error('That file is over 10 MB — please upload a smaller copy.')
      await uploadSalesOrderFile(salesOrderId, file)
    }, 'Failed to upload the PO.')
  }

  async function handleOpen(file: SalesOrderFile) {
    setError(null)
    // Open the tab straight away (before the await) so pop-up blockers allow it.
    const tab = window.open('', '_blank')
    try {
      const url = await getSalesOrderFileUrl(file)
      if (tab) tab.location.href = url
      else window.location.href = url
    } catch (err) {
      tab?.close()
      setError(err instanceof Error ? err.message : 'Failed to open the file.')
    }
  }

  async function handleRead(file: SalesOrderFile) {
    setReading(file.id)
    setError(null)
    try {
      await readPoWithAi(file.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read the PO.')
    } finally {
      setReading(null)
    }
  }

  function handleRemove(file: SalesOrderFile) {
    if (!window.confirm(`Remove ${file.file_name}?`)) return
    run(() => removeSalesOrderFile(file), 'Failed to remove the file.')
  }

  return (
    <Card className="mb-6">
      <h2 className="mb-1 text-sm font-semibold text-text">PO copy{poNumber ? ` · ${poNumber}` : ''}</h2>
      <p className="mb-3 text-xs text-text-muted">
        Attach the customer's purchase order as received (PDF or photo, up to 10 MB). Add amended POs too — the newest is listed first. <strong>Check with AI</strong> reads the PO and compares it with
        the quote; nothing changes until you press Use these figures and save.
      </p>
      {files === null ? (
        <p className="mb-3 text-sm text-text-muted">Loading…</p>
      ) : files.length === 0 ? (
        <p className="mb-3 text-sm text-text-muted">No PO attached yet.</p>
      ) : (
        <ul className="mb-3 divide-y divide-border">
          {files.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <button onClick={() => handleOpen(f)} className="break-all text-left text-sm text-accent hover:underline">
                  {f.file_name}
                </button>
                <p className="text-xs text-text-muted">
                  Uploaded {new Date(f.uploaded_at).toLocaleDateString('en-GB')}
                  {f.uploader?.full_name ? ` by ${f.uploader.full_name}` : ''}
                  {f.size_bytes ? ` · ${Math.max(1, Math.round(f.size_bytes / 1024))} KB` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={busy || reading !== null} onClick={() => handleRead(f)}>
                  {reading === f.id ? 'Reading…' : f.ai_reading ? 'Read again' : 'Check with AI'}
                </Button>
                <Button variant="secondary" disabled={busy || reading !== null} onClick={() => handleRemove(f)}>
                  Remove
                </Button>
              </div>
              {f.ai_reading && (
                <PoReadingPanel
                  file={f}
                  checks={checkPo(f.ai_reading, { quoteValue, total, poNumber, quoteNumber })}
                  used={used === f.id}
                  onUse={() => {
                    onUseFigures(f.ai_reading!)
                    setUsed(f.id)
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <input ref={fileInput} type="file" accept={PO_FILE_ACCEPT} className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      {/* capture="environment" opens the back camera straight away on phones. */}
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <div className="flex flex-wrap gap-2">
        {camera && (
          <Button disabled={busy} onClick={() => cameraInput.current?.click()}>
            Take photo
          </Button>
        )}
        <Button variant="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>
          {busy ? 'Working…' : files?.length ? 'Upload another' : 'Upload PO'}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </Card>
  )
}

const RESULT_STYLE: Record<CheckResult, { mark: string; className: string }> = {
  match: { mark: '✓', className: 'text-accent' },
  differs: { mark: '✗', className: 'text-danger' },
  unknown: { mark: '?', className: 'text-text-muted' },
}

function showValue(v: string | number | null) {
  if (v == null || v === '') return '—'
  return typeof v === 'number' ? `£${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : v
}

// What the AI read from one PO, checked against this sales order and its quote (0052).
function PoReadingPanel({
  file,
  checks,
  used,
  onUse,
}: {
  file: SalesOrderFile
  checks: ReturnType<typeof checkPo>
  used: boolean
  onUse: () => void
}) {
  const r = file.ai_reading!
  const anyDiffers = checks.some((c) => c.result === 'differs')
  const allMatch = checks.length > 0 && checks.every((c) => c.result === 'match')
  const headline = !r.is_purchase_order
    ? "This doesn't look like a purchase order — check the file."
    : anyDiffers
      ? "The PO doesn't match — check before going ahead."
      : allMatch
        ? 'The PO matches the quote.'
        : "Read — some things couldn't be checked."
  const headlineClass = !r.is_purchase_order || anyDiffers ? 'text-danger' : allMatch ? 'text-accent' : 'text-text'
  return (
    <div className="w-full rounded-lg border border-border p-3 text-sm">
      <p className={`mb-2 font-medium ${headlineClass}`}>{headline}</p>
      <div className="mb-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-text-muted sm:grid-cols-2">
        <span>
          PO number: <span className="text-text">{showValue(r.po_number)}</span>
        </span>
        <span>
          PO date: <span className="text-text">{r.po_date ? new Date(r.po_date).toLocaleDateString('en-GB') : '—'}</span>
        </span>
        <span>
          From: <span className="text-text">{showValue(r.buyer)}</span>
        </span>
        <span>
          To: <span className="text-text">{showValue(r.supplier)}</span>
        </span>
      </div>
      <table className="mb-2 w-full text-left text-xs">
        <thead className="text-text-muted">
          <tr>
            <th className="py-1 pr-2 font-normal">Check</th>
            <th className="py-1 pr-2 font-normal">On the PO</th>
            <th className="py-1 pr-2 font-normal">In Spine</th>
            <th className="py-1 font-normal">
              <span className="sr-only">Result</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => (
            <tr key={c.key} className="border-t border-border">
              <td className="py-1 pr-2 text-text-muted">{c.label}</td>
              <td className="py-1 pr-2 text-text">{showValue(c.po)}</td>
              <td className="py-1 pr-2 text-text">{showValue(c.ours)}</td>
              <td className={`py-1 font-semibold ${RESULT_STYLE[c.result].className}`}>{RESULT_STYLE[c.result].mark}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {r.currency && r.currency.toUpperCase() !== 'GBP' && (
        <p className="mb-2 text-xs text-danger">Currency on the PO: {r.currency}</p>
      )}
      {r.notes && <p className="mb-2 text-xs text-text">Note: {r.notes}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={onUse} disabled={!r.is_purchase_order}>
          Use these figures
        </Button>
        <span className="text-xs text-text-faint">
          {used
            ? 'PO number, PO value, difference and "Quote matches PO" are filled in below — check them, then save.'
            : `Read by AI${file.ai_read_at ? ' ' + new Date(file.ai_read_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : ''} — always check against the PO itself.`}
        </span>
      </div>
    </div>
  )
}
