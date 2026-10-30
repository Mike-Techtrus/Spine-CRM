import { useState, type ReactNode } from 'react'

// Small, dependency-free chart pieces for the Dashboard. Single-series only
// (the Techtrus green); red is kept for status (overdue) and always comes
// with a text label. Every value shown on hover is also in a table view.

// ── Formatting ───────────────────────────────────────────────────────────────

export function gbp(n: number) {
  return `£${Math.round(n).toLocaleString('en-GB')}`
}

// £950 / £12.4K / £892K / £1.2M — for axes, tiles and tight spaces.
export function gbpCompact(n: number) {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `£${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`
  if (a >= 10_000) return `£${Math.round(n / 1000)}K`
  if (a >= 1000) return `£${(n / 1000).toFixed(1)}K`
  return `£${Math.round(n)}`
}

export function pct(n: number) {
  return `${Math.round(n * 100)}%`
}

// ── Stat tile ────────────────────────────────────────────────────────────────

export function Tile({
  label,
  value,
  sub,
  tone = 'normal',
  onClick,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: 'normal' | 'accent' | 'danger'
  onClick?: () => void
}) {
  const valueClass = tone === 'accent' ? 'text-accent' : tone === 'danger' ? 'text-danger' : 'text-text'
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`rounded-lg border border-border bg-sunken px-4 py-3 text-left ${
        onClick ? 'transition-colors hover:border-accent/60 focus:border-accent focus:outline-none' : ''
      }`}
    >
      <p className="text-xs font-mono-label text-text-dim">{label}</p>
      <p className={`font-display mt-1 text-2xl font-semibold ${valueClass}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-text-muted">{sub}</p>}
    </Tag>
  )
}

// ── Column chart (e.g. value per month) ──────────────────────────────────────

export interface Column {
  label: string // short axis label, e.g. "Oct"
  fullLabel: string // tooltip/table label, e.g. "October 2026"
  value: number
  detail?: string // extra tooltip line, e.g. "4 invoices"
}

export function ColumnChart({
  columns,
  format = gbp,
  formatAxis = gbpCompact,
  height = 160,
  title,
}: {
  columns: Column[]
  format?: (n: number) => string
  formatAxis?: (n: number) => string
  height?: number
  title: string // used for the table view and screen readers
}) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(...columns.map((c) => c.value), 0)
  // Round the top of the scale to a clean number.
  const step = max > 0 ? 10 ** Math.floor(Math.log10(max)) : 1
  const top = max > 0 ? [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * step >= max)! * step : 1
  const lastIndex = columns.length - 1
  const peakIndex = columns.reduce((best, c, i) => (c.value > columns[best].value ? i : best), 0)

  return (
    <div>
      <div className="relative mt-4" style={{ height }}>
        {/* recessive grid: top + middle + baseline */}
        {[1, 0.5].map((f) => (
          <div key={f} className="absolute inset-x-0 border-t border-hair" style={{ bottom: `${f * 100}%` }}>
            <span className="absolute -top-2 left-0 bg-surface pr-1 text-[10px] font-mono-label text-text-faint">
              {formatAxis(top * f)}
            </span>
          </div>
        ))}
        <div className="absolute inset-x-0 bottom-0 border-t border-border" />

        <div className="absolute inset-0 flex items-end gap-[2px] pl-10">
          {columns.map((c, i) => {
            const h = top ? (c.value / top) * 100 : 0
            const showLabel = (i === lastIndex || i === peakIndex) && c.value > 0
            return (
              <button
                key={c.fullLabel}
                type="button"
                aria-label={`${c.fullLabel}: ${format(c.value)}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="group relative flex h-full flex-1 items-end justify-center focus:outline-none"
              >
                {showLabel && hover === null && (
                  <span
                    className="absolute text-[10px] font-mono-label text-text-muted"
                    style={{ bottom: `calc(${h}% + 4px)` }}
                  >
                    {formatAxis(c.value)}
                  </span>
                )}
                <span
                  className={`w-full max-w-6 rounded-t bg-accent transition-opacity ${
                    hover !== null && hover !== i ? 'opacity-40' : ''
                  } group-focus-visible:ring-2 group-focus-visible:ring-text`}
                  style={{ height: `${Math.max(h, c.value > 0 ? 1 : 0)}%` }}
                />
                {hover === i && (
                  <span className="pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-md border border-border-strong bg-surface-raised px-2 py-1 text-left shadow-lg">
                    <span className="block text-sm font-semibold text-text">{format(c.value)}</span>
                    <span className="block text-xs text-text-muted">{c.fullLabel}</span>
                    {c.detail && <span className="block text-xs text-text-faint">{c.detail}</span>}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
      <div className="mt-1 flex gap-[2px] pl-10">
        {columns.map((c) => (
          <span key={c.fullLabel} className="flex-1 text-center text-[10px] font-mono-label text-text-faint">
            {c.label}
          </span>
        ))}
      </div>
      <TableView
        title={title}
        headers={['', 'Value']}
        rows={columns.map((c) => [c.fullLabel + (c.detail ? ` (${c.detail})` : ''), format(c.value)])}
      />
    </div>
  )
}

// ── Horizontal bar list (ranked / bucketed values) ───────────────────────────

export interface BarRow {
  key: string
  label: ReactNode
  value: number
  display?: string // value text at the bar tip (defaults to format(value))
  sub?: ReactNode
  onClick?: () => void
  tone?: 'accent' | 'danger'
}

export function BarList({
  rows,
  format = gbp,
  empty,
}: {
  rows: BarRow[]
  format?: (n: number) => string
  empty?: string
}) {
  const max = Math.max(...rows.map((r) => r.value), 0)
  if (rows.length === 0) return <p className="text-sm text-text-muted">{empty ?? 'Nothing to show.'}</p>
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const Inner = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-text">{r.label}</span>
              <span className="shrink-0 font-mono-label text-xs text-text-muted">{r.display ?? format(r.value)}</span>
            </div>
            {r.sub && <div className="text-xs text-text-faint">{r.sub}</div>}
            <div className="mt-1 h-1.5 w-full rounded-full bg-sunken">
              <div
                className={`h-full rounded-full ${r.tone === 'danger' ? 'bg-danger' : 'bg-accent'}`}
                style={{ width: max ? `${(r.value / max) * 100}%` : 0 }}
              />
            </div>
          </>
        )
        return (
          <li key={r.key}>
            {r.onClick ? (
              <button
                type="button"
                onClick={r.onClick}
                className="w-full rounded-md px-2 py-1 text-left hover:bg-surface-raised focus:bg-surface-raised focus:outline-none"
              >
                {Inner}
              </button>
            ) : (
              <div className="px-2 py-1">{Inner}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// ── Progress meter ───────────────────────────────────────────────────────────

export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const ratio = max > 0 ? value / max : 0
  const tone = ratio > 1 ? 'bg-danger' : ratio >= 0.9 ? 'bg-warning' : 'bg-accent'
  return (
    <div
      className="h-1.5 w-full rounded-full bg-sunken"
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemax={max}
    >
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
    </div>
  )
}

// ── Table view (keeps chart values reachable without hovering) ───────────────

export function TableView({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer font-mono-label text-text-faint hover:text-text-muted">Show as table</summary>
      <table className="mt-2 w-full">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr className="text-left text-text-dim">
            {headers.map((h) => (
              <th key={h} className="py-1 pr-2 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-hair">
              {r.map((cell, j) => (
                <td key={j} className={`py-1 pr-2 ${j > 0 ? 'text-right text-text-muted' : 'text-text-soft'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

// ── Card with a heading and optional "view all" link ─────────────────────────

export function Panel({
  title,
  action,
  children,
  className = '',
}: {
  title: string
  action?: { label: string; onClick: () => void }
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-lg border border-border bg-surface p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-sm font-semibold text-text">{title}</h2>
        {action && (
          <button type="button" onClick={action.onClick} className="text-xs text-accent hover:underline">
            {action.label} →
          </button>
        )}
      </div>
      {children}
    </section>
  )
}
