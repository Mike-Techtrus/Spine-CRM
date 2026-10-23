import { useEffect, useState, type SyntheticEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  createInvoice,
  getInvoice,
  getSalesOrderForConversion,
  listAccounts,
  listPaymentsForInvoice,
  recordPayment,
  updateInvoice,
} from '../../lib/api'
import type { Account, InvoiceStatus, Payment } from '../../lib/types'
import { INVOICE_STATUS_LABELS } from '../../lib/types'
import { Button, Card, ErrorText, Input, Label, Select } from '../../components/ui'
import { preventEnterSubmit } from '../../lib/preventEnterSubmit'
import { useUnsavedChangesGuard } from '../../lib/useUnsavedChangesGuard'

const emptyForm = {
  sales_order_id: '',
  quote_id: '',
  client_id: '',
  end_client_id: '',
  po_number: '',
  invoice_date: '',
  due_date: '',
  invoice_period_from: '',
  invoice_period_to: '',
  value: '',
  vat: '',
  total: '',
  rebate: '',
  net_value: '',
  status: 'draft' as InvoiceStatus,
}

export default function InvoiceForm() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const salesOrderIdFromQuery = searchParams.get('salesOrderId')
  const isEditing = Boolean(id)
  const navigate = useNavigate()

  const [accounts, setAccounts] = useState<Account[]>([])
  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(null)
  const [sourceSalesOrderRef, setSourceSalesOrderRef] = useState<string | null>(null)
  // Invoices can only be created from a Sales Order. Set when creating one
  // without a salesOrderId in the URL — the form below is replaced with an
  // explanation. Never applies when editing an existing invoice (some
  // invoices migrated from the old system predate this rule).
  const [blocked, setBlocked] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [initialSnapshot, setInitialSnapshot] = useState(() => JSON.stringify(emptyForm))
  const isDirty = !loading && !blocked && JSON.stringify(form) !== initialSnapshot
  const { allowNextNavigation } = useUnsavedChangesGuard(isDirty)

  const [payments, setPayments] = useState<Payment[]>([])
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState('')
  const [savingPayment, setSavingPayment] = useState(false)

  async function refreshPayments(invoiceId: string) {
    setPayments(await listPaymentsForInvoice(invoiceId))
  }

  useEffect(() => {
    ;(async () => {
      try {
        setAccounts(await listAccounts(true))

        if (id) {
          const inv = await getInvoice(id)
          setInvoiceNumber(inv.invoice_number)
          setSourceSalesOrderRef(inv.sales_order?.reference ?? null)
          const loaded = {
            sales_order_id: inv.sales_order_id ?? '',
            quote_id: inv.quote_id ?? '',
            client_id: inv.client_id ?? '',
            end_client_id: inv.end_client_id ?? '',
            po_number: inv.po_number ?? '',
            invoice_date: inv.invoice_date ?? '',
            due_date: inv.due_date ?? '',
            invoice_period_from: inv.invoice_period_from ?? '',
            invoice_period_to: inv.invoice_period_to ?? '',
            value: inv.value?.toString() ?? '',
            vat: inv.vat?.toString() ?? '',
            total: inv.total?.toString() ?? '',
            rebate: inv.rebate?.toString() ?? '',
            net_value: inv.net_value?.toString() ?? '',
            status: inv.status,
          }
          setForm(loaded)
          setInitialSnapshot(JSON.stringify(loaded))
          await refreshPayments(id)
        } else if (salesOrderIdFromQuery) {
          const so = await getSalesOrderForConversion(salesOrderIdFromQuery)
          setSourceSalesOrderRef(so.reference)
          const loaded = {
            ...emptyForm,
            sales_order_id: so.id,
            quote_id: so.quote_id ?? '',
            client_id: so.client_id ?? '',
            end_client_id: so.end_client_id ?? '',
            po_number: so.po_number ?? '',
            value: so.net_value?.toString() ?? '',
            vat: so.vat?.toString() ?? '',
            total: so.total?.toString() ?? '',
            rebate: so.rebate?.toString() ?? '',
            net_value: so.net_value?.toString() ?? '',
          }
          setForm(loaded)
          setInitialSnapshot(JSON.stringify(loaded))
        } else {
          setBlocked(
            'Invoices can only be created from a sales order — open the sales order and use "Create Invoice from this Sales Order".',
          )
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load.')
      } finally {
        setLoading(false)
      }
    })()
  }, [id, salesOrderIdFromQuery])

  function n(v: string): number | null {
    return v === '' ? null : Number(v)
  }

  async function handleSave(e: SyntheticEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const input = {
        sales_order_id: form.sales_order_id || null,
        quote_id: form.quote_id || null,
        client_id: form.client_id || null,
        end_client_id: form.end_client_id || null,
        po_number: form.po_number || null,
        invoice_date: form.invoice_date || null,
        due_date: form.due_date || null,
        invoice_period_from: form.invoice_period_from || null,
        invoice_period_to: form.invoice_period_to || null,
        value: n(form.value),
        vat: n(form.vat),
        total: n(form.total),
        rebate: n(form.rebate),
        net_value: n(form.net_value),
        status: form.status,
      }

      let savedId = id
      if (isEditing && id) {
        await updateInvoice(id, input)
      } else {
        const created = await createInvoice(input)
        savedId = created.id
      }
      allowNextNavigation()
      navigate(`/staff/invoices/${savedId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save invoice.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddPayment(e: SyntheticEvent) {
    e.preventDefault()
    if (!id || !paymentAmount) return
    setSavingPayment(true)
    try {
      const totalPaid = payments.reduce((sum, p) => sum + Number(p.payment_amount), 0)
      const original = Number(form.total || 0)
      const newAmount = Number(paymentAmount)
      await recordPayment({
        invoice_id: id,
        payment_date: paymentDate || null,
        original_amount: original || null,
        remaining_amount: original ? original - totalPaid - newAmount : null,
        payment_amount: newAmount,
      })
      setPaymentAmount('')
      setPaymentDate('')
      await refreshPayments(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment.')
    } finally {
      setSavingPayment(false)
    }
  }

  if (loading) return <p className="text-sm text-text-muted">Loading…</p>

  if (blocked) {
    return (
      <div className="max-w-xl">
        <h1 className="mb-6 text-xl font-semibold text-text">New invoice</h1>
        <Card>
          <p className="text-sm text-text-muted">{blocked}</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-xl">
      <h1 className="mb-6 text-xl font-semibold text-text">
        {isEditing ? `Edit invoice ${invoiceNumber ?? ''}` : 'New invoice'}
        {sourceSalesOrderRef && (
          <span className="ml-2 font-mono-label text-xs font-normal text-text-faint">
            from sales order {sourceSalesOrderRef}
          </span>
        )}
      </h1>

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

          <div>
            <Label>PO number</Label>
            <Input value={form.po_number} onChange={(e) => setForm({ ...form, po_number: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Invoice date</Label>
              <Input type="date" value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.target.value })} />
            </div>
            <div>
              <Label>Due date</Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div>
              <Label>Invoice period from</Label>
              <Input
                type="date"
                value={form.invoice_period_from}
                onChange={(e) => setForm({ ...form, invoice_period_from: e.target.value })}
              />
            </div>
            <div>
              <Label>Invoice period to</Label>
              <Input
                type="date"
                value={form.invoice_period_to}
                onChange={(e) => setForm({ ...form, invoice_period_to: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Value (£)</Label>
              <Input type="number" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </div>
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
              <Label>Status</Label>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as InvoiceStatus })}>
                {Object.entries(INVOICE_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <ErrorText>{error}</ErrorText>

          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save invoice'}
          </Button>
        </form>
      </Card>

      {isEditing && (
        <Card className="mt-6">
          <h2 className="mb-4 text-sm font-mono-label uppercase tracking-wide text-text-muted">Payments</h2>

          {payments.length === 0 && <p className="mb-4 text-sm text-text-muted">No payments recorded yet.</p>}

          {payments.length > 0 && (
            <table className="mb-4 w-full text-sm">
              <thead className="text-left text-xs font-mono-label text-text-muted">
                <tr>
                  <th className="py-1">Ref</th>
                  <th className="py-1">Date</th>
                  <th className="py-1">Amount</th>
                  <th className="py-1">Remaining after</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="py-1 font-mono-label text-text-muted">{p.reference}</td>
                    <td className="py-1 text-text">{p.payment_date || '—'}</td>
                    <td className="py-1 text-text">£{Number(p.payment_amount).toLocaleString('en-GB')}</td>
                    <td className="py-1 text-text-muted">
                      {p.remaining_amount !== null ? `£${Number(p.remaining_amount).toLocaleString('en-GB')}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <form onSubmit={handleAddPayment} className="flex items-end gap-3">
            <div>
              <Label>Amount (£)</Label>
              <Input
                type="number"
                step="0.01"
                required
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
            <Button type="submit" variant="secondary" disabled={savingPayment}>
              {savingPayment ? 'Recording…' : 'Record payment'}
            </Button>
          </form>
        </Card>
      )}
    </div>
  )
}
