import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  listAccounts,
  listInvoiceLinesFor,
  listInvoices,
  listLineTypes,
  listPaymentDates,
  listQuoteLinesFor,
} from '../../../lib/api'
import { INVOICE_STATUS_LABELS, type Account, type InvoiceStatus, type InvoiceWithRelations, type LineType } from '../../../lib/types'
import { round2 } from '../../../lib/money'
import { rebateRow, rebateTotals, type NoLinesRule, type RebateConditions, type RebateRow, type ReportLine } from '../../../lib/rebateReport'
import { downloadXlsx } from '../../../lib/xlsx'
import { Button, Card, ErrorText, Input, Label, Select, StatTile } from '../../../components/ui'
import PrintDocument, { printWithTitle } from '../../../components/PrintDocument'
import ReportTabs from './ReportTabs'
import { RebateReportGuide } from '../../../components/guides'

// Reports → Rebate: the rebate due on invoices, worked out fresh from their
// lines under the conditions chosen here (lib/rebateReport.ts). The stored
// Rebate / Net value on records isn't used or changed.

const STATUSES: InvoiceStatus[] = ['draft', 'sent', 'paid', 'cancelled']

const NO_LINES_OPTIONS: { value: NoLinesRule; label: string }[] = [
  { value: 'quote_share', label: 'Use the mix of lines on their quote' },
  { value: 'whole_value', label: 'Count their whole value' },
  { value: 'exclude', label: 'Leave them out' },
]

const BASIS_LABELS: Record<RebateRow['basis'], string> = {
  lines: 'Invoice lines',
  quote_share: 'Quote mix',
  whole_value: 'Whole value',
  excluded: 'Left out',
}

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Calendar periods for the quick-pick buttons.
function periods() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const q = Math.floor(m / 3)
  return [
    { label: 'This month', from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) },
    { label: 'Last month', from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) },
    { label: 'This quarter', from: iso(new Date(y, q * 3, 1)), to: iso(new Date(y, q * 3 + 3, 0)) },
    { label: 'Last quarter', from: iso(new Date(y, q * 3 - 3, 1)), to: iso(new Date(y, q * 3, 0)) },
    { label: 'This year', from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) },
    { label: 'Last year', from: iso(new Date(y - 1, 0, 1)), to: iso(new Date(y - 1, 11, 31)) },
  ]
}

function money(n: number) {
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function shortDate(d: string | null) {
  return d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC' }) : '—'
}

interface Result {
  invoice: InvoiceWithRelations
  row: RebateRow
  paidOn: string | null
}

// CDW's rebate quarters go by when the payment was received (credit note CN78).
type DateBasis = 'payment' | 'invoice'

export default function RebateReport() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [lineTypes, setLineTypes] = useState<LineType[]>([])
  const [invoices, setInvoices] = useState<InvoiceWithRelations[] | null>(null)
  const [paidOn, setPaidOn] = useState<Map<string, string>>(new Map())
  const [error, setError] = useState<string | null>(null)

  // Conditions
  const lastQuarter = periods()[3]
  const [dateBasis, setDateBasis] = useState<DateBasis>('payment')
  const [clientId, setClientId] = useState('')
  const [endClientId, setEndClientId] = useState('')
  const [from, setFrom] = useState(lastQuarter.from)
  const [to, setTo] = useState(lastQuarter.to)
  const [statuses, setStatuses] = useState<InvoiceStatus[]>(['sent', 'paid'])
  const [eligibleTypes, setEligibleTypes] = useState<string[]>([])
  const [includeOther, setIncludeOther] = useState(true)
  const [excludeBundled, setExcludeBundled] = useState(true)
  const [noLines, setNoLines] = useState<NoLinesRule>('quote_share')
  const [ratePercent, setRatePercent] = useState('7.5')

  // Results
  const [results, setResults] = useState<Result[] | null>(null)
  const [running, setRunning] = useState(false)
  const [ranWith, setRanWith] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const [acc, types, inv, paid] = await Promise.all([listAccounts(), listLineTypes(), listInvoices(), listPaymentDates()])
        setPaidOn(paid)
        setAccounts(acc)
        setLineTypes(types)
        setInvoices(inv)
        setEligibleTypes(types.filter((t) => t.rebate_eligible).map((t) => t.name))
        // Start on the first client with an agreed rebate (CDW), at its rate.
        const withRebate = acc.find((a) => Number(a.rebate_rate) > 0)
        if (withRebate) {
          setClientId(withRebate.id)
          setRatePercent(String(Number(withRebate.rebate_rate)))
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load.')
      }
    })()
  }, [])

  function pickClient(id: string) {
    setClientId(id)
    const rate = Number(accounts.find((a) => a.id === id)?.rebate_rate ?? 0)
    if (rate > 0) setRatePercent(String(rate))
  }

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? ''
  const paidWithoutDate = useMemo(
    () =>
      (invoices ?? []).filter(
        (i) =>
          i.status === 'paid' &&
          !paidOn.has(i.id) &&
          (!clientId || i.client_id === clientId) &&
          (!endClientId || i.end_client_id === endClientId) &&
          (i.invoice_date ?? '') >= '2026-01-01',
      ).length,
    [invoices, paidOn, clientId, endClientId],
  )
  const usedAsEndClient = useMemo(() => {
    const ids = new Set((invoices ?? []).filter((i) => !clientId || i.client_id === clientId).map((i) => i.end_client_id))
    return accounts.filter((a) => ids.has(a.id))
  }, [invoices, accounts, clientId])

  async function run() {
    if (!invoices) return
    setRunning(true)
    setError(null)
    try {
      // Payment basis: invoices whose payment was received in the period (any status).
      // Invoice basis: invoice date in the period, with the chosen statuses.
      const dateOf = (i: InvoiceWithRelations) => (dateBasis === 'payment' ? (paidOn.get(i.id) ?? null) : i.invoice_date)
      const chosen = invoices.filter((i) => {
        const d = dateOf(i)
        return (
          (!clientId || i.client_id === clientId) &&
          (!endClientId || i.end_client_id === endClientId) &&
          (dateBasis === 'payment' || statuses.includes(i.status)) &&
          d !== null &&
          d >= from &&
          d <= to
        )
      })
      const invoiceLines = await listInvoiceLinesFor(chosen.map((i) => i.id))
      const linesByInvoice = new Map<string, ReportLine[]>()
      for (const l of invoiceLines) {
        const list = linesByInvoice.get(l.invoice_id) ?? []
        list.push({
          line_type: l.line_type,
          amount: round2(Number(l.qty) * Number(l.unit_price)),
          expenses: round2(Number(l.qty) * Number(l.expenses_included ?? 0)),
        })
        linesByInvoice.set(l.invoice_id, list)
      }
      const quoteIds = [...new Set(chosen.filter((i) => !linesByInvoice.has(i.id) && i.quote_id).map((i) => i.quote_id!))]
      const quoteLines = noLines === 'quote_share' ? await listQuoteLinesFor(quoteIds) : []
      const linesByQuote = new Map<string, ReportLine[]>()
      for (const l of quoteLines) {
        const list = linesByQuote.get(l.quote_id) ?? []
        list.push({
          line_type: l.line_type,
          amount: Number(l.line_total ?? Number(l.qty ?? 0) * Number(l.unit_cost ?? 0)),
          expenses: Number(l.qty ?? 0) * Number(l.expenses_included ?? 0),
        })
        linesByQuote.set(l.quote_id, list)
      }

      const conditions: RebateConditions = {
        eligibleTypes,
        knownTypes: lineTypes.map((t) => t.name),
        includeOther,
        excludeBundled,
        noLines,
        rate: (Number(ratePercent) || 0) / 100,
      }
      setResults(
        chosen
          .map((invoice) => ({
            invoice,
            paidOn: paidOn.get(invoice.id) ?? null,
            row: rebateRow(
              {
                id: invoice.id,
                value: Number(invoice.value ?? 0),
                lines: linesByInvoice.get(invoice.id) ?? [],
                quoteLines: invoice.quote_id ? (linesByQuote.get(invoice.quote_id) ?? []) : [],
              },
              conditions,
            ),
          }))
          .sort((a, b) => a.invoice.invoice_number.localeCompare(b.invoice.invoice_number)),
      )
      setRanWith(describeConditions())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run the report.')
    } finally {
      setRunning(false)
    }
  }

  function describeConditions() {
    const parts = [
      clientId ? accountName(clientId) : 'All clients',
      endClientId ? `end client ${accountName(endClientId)}` : null,
      `${dateBasis === 'payment' ? 'payment received' : 'invoice dates'} ${shortDate(from)} – ${shortDate(to)}`,
      dateBasis === 'invoice' ? `status ${statuses.map((s) => INVOICE_STATUS_LABELS[s]).join('/')}` : null,
      `${ratePercent}% on ${[...eligibleTypes, ...(includeOther ? ['no/other line type'] : [])].join(', ') || 'nothing'}`,
      `invoices without lines: ${NO_LINES_OPTIONS.find((o) => o.value === noLines)?.label.toLowerCase()}`,
      excludeBundled ? 'bundled expenses left out' : 'bundled expenses included',
    ]
    return parts.filter(Boolean).join(' · ')
  }

  const totals = results ? rebateTotals(results.map((r) => r.row)) : null

  const byMonth = useMemo(() => {
    const map = new Map<string, { value: number; eligible: number; rebate: number; count: number }>()
    for (const r of results ?? []) {
      if (r.row.basis === 'excluded') continue
      const k = ((dateBasis === 'payment' ? r.paidOn : r.invoice.invoice_date) ?? '').slice(0, 7)
      const m = map.get(k) ?? { value: 0, eligible: 0, rebate: 0, count: 0 }
      m.value += r.row.value
      m.eligible += r.row.eligible
      m.rebate += r.row.rebate
      m.count += 1
      map.set(k, m)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [results, dateBasis])

  function exportExcel() {
    if (!results) return
    downloadXlsx(
      `Rebate report ${from} to ${to}`,
      'Rebate',
      ['Invoice', 'Invoice date', 'Payment received', 'Client', 'End client', 'Sales order', 'Status', 'Value ex VAT', 'Bundled expenses left out', 'Earns rebate', 'Worked out from', 'Rebate'],
      results.map(({ invoice: i, row, paidOn: paid }) => [
        i.invoice_number,
        i.invoice_date,
        paid,
        i.client?.name ?? '',
        i.end_client?.name ?? '',
        i.sales_order?.reference ?? '',
        INVOICE_STATUS_LABELS[i.status],
        row.value,
        row.expensesExcluded,
        row.eligible,
        BASIS_LABELS[row.basis] + (row.share !== null ? ` (${Math.round(row.share * 100)}%)` : ''),
        row.rebate,
      ]),
    )
  }

  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item])

  return (
    <div>
      <div className="print:hidden">
        <h1 className="mb-4 text-xl font-semibold text-text">Reports</h1>
        <ReportTabs />
        <RebateReportGuide />
        <ErrorText>{error}</ErrorText>

        <Card className="mb-6">
          <h2 className="mb-4 text-sm font-semibold text-text">Conditions</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Label>Client</Label>
              <Select value={clientId} onChange={(e) => pickClient(e.target.value)}>
                <option value="">All clients</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {Number(a.rebate_rate) > 0 ? ` (${Number(a.rebate_rate)}% agreed)` : ''}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>End client (optional)</Label>
              <Select value={endClientId} onChange={(e) => setEndClientId(e.target.value)}>
                <option value="">Any</option>
                {usedAsEndClient.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Rebate rate (%)</Label>
              <Input type="number" step="0.01" min="0" max="100" value={ratePercent} onChange={(e) => setRatePercent(e.target.value)} />
            </div>

            <div className="md:col-span-3">
              <div className="mb-1 flex flex-wrap items-center gap-4 text-sm text-text-muted">
                <span className="text-xs font-mono-label text-text-dim">Period is by</span>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="basis" checked={dateBasis === 'payment'} onChange={() => setDateBasis('payment')} />
                  Payment received (how CDW credit notes work)
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="basis" checked={dateBasis === 'invoice'} onChange={() => setDateBasis('invoice')} />
                  Invoice date
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
                <span className="text-text-muted">to</span>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
                {periods().map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setFrom(p.from)
                      setTo(p.to)
                    }}
                    className={`rounded border px-2 py-1 text-xs ${
                      from === p.from && to === p.to ? 'border-accent text-accent' : 'border-border text-text-muted hover:text-text'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={dateBasis === 'payment' ? 'opacity-50' : ''}>
              <Label>Invoice status{dateBasis === 'payment' ? ' (not used — every paid invoice counts)' : ''}</Label>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-muted">
                {STATUSES.map((s) => (
                  <label key={s} className="flex items-center gap-1.5">
                    <input type="checkbox" checked={statuses.includes(s)} onChange={() => setStatuses(toggle(statuses, s))} />
                    {INVOICE_STATUS_LABELS[s]}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label>Line types that earn rebate</Label>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-muted">
                {lineTypes.map((t) => (
                  <label key={t.id} className="flex items-center gap-1.5">
                    <input type="checkbox" checked={eligibleTypes.includes(t.name)} onChange={() => setEligibleTypes(toggle(eligibleTypes, t.name))} />
                    {t.name}
                  </label>
                ))}
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={includeOther} onChange={(e) => setIncludeOther(e.target.checked)} />
                  No / other line type
                </label>
              </div>
              <label className="mt-2 flex items-center gap-1.5 text-sm text-text-muted">
                <input type="checkbox" checked={excludeBundled} onChange={(e) => setExcludeBundled(e.target.checked)} />
                Leave out expenses bundled into day rates
              </label>
            </div>

            <div>
              <Label>Invoices with no lines (most before 2026)</Label>
              <Select value={noLines} onChange={(e) => setNoLines(e.target.value as NoLinesRule)}>
                {NO_LINES_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="button" onClick={run} disabled={!invoices || running || statuses.length === 0}>
              {running ? 'Working it out…' : 'Run report'}
            </Button>
            {results && results.length > 0 && (
              <>
                <Button type="button" variant="secondary" onClick={exportExcel}>
                  Export to Excel
                </Button>
                <Button type="button" variant="secondary" onClick={() => printWithTitle(`Rebate report ${from} to ${to}`)}>
                  Print / PDF
                </Button>
              </>
            )}
          </div>
          {dateBasis === 'payment' && paidWithoutDate > 0 && (
            <p className="mt-3 text-xs text-warning">
              {paidWithoutDate} invoice{paidWithoutDate === 1 ? ' is' : 's are'} marked Paid (since January 2026) with no payment date
              recorded, so {paidWithoutDate === 1 ? 'it' : 'they'} can&apos;t be placed in a period. Record the payment on the invoice
              (Payments → date received) and {paidWithoutDate === 1 ? 'it' : 'they'}&apos;ll be picked up.
            </p>
          )}
          <p className="mt-3 text-xs text-text-faint">
            Rebate is worked out afresh for each invoice: the rate × the value of its lines whose line type earns rebate.
            Older invoices with no lines of their own can take the same share as their quote&apos;s lines. Amounts are ex
            VAT. Nothing on the invoices themselves is changed.
          </p>
        </Card>

        {results && totals && (
          <>
            <p className="mb-3 text-xs text-text-muted">{ranWith}</p>
            <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatTile label="Invoices" value={totals.invoices.toLocaleString('en-GB')} />
              <StatTile label="Invoiced, ex VAT" value={money(totals.value)} />
              <StatTile
                label={totals.expensesExcluded > 0 ? `Earns rebate (${money(totals.expensesExcluded)} expenses left out)` : 'Earns rebate'}
                value={money(totals.eligible)}
              />
              <StatTile label="Rebate" value={money(totals.rebate)} accent />
            </div>

            {byMonth.length > 1 && (
              <Card className="mb-6">
                <h2 className="mb-3 text-sm font-semibold text-text">By month</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs font-mono-label text-text-muted">
                      <tr>
                        <th className="py-1.5 pr-3">Month</th>
                        <th className="py-1.5 pr-3 text-right">Invoices</th>
                        <th className="py-1.5 pr-3 text-right">Value ex VAT</th>
                        <th className="py-1.5 pr-3 text-right">Earns rebate</th>
                        <th className="py-1.5 text-right">Rebate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byMonth.map(([month, m]) => (
                        <tr key={month} className="border-t border-hair">
                          <td className="py-1.5 pr-3 text-text">
                            {new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
                          </td>
                          <td className="py-1.5 pr-3 text-right text-text-muted">{m.count}</td>
                          <td className="py-1.5 pr-3 text-right text-text-muted">{money(round2(m.value))}</td>
                          <td className="py-1.5 pr-3 text-right text-text-muted">{money(round2(m.eligible))}</td>
                          <td className="py-1.5 text-right text-text">{money(round2(m.rebate))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface-raised text-left text-xs font-mono-label text-text-muted">
                  <tr>
                    <th className="px-3 py-2">Invoice</th>
                    <th className="px-3 py-2">Invoice date</th>
                    <th className="px-3 py-2">Paid</th>
                    <th className="px-3 py-2">Client / end client</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Value ex VAT</th>
                    <th className="px-3 py-2 text-right">Earns rebate</th>
                    <th className="px-3 py-2">From</th>
                    <th className="px-3 py-2 text-right">Rebate</th>
                  </tr>
                </thead>
                <tbody>
                  {results.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-6 text-center text-text-muted">
                        No invoices match these conditions.
                      </td>
                    </tr>
                  ) : (
                    results.map(({ invoice: i, row, paidOn: paid }) => (
                      <tr key={i.id} className={`border-t border-border ${row.basis === 'excluded' ? 'opacity-50' : ''}`}>
                        <td className="whitespace-nowrap px-3 py-2">
                          <Link to={`/staff/invoices/${i.id}`} className="font-mono-label text-accent hover:underline">
                            {i.invoice_number}
                          </Link>
                          {i.sales_order && <span className="block text-xs text-text-faint">{i.sales_order.reference}</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-text-muted">{shortDate(i.invoice_date)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-text-muted">{shortDate(paid)}</td>
                        <td className="px-3 py-2 text-text-muted">
                          {i.client?.name ?? '—'}
                          {i.end_client && <span className="block text-xs text-text-faint">{i.end_client.name}</span>}
                        </td>
                        <td className="px-3 py-2 text-text-muted">{INVOICE_STATUS_LABELS[i.status]}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-text-muted">{money(row.value)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-text-muted">
                          {money(row.eligible)}
                          {row.expensesExcluded > 0 && (
                            <span className="block text-xs text-text-faint">{money(row.expensesExcluded)} expenses out</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-text-faint">
                          {BASIS_LABELS[row.basis]}
                          {row.share !== null && ` (${Math.round(row.share * 100)}%)`}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-text">{money(row.rebate)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {results && totals && (
        <PrintDocument>
          <div className="mb-4 flex items-start justify-between">
            <img src="/techtrus-logo.png" alt="Techtrus" className="h-8 w-auto" />
            <div className="text-right">
              <p className="text-xl font-semibold">Rebate report</p>
              <p>Printed {new Date().toLocaleDateString('en-GB')}</p>
            </div>
          </div>
          <p className="mb-4 text-xs">{ranWith}</p>
          <table className="mb-4 w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-black">
                <th className="py-1 pr-2">Invoice</th>
                <th className="py-1 pr-2">Date</th>
                <th className="py-1 pr-2">Client / end client</th>
                <th className="py-1 pr-2 text-right">Value ex VAT</th>
                <th className="py-1 pr-2 text-right">Earns rebate</th>
                <th className="py-1 text-right">Rebate</th>
              </tr>
            </thead>
            <tbody>
              {results
                .filter((r) => r.row.basis !== 'excluded')
                .map(({ invoice: i, row }) => (
                  <tr key={i.id} className="border-b border-black/20">
                    <td className="py-1 pr-2">{i.invoice_number}</td>
                    <td className="py-1 pr-2">{shortDate(i.invoice_date)}</td>
                    <td className="py-1 pr-2">
                      {i.client?.name ?? '—'}
                      {i.end_client && ` / ${i.end_client.name}`}
                    </td>
                    <td className="py-1 pr-2 text-right">{money(row.value)}</td>
                    <td className="py-1 pr-2 text-right">{money(row.eligible)}</td>
                    <td className="py-1 text-right">{money(row.rebate)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div className="ml-auto w-72 text-sm">
            <div className="flex justify-between py-0.5">
              <span>Invoiced, ex VAT</span>
              <span>{money(totals.value)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span>Earns rebate</span>
              <span>{money(totals.eligible)}</span>
            </div>
            <div className="flex justify-between border-t border-black py-1 font-semibold">
              <span>Rebate ({ratePercent}%)</span>
              <span>{money(totals.rebate)}</span>
            </div>
          </div>
        </PrintDocument>
      )}
    </div>
  )
}
