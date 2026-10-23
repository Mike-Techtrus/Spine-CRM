import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listAllTimesheets, listInvoices, listOpportunities, listQuotes } from '../../lib/api'
import type {
  InvoiceWithRelations,
  OpportunityWithRelations,
  QuoteWithRelations,
  TimesheetEntryWithRelations,
} from '../../lib/types'
import { quoteExpiresOn } from '../../lib/types'
import { Card, Eyebrow, StatTile } from '../../components/ui'

function gbp(n: number) {
  return `£${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [openOpportunities, setOpenOpportunities] = useState<OpportunityWithRelations[]>([])
  const [quotesAwaiting, setQuotesAwaiting] = useState(0)
  const [pendingTimesheets, setPendingTimesheets] = useState<TimesheetEntryWithRelations[]>([])
  const [outstandingInvoices, setOutstandingInvoices] = useState<InvoiceWithRelations[]>([])
  const [expiredQuotes, setExpiredQuotes] = useState<QuoteWithRelations[]>([])
  const [quotesExpiringSoon, setQuotesExpiringSoon] = useState(0)

  useEffect(() => {
    ;(async () => {
      try {
        const [opportunities, quotes, timesheets, invoices] = await Promise.all([
          listOpportunities(),
          listQuotes(),
          listAllTimesheets({ status: 'submitted' }),
          listInvoices(),
        ])
        setOpenOpportunities(opportunities.filter((o) => o.is_active))
        setQuotesAwaiting(quotes.filter((q) => q.status === 'sent').length)
        setPendingTimesheets(timesheets)
        setOutstandingInvoices(invoices.filter((inv) => inv.status === 'sent'))
        setExpiredQuotes(quotes.filter((q) => q.status === 'expired'))

        // Quotes still awaiting a decision whose 30-day validity window
        // runs out within the next 7 days — a nudge to chase them up
        // before they auto-expire. The server flips the stored status to
        // "expired" once a day, so this is a forward-looking count, not
        // the live/current status.
        const now = new Date()
        const in7Days = new Date(now)
        in7Days.setDate(in7Days.getDate() + 7)
        setQuotesExpiringSoon(
          quotes.filter((q) => {
            if (q.status !== 'draft' && q.status !== 'sent') return false
            const expiresOn = quoteExpiresOn(q)
            return expiresOn >= now && expiresOn <= in7Days
          }).length,
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const openOppValue = openOpportunities.reduce((sum, o) => sum + Number(o.estimated_value || 0), 0)
  const outstandingValue = outstandingInvoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0)

  return (
    <div>
      <Eyebrow>// overview</Eyebrow>
      <h1 className="font-display mt-1 mb-6 text-2xl font-semibold text-text">Dashboard</h1>

      {error && <p className="text-sm text-danger">{error}</p>}
      {loading && <p className="text-sm text-text-muted">Loading…</p>}

      {!loading && !error && (
        <>
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile value={openOpportunities.length} label="open opportunities" accent />
            <StatTile value={gbp(openOppValue)} label="pipeline value" />
            <StatTile value={quotesAwaiting} label="quotes awaiting response" />
            <StatTile value={pendingTimesheets.length} label="timesheets to approve" accent={pendingTimesheets.length > 0} />
            <StatTile value={quotesExpiringSoon} label="quotes expiring in 7 days" accent={quotesExpiringSoon > 0} />
            <StatTile value={expiredQuotes.length} label="expired quotes" />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-text">Timesheets to approve</h2>
                <button
                  onClick={() => navigate('/staff/timesheets')}
                  className="text-xs text-accent hover:underline"
                >
                  View all →
                </button>
              </div>
              {pendingTimesheets.length === 0 && (
                <p className="text-sm text-text-muted">Nothing waiting on you right now.</p>
              )}
              <ul className="space-y-2">
                {pendingTimesheets.slice(0, 6).map((ts) => (
                  <li
                    key={ts.id}
                    className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-surface-raised"
                    onClick={() => navigate(`/staff/timesheets/${ts.id}`)}
                  >
                    <span className="text-text">
                      {ts.field_engineer.name} <span className="text-text-muted">· {ts.client.name}</span>
                    </span>
                    <span className="font-mono-label text-xs text-text-dim">{ts.work_date}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-text">Outstanding invoices</h2>
                <button
                  onClick={() => navigate('/staff/invoices')}
                  className="text-xs text-accent hover:underline"
                >
                  View all →
                </button>
              </div>
              {outstandingInvoices.length === 0 && (
                <p className="text-sm text-text-muted">Nothing outstanding right now.</p>
              )}
              <ul className="space-y-2">
                {outstandingInvoices.slice(0, 6).map((inv) => (
                  <li
                    key={inv.id}
                    className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-surface-raised"
                    onClick={() => navigate(`/staff/invoices/${inv.id}`)}
                  >
                    <span className="text-text">
                      {inv.client?.name || '—'} <span className="text-text-muted">· {inv.invoice_number}</span>
                    </span>
                    <span className="font-mono-label text-xs text-text-dim">
                      {inv.total ? gbp(Number(inv.total)) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
              {outstandingInvoices.length > 0 && (
                <p className="mt-3 border-t border-hair pt-3 text-xs text-text-dim">
                  {gbp(outstandingValue)} total outstanding
                </p>
              )}
            </Card>

            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-text">Expired quotes</h2>
                <button
                  onClick={() => navigate('/staff/quotes')}
                  className="text-xs text-accent hover:underline"
                >
                  View all →
                </button>
              </div>
              {expiredQuotes.length === 0 && <p className="text-sm text-text-muted">No expired quotes.</p>}
              <ul className="space-y-2">
                {expiredQuotes.slice(0, 6).map((q) => (
                  <li
                    key={q.id}
                    className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-surface-raised"
                    onClick={() => navigate(`/staff/quotes/${q.id}`)}
                  >
                    <span className="text-text">
                      {q.client?.name || '—'} <span className="text-text-muted">· {q.quote_number}</span>
                    </span>
                    <span className="font-mono-label text-xs text-text-dim">
                      {q.net_value ? gbp(Number(q.net_value)) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
