import { useEffect, useState, type SyntheticEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { PricedLineItem, QuoteLineInput } from '../../lib/api'
import {
  createQuote,
  deleteQuote,
  getOpportunity,
  getPricedLineItems,
  listLineTypes,
  getQuote,
  listAccounts,
  listQuoteLines,
  replaceQuoteLines,
  updateQuote,
} from '../../lib/api'
import type { Account, QuoteStatus, RateCard } from '../../lib/types'
import {
  QUOTE_LINE_PART_CODE_SUGGESTIONS,
  QUOTE_LINE_TYPE_SUGGESTIONS,
  QUOTE_STATUS_LABELS,
  QUOTE_VALIDITY_DAYS,
} from '../../lib/types'
import { Button, Card, ErrorText, Input, Label, Select, Textarea } from '../../components/ui'
import PrintDocument, { printWithTitle } from '../../components/PrintDocument'
import { preventEnterSubmit } from '../../lib/preventEnterSubmit'
import { useUnsavedChangesGuard } from '../../lib/useUnsavedChangesGuard'

// A quote line item while it's being edited in this form — numbers kept as
// strings (same convention as `form` below) so inputs can hold intermediate
// text like "" or "1.", and `key` is a stable React key: the row's id once
// saved, or a locally-generated one for a line that hasn't been saved yet.
type LocalLine = {
  key: string
  line_type: string
  part_code: string
  description: string
  description_2: string
  vendor: string
  qty: string
  unit_cost: string
  line_item_id: string // rate-card line item it came from ('' = typed in by hand)
}

function newLineKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `line-${Date.now()}-${Math.random()}`
}

function emptyLine(): LocalLine {
  return {
    key: newLineKey(),
    line_type: 'Outsource Resource',
    part_code: '',
    description: '',
    description_2: '',
    vendor: '',
    qty: '1',
    unit_cost: '0',
    line_item_id: '',
  }
}

const emptyForm = {
  opportunity_id: '',
  client_id: '',
  end_client_id: '',
  quote_date: '',
  start_date: '',
  end_date: '',
  value: '',
  vat: '',
  total: '',
  rebate: '',
  net_value: '',
  status: 'draft' as QuoteStatus,
  comments: '',
}

export default function QuoteForm() {
  const { id } = useParams()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const opportunityIdFromQuery = searchParams.get('opportunityId')

  const [accounts, setAccounts] = useState<Account[]>([])
  const [quoteNumber, setQuoteNumber] = useState<string | null>(null)
  const [sourceOpportunity, setSourceOpportunity] = useState<{ opportunity_number: string; name: string } | null>(
    null,
  )
  // Quotes can only be created from an Opportunity. Set when creating one
  // without an opportunityId in the URL — the form below is replaced with
  // an explanation. Never applies when editing an existing quote (some
  // quotes migrated from the old system predate this rule).
  const [blocked, setBlocked] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [lines, setLines] = useState<LocalLine[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Line items priced from the client account's rate card (custom card where
  // it has a price, else Default) — for the "Add from rate card" picker.
  const [rateCard, setRateCard] = useState<RateCard | null>(null)
  const [pricedItems, setPricedItems] = useState<PricedLineItem[]>([])
  const [lineTypeNames, setLineTypeNames] = useState<string[]>([])

  useEffect(() => {
    listLineTypes()
      .then((types) => setLineTypeNames(types.filter((t) => t.is_active).map((t) => t.name)))
      .catch(() => setLineTypeNames([]))
  }, [])

  const [initialSnapshot, setInitialSnapshot] = useState(() => JSON.stringify({ form: emptyForm, lines: [] }))
  const isDirty = !loading && !blocked && JSON.stringify({ form, lines }) !== initialSnapshot
  const { allowNextNavigation } = useUnsavedChangesGuard(isDirty)

  useEffect(() => {
    ;(async () => {
      try {
        setAccounts(await listAccounts(true))

        if (id) {
          const [q, loadedLines] = await Promise.all([getQuote(id), listQuoteLines(id)])
          setQuoteNumber(q.quote_number)
          if (q.opportunity) {
            setSourceOpportunity({ opportunity_number: q.opportunity.opportunity_number, name: q.opportunity.name })
          }
          const loaded = {
            opportunity_id: q.opportunity_id ?? '',
            client_id: q.client_id ?? '',
            end_client_id: q.end_client_id ?? '',
            quote_date: q.quote_date ?? '',
            start_date: q.start_date ?? '',
            end_date: q.end_date ?? '',
            value: q.value?.toString() ?? '',
            vat: q.vat?.toString() ?? '',
            total: q.total?.toString() ?? '',
            rebate: q.rebate?.toString() ?? '',
            net_value: q.net_value?.toString() ?? '',
            status: q.status,
            comments: q.comments ?? '',
          }
          const linesForForm: LocalLine[] = loadedLines.map((l) => ({
            key: l.id,
            line_type: l.line_type,
            part_code: l.part_code ?? '',
            description: l.description ?? '',
            description_2: l.description_2 ?? '',
            vendor: l.vendor ?? '',
            qty: l.qty.toString(),
            unit_cost: l.unit_cost.toString(),
            line_item_id: l.line_item_id ?? '',
          }))
          setForm(loaded)
          setLines(linesForForm)
          setInitialSnapshot(JSON.stringify({ form: loaded, lines: linesForForm }))
        } else if (opportunityIdFromQuery) {
          const opp = await getOpportunity(opportunityIdFromQuery)
          setSourceOpportunity({ opportunity_number: opp.opportunity_number, name: opp.name })
          const loaded = {
            ...emptyForm,
            opportunity_id: opp.id,
            client_id: opp.billing_account_id ?? '',
            end_client_id: opp.client_id ?? '',
          }
          setForm(loaded)
          setLines([])
          setInitialSnapshot(JSON.stringify({ form: loaded, lines: [] }))
        } else {
          setBlocked('Quotes can only be created from an opportunity — open the opportunity and use "New quote".')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load.')
      } finally {
        setLoading(false)
      }
    })()
  }, [id, opportunityIdFromQuery])

  // Reload rate-card prices whenever the client changes.
  const clientRateCardId = accounts.find((a) => a.id === form.client_id)?.rate_card_id ?? null
  useEffect(() => {
    if (loading) return
    getPricedLineItems(clientRateCardId)
      .then(({ card, items }) => {
        setRateCard(card)
        setPricedItems(items)
      })
      .catch(() => {
        setRateCard(null)
        setPricedItems([])
      })
  }, [clientRateCardId, loading])

  function toNumberOrNull(v: string): number | null {
    return v === '' ? null : Number(v)
  }

  // VAT (20%) and Rebate (7.5%) are standard rates applied to the quote
  // Value; Total and Net value follow from those. Recalculated whenever
  // Value changes — the four derived fields stay editable afterwards in
  // case a specific quote needs a manual override.
  const VAT_RATE = 0.2
  const REBATE_RATE = 0.075

  function round2(n: number): number {
    return Math.round(n * 100) / 100
  }

  // Looks up an account's display name for the printable quote view below —
  // the form only carries the id, same as the Client/End client <Select>s.
  function accountName(accountId: string): string {
    if (!accountId) return '—'
    return accounts.find((a) => a.id === accountId)?.name ?? '—'
  }

  function deriveFinancials(value: number) {
    const vat = round2(value * VAT_RATE)
    const total = round2(value + vat)
    const rebate = round2(value * REBATE_RATE)
    const net_value = round2(total - rebate)
    return { vat: vat.toString(), total: total.toString(), rebate: rebate.toString(), net_value: net_value.toString() }
  }

  function handleValueChange(raw: string) {
    const value = Number(raw)
    if (raw === '' || Number.isNaN(value)) {
      setForm({ ...form, value: raw })
      return
    }
    setForm({ ...form, value: raw, ...deriveFinancials(value) })
  }

  // Line items drive Value (and so VAT/Total/Rebate/Net) once any exist —
  // see the disabled state on those fields below. A quote with no line
  // items falls back to the old manual-entry behaviour via handleValueChange.
  function lineTotal(line: LocalLine): number {
    const qty = Number(line.qty)
    const unitCost = Number(line.unit_cost)
    if (Number.isNaN(qty) || Number.isNaN(unitCost)) return 0
    return qty * unitCost
  }

  function applyLines(newLines: LocalLine[]) {
    setLines(newLines)
    if (newLines.length === 0) return
    const sum = round2(newLines.reduce((acc, l) => acc + lineTotal(l), 0))
    setForm((prev) => ({ ...prev, value: sum.toString(), ...deriveFinancials(sum) }))
  }

  function updateLine(key: string, patch: Partial<LocalLine>) {
    applyLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function addLine() {
    applyLines([...lines, emptyLine()])
  }

  // The unit cost is copied onto the quote line here and is the quote's own
  // from then on — editable, and untouched by later rate card changes.
  function addFromRateCard(itemId: string) {
    const item = pricedItems.find((i) => i.id === itemId)
    if (!item) return
    applyLines([
      ...lines,
      {
        ...emptyLine(),
        line_type: item.line_type,
        part_code: item.part_code,
        description: item.description ?? '',
        unit_cost: item.unit_cost?.toString() ?? '0',
        line_item_id: item.id,
      },
    ])
  }

  function removeLine(key: string) {
    applyLines(lines.filter((l) => l.key !== key))
  }

  function toLineInput(line: LocalLine): QuoteLineInput {
    return {
      line_type: line.line_type || 'Outsource Resource',
      part_code: line.part_code || null,
      description: line.description || null,
      description_2: line.description_2 || null,
      vendor: line.vendor || null,
      qty: Number(line.qty) || 0,
      unit_cost: Number(line.unit_cost) || 0,
      line_item_id: line.line_item_id || null,
    }
  }

  async function handleSave(e: SyntheticEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const input = {
        opportunity_id: form.opportunity_id || null,
        client_id: form.client_id || null,
        end_client_id: form.end_client_id || null,
        contact_id: null,
        quote_date: form.quote_date || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        value: toNumberOrNull(form.value),
        vat: toNumberOrNull(form.vat),
        total: toNumberOrNull(form.total),
        rebate: toNumberOrNull(form.rebate),
        net_value: toNumberOrNull(form.net_value),
        status: form.status,
        comments: form.comments || null,
      }

      let savedId = id
      if (isEditing && id) {
        await updateQuote(id, input)
      } else {
        const created = await createQuote(input)
        savedId = created.id
      }
      if (savedId) {
        await replaceQuoteLines(savedId, lines.map(toLineInput))
      }
      allowNextNavigation()
      navigate('/staff/quotes')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save quote.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!id) return
    if (!window.confirm(`Delete draft quote ${quoteNumber ?? ''}? This can't be undone.`)) return
    setDeleting(true)
    setError(null)
    try {
      await deleteQuote(id)
      allowNextNavigation()
      navigate('/staff/quotes')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete quote.')
      setDeleting(false)
    }
  }

  if (loading) return <p className="text-sm text-text-muted">Loading…</p>

  if (blocked) {
    return (
      <div className="max-w-xl">
        <h1 className="mb-6 text-xl font-semibold text-text">New quote</h1>
        <Card>
          <p className="text-sm text-text-muted">{blocked}</p>
        </Card>
      </div>
    )
  }

  const linesTotal = round2(lines.reduce((acc, l) => acc + lineTotal(l), 0))
  const linesControlTotals = lines.length > 0

  return (
    <div className="max-w-4xl print:max-w-none">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <h1 className="text-xl font-semibold text-text">
          {isEditing ? `Edit quote ${quoteNumber ?? ''}` : 'New quote'}
        </h1>
        {isEditing && id && (
          <div className="flex items-center gap-3">
            <Button type="button" variant="secondary" onClick={() => printWithTitle(`Quote ${quoteNumber ?? ''}`)}>
              Print / Export PDF
            </Button>
            {form.status === 'accepted' ? (
              <Button variant="secondary" onClick={() => navigate(`/staff/sales-orders/new?quoteId=${id}`)}>
                Create Sales Order from this Quote
              </Button>
            ) : form.status === 'expired' ? (
              <p className="text-xs text-text-faint">This quote has expired.</p>
            ) : (
              <p className="text-xs text-text-faint">Accept this quote to create a Sales Order from it.</p>
            )}
          </div>
        )}
      </div>

      {/* Printable quote document — hidden on screen, shown only when printing
          (or "Save as PDF" from the print dialog triggered by the button above).
          The editable form below is marked print:hidden so only this renders. */}
      {isEditing && (
        <PrintDocument
          footer={
            <p className="border-t border-gray-300 pt-2 text-center text-xs text-gray-500">
              This quote is valid for {QUOTE_VALIDITY_DAYS} days from the quote date above and is subject to change
              thereafter.
            </p>
          }
        >
          <div className="mb-8 flex items-start justify-between border-b border-gray-300 pb-4">
            <div>
              <img src="/techtrus-logo.png" alt="Techtrus" className="h-8 w-auto" />
              <p className="mt-2 text-xs text-gray-500">techtrus.co.uk</p>
            </div>
            <div className="text-right">
              <h1 className="text-2xl font-semibold text-black">Quote {quoteNumber}</h1>
              <p className="mt-1 text-sm text-gray-600">{QUOTE_STATUS_LABELS[form.status]}</p>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-x-8 gap-y-3 text-sm text-black">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Client</p>
              <p>{accountName(form.client_id)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">End client</p>
              <p>{accountName(form.end_client_id)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Opportunity</p>
              <p>{sourceOpportunity ? `${sourceOpportunity.opportunity_number} — ${sourceOpportunity.name}` : '—'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Quote date</p>
              <p>{form.quote_date || '—'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Start date</p>
              <p>{form.start_date || '—'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">End date</p>
              <p>{form.end_date || '—'}</p>
            </div>
          </div>

          {lines.length > 0 && (
            <table className="mb-6 w-full border-collapse text-sm text-black">
              <thead>
                <tr className="border-b-2 border-gray-400 text-left text-xs uppercase tracking-wide text-gray-600">
                  <th className="py-2 pr-2">Line type</th>
                  <th className="py-2 pr-2">Part code</th>
                  <th className="py-2 pr-2">Description</th>
                  <th className="py-2 pr-2">Description 2</th>
                  <th className="py-2 pr-2">Vendor</th>
                  <th className="py-2 pr-2 text-right">Qty</th>
                  <th className="py-2 pr-2 text-right">Unit cost (£)</th>
                  <th className="py-2 pl-2 text-right">Total (£)</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.key} className="border-b border-gray-200">
                    <td className="py-1.5 pr-2">{line.line_type}</td>
                    <td className="py-1.5 pr-2">{line.part_code}</td>
                    <td className="py-1.5 pr-2">{line.description}</td>
                    <td className="py-1.5 pr-2">{line.description_2}</td>
                    <td className="py-1.5 pr-2">{line.vendor}</td>
                    <td className="py-1.5 pr-2 text-right">{line.qty}</td>
                    <td className="py-1.5 pr-2 text-right">{Number(line.unit_cost || 0).toFixed(2)}</td>
                    <td className="py-1.5 pl-2 text-right">{lineTotal(line).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="mb-8 ml-auto w-64 text-sm text-black">
            <div className="flex justify-between py-1">
              <span className="text-gray-600">Value</span>
              <span>£{form.value || '0.00'}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-600">VAT</span>
              <span>£{form.vat || '0.00'}</span>
            </div>
            <div className="flex justify-between border-t border-gray-300 py-1 font-semibold">
              <span>Total</span>
              <span>£{form.total || '0.00'}</span>
            </div>
          </div>

          {form.comments && (
            <div className="mb-8 text-sm text-black">
              <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">Comments</p>
              <p className="whitespace-pre-wrap">{form.comments}</p>
            </div>
          )}

        </PrintDocument>
      )}

      <Card className="print:hidden">
        <form onSubmit={handleSave} onKeyDown={preventEnterSubmit} className="space-y-4">
          <div>
            <Label>Opportunity</Label>
            <p className="rounded-md border border-border bg-sunken px-3 py-2 text-sm text-text-muted">
              {sourceOpportunity ? `${sourceOpportunity.opportunity_number} — ${sourceOpportunity.name}` : '—'}
            </p>
          </div>

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

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Quote date</Label>
              <Input type="date" value={form.quote_date} onChange={(e) => setForm({ ...form, quote_date: e.target.value })} />
            </div>
            <div>
              <Label>Start date</Label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <Label>End date</Label>
              <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
              <div>
                <Label>Line items</Label>
                {rateCard && (
                  <p className="text-xs text-text-faint">
                    Prices from the <span className="text-text-muted">{rateCard.name}</span> rate card
                    {form.client_id ? '' : ' (no client selected)'}
                    {rateCard.is_default ? '' : ' (* = custom price, others from Default)'} — you can change a line's unit
                    cost after adding it.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Select
                  aria-label="Add from rate card"
                  value=""
                  onChange={(e) => addFromRateCard(e.target.value)}
                  className="w-64"
                  disabled={pricedItems.length === 0}
                >
                  <option value="">Add from rate card…</option>
                  {pricedItems.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.part_code} — {i.unit_cost === null ? 'no price' : `£${Number(i.unit_cost).toFixed(2)}`}
                      {i.from_custom ? ' *' : ''}
                    </option>
                  ))}
                </Select>
                <Button type="button" variant="secondary" onClick={addLine}>
                  + Blank line
                </Button>
              </div>
            </div>

            {lines.length === 0 ? (
              <p className="text-sm text-text-muted">
                No line items yet — add the services, SKUs or part codes that make up this quote, or leave this empty
                and enter Value directly below.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[920px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-sunken text-left text-xs font-mono-label text-text-dim">
                      <th className="px-2 py-2">Line type</th>
                      <th className="px-2 py-2">Part code</th>
                      <th className="px-2 py-2">Description</th>
                      <th className="px-2 py-2">Description 2</th>
                      <th className="px-2 py-2">Vendor</th>
                      <th className="px-2 py-2 text-right">Qty</th>
                      <th className="px-2 py-2 text-right">Unit cost (£)</th>
                      <th className="px-2 py-2 text-right">Total (£)</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.key} className="border-b border-border last:border-0">
                        <td className="px-2 py-1.5">
                          <input
                            list="quote-line-type-options"
                            value={line.line_type}
                            onChange={(e) => updateLine(line.key, { line_type: e.target.value })}
                            className="w-full min-w-[9rem] rounded border border-border bg-sunken px-2 py-1 text-sm text-text focus:border-accent focus:outline-none"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            list="quote-line-part-code-options"
                            value={line.part_code}
                            onChange={(e) => updateLine(line.key, { part_code: e.target.value })}
                            className="w-full min-w-[9rem] rounded border border-border bg-sunken px-2 py-1 text-sm text-text focus:border-accent focus:outline-none"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={line.description}
                            onChange={(e) => updateLine(line.key, { description: e.target.value })}
                            className="w-full min-w-[8rem] rounded border border-border bg-sunken px-2 py-1 text-sm text-text focus:border-accent focus:outline-none"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={line.description_2}
                            onChange={(e) => updateLine(line.key, { description_2: e.target.value })}
                            className="w-full min-w-[8rem] rounded border border-border bg-sunken px-2 py-1 text-sm text-text focus:border-accent focus:outline-none"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={line.vendor}
                            onChange={(e) => updateLine(line.key, { vendor: e.target.value })}
                            className="w-full min-w-[6rem] rounded border border-border bg-sunken px-2 py-1 text-sm text-text focus:border-accent focus:outline-none"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            step="0.01"
                            value={line.qty}
                            onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                            className="w-20 rounded border border-border bg-sunken px-2 py-1 text-right text-sm text-text focus:border-accent focus:outline-none"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            step="0.01"
                            value={line.unit_cost}
                            onChange={(e) => updateLine(line.key, { unit_cost: e.target.value })}
                            className="w-24 rounded border border-border bg-sunken px-2 py-1 text-right text-sm text-text focus:border-accent focus:outline-none"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right text-text-muted">{lineTotal(line).toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-right">
                          <button
                            type="button"
                            onClick={() => removeLine(line.key)}
                            aria-label="Remove line"
                            className="text-text-faint hover:text-danger"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={7} className="px-2 py-2 text-right text-xs font-mono-label text-text-dim">
                        Lines total
                      </td>
                      <td className="px-2 py-2 text-right text-sm font-semibold text-text">£{linesTotal.toFixed(2)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <datalist id="quote-line-type-options">
              {(lineTypeNames.length > 0 ? lineTypeNames : QUOTE_LINE_TYPE_SUGGESTIONS).map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <datalist id="quote-line-part-code-options">
              {(pricedItems.length > 0 ? pricedItems.map((i) => i.part_code) : QUOTE_LINE_PART_CODE_SUGGESTIONS).map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Value (£){linesControlTotals && ' — from line items'}</Label>
              <Input
                type="number"
                step="0.01"
                value={form.value}
                disabled={linesControlTotals}
                onChange={(e) => handleValueChange(e.target.value)}
              />
            </div>
            <div>
              <Label>VAT (£)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.vat}
                disabled={linesControlTotals}
                onChange={(e) => setForm({ ...form, vat: e.target.value })}
              />
            </div>
            <div>
              <Label>Total (£)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.total}
                disabled={linesControlTotals}
                onChange={(e) => setForm({ ...form, total: e.target.value })}
              />
            </div>
            <div>
              <Label>Rebate (£)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.rebate}
                disabled={linesControlTotals}
                onChange={(e) => setForm({ ...form, rebate: e.target.value })}
              />
            </div>
            <div>
              <Label>Net value (£)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.net_value}
                disabled={linesControlTotals}
                onChange={(e) => setForm({ ...form, net_value: e.target.value })}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as QuoteStatus })}>
                {Object.entries(QUOTE_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label>Comments</Label>
            <Textarea rows={3} value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })} />
          </div>

          <ErrorText>{error}</ErrorText>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving || deleting}>
              {saving ? 'Saving…' : 'Save quote'}
            </Button>
            {isEditing && form.status === 'draft' && (
              <Button type="button" variant="danger" onClick={handleDelete} disabled={saving || deleting}>
                {deleting ? 'Deleting…' : 'Delete quote'}
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  )
}
