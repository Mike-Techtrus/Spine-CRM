import { useEffect, type ReactNode } from 'react'
import type { PricedLineItem } from '../lib/api'
import { round2 } from '../lib/money'
import {
  EXPENSE_SUGGESTIONS,
  calculatePriceBuilder,
  expenseCost,
  resourceDays,
  type PBExpense,
  type PBResource,
  type PriceBuilderResult,
  type PriceBuilderState,
} from '../lib/priceBuilder'
import { Button, Select, Textarea } from './ui'

// Pop-out on the quote page: work out profit and expenses, then fill the
// quote lines. The sums are in lib/priceBuilder.ts; the workings are saved
// with the quote (quotes.price_builder) when the quote is saved.

function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `pb-${Date.now()}-${Math.random()}`
}

function money(v: number): string {
  return `£${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function blankResource(): PBResource {
  return {
    key: newKey(),
    part_code: '',
    line_item_id: '',
    line_type: 'Outsource Resource',
    description: '',
    people: '1',
    days: '',
    sell_rate: '',
    cost_rate: '',
  }
}

function blankExpense(): PBExpense {
  return { key: newKey(), item: '', qty: '1', times: '1', unit_cost: '', spread: 'all' }
}

const cell =
  'rounded border border-border bg-sunken px-2 py-1 text-sm text-text focus:border-accent focus:outline-none'
const num = `${cell} w-20 text-right`

export default function PriceBuilder({
  value,
  onChange,
  pricedItems,
  rebateRate,
  rebateEligible,
  existingLineCount,
  onFill,
  onClose,
}: {
  value: PriceBuilderState
  onChange: (next: PriceBuilderState) => void
  pricedItems: PricedLineItem[]
  rebateRate: number // fraction, e.g. 0.075
  rebateEligible: (lineType: string) => boolean
  existingLineCount: number
  onFill: (result: PriceBuilderResult, replace: boolean) => void
  onClose: () => void
}) {
  const s = value
  const result = calculatePriceBuilder(s, rebateRate, rebateEligible)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const setResource = (key: string, patch: Partial<PBResource>) =>
    onChange({ ...s, resources: s.resources.map((r) => (r.key === key ? { ...r, ...patch } : r)) })
  const setExpense = (key: string, patch: Partial<PBExpense>) =>
    onChange({ ...s, expenses: s.expenses.map((e) => (e.key === key ? { ...e, ...patch } : e)) })

  function addRoleFromRateCard(itemId: string) {
    const item = pricedItems.find((i) => i.id === itemId)
    if (!item) return
    onChange({
      ...s,
      resources: [
        ...s.resources,
        {
          ...blankResource(),
          part_code: item.part_code,
          line_item_id: item.id,
          line_type: item.line_type,
          description: item.description ?? '',
          sell_rate: item.unit_cost?.toString() ?? '',
          cost_rate: item.standard_cost?.toString() ?? '',
        },
      ],
    })
  }

  // Typing a role that's on the rate card picks up its price and line type.
  function changeRole(r: PBResource, partCode: string) {
    const item = pricedItems.find((i) => i.part_code.toLowerCase() === partCode.trim().toLowerCase())
    if (item && item.id !== r.line_item_id) {
      setResource(r.key, {
        part_code: partCode,
        line_item_id: item.id,
        line_type: item.line_type,
        description: r.description || (item.description ?? ''),
        sell_rate: item.unit_cost?.toString() ?? r.sell_rate,
        cost_rate: r.cost_rate || (item.standard_cost?.toString() ?? ''),
      })
    } else {
      setResource(r.key, { part_code: partCode, ...(item ? {} : { line_item_id: '' }) })
    }
  }

  function removeResource(key: string) {
    onChange({
      ...s,
      resources: s.resources.filter((r) => r.key !== key),
      expenses: s.expenses.map((e) => (e.spread === key ? { ...e, spread: 'all' } : e)),
    })
  }

  const markup = 1 + (Number(s.markup_percent) || 0) / 100
  const missingCost = s.resources.some((r) => resourceDays(r) > 0 && !(Number(r.cost_rate) > 0))
  const canFill = result.resources.some((r) => r.days > 0) || result.expensesOnQuote > 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-2 py-6 sm:px-4 print:hidden">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Price builder"
        className="w-full max-w-6xl rounded-lg border border-border bg-surface p-4 shadow-xl sm:p-6"
      >
        <div className="mb-1 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-text">Price builder</h2>
          <button type="button" onClick={onClose} className="text-xs font-mono-label text-text-muted hover:text-text">
            Close
          </button>
        </div>
        <p className="mb-5 text-xs text-text-muted">
          Work out the profit and expenses, then fill the quote lines. Cost rates, expenses and profit are for us only —
          they're saved with the quote when you save it, and never printed.
        </p>

        {/* ── Roles ─────────────────────────────────────────── */}
        <Section
          title="Roles and days"
          actions={
            <>
              <div className="w-56">
              <Select
                aria-label="Add role from rate card"
                value=""
                onChange={(e) => addRoleFromRateCard(e.target.value)}
                className="py-1.5"
                disabled={pricedItems.length === 0}
              >
                <option value="">Add role from rate card…</option>
                {pricedItems.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.part_code} — {i.unit_cost === null ? 'no price' : `£${Number(i.unit_cost).toFixed(2)}`}
                  </option>
                ))}
              </Select>
              </div>
              <Button
                type="button"
                variant="secondary"
                className="py-1.5"
                onClick={() => onChange({ ...s, resources: [...s.resources, blankResource()] })}
              >
                + Blank role
              </Button>
            </>
          }
        >
          {s.resources.length === 0 ? (
            <Empty>No roles yet — add the engineers, team leads and PMs this job needs.</Empty>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-sunken text-left text-xs font-mono-label text-text-dim">
                    <th className="px-2 py-2">Role</th>
                    <th className="px-2 py-2 text-right">People</th>
                    <th className="px-2 py-2 text-right">Days each</th>
                    <th className="px-2 py-2 text-right">Total days</th>
                    <th className="px-2 py-2 text-right" title="Day rate we charge, before expenses (rate card or typed).">
                      Sell / day
                    </th>
                    <th
                      className="px-2 py-2 text-right"
                      title="What the person costs us per day. Starts at the role's standard contractor cost (Admin → Rate cards)."
                    >
                      Cost / day
                    </th>
                    <th className="px-2 py-2 text-right" title="Sell − rebate − cost, per day, labour only.">
                      Margin / day
                    </th>
                    {s.mode === 'bundle' && (
                      <>
                        <th className="px-2 py-2 text-right">+ Expenses / day</th>
                        <th className="px-2 py-2 text-right">= Price / day</th>
                      </>
                    )}
                    <th className="px-2 py-2 text-right">Sell total</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {s.resources.map((r, i) => {
                    const res = result.resources[i]
                    const sell = Number(r.sell_rate) || 0
                    const marginDay = sell - (rebateEligible(r.line_type) ? sell * rebateRate : 0) - (Number(r.cost_rate) || 0)
                    return (
                      <tr key={r.key} className="border-b border-border last:border-0">
                        <td className="px-2 py-1.5">
                          <input
                            list="price-builder-roles"
                            value={r.part_code}
                            placeholder="e.g. L2 Engineer"
                            onChange={(e) => changeRole(r, e.target.value)}
                            className={`${cell} w-full min-w-[9rem]`}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input type="number" min="0" step="1" aria-label="People" value={r.people} onChange={(e) => setResource(r.key, { people: e.target.value })} className={`${num} w-16`} />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input type="number" min="0" step="0.5" aria-label="Days each" value={r.days} onChange={(e) => setResource(r.key, { days: e.target.value })} className={num} />
                        </td>
                        <td className="px-2 py-1.5 text-right text-text-muted">{res.days}</td>
                        <td className="px-2 py-1.5 text-right">
                          <input type="number" min="0" step="0.01" aria-label="Sell per day" value={r.sell_rate} onChange={(e) => setResource(r.key, { sell_rate: e.target.value })} className={`${num} w-24`} />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input type="number" min="0" step="0.01" aria-label="Cost per day" placeholder="—" value={r.cost_rate} onChange={(e) => setResource(r.key, { cost_rate: e.target.value })} className={`${num} w-24`} />
                        </td>
                        <td className={`px-2 py-1.5 text-right ${marginDay < 0 ? 'text-danger' : 'text-text-muted'}`}>
                          {Number(r.cost_rate) > 0 ? money(round2(marginDay)) : '—'}
                        </td>
                        {s.mode === 'bundle' && (
                          <>
                            <td className="px-2 py-1.5 text-right text-text-muted">{res.expensesPerDay ? money(res.expensesPerDay) : '—'}</td>
                            <td className="px-2 py-1.5 text-right font-medium text-text">{money(res.price)}</td>
                          </>
                        )}
                        <td className="px-2 py-1.5 text-right text-text-muted">{money(round2(res.days * res.price))}</td>
                        <td className="px-2 py-1.5 text-right">
                          <button type="button" onClick={() => removeResource(r.key)} aria-label="Remove role" className="text-text-faint hover:text-danger">
                            ✕
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <datalist id="price-builder-roles">
            {pricedItems.map((i) => (
              <option key={i.id} value={i.part_code} />
            ))}
          </datalist>
        </Section>

        {/* ── Expenses ──────────────────────────────────────── */}
        <Section
          title="Expenses and logistics"
          actions={
            <Button
              type="button"
              variant="secondary"
              className="py-1.5"
              onClick={() => onChange({ ...s, expenses: [...s.expenses, blankExpense()] })}
            >
              + Add expense
            </Button>
          }
        >
          {s.expenses.length === 0 ? (
            <Empty>No expenses — add hotels, mileage, parking, couriers and so on, at what they cost us.</Empty>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-sunken text-left text-xs font-mono-label text-text-dim">
                    <th className="px-2 py-2">Item</th>
                    <th className="px-2 py-2 text-right" title="How many: people, cars, rooms…">Qty</th>
                    <th className="px-2 py-2 text-right" title="How many times: nights, days, trips, miles…">× Times</th>
                    <th className="px-2 py-2 text-right" title="What one costs us.">× £ each</th>
                    <th className="px-2 py-2 text-right">= Cost</th>
                    <th className="px-2 py-2 text-right">We charge</th>
                    {s.mode === 'bundle' && <th className="px-2 py-2">Spread over</th>}
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {s.expenses.map((e) => (
                    <tr key={e.key} className="border-b border-border last:border-0">
                      <td className="px-2 py-1.5">
                        <input list="price-builder-expenses" value={e.item} placeholder="e.g. Hotel" onChange={(ev) => setExpense(e.key, { item: ev.target.value })} className={`${cell} w-full min-w-[9rem]`} />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <input type="number" min="0" step="1" aria-label="Quantity" value={e.qty} onChange={(ev) => setExpense(e.key, { qty: ev.target.value })} className={`${num} w-16`} />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <input type="number" min="0" step="1" aria-label="Times" value={e.times} onChange={(ev) => setExpense(e.key, { times: ev.target.value })} className={num} />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <input type="number" min="0" step="0.01" aria-label="Cost each" value={e.unit_cost} onChange={(ev) => setExpense(e.key, { unit_cost: ev.target.value })} className={`${num} w-24`} />
                      </td>
                      <td className="px-2 py-1.5 text-right text-text-muted">{money(round2(expenseCost(e)))}</td>
                      <td className="px-2 py-1.5 text-right text-text">{money(round2(expenseCost(e) * markup))}</td>
                      {s.mode === 'bundle' && (
                        <td className="px-2 py-1.5">
                          <select value={e.spread} onChange={(ev) => setExpense(e.key, { spread: ev.target.value })} className={`${cell} w-full min-w-[9rem]`}>
                            <option value="all">All roles (per day)</option>
                            {s.resources.map((r) => (
                              <option key={r.key} value={r.key}>
                                {r.part_code || 'Unnamed role'} only
                              </option>
                            ))}
                          </select>
                        </td>
                      )}
                      <td className="px-2 py-1.5 text-right">
                        <button type="button" onClick={() => onChange({ ...s, expenses: s.expenses.filter((x) => x.key !== e.key) })} aria-label="Remove expense" className="text-text-faint hover:text-danger">
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <datalist id="price-builder-expenses">
            {EXPENSE_SUGGESTIONS.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>

          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <label className="flex items-center gap-2 text-text-muted">
              Markup on expenses
              <input type="number" min="0" step="1" value={s.markup_percent} onChange={(e) => onChange({ ...s, markup_percent: e.target.value })} className={`${num} w-16`} />
              %
            </label>
            <fieldset className="flex flex-wrap items-center gap-4">
              <legend className="sr-only">How to charge expenses</legend>
              <label className="flex items-center gap-2 text-text">
                <input type="radio" name="pb-mode" checked={s.mode === 'bundle'} onChange={() => onChange({ ...s, mode: 'bundle' })} className="accent-[var(--color-accent)]" />
                Bundle into the day rates
              </label>
              <label className="flex items-center gap-2 text-text">
                <input type="radio" name="pb-mode" checked={s.mode === 'separate'} onChange={() => onChange({ ...s, mode: 'separate' })} className="accent-[var(--color-accent)]" />
                Separate Expenses line
              </label>
            </fieldset>
          </div>
        </Section>

        {/* ── Summary ───────────────────────────────────────── */}
        <Section title="Profit">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Tile label="Quote value (ex VAT)" value={money(result.quoteValue)} sub={`${result.totalDays} days`} />
            <Tile label="Labour" value={money(result.labourSell)} sub={`cost ${money(result.labourCost)}`} />
            <Tile label="Expenses charged" value={money(result.expensesOnQuote)} sub={`cost ${money(result.expensesCost)}`} />
            <Tile label={`Rebate (${round2(rebateRate * 100)}%)`} value={money(result.rebate)} sub="labour only" />
            <Tile label="Total cost" value={money(result.totalCost)} sub="people + expenses" />
            <Tile
              label="Profit"
              value={money(result.profit)}
              sub={result.marginPercent === null ? '—' : `${result.marginPercent}% of value`}
              tone={result.profit < 0 ? 'bad' : 'good'}
            />
          </div>
          <ul className="mt-3 space-y-1 text-xs text-text-muted">
            {missingCost && <li className="text-warning">Some roles have no cost per day, so profit is overstated.</li>}
            {result.unspread > 0 && (
              <li className="text-warning">
                {money(result.unspread)} of expenses is set to spread over a role with no days — it'll go on a separate
                Expenses line.
              </li>
            )}
            {s.mode === 'bundle' && result.roundingDifference !== 0 && (
              <li>
                Expenses per day are rounded to the penny, so the quote carries {money(Math.abs(result.roundingDifference))}{' '}
                {result.roundingDifference > 0 ? 'more' : 'less'} than the exact expenses.
              </li>
            )}
          </ul>
        </Section>

        <div className="mb-5">
          <label className="mb-1 block text-xs font-mono-label text-text-dim">Notes (internal)</label>
          <Textarea rows={2} value={s.notes} placeholder="Assumptions, where the costs came from…" onChange={(e) => onChange({ ...s, notes: e.target.value })} />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
          <p className="mr-auto text-xs text-text-faint">
            {existingLineCount > 0
              ? `The quote has ${existingLineCount} line${existingLineCount === 1 ? '' : 's'} already.`
              : 'Fills the quote lines — you can still edit them afterwards.'}
          </p>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          {existingLineCount > 0 && (
            <Button type="button" variant="secondary" disabled={!canFill} onClick={() => onFill(result, false)}>
              Add to quote lines
            </Button>
          )}
          <Button type="button" disabled={!canFill} onClick={() => onFill(result, true)}>
            {existingLineCount > 0 ? 'Replace quote lines' : 'Fill quote lines'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
        <h3 className="text-xs font-mono-label uppercase tracking-wide text-text-dim">{title}</h3>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-text-muted">{children}</p>
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${tone === 'bad' ? 'border-danger/60' : tone === 'good' ? 'border-accent/50' : 'border-border'}`}>
      <div className="text-[11px] font-mono-label text-text-dim">{label}</div>
      <div className={`text-base font-semibold ${tone === 'bad' ? 'text-danger' : 'text-text'}`}>{value}</div>
      {sub && <div className="text-[11px] text-text-faint">{sub}</div>}
    </div>
  )
}
