import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { dismissDataChecks, listDataChecks, updateSalesOrder, type DataCheckRow } from '../../../lib/api'
import { Card, ErrorText } from '../../../components/ui'
import AdminTabs from './AdminTabs'
import { DataChecksGuide } from '../../../components/guides'

// Admin → Data checks (migration 0045): records that look wrong or stuck,
// grouped by check, each with what to do about it. Fixing the record makes it
// drop off; anything that's actually fine can be dismissed with a reason.

const CHECKS: Record<string, { title: string; fix: string; canClose?: boolean }> = {
  so_over_invoiced: {
    title: 'Sales orders invoiced for more than they’re worth',
    fix: 'Check the order’s Total/PO value is right (it may have been changed or extended), or whether an invoice is linked to the wrong order. If the extra was agreed, close the order or dismiss.',
  },
  so_no_value: {
    title: 'Sales orders with no value',
    fix: 'The quote has a value but the order has no Total or PO value, so it can’t show what’s left to invoice. Fill in the PO value / totals on the order.',
  },
  so_not_invoiced_old: {
    title: 'Sales orders open over a year with nothing invoiced',
    fix: 'If the work never happened or was billed elsewhere, close the order with a reason.',
    canClose: true,
  },
  so_part_invoiced_stalled: {
    title: 'Part-invoiced sales orders with no invoice for 12 months',
    fix: 'If the rest won’t be invoiced, close the order (e.g. "Finished under budget"). Otherwise raise the next invoice.',
    canClose: true,
  },
  so_no_quote: { title: 'Sales orders not linked to a quote', fix: 'Link the order to its quote, or dismiss if there wasn’t one.' },
  inv_no_sales_order: {
    title: 'Invoices not linked to a sales order',
    fix: 'Link each to its sales order so invoiced-to-date is right. Very old ones (2018–19) may predate sales orders — dismiss those.',
  },
  inv_no_value: { title: 'Invoices with no value', fix: 'Add the lines or value, or cancel the invoice if it was raised by mistake.' },
  inv_overdue_90: {
    title: 'Invoices more than 90 days overdue',
    fix: 'Chase the payment — or, if it has been paid, record the payment so the invoice shows Paid.',
  },
  inv_client_mismatch: {
    title: 'Invoices whose client doesn’t match their sales order',
    fix: 'Set the invoice’s client to match the order (or link it to the right order).',
  },
  quote_accepted_no_so: {
    title: 'Accepted quotes with no sales order',
    fix: 'Create the sales order from the quote, or change the quote’s status if it didn’t go ahead.',
  },
  quote_no_value: { title: 'Quotes with no value', fix: 'Add lines or a value, or decline/delete the quote if it isn’t real.' },
}

const PATHS: Record<DataCheckRow['record_type'], string> = {
  sales_order: '/staff/sales-orders',
  invoice: '/staff/invoices',
  quote: '/staff/quotes',
}

function money(n: number) {
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function DataChecks() {
  const [rows, setRows] = useState<DataCheckRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function refresh() {
    setRows(await listDataChecks())
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load.'))
  }, [])

  const groups = useMemo(() => {
    const byKey = new Map<string, DataCheckRow[]>()
    for (const r of rows ?? []) byKey.set(r.check_key, [...(byKey.get(r.check_key) ?? []), r])
    return Object.keys(CHECKS)
      .map((key) => ({ key, rows: byKey.get(key) ?? [] }))
      .filter((g) => g.rows.length > 0)
  }, [rows])

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  function dismiss(checkKey: string, list: DataCheckRow[]) {
    const what = list.length === 1 ? (list[0].reference ?? 'this record') : `all ${list.length} in this list`
    const reason = window.prompt(`Why is ${what} fine? (shown in the record of dismissals)`, '')
    if (!reason?.trim()) return
    run(() => dismissDataChecks(checkKey, list.map((r) => r.record_id), reason.trim()))
  }

  function closeOrders(list: DataCheckRow[]) {
    const what = list.length === 1 ? (list[0].reference ?? 'this order') : `all ${list.length} orders in this list`
    const reason = window.prompt(`Close ${what}? Reason (shown on the order):`, 'Closed in data clean-up')
    if (reason === null) return
    run(async () => {
      for (const r of list) await updateSalesOrder(r.record_id, { closed_at: new Date().toISOString(), closed_reason: reason.trim() || null })
    })
  }

  const total = rows?.length ?? 0

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-text">Admin · Data checks</h1>
      <AdminTabs />
      <DataChecksGuide />

      <p className="mb-4 text-sm text-text-muted">
        Records that look wrong or stuck. Fix the record and it drops off this list; if something&apos;s actually fine,
        dismiss it with a reason. {rows && (total === 0 ? 'Nothing to look at — all clear.' : `${total} to look at.`)}
      </p>

      <ErrorText>{error}</ErrorText>
      {!rows && !error && <p className="text-sm text-text-muted">Loading…</p>}

      <div className="space-y-3">
        {groups.map((g) => {
          const info = CHECKS[g.key]
          const sum = g.rows.reduce((s, r) => s + (r.amount ? Number(r.amount) : 0), 0)
          const isOpen = open === g.key
          return (
            <Card key={g.key}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : g.key)}
                aria-expanded={isOpen}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <span>
                  <span className="text-sm font-semibold text-text">{info.title}</span>
                  <span className="mt-0.5 block text-xs text-text-muted">{info.fix}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono-label text-sm text-text">{g.rows.length}</span>
                  {sum > 0 && <span className="block text-xs text-text-faint">{money(sum)}</span>}
                </span>
              </button>

              {isOpen && (
                <div className="mt-4">
                  <div className="mb-3 flex flex-wrap gap-3 text-xs">
                    {info.canClose && (
                      <button type="button" disabled={busy} onClick={() => closeOrders(g.rows)} className="text-accent hover:underline">
                        Close all {g.rows.length} orders…
                      </button>
                    )}
                    <button type="button" disabled={busy} onClick={() => dismiss(g.key, g.rows)} className="text-text-muted hover:text-text">
                      Dismiss all {g.rows.length}…
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-surface-raised text-left text-xs font-mono-label text-text-muted">
                        <tr>
                          <th className="px-3 py-2">Record</th>
                          <th className="px-3 py-2">What&apos;s wrong</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((r) => (
                          <tr key={r.record_id} className="border-t border-border">
                            <td className="whitespace-nowrap px-3 py-2">
                              <Link to={`${PATHS[r.record_type]}/${r.record_id}`} className="font-mono-label text-accent hover:underline">
                                {r.reference ?? 'Open'}
                              </Link>
                            </td>
                            <td className="px-3 py-2 text-text-muted">{r.detail}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right text-text">{r.amount != null ? money(Number(r.amount)) : '—'}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-text-faint">
                              {r.since ? new Date(`${r.since}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC' }) : '—'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right text-xs">
                              {info.canClose && (
                                <button type="button" disabled={busy} onClick={() => closeOrders([r])} className="mr-3 text-accent hover:underline">
                                  Close
                                </button>
                              )}
                              <button type="button" disabled={busy} onClick={() => dismiss(g.key, [r])} className="text-text-muted hover:text-text">
                                Dismiss
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
