import { useEffect, useRef, useState } from 'react'
import { listAllTimesheets, listInvoices, listOpportunities, listQuotes, listSalesOrders } from '../../lib/api'
import { Eyebrow } from '../../components/ui'
import { Tile, gbp, gbpCompact, pct } from './dashboard/charts'
import {
  expiresWithin,
  invoiceValue,
  isOpenQuote,
  isRaised,
  isoDate,
  monthKey,
  ordersToInvoice,
  outstandingInvoices,
  quoteValue,
  winRate,
} from './dashboard/metrics'
import {
  InvoicesSection,
  OpportunitiesSection,
  ProjectsSection,
  QuotesSection,
  SalesOrdersSection,
  TimesheetsSection,
  type DashboardData,
} from './dashboard/sections'

const SECTIONS = [
  { key: 'invoices', label: 'Invoices' },
  { key: 'sales_orders', label: 'Sales Orders' },
  { key: 'opportunities', label: 'Opportunities' },
  { key: 'quotes', label: 'Quotes' },
  { key: 'projects', label: 'Projects' },
  { key: 'timesheets', label: 'Timesheets' },
] as const
type SectionKey = (typeof SECTIONS)[number]['key']

const SECTION_STORAGE_KEY = 'spine.dashboard.section'

function savedSection(): SectionKey {
  try {
    const v = localStorage.getItem(SECTION_STORAGE_KEY)
    if (SECTIONS.some((s) => s.key === v)) return v as SectionKey
  } catch {
    // storage blocked — fall back to the default
  }
  return 'invoices'
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [section, setSection] = useState<SectionKey>(savedSection)
  const sectionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const [opportunities, quotes, salesOrders, invoices, timesheets] = await Promise.all([
          listOpportunities(),
          listQuotes(),
          listSalesOrders(),
          listInvoices(),
          listAllTimesheets(),
        ])
        const today = new Date()
        const yearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())
        setData({
          opportunities,
          quotes,
          salesOrders,
          invoices,
          timesheets,
          todayIso: isoDate(today),
          yearAgoIso: isoDate(yearAgo),
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard.')
      }
    })()
  }, [])

  function choose(key: SectionKey, scroll = false) {
    setSection(key)
    try {
      localStorage.setItem(SECTION_STORAGE_KEY, key)
    } catch {
      // not remembered — fine
    }
    if (scroll) sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div>
      <Eyebrow>// overview</Eyebrow>
      <h1 className="font-display mt-1 mb-6 text-2xl font-semibold text-text">Dashboard</h1>

      {error && <p className="text-sm text-danger">{error}</p>}
      {!data && !error && <p className="text-sm text-text-muted">Loading…</p>}

      {data && (
        <>
          <Banner data={data} onPick={(k) => choose(k, true)} />

          <div ref={sectionRef} className="mt-8 scroll-mt-4">
            <div
              role="tablist"
              aria-label="Dashboard section"
              className="mb-4 flex flex-wrap gap-1 rounded-lg border border-border bg-sunken p-1"
            >
              {SECTIONS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  role="tab"
                  aria-selected={section === s.key}
                  onClick={() => choose(s.key)}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    section === s.key
                      ? 'bg-surface-raised font-semibold text-text shadow-sm'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {section === 'invoices' && <InvoicesSection data={data} />}
            {section === 'sales_orders' && <SalesOrdersSection data={data} />}
            {section === 'opportunities' && <OpportunitiesSection data={data} />}
            {section === 'quotes' && <QuotesSection data={data} />}
            {section === 'projects' && <ProjectsSection />}
            {section === 'timesheets' && <TimesheetsSection data={data} />}
          </div>
        </>
      )}
    </div>
  )
}

// The headline numbers. Each tile opens the section that explains it.
function Banner({ data, onPick }: { data: DashboardData; onPick: (k: SectionKey) => void }) {
  const today = new Date()
  const thisMonth = monthKey(today)
  const lastMonth = monthKey(new Date(today.getFullYear(), today.getMonth() - 1, 1))
  const thisYear = String(today.getFullYear())

  const raised = data.invoices.filter(isRaised)
  const sumFor = (prefix: string) =>
    raised.filter((i) => (i.invoice_date ?? '').startsWith(prefix)).reduce((s, i) => s + invoiceValue(i), 0)
  const invoicedThisMonth = sumFor(thisMonth)
  const invoicedLastMonth = sumFor(lastMonth)
  const invoicedThisYear = sumFor(thisYear)

  const outstanding = outstandingInvoices(data.invoices, data.todayIso)
  const outstandingTotal = outstanding.reduce((s, o) => s + o.amount, 0)
  const overdue = outstanding.filter((o) => o.daysOverdue > 0)

  const toInvoice = ordersToInvoice(data.salesOrders)
  const toInvoiceTotal = toInvoice.reduce((s, o) => s + o.balance, 0)

  const openQuotes = data.quotes.filter(isOpenQuote)
  const pipeline = openQuotes.reduce((s, q) => s + quoteValue(q), 0)
  const quotingOpps = data.opportunities.filter((o) => o.stage === 'quoting').length

  const win = winRate(data.opportunities, data.yearAgoIso)
  const toApprove = data.timesheets.filter((t) => t.status === 'submitted').length
  const expiring = data.quotes.filter((q) => expiresWithin(q, 7)).length

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile
        label="Invoiced this month · ex VAT"
        value={gbp(invoicedThisMonth)}
        sub={`Last month ${gbp(invoicedLastMonth)}`}
        tone="accent"
        onClick={() => onPick('invoices')}
      />
      <Tile
        label={`Invoiced in ${thisYear} · ex VAT`}
        value={gbpCompact(invoicedThisYear)}
        sub={gbp(invoicedThisYear)}
        onClick={() => onPick('invoices')}
      />
      <Tile
        label="Owed to us · inc VAT"
        value={gbpCompact(outstandingTotal)}
        sub={
          <>
            {outstanding.length} invoices
            {overdue.length > 0 && (
              <span className="text-danger">
                {' '}
                · {overdue.length} overdue ({gbpCompact(overdue.reduce((s, o) => s + o.amount, 0))})
              </span>
            )}
          </>
        }
        onClick={() => onPick('invoices')}
      />
      <Tile
        label="Still to invoice · net"
        value={gbpCompact(toInvoiceTotal)}
        sub={`${toInvoice.length} open sales orders`}
        onClick={() => onPick('sales_orders')}
      />
      <Tile
        label="Open quotes · ex VAT"
        value={gbpCompact(pipeline)}
        sub={`${openQuotes.length} quotes · ${quotingOpps} opportunities quoting`}
        onClick={() => onPick('quotes')}
      />
      <Tile
        label="Win rate · last 12 months"
        value={win.rate === null ? '—' : pct(win.rate)}
        sub={`${win.won} won · ${win.lost} lost`}
        onClick={() => onPick('opportunities')}
      />
      <Tile
        label="Timesheets to approve"
        value={toApprove}
        sub={toApprove === 0 ? 'All clear' : 'Waiting on approval'}
        tone={toApprove > 0 ? 'accent' : 'normal'}
        onClick={() => onPick('timesheets')}
      />
      <Tile
        label="Quotes expiring in 7 days"
        value={expiring}
        sub={expiring === 0 ? 'Nothing to chase' : 'Worth chasing'}
        tone={expiring > 0 ? 'accent' : 'normal'}
        onClick={() => onPick('quotes')}
      />
    </div>
  )
}
