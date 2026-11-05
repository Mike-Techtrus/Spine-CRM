import { useEffect, useState, type SyntheticEvent } from 'react'
import { showToast } from '../../components/Toast'
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
import type { Account, LineType, QuoteStatus, RateCard } from '../../lib/types'
import { accountRebateRate, isRebateEligible } from '../../lib/rebate'
import { moneyTotals, round2 } from '../../lib/money'
import {
  QUOTE_LINE_PART_CODE_SUGGESTIONS,
  QUOTE_LINE_TYPE_SUGGESTIONS,
  QUOTE_STATUS_LABELS,
  QUOTE_VALIDITY_DAYS,
} from '../../lib/types'
import { Button, Card, ErrorText, Input, Label, Select, Textarea } from '../../components/ui'
import PrintDocument, { pdfFileName, printWithTitle } from '../../components/PrintDocument'
import { preventEnterSubmit } from '../../lib/preventEnterSubmit'
import { useUnsavedChangesGuard } from '../../lib/useUnsavedChangesGuard'
import HistoryCard from '../../components/HistoryCard'
import { standardCostFor } from '../../lib/margin'
import PriceBuilder from '../../components/PriceBuilder'
import {
  EXPENSES_LINE_TYPE,
  buildQuoteLines,
  calculatePriceBuilder,
  emptyPriceBuilder,
  type PriceBuilderResult,
  type PriceBuilderState,
} from '../../lib/priceBuilder'

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
  unit_cost: string // the price the customer sees = rate + expenses_included (what's saved)
  rate: string // editor only: rate-card or typed-in rate before expenses
  line_item_id: string // rate-card line item it came from ('' = typed in by hand)
  expenses_included: string // per unit: bundled expenses inside unit_cost ('' = none) — 0047
}

// Print formatting: £7,130.00 and 04/11/2026.
function printMoney(v: string | number | null | undefined): string {
  return `£${Number(v || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function printDate(iso: string): string {
  return iso ? new Date(iso).toLocaleDateString('en-GB') : '—'
}

// Price on the quote = rate (rate card or typed) + expenses per unit.
function priceFrom(rate: string, expenses: string): string {
  return round2((Number(rate) || 0) + (Number(expenses) || 0)).toString()
}

function newLineKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `line-${Date.now()}-${Math.random()}`
}

// Techtrus's vendor code with CDW; still editable per line.
const DEFAULT_VENDOR = 'TEC410'

function emptyLine(): LocalLine {
  return {
    key: newLineKey(),
    line_type: 'Outsource Resource',
    part_code: '',
    description: '',
    description_2: '',
    vendor: DEFAULT_VENDOR,
    qty: '1',
    unit_cost: '0',
    rate: '0',
    line_item_id: '',
    expenses_included: '',
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
  const [sourceOpportunity, setSourceOpportunity] = useState<{ opportunity_number: string; name: string; customer_opportunity_number: string | null } | null>(
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
  // All line types (inactive ones too, so old lines still get the right
  // rebate); only active ones are offered as suggestions.
  const [lineTypes, setLineTypes] = useState<LineType[]>([])
  const lineTypeNames = lineTypes.filter((t) => t.is_active).map((t) => t.name)

  useEffect(() => {
    listLineTypes()
      .then(setLineTypes)
      .catch(() => setLineTypes([]))
  }, [])

  // Price builder workings (saved on quotes.price_builder; null = not used).
  const [priceBuilder, setPriceBuilder] = useState<PriceBuilderState | null>(null)
  const [builderOpen, setBuilderOpen] = useState(false)

  const [initialSnapshot, setInitialSnapshot] = useState(() =>
    JSON.stringify({ form: emptyForm, lines: [], priceBuilder: null }),
  )
  const isDirty = !loading && !blocked && JSON.stringify({ form, lines, priceBuilder }) !== initialSnapshot
  const { allowNextNavigation } = useUnsavedChangesGuard(isDirty)

  useEffect(() => {
    ;(async () => {
      try {
        setAccounts(await listAccounts(true))

        if (id) {
          const [q, loadedLines] = await Promise.all([getQuote(id), listQuoteLines(id)])
          setQuoteNumber(q.quote_number)
          if (q.opportunity) {
            setSourceOpportunity({
              opportunity_number: q.opportunity.opportunity_number,
              name: q.opportunity.name,
              customer_opportunity_number: q.opportunity.customer_opportunity_number,
            })
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
            rate: round2(Number(l.unit_cost) - (Number(l.expenses_included) || 0)).toString(),
            line_item_id: l.line_item_id ?? '',
            expenses_included: l.expenses_included?.toString() ?? '',
          }))
          setForm(loaded)
          setLines(linesForForm)
          setPriceBuilder(q.price_builder ?? null)
          setInitialSnapshot(JSON.stringify({ form: loaded, lines: linesForForm, priceBuilder: q.price_builder ?? null }))
        } else if (opportunityIdFromQuery) {
          const opp = await getOpportunity(opportunityIdFromQuery)
          setSourceOpportunity({
            opportunity_number: opp.opportunity_number,
            name: opp.name,
            customer_opportunity_number: opp.customer_opportunity_number,
          })
          const loaded = {
            ...emptyForm,
            opportunity_id: opp.id,
            client_id: opp.billing_account_id ?? '',
            end_client_id: opp.client_id ?? '',
          }
          setForm(loaded)
          setLines([])
          setInitialSnapshot(JSON.stringify({ form: loaded, lines: [], priceBuilder: null }))
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

  // VAT (20%) applies to the quote Value. Rebate is the client's agreed rate
  // (0% for most) on the value of lines whose line type earns it
  // (lib/rebate.ts) — the whole Value when there are no lines. Total and Net
  // value follow from those. Recalculated whenever Value, the lines or the
  // client change — the four derived fields stay editable afterwards in case
  // a specific quote needs a manual override. The sums themselves are in lib/money.ts.

  function clientRebateRate(clientId: string): number {
    return accountRebateRate(accounts.find((a) => a.id === clientId))
  }

  function rebateEligibleValue(forLines: LocalLine[]): number {
    return forLines
      .filter((l) => isRebateEligible(l.line_type, lineTypes))
      .reduce((acc, l) => acc + lineTotal(l) - (Number(l.qty) || 0) * (Number(l.expenses_included) || 0), 0)
  }

  // A different client can mean a different rebate rate: redo Rebate and Net
  // value from the current figures.
  function handleClientChange(clientId: string) {
    const eligible = lines.length > 0 ? rebateEligibleValue(lines) : Number(form.value) || 0
    const rebate = round2(eligible * clientRebateRate(clientId))
    const total = Number(form.total)
    setForm({
      ...form,
      client_id: clientId,
      rebate: rebate.toString(),
      net_value: form.total === '' || Number.isNaN(total) ? form.net_value : round2(total - rebate).toString(),
    })
  }

  // Looks up an account's display name for the printable quote view below —
  // the form only carries the id, same as the Client/End client <Select>s.
  function accountName(accountId: string): string {
    if (!accountId) return '—'
    return accounts.find((a) => a.id === accountId)?.name ?? '—'
  }

  function deriveFinancials(value: number, eligibleValue: number, rebateRate: number) {
    const t = moneyTotals(value, eligibleValue, rebateRate)
    return { vat: t.vat.toString(), total: t.total.toString(), rebate: t.rebate.toString(), net_value: t.net_value.toString() }
  }

  function handleValueChange(raw: string) {
    const value = Number(raw)
    if (raw === '' || Number.isNaN(value)) {
      setForm({ ...form, value: raw })
      return
    }
    setForm({ ...form, value: raw, ...deriveFinancials(value, value, clientRebateRate(form.client_id)) })
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
    const eligible = rebateEligibleValue(newLines)
    setForm((prev) => ({
      ...prev,
      value: sum.toString(),
      ...deriveFinancials(sum, eligible, clientRebateRate(prev.client_id)),
    }))
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
        rate: item.unit_cost?.toString() ?? '0',
        line_item_id: item.id,
      },
    ])
  }

  function removeLine(key: string) {
    applyLines(lines.filter((l) => l.key !== key))
  }

  // ── Price builder ──
  const builderRebateRate = clientRebateRate(form.client_id)
  const builderEligible = (lineType: string) => isRebateEligible(lineType, lineTypes)
  const builderResult = priceBuilder ? calculatePriceBuilder(priceBuilder, builderRebateRate, builderEligible) : null

  // First time on a quote that already has lines: start from those lines, so
  // only cost rates need adding. Bundled expenses come back as one expense
  // per role; Expenses lines as expenses charged on a separate line.
  function openPriceBuilder() {
    if (!priceBuilder) {
      const start = emptyPriceBuilder()
      const resourceLines = lines.filter((l) => l.line_type !== EXPENSES_LINE_TYPE)
      const expenseLines = lines.filter((l) => l.line_type === EXPENSES_LINE_TYPE)
      start.resources = resourceLines.map((l) => ({
        key: l.key,
        part_code: l.part_code,
        line_item_id: l.line_item_id,
        line_type: l.line_type,
        description: l.description,
        people: '1',
        days: l.qty,
        sell_rate: l.rate,
        cost_rate: standardCostFor(l, pricedItems)?.toString() ?? '',
      }))
      start.expenses = [
        ...resourceLines
          .filter((l) => Number(l.expenses_included) > 0)
          .map((l) => ({
            key: `exp-${l.key}`,
            item: `Expenses (${l.part_code || 'role'})`,
            qty: '1',
            times: l.qty,
            unit_cost: l.expenses_included,
            spread: l.key,
          })),
        ...expenseLines.map((l) => ({
          key: `exp-${l.key}`,
          item: l.description || l.part_code || 'Expenses',
          qty: l.qty,
          times: '1',
          unit_cost: l.unit_cost,
          spread: 'all',
        })),
      ]
      if (expenseLines.length > 0 && !resourceLines.some((l) => Number(l.expenses_included) > 0)) start.mode = 'separate'
      setPriceBuilder(start)
    }
    setBuilderOpen(true)
  }

  function fillFromPriceBuilder(result: PriceBuilderResult, replace: boolean) {
    if (!priceBuilder) return
    const built = buildQuoteLines(priceBuilder, result).map((b) => ({ ...emptyLine(), ...b }))
    applyLines(replace ? built : [...lines, ...built])
    setBuilderOpen(false)
    showToast(`${built.length} quote line${built.length === 1 ? '' : 's'} filled from the price builder — save to keep`)
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
      expenses_included: Number(line.expenses_included) > 0 ? Number(line.expenses_included) : null,
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
        price_builder: priceBuilder,
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
      showToast(isEditing && quoteNumber ? `Quote ${quoteNumber} saved` : 'Quote created')
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
  // Description 2 is no longer used on new quotes; still shown where an older quote has it.
  const showDescription2 = lines.some((l) => l.description_2.trim())
  const linesControlTotals = lines.length > 0

  return (
    <div className="max-w-4xl print:max-w-none">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <h1 className="text-xl font-semibold text-text">
          {isEditing ? `Edit quote ${quoteNumber ?? ''}` : 'New quote'}
        </h1>
        {isEditing && id && (
          <div className="flex items-center gap-3">
            <Button type="button" variant="secondary" onClick={() =>
                printWithTitle(
                  pdfFileName(
                    `Quote ${quoteNumber ?? ''}`,
                    accountName(form.end_client_id || form.client_id),
                    sourceOpportunity?.name,
                  ),
                )
              }>
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
          {/* Header: logo | Customer Opp Name (the opportunity's name) | quote number. */}
          <div className="mb-8 grid grid-cols-[1fr_auto_1fr] items-start gap-6 border-b border-gray-300 pb-4">
            <div>
              <img src="/techtrus-logo-print.png" alt="Techtrus" className="h-20 w-auto" />
            </div>
            <div className="max-w-sm pt-1 text-center">
              {sourceOpportunity?.name && (
                <p className="text-base font-semibold text-black">{sourceOpportunity.name}</p>
              )}
            </div>
            <div className="text-right">
              <h1 className="text-2xl font-semibold text-black">Quote {quoteNumber}</h1>
              <p className="mt-1 text-sm text-gray-600">{QUOTE_STATUS_LABELS[form.status]}</p>
            </div>
          </div>

          {/* Who it's for on the left, dates on the right. */}
          <div className="mb-6 flex justify-between gap-8 text-sm text-black">
            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Client</p>
                <p>{accountName(form.client_id)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">End client</p>
                <p>{accountName(form.end_client_id)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Customer Opp #</p>
                <p>{sourceOpportunity?.customer_opportunity_number || '—'}</p>
              </div>
            </div>
            <div className="space-y-3 text-right">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Quote date</p>
                <p>{printDate(form.quote_date)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Start date</p>
                <p>{printDate(form.start_date)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">End date</p>
                <p>{printDate(form.end_date)}</p>
              </div>
            </div>
          </div>

          {lines.length > 0 && (
            <table className="mb-6 w-full border-collapse text-sm text-black">
              <thead>
                <tr className="border-b-2 border-gray-400 text-left text-xs uppercase tracking-wide text-gray-600">
                  <th className="py-2 pr-2">Line type</th>
                  <th className="py-2 pr-2">Part code</th>
                  <th className="py-2 pr-2">Description</th>
                  {showDescription2 && <th className="py-2 pr-2">Description 2</th>}
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
                    {showDescription2 && <td className="py-1.5 pr-2">{line.description_2}</td>}
                    <td className="py-1.5 pr-2">{line.vendor}</td>
                    <td className="py-1.5 pr-2 text-right">{line.qty}</td>
                    <td className="py-1.5 pr-2 text-right">{printMoney(line.unit_cost).slice(1)}</td>
                    <td className="py-1.5 pl-2 text-right">{printMoney(lineTotal(line)).slice(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="mb-8 ml-auto w-64 text-sm text-black">
            <div className="flex justify-between py-1">
              <span className="text-gray-600">Value</span>
              <span>{printMoney(form.value)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-600">VAT</span>
              <span>{printMoney(form.vat)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-300 py-1 font-semibold">
              <span>Total</span>
              <span>{printMoney(form.total)}</span>
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
              <Select value={form.client_id} onChange={(e) => handleClientChange(e.target.value)}>
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
                    {rateCard.is_default ? '' : ' (* = custom price, others from Default)'} — you can change a line's rate
                    or add expenses after adding it.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {builderResult && (
                  <span
                    className={`text-xs ${builderResult.profit < 0 ? 'text-danger' : 'text-text-muted'}`}
                    title="From the price builder's workings (internal)."
                  >
                    Profit {builderResult.profit < 0 ? '−' : ''}£
                    {Math.abs(builderResult.profit).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    {builderResult.marginPercent !== null && ` (${builderResult.marginPercent}%)`}
                  </span>
                )}
                <Button type="button" variant="secondary" onClick={openPriceBuilder}>
                  Price builder
                </Button>
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
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-sunken text-left text-xs font-mono-label text-text-dim">
                      <th className="px-2 py-2">Line type</th>
                      <th className="px-2 py-2">Part code</th>
                      <th className="px-2 py-2">Description</th>
                      {showDescription2 && <th className="px-2 py-2">Description 2</th>}
                      <th className="px-2 py-2 text-right">Qty</th>
                      <th className="px-2 py-2 text-right" title="From the rate card, or typed in.">
                        Rate (£)
                      </th>
                      <th className="px-2 py-2 text-right" title="Expenses per unit added on top of the rate (travel, subsistence). Not shown separately to the customer; no rebate on it.">
                        + Expenses (£)
                      </th>
                      <th className="px-2 py-2 text-right" title="Rate + expenses: the unit price printed on the quote.">
                        = Price (£)
                      </th>
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
                        {showDescription2 && (
                          <td className="px-2 py-1.5">
                            <input
                              value={line.description_2}
                              onChange={(e) => updateLine(line.key, { description_2: e.target.value })}
                              className="w-full min-w-[8rem] rounded border border-border bg-sunken px-2 py-1 text-sm text-text focus:border-accent focus:outline-none"
                            />
                          </td>
                        )}
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            step="0.5"
                            value={line.qty}
                            onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                            className="w-20 rounded border border-border bg-sunken px-2 py-1 text-right text-sm text-text focus:border-accent focus:outline-none"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            step="0.01"
                            aria-label="Rate"
                            value={line.rate}
                            onChange={(e) =>
                              updateLine(line.key, {
                                rate: e.target.value,
                                unit_cost: priceFrom(e.target.value, line.expenses_included),
                              })
                            }
                            className="w-24 rounded border border-border bg-sunken px-2 py-1 text-right text-sm text-text focus:border-accent focus:outline-none"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            aria-label="Expenses per unit"
                            placeholder="—"
                            value={line.expenses_included}
                            onChange={(e) =>
                              updateLine(line.key, {
                                expenses_included: e.target.value,
                                unit_cost: priceFrom(line.rate, e.target.value),
                              })
                            }
                            className="w-24 rounded border border-border bg-sunken px-2 py-1 text-right text-sm text-text focus:border-accent focus:outline-none"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium text-text">
                          {(Number(line.unit_cost) || 0).toFixed(2)}
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
                      <td colSpan={showDescription2 ? 8 : 7} className="px-2 py-2 text-right text-xs font-mono-label text-text-dim">
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
            {/* Rebate and Net value are still worked out and stored behind the scenes, but no longer shown — see Reports → Rebate. */}
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
      <HistoryCard table="quotes" recordId={id} />

      {builderOpen && priceBuilder && (
        <PriceBuilder
          value={priceBuilder}
          onChange={setPriceBuilder}
          pricedItems={pricedItems}
          rebateRate={builderRebateRate}
          rebateEligible={builderEligible}
          existingLineCount={lines.length}
          onFill={fillFromPriceBuilder}
          onClose={() => setBuilderOpen(false)}
        />
      )}
    </div>
  )
}
