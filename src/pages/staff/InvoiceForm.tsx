import { useEffect, useState, type SyntheticEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  createInvoice,
  getCompanySettings,
  getInvoice,
  getSalesOrderForConversion,
  listAccounts,
  listInvoiceLines,
  listLineTypes,
  listPaymentsForInvoice,
  recordPayment,
  replaceInvoiceLines,
  updateInvoice,
  type InvoiceLineInput,
} from '../../lib/api'
import type { Account, CompanySettings, InvoiceStatus, LineType, Payment } from '../../lib/types'
import { REBATE_RATE, isRebateEligible } from '../../lib/rebate'
import { INVOICE_STATUS_LABELS } from '../../lib/types'
import { Button, Card, ErrorText, Input, Label, Select } from '../../components/ui'
import PrintDocument, { printWithTitle } from '../../components/PrintDocument'
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

// Same rules as QuoteForm: VAT 20% of Value, Rebate 7.5% of the lines whose
// line type earns it (lib/rebate.ts; lines with no line type earn it, as
// before), Net value = Total − Rebate.
const VAT_RATE = 0.2

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function deriveFinancials(value: number, rebateEligibleValue = value) {
  const vat = round2(value * VAT_RATE)
  const total = round2(value + vat)
  const rebate = round2(rebateEligibleValue * REBATE_RATE)
  return {
    value: value.toString(),
    vat: vat.toString(),
    total: total.toString(),
    rebate: rebate.toString(),
    net_value: round2(total - rebate).toString(),
  }
}

// An invoice line being edited (strings, like the rest of the form).
interface LocalLine {
  key: string
  description: string
  line_type: string // '' = not given
  qty: string
  unit_price: string
}

function emptyLine(): LocalLine {
  return { key: crypto.randomUUID(), description: '', line_type: '', qty: '1', unit_price: '' }
}

function lineTotal(line: LocalLine): number {
  const qty = Number(line.qty)
  const price = Number(line.unit_price)
  return Number.isNaN(qty) || Number.isNaN(price) ? 0 : round2(qty * price)
}

function toLineInput(line: LocalLine): InvoiceLineInput {
  return {
    description: line.description.trim() || null,
    line_type: line.line_type || null,
    qty: Number(line.qty) || 0,
    unit_price: Number(line.unit_price) || 0,
  }
}

// Lines compared by content only, for the unsaved-changes check.
function linesSnapshot(lines: LocalLine[]) {
  return JSON.stringify(lines.map(({ description, line_type, qty, unit_price }) => [description, line_type, qty, unit_price]))
}

function money(v: string | number | null): string {
  return `£${Number(v || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function shortDate(iso: string): string {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }) : ''
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

  const [lines, setLines] = useState<LocalLine[]>([])
  const [company, setCompany] = useState<CompanySettings | null>(null)
  const [lineTypes, setLineTypes] = useState<LineType[]>([])

  useEffect(() => {
    listLineTypes()
      .then(setLineTypes)
      .catch(() => setLineTypes([]))
  }, [])

  const [initialSnapshot, setInitialSnapshot] = useState(() => JSON.stringify(emptyForm))
  const [initialLines, setInitialLines] = useState('[]')
  const isDirty =
    !loading && !blocked && (JSON.stringify(form) !== initialSnapshot || linesSnapshot(lines) !== initialLines)
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
          const loadedLines: LocalLine[] = (await listInvoiceLines(id)).map((l) => ({
            key: l.id,
            description: l.description ?? '',
            line_type: l.line_type ?? '',
            qty: l.qty.toString(),
            unit_price: l.unit_price.toString(),
          }))
          setLines(loadedLines)
          setInitialLines(linesSnapshot(loadedLines))
          await refreshPayments(id)
          // Only needed for printing — don't block the form if it fails.
          getCompanySettings()
            .then(setCompany)
            .catch(() => setCompany(null))
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
      if (savedId) await replaceInvoiceLines(savedId, lines.map(toLineInput))
      setInitialSnapshot(JSON.stringify(form))
      setInitialLines(linesSnapshot(lines))
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

  // Lines drive Value (and so VAT/Total/Rebate/Net) once any exist; an
  // invoice with no lines keeps the manual figures (e.g. imported invoices).
  function applyLines(newLines: LocalLine[]) {
    setLines(newLines)
    if (newLines.length === 0) return
    const sum = round2(newLines.reduce((acc, l) => acc + lineTotal(l), 0))
    const eligible = newLines.filter((l) => isRebateEligible(l.line_type, lineTypes)).reduce((acc, l) => acc + lineTotal(l), 0)
    setForm((prev) => ({ ...prev, ...deriveFinancials(sum, eligible) }))
  }

  const linesControlTotals = lines.length > 0

  // ── Printable invoice data ──
  const client = accounts.find((a) => a.id === form.client_id)
  const invoiceTo = [
    client ? client.billing_name || client.name : '',
    client?.address_line_1,
    client?.address_line_2,
    client?.city,
    client?.postcode,
  ].filter((v): v is string => Boolean(v))
  // Invoices with no lines (e.g. imported ones) print a single line for their Value.
  const printLines =
    lines.length > 0
      ? lines.map((l) => ({ key: l.key, description: l.description, qty: Number(l.qty) || 0, price: Number(l.unit_price) || 0 }))
      : [
          {
            key: 'value',
            description:
              form.invoice_period_from || form.invoice_period_to
                ? `Services ${shortDate(form.invoice_period_from)} – ${shortDate(form.invoice_period_to)}`
                : 'Services',
            qty: 1,
            price: Number(form.value) || 0,
          },
        ]
  const bankDetails = company
    ? [
        company.bank_account_name && `Acc Name: ${company.bank_account_name}`,
        company.bank_account_number && `Acc No: ${company.bank_account_number}`,
        company.bank_sort_code && `Sort Code: ${company.bank_sort_code}`,
      ].filter(Boolean)
    : []

  return (
    <div className="max-w-3xl print:max-w-none">
      <div className="mb-6 flex items-start justify-between gap-4 print:hidden">
        <h1 className="text-xl font-semibold text-text">
          {isEditing ? `Edit invoice ${invoiceNumber ?? ''}` : 'New invoice'}
          {sourceSalesOrderRef && (
            <span className="ml-2 font-mono-label text-xs font-normal text-text-faint">
              from sales order {sourceSalesOrderRef}
            </span>
          )}
        </h1>
        {isEditing && id && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => printWithTitle(`Invoice ${invoiceNumber ?? ''}`)}
            className="shrink-0"
          >
            Print / Export PDF
          </Button>
        )}
      </div>

      {/* Printable invoice — hidden on screen, shown only when printing (or
          "Save as PDF" from the print dialog opened by the button above).
          Laid out like Techtrus's existing invoices (INV2365, Sept 2026):
          details block top right, lines, terms + bank details beside the
          totals, company registration line. No status, Rebate or Net value.
          Company details come from Admin → Invoice settings. It prints what's
          currently in the form, so save first if you've changed anything. */}
      {isEditing && (
        <PrintDocument
          footer={
            <div className="space-y-1 border-t border-gray-300 pt-2 text-center text-xs text-gray-600">
              {company && (
                <p>
                  A company Registered in England and Wales. Company registration number: {company.company_number}
                  {company.registered_address && <> &nbsp; Registered Address: {company.registered_address}</>}
                  {company.vat_reg && <> &nbsp; Company VAT Reg: {company.vat_reg}</>}
                </p>
              )}
              <p>
                {form.due_date && form.status !== 'paid' ? `Payment due by ${shortDate(form.due_date)}. ` : ''}
                Please quote invoice number {invoiceNumber} with your payment.
              </p>
            </div>
          }
        >
          {/* Logo with "Invoice To" under it on the left; title and the
              reference details on the right. Kept compact so a typical
              invoice fits on one page in landscape as well as portrait. */}
          <div className="mb-6 flex items-start justify-between gap-8">
            <div className="space-y-5">
              <img src="/techtrus-logo.png" alt="Techtrus" className="h-14 w-auto" />
              <div>
                <p className="font-semibold">Invoice To</p>
                {invoiceTo.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            </div>
            <div className="w-1/2">
              <h1 className="mb-4 text-right text-4xl font-semibold tracking-wide">Invoice</h1>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <p className="font-semibold">Company VAT Reg</p>
                  <p>{company?.vat_reg}</p>
                </div>
                <div>
                  <p className="font-semibold">Invoice No.</p>
                  <p>{invoiceNumber}</p>
                </div>
                <div>
                  <p className="font-semibold">PO No.</p>
                  <p>{form.po_number}</p>
                </div>
                <div>
                  <p className="font-semibold">Terms</p>
                  <p>{company?.payment_terms}</p>
                </div>
                <div>
                  <p className="font-semibold">Date</p>
                  <p>{shortDate(form.invoice_date)}</p>
                </div>
              </div>
            </div>
          </div>

          <table className="mb-6 w-full border-collapse">
            <thead>
              <tr className="border-y-2 border-gray-400 text-left">
                <th className="py-2 pr-2 font-semibold">Product Description</th>
                <th className="w-24 py-2 pr-2 text-right font-semibold">Quantity</th>
                <th className="w-28 py-2 pr-2 text-right font-semibold">Price</th>
                <th className="w-32 py-2 text-right font-semibold">Net Amount</th>
              </tr>
            </thead>
            <tbody>
              {printLines.map((l) => (
                <tr key={l.key} className="border-b border-gray-200">
                  <td className="py-1.5 pr-2">{l.description}</td>
                  <td className="py-1.5 pr-2 text-right">{l.qty}</td>
                  <td className="py-1.5 pr-2 text-right">{money(l.price)}</td>
                  <td className="py-1.5 text-right">{money(round2(l.qty * l.price))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="grid grid-cols-[1fr_16rem] gap-8">
            <div className="space-y-3 text-xs">
              {company?.payment_terms_text && <p>{company.payment_terms_text}</p>}
              {bankDetails.length > 0 && (
                <p className="flex flex-wrap gap-x-8 font-semibold">
                  {bankDetails.map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </p>
              )}
            </div>
            <div>
              <div className="flex justify-between py-1">
                <span className="font-semibold">Net Amount</span>
                <span>{money(form.value)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="font-semibold">VAT Total</span>
                <span>{money(form.vat)}</span>
              </div>
              <div className="flex justify-between border-t-2 border-gray-400 py-1 font-semibold">
                <span>Total Amount</span>
                <span>{money(form.total)}</span>
              </div>
            </div>
          </div>
        </PrintDocument>
      )}

      <Card className="print:hidden">
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
              <Select value={form.end_client_id} onChange={(e) => setForm({ ...form, end_client_id: e.target.value })}>
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
              <Input
                type="date"
                value={form.invoice_date}
                onChange={(e) => setForm({ ...form, invoice_date: e.target.value })}
              />
            </div>
            <div>
              <Label>Due date</Label>
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
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

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Invoice lines</Label>
              <button
                type="button"
                onClick={() => applyLines([...lines, emptyLine()])}
                className="text-xs font-mono-label text-accent hover:underline"
              >
                + Add line
              </button>
            </div>
            {lines.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-text-muted">
                No lines — the printed invoice shows one line for the Value below. Add lines (e.g. "L2 ENGINEER", 18 ×
                £448.82) to itemise it; Value, VAT and Total are then worked out from them.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-surface-raised text-left text-xs font-mono-label text-text-muted">
                    <tr>
                      <th className="px-2 py-2">Product description</th>
                      <th className="w-44 px-2 py-2">Line type</th>
                      <th className="w-24 px-2 py-2">Quantity</th>
                      <th className="w-32 px-2 py-2">Price (£)</th>
                      <th className="w-28 px-2 py-2 text-right">Net amount</th>
                      <th className="w-8 px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.key} className="border-t border-border">
                        <td className="px-2 py-1.5">
                          <Input
                            aria-label="Product description"
                            value={line.description}
                            onChange={(e) =>
                              applyLines(
                                lines.map((l) => (l.key === line.key ? { ...l, description: e.target.value } : l)),
                              )
                            }
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Select
                            aria-label="Line type"
                            value={line.line_type}
                            onChange={(e) =>
                              applyLines(
                                lines.map((l) => (l.key === line.key ? { ...l, line_type: e.target.value } : l)),
                              )
                            }
                          >
                            <option value="">—</option>
                            {lineTypes
                              .filter((t) => t.is_active || t.name === line.line_type)
                              .map((t) => (
                                <option key={t.id} value={t.name}>
                                  {t.name}
                                </option>
                              ))}
                            {line.line_type && !lineTypes.some((t) => t.name === line.line_type) && (
                              <option value={line.line_type}>{line.line_type}</option>
                            )}
                          </Select>
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            aria-label="Quantity"
                            type="number"
                            step="0.01"
                            value={line.qty}
                            onChange={(e) =>
                              applyLines(lines.map((l) => (l.key === line.key ? { ...l, qty: e.target.value } : l)))
                            }
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            aria-label="Price"
                            type="number"
                            step="0.01"
                            value={line.unit_price}
                            onChange={(e) =>
                              applyLines(
                                lines.map((l) => (l.key === line.key ? { ...l, unit_price: e.target.value } : l)),
                              )
                            }
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right text-text-muted">{money(lineTotal(line))}</td>
                        <td className="px-2 py-1.5 text-right">
                          <button
                            type="button"
                            aria-label="Remove line"
                            onClick={() => applyLines(lines.filter((l) => l.key !== line.key))}
                            className="text-text-muted hover:text-danger"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {linesControlTotals && (
            <p className="text-xs text-text-faint">
              Worked out from the lines above (VAT 20%; rebate 7.5% of resource lines — lines with no line type count
              too).
            </p>
          )}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Value (£)</Label>
              <Input
                type="number"
                step="0.01"
                disabled={linesControlTotals}
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
              />
            </div>
            <div>
              <Label>VAT (£)</Label>
              <Input
                type="number"
                step="0.01"
                disabled={linesControlTotals}
                value={form.vat}
                onChange={(e) => setForm({ ...form, vat: e.target.value })}
              />
            </div>
            <div>
              <Label>Total (£)</Label>
              <Input
                type="number"
                step="0.01"
                disabled={linesControlTotals}
                value={form.total}
                onChange={(e) => setForm({ ...form, total: e.target.value })}
              />
            </div>
            <div>
              <Label>Rebate (£)</Label>
              <Input
                type="number"
                step="0.01"
                disabled={linesControlTotals}
                value={form.rebate}
                onChange={(e) => setForm({ ...form, rebate: e.target.value })}
              />
            </div>
            <div>
              <Label>Net value (£)</Label>
              <Input
                type="number"
                step="0.01"
                disabled={linesControlTotals}
                value={form.net_value}
                onChange={(e) => setForm({ ...form, net_value: e.target.value })}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as InvoiceStatus })}
              >
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
        <Card className="mt-6 print:hidden">
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
