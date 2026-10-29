import { useEffect, useState, type SyntheticEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  createProjectFromSalesOrder,
  createSalesOrder,
  getProjectForSalesOrder,
  getQuoteForConversion,
  getSalesOrder,
  listAccounts,
  updateSalesOrder,
} from '../../lib/api'
import type { Account, Project } from '../../lib/types'
import { INVOICING_STATUS_BADGE, INVOICING_STATUS_LABELS, invoicingStatus } from '../../lib/types'
import { Button, Card, ErrorText, Input, Label, Select, StatusBadge, Textarea } from '../../components/ui'
import { preventEnterSubmit } from '../../lib/preventEnterSubmit'
import { useUnsavedChangesGuard } from '../../lib/useUnsavedChangesGuard'

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
          setProject(await getProjectForSalesOrder(id))
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

  // Invoicing status + balance still to invoice (net value − invoiced to date).
  const invoicing = invoicingStatus({
    net_value: n(form.net_value),
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
              `${money(invoicing.balance)} still to invoice.`}
            {invoicing.status === 'over_invoiced' && `Invoiced ${money(-invoicing.balance)} more than the net value.`}
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
                <Button variant="secondary" onClick={handleCreateProject} disabled={creatingProject}>
                  {creatingProject ? 'Creating…' : 'Create project'}
                </Button>
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

      {isEditing && id && invoicingPanel}

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
            <div>
              <Label>Rebate (£)</Label>
              <Input type="number" step="0.01" value={form.rebate} onChange={(e) => setForm({ ...form, rebate: e.target.value })} />
            </div>
            <div>
              <Label>Net value (£)</Label>
              <Input type="number" step="0.01" value={form.net_value} onChange={(e) => setForm({ ...form, net_value: e.target.value })} />
            </div>
            <div>
              <Label>Invoiced to date (£)</Label>
              {/* Worked out by the database from this order's invoices (migration 0017), so not editable. */}
              <Input type="number" value={form.invoiced_to_date} readOnly disabled placeholder="No invoices yet" />
              <p className="mt-1 text-xs text-text-faint">Net value of linked invoices, excluding cancelled.</p>
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
    </div>
  )
}
