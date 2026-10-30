import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listAllProjectLines, listAssignmentTimesheets, listProjectAssignments, listProjects } from '../../../lib/api'
import type {
  InvoiceWithRelations,
  OpportunityWithRelations,
  ProjectWithRelations,
  QuoteWithRelations,
  SalesOrderWithRelations,
  TimesheetEntryWithRelations,
} from '../../../lib/types'
import {
  DAY_TYPE_DAYS,
  INVOICING_STATUS_BADGE,
  INVOICING_STATUS_LABELS,
  OPPORTUNITY_STAGE_BADGE,
  OPPORTUNITY_STAGE_LABELS,
  invoicingStatus,
  quoteExpiresOn,
  timesheetProjectLabel,
  type InvoicingStatus,
} from '../../../lib/types'
import { StatusBadge } from '../../../components/ui'
import { BarList, ColumnChart, Meter, Panel, Tile, gbp, gbpCompact, pct } from './charts'
import {
  AGE_BUCKETS,
  expiresWithin,
  invoiceValue,
  isOpenQuote,
  isRaised,
  isoDate,
  monthKey,
  monthlyColumns,
  num,
  ordersToInvoice,
  outstandingInvoices,
  quoteDate,
  quoteValue,
  shortDate,
  topBy,
} from './metrics'

export interface DashboardData {
  opportunities: OpportunityWithRelations[]
  quotes: QuoteWithRelations[]
  salesOrders: SalesOrderWithRelations[]
  invoices: InvoiceWithRelations[]
  timesheets: TimesheetEntryWithRelations[]
  todayIso: string
  yearAgoIso: string
}

const days = (n: number) => `${n % 1 === 0 ? n : n.toFixed(1)} day${n === 1 ? '' : 's'}`
const count = (n: number) => String(n)

// A clickable row in a list panel.
function Row({ onClick, left, right }: { onClick: () => void; left: React.ReactNode; right: React.ReactNode }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-raised focus:bg-surface-raised focus:outline-none"
      >
        <span className="min-w-0 truncate text-text">{left}</span>
        <span className="shrink-0 text-right font-mono-label text-xs text-text-dim">{right}</span>
      </button>
    </li>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-text-muted">{children}</p>
}

// ── Invoices ────────────────────────────────────────────────────────────────

export function InvoicesSection({ data }: { data: DashboardData }) {
  const navigate = useNavigate()
  const raised = data.invoices.filter(isRaised)
  const columns = monthlyColumns(raised, (i) => i.invoice_date, invoiceValue, ['invoice', 'invoices'])
  const outstanding = outstandingInvoices(data.invoices, data.todayIso)
  const overdue = outstanding.filter((o) => o.daysOverdue > 0)
  const total12 = columns.reduce((s, c) => s + c.value, 0)
  const recent = raised.filter((i) => (i.invoice_date ?? '') >= data.yearAgoIso)
  const topClients = topBy(recent, (i) => i.client?.name, invoiceValue)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Panel title="Invoiced per month · Value ex VAT" className="lg:col-span-2">
        <p className="mb-3 text-xs text-text-muted">
          {gbp(total12)} over the last 12 months · average {gbp(total12 / 12)} a month
        </p>
        <ColumnChart title="Invoiced per month, ex VAT" columns={columns} />
      </Panel>

      <Panel
        title="Money owed · total inc VAT"
        action={{ label: 'Invoices', onClick: () => navigate('/staff/invoices') }}
      >
        <BarList
          empty="Nothing outstanding."
          rows={AGE_BUCKETS.map((b) => {
            const inBucket = outstanding.filter((o) => b.test(o.daysOverdue))
            return {
              key: b.key,
              label: b.label,
              value: inBucket.reduce((s, o) => s + o.amount, 0),
              sub: `${inBucket.length} invoice${inBucket.length === 1 ? '' : 's'}`,
              tone: b.key === 'current' ? 'accent' : 'danger',
            }
          })}
        />
      </Panel>

      <Panel title={`Outstanding invoices (${outstanding.length})`} className="lg:col-span-2">
        {outstanding.length === 0 ? (
          <Empty>Nothing outstanding.</Empty>
        ) : (
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Outstanding invoices</caption>
              <thead className="sticky top-0 bg-surface">
                <tr className="text-left font-mono-label text-xs text-text-dim">
                  <th className="px-2 py-1.5 font-normal">Invoice</th>
                  <th className="px-2 py-1.5 font-normal">Client</th>
                  <th className="px-2 py-1.5 font-normal">End client</th>
                  <th className="px-2 py-1.5 text-right font-normal">Value</th>
                  <th className="px-2 py-1.5 text-right font-normal">VAT</th>
                  <th className="px-2 py-1.5 text-right font-normal">Total</th>
                  <th className="px-2 py-1.5 text-right font-normal">Due</th>
                </tr>
              </thead>
              <tbody>
                {outstanding.map((o) => {
                  const open = () => navigate(`/staff/invoices/${o.invoice.id}`)
                  return (
                    <tr
                      key={o.invoice.id}
                      onClick={open}
                      className="cursor-pointer border-t border-hair hover:bg-surface-raised"
                    >
                      <td className="whitespace-nowrap px-2 py-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            open()
                          }}
                          className="text-text hover:underline focus:underline focus:outline-none">
                          {o.invoice.invoice_number}
                        </button>
                      </td>
                      <td className="px-2 py-1.5 text-text">{o.invoice.client?.name || '—'}</td>
                      <td className="px-2 py-1.5 text-text-muted">{o.invoice.end_client?.name || '—'}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono-label text-xs text-text-dim">
                        {gbp(num(o.invoice.value))}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono-label text-xs text-text-dim">
                        {gbp(num(o.invoice.vat))}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono-label text-xs text-text">
                        {gbp(o.amount)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono-label text-xs">
                        {o.daysOverdue > 0 ? (
                          <span className="text-danger">{o.daysOverdue}d overdue</span>
                        ) : (
                          <span className="text-text-dim">{shortDate(o.invoice.due_date)}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {overdue.length > 0 && (
          <p className="mt-3 border-t border-hair pt-3 text-xs text-text-dim">
            {overdue.length} overdue · {gbp(overdue.reduce((s, o) => s + o.amount, 0))}
          </p>
        )}
      </Panel>

      <Panel title="Top clients · last 12 months, ex VAT">
        <BarList
          empty="No invoices in the last 12 months."
          rows={topClients.map((c) => ({
            key: c.name,
            label: c.name,
            value: c.value,
            display: gbpCompact(c.value),
            sub: `${c.count} invoice${c.count === 1 ? '' : 's'}`,
          }))}
        />
      </Panel>
    </div>
  )
}

// ── Sales orders ────────────────────────────────────────────────────────────

export function SalesOrdersSection({ data }: { data: DashboardData }) {
  const navigate = useNavigate()
  const toInvoice = ordersToInvoice(data.salesOrders)
  const byStatus = new Map<InvoicingStatus, number>()
  for (const so of data.salesOrders) {
    const s = invoicingStatus(so).status
    byStatus.set(s, (byStatus.get(s) ?? 0) + 1)
  }
  const statuses: InvoicingStatus[] = ['not_invoiced', 'part_invoiced', 'fully_invoiced', 'over_invoiced', 'closed']
  const noPo = data.salesOrders.filter(
    (so) => so.advanced_without_po && !so.po_number && !so.closed_at && invoicingStatus(so).status !== 'fully_invoiced',
  )

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Panel
        title={`Still to invoice · net (${toInvoice.length} orders)`}
        className="lg:col-span-2"
        action={{ label: 'Sales orders', onClick: () => navigate('/staff/sales-orders') }}
      >
        <BarList
          empty="Every open order is fully invoiced."
          rows={toInvoice.slice(0, 10).map((o) => ({
            key: o.order.id,
            label: (
              <>
                {o.order.end_client?.name || o.order.client?.name || '—'}{' '}
                <span className="text-text-muted">· {o.order.reference}</span>
              </>
            ),
            value: o.balance,
            sub: `${gbp(Number(o.order.invoiced_to_date ?? 0))} of ${gbp(Number(o.order.net_value ?? 0))} invoiced`,
            onClick: () => navigate(`/staff/sales-orders/${o.order.id}`),
          }))}
        />
        {toInvoice.length > 10 && (
          <p className="mt-3 border-t border-hair pt-3 text-xs text-text-dim">
            Top 10 of {toInvoice.length} · {gbp(toInvoice.reduce((s, o) => s + o.balance, 0))} in total
          </p>
        )}
      </Panel>

      <div className="space-y-4">
        <Panel title="Orders by invoicing status">
          <ul className="space-y-2">
            {statuses.map((s) => (
              <li key={s} className="flex items-center justify-between text-sm">
                <StatusBadge status={INVOICING_STATUS_BADGE[s]} label={INVOICING_STATUS_LABELS[s]} />
                <span className="font-mono-label text-text-muted">{byStatus.get(s) ?? 0}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={`Advanced without PO (${noPo.length})`}>
          {noPo.length === 0 ? (
            <Empty>No open orders waiting on a PO.</Empty>
          ) : (
            <ul className="space-y-1">
              {noPo.slice(0, 8).map((so) => (
                <Row
                  key={so.id}
                  onClick={() => navigate(`/staff/sales-orders/${so.id}`)}
                  left={
                    <>
                      {so.reference} <span className="text-text-muted">· {so.client?.name || '—'}</span>
                    </>
                  }
                  right={gbp(Number(so.net_value ?? 0))}
                />
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}

// ── Opportunities ───────────────────────────────────────────────────────────

export function OpportunitiesSection({ data }: { data: DashboardData }) {
  const navigate = useNavigate()
  const recent = data.opportunities.filter((o) => o.created_at.slice(0, 10) >= data.yearAgoIso)
  const stages = ['qualifying', 'quoting', 'closed_won', 'closed_lost'] as const
  const open = data.opportunities
    .filter((o) => o.stage === 'qualifying' || o.stage === 'quoting')
    .sort((a, b) => (a.expected_close_date ?? '9999').localeCompare(b.expected_close_date ?? '9999'))
  // Open value per opportunity = its open quotes, else its own estimate.
  const openQuoteValue = new Map<string, number>()
  for (const q of data.quotes) {
    if (q.opportunity_id && isOpenQuote(q))
      openQuoteValue.set(q.opportunity_id, (openQuoteValue.get(q.opportunity_id) ?? 0) + quoteValue(q))
  }
  const wonByClient = topBy(
    recent.filter((o) => o.stage === 'closed_won'),
    (o) => o.end_client?.name ?? o.client?.name,
    (o) => Number(o.estimated_value ?? 0),
  )
  const newPerMonth = monthlyColumns(
    data.opportunities,
    (o) => o.created_at,
    () => 1,
    ['opportunity', 'opportunities'],
  )

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Panel title="Last 12 months, by stage now">
        <ul className="space-y-2">
          {stages.map((s) => (
            <li key={s} className="flex items-center justify-between text-sm">
              <StatusBadge status={OPPORTUNITY_STAGE_BADGE[s]} label={OPPORTUNITY_STAGE_LABELS[s]} />
              <span className="font-mono-label text-text-muted">{recent.filter((o) => o.stage === s).length}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-hair pt-3 text-xs text-text-dim">
          {recent.length} opportunities raised since {shortDate(data.yearAgoIso)}
        </p>
      </Panel>

      <Panel title="New opportunities per month" className="lg:col-span-2">
        <ColumnChart
          title="New opportunities per month"
          columns={newPerMonth}
          format={count}
          formatAxis={count}
          height={140}
        />
      </Panel>

      <Panel
        title={`Open opportunities (${open.length})`}
        className="lg:col-span-2"
        action={{ label: 'Opportunities', onClick: () => navigate('/staff/opportunities') }}
      >
        {open.length === 0 ? (
          <Empty>No open opportunities.</Empty>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {open.map((o) => {
              const value = openQuoteValue.get(o.id) ?? Number(o.estimated_value ?? 0)
              return (
                <Row
                  key={o.id}
                  onClick={() => navigate(`/staff/opportunities/${o.id}`)}
                  left={
                    <>
                      {o.name} <span className="text-text-muted">· {o.end_client?.name || o.client?.name || '—'}</span>
                    </>
                  }
                  right={
                    <>
                      {OPPORTUNITY_STAGE_LABELS[o.stage]} · {value ? gbp(value) : '—'}
                      {o.expected_close_date && ` · close ${shortDate(o.expected_close_date)}`}
                    </>
                  }
                />
              )
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Won by end client · last 12 months">
        <BarList
          empty="Nothing won in the last 12 months."
          rows={wonByClient.map((c) => ({
            key: c.name,
            label: c.name,
            value: c.value,
            display: gbpCompact(c.value),
            sub: `${c.count} won`,
          }))}
        />
      </Panel>
    </div>
  )
}

// ── Quotes ──────────────────────────────────────────────────────────────────

export function QuotesSection({ data }: { data: DashboardData }) {
  const navigate = useNavigate()
  const columns = monthlyColumns(data.quotes, quoteDate, quoteValue, ['quote', 'quotes'])
  const recent = data.quotes.filter((q) => quoteDate(q) >= data.yearAgoIso)
  const decided = recent.filter((q) => q.status === 'accepted' || q.status === 'declined' || q.status === 'expired')
  const accepted = recent.filter((q) => q.status === 'accepted')
  const acceptedValue = accepted.reduce((s, q) => s + quoteValue(q), 0)
  const decidedValue = decided.reduce((s, q) => s + quoteValue(q), 0)
  const awaiting = data.quotes
    .filter((q) => q.status === 'sent')
    .sort((a, b) => quoteDate(a).localeCompare(quoteDate(b)))
  const expiring = data.quotes.filter((q) => expiresWithin(q, 7))
  const drafts = data.quotes.filter((q) => q.status === 'draft')

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Panel title="Quoted per month · Value ex VAT" className="lg:col-span-2">
        <ColumnChart title="Quoted per month, ex VAT" columns={columns} />
      </Panel>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
        <Tile
          label="Accepted · last 12 months"
          value={decided.length ? pct(accepted.length / decided.length) : '—'}
          sub={`${accepted.length} of ${decided.length} decided quotes`}
        />
        <Tile
          label="Accepted by value"
          value={decidedValue ? pct(acceptedValue / decidedValue) : '—'}
          sub={`${gbpCompact(acceptedValue)} of ${gbpCompact(decidedValue)}`}
        />
        <Tile label="Drafts not sent" value={drafts.length} sub={gbp(drafts.reduce((s, q) => s + quoteValue(q), 0))} />
      </div>

      <Panel
        title={`Awaiting response (${awaiting.length})`}
        className="lg:col-span-2"
        action={{ label: 'Quotes', onClick: () => navigate('/staff/quotes') }}
      >
        {awaiting.length === 0 ? (
          <Empty>No sent quotes waiting on a decision.</Empty>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {awaiting.map((q) => (
              <Row
                key={q.id}
                onClick={() => navigate(`/staff/quotes/${q.id}`)}
                left={
                  <>
                    {q.end_client?.name || q.client?.name || '—'}{' '}
                    <span className="text-text-muted">· {q.quote_number}</span>
                  </>
                }
                right={`${gbp(quoteValue(q))} · sent ${shortDate(quoteDate(q))} · expires ${shortDate(isoDate(quoteExpiresOn(q)))}`}
              />
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={`Expiring in 7 days (${expiring.length})`}>
        {expiring.length === 0 ? (
          <Empty>Nothing about to expire.</Empty>
        ) : (
          <ul className="space-y-1">
            {expiring.map((q) => (
              <Row
                key={q.id}
                onClick={() => navigate(`/staff/quotes/${q.id}`)}
                left={q.quote_number}
                right={`${gbp(quoteValue(q))} · ${shortDate(isoDate(quoteExpiresOn(q)))}`}
              />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

// ── Projects (loaded when the tab is opened) ────────────────────────────────

interface ProjectSummary {
  project: ProjectWithRelations
  allocated: number
  quoted: number
  used: number // submitted + approved days
  uninvoicedDays: number // approved, not on an invoice
  uninvoicedValue: number
}

export function ProjectsSection() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<ProjectSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const [projects, lines, assignments] = await Promise.all([
          listProjects(),
          listAllProjectLines(),
          listProjectAssignments(),
        ])
        const entries = await listAssignmentTimesheets(assignments.map((a) => a.id))
        const lineById = new Map(lines.map((l) => [l.id, l]))
        const assignmentById = new Map(assignments.map((a) => [a.id, a]))
        const summaries = new Map<string, ProjectSummary>(
          projects.map((p) => [
            p.id,
            { project: p, allocated: 0, quoted: 0, used: 0, uninvoicedDays: 0, uninvoicedValue: 0 },
          ]),
        )
        for (const l of lines) {
          const s = summaries.get(l.project_id)
          if (s) s.quoted += Number(l.quoted_days)
        }
        for (const a of assignments) {
          const line = lineById.get(a.project_line_id)
          const s = line && summaries.get(line.project_id)
          if (s) s.allocated += Number(a.allocated_days)
        }
        for (const e of entries) {
          const a = assignmentById.get(e.project_assignment_id)
          const line = a && lineById.get(a.project_line_id)
          const s = line && summaries.get(line.project_id)
          if (!s || !line) continue
          const d = DAY_TYPE_DAYS[e.day_type]
          if (e.status === 'submitted' || e.status === 'approved') s.used += d
          if (e.status === 'approved' && !e.invoice_id) {
            s.uninvoicedDays += d
            s.uninvoicedValue += d * Number(line.day_rate)
          }
        }
        setRows([...summaries.values()].filter((s) => s.project.status === 'active'))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load projects.')
      }
    })()
  }, [])

  if (error) return <p className="text-sm text-danger">{error}</p>
  if (!rows) return <p className="text-sm text-text-muted">Loading projects…</p>

  const ready = rows.filter((r) => r.uninvoicedDays > 0).sort((a, b) => b.uninvoicedValue - a.uninvoicedValue)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Panel
        title={`Active projects (${rows.length}) · days used of quoted`}
        className="lg:col-span-2"
        action={{ label: 'Projects', onClick: () => navigate('/staff/projects') }}
      >
        {rows.length === 0 ? (
          <Empty>No active projects.</Empty>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.project.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/staff/projects/${r.project.id}`)}
                  className="w-full rounded-md px-2 py-1 text-left hover:bg-surface-raised focus:bg-surface-raised focus:outline-none"
                >
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-text">
                      {r.project.name}{' '}
                      <span className="text-text-muted">
                        · {r.project.reference} ·{' '}
                        {r.project.sales_order.end_client?.name || r.project.sales_order.client?.name || '—'}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono-label text-xs text-text-muted">
                      {days(r.used)} of {days(r.quoted)}
                      {r.quoted > 0 && ` · ${pct(r.used / r.quoted)}`}
                    </span>
                  </div>
                  <div className="mt-1">
                    <Meter value={r.used} max={r.quoted} label={`${r.project.reference} days used`} />
                  </div>
                  <p className="mt-0.5 text-xs text-text-faint">
                    {days(r.allocated)} allocated · owner {r.project.owner?.full_name || '—'}
                    {r.quoted > 0 && r.used > r.quoted && <span className="text-danger"> · over quoted days</span>}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Ready to invoice · approved days">
        <BarList
          empty="No approved days waiting to be invoiced."
          rows={ready.map((r) => ({
            key: r.project.id,
            label: (
              <>
                {r.project.reference} <span className="text-text-muted">· {r.project.name}</span>
              </>
            ),
            value: r.uninvoicedValue,
            sub: `${days(r.uninvoicedDays)} at the quoted rate, ex VAT`,
            onClick: () => navigate(`/staff/projects/${r.project.id}`),
          }))}
        />
      </Panel>
    </div>
  )
}

// ── Timesheets ──────────────────────────────────────────────────────────────

export function TimesheetsSection({ data }: { data: DashboardData }) {
  const navigate = useNavigate()
  const toApprove = data.timesheets
    .filter((t) => t.status === 'submitted')
    .sort((a, b) => a.work_date.localeCompare(b.work_date))
  const thisMonth = monthKey(new Date())
  const logged = data.timesheets.filter((t) => t.work_date.startsWith(thisMonth) && t.status !== 'rejected')
  const byPerson = topBy(
    logged,
    (t) => t.field_engineer.name,
    (t) => DAY_TYPE_DAYS[t.day_type],
    20,
  )
  const perMonth = monthlyColumns(
    data.timesheets.filter((t) => t.status === 'approved'),
    (t) => t.work_date,
    (t) => DAY_TYPE_DAYS[t.day_type],
    ['entry', 'entries'],
  )

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Panel
        title={`To approve (${toApprove.length})`}
        className="lg:col-span-2"
        action={{ label: 'Timesheets', onClick: () => navigate('/staff/timesheets') }}
      >
        {toApprove.length === 0 ? (
          <Empty>Nothing waiting on approval.</Empty>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {toApprove.map((t) => (
              <Row
                key={t.id}
                onClick={() => navigate(`/staff/timesheets/${t.id}`)}
                left={
                  <>
                    {t.field_engineer.name}{' '}
                    <span className="text-text-muted">· {timesheetProjectLabel(t) ?? t.client.name}</span>
                  </>
                }
                right={`${shortDate(t.work_date)} · ${days(DAY_TYPE_DAYS[t.day_type])}`}
              />
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Days logged this month">
        <BarList
          empty="No days logged this month yet."
          format={days}
          rows={byPerson.map((p) => ({ key: p.name, label: p.name, value: p.value }))}
        />
      </Panel>

      <Panel title="Approved days per month" className="lg:col-span-3">
        <ColumnChart title="Approved days per month" columns={perMonth} format={days} formatAxis={count} height={120} />
      </Panel>
    </div>
  )
}
