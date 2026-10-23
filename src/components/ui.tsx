import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import type { SortDirection } from '../lib/useSort'

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    primary: 'bg-accent text-accent-contrast hover:bg-accent-strong',
    secondary: 'bg-transparent text-text border border-border-strong hover:border-accent hover:text-accent',
    danger: 'bg-danger text-text hover:bg-danger-strong',
  }
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-md border border-border bg-sunken px-3 py-2 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none ${props.className ?? ''}`}
    />
  )
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-md border border-border bg-sunken px-3 py-2 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none ${props.className ?? ''}`}
    />
  )
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-md border border-border bg-sunken px-3 py-2 text-sm text-text focus:border-accent focus:outline-none ${props.className ?? ''}`}
    />
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-faint"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="9" cy="9" r="6" />
        <path d="M18 18l-4.35-4.35" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-border bg-sunken py-2 pl-9 pr-3 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-faint hover:text-text"
        >
          ✕
        </button>
      )}
    </div>
  )
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-mono-label text-text-dim">{children}</label>
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="eyebrow">{children}</span>
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-surface p-5 shadow-[0_1px_0_0_rgba(0,0,0,0.3)] ${className}`}>
      {children}
    </div>
  )
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-surface-raised text-text-muted border-border-strong',
  submitted: 'bg-warning/10 text-warning border-warning/40',
  approved: 'bg-accent/10 text-accent border-accent/40',
  rejected: 'bg-danger/10 text-danger border-danger/40',
  expired: 'bg-text-faint/10 text-text-faint border-border-strong',
}

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-mono-label uppercase tracking-wide ${STATUS_STYLES[status] ?? STATUS_STYLES.draft}`}
    >
      {label}
    </span>
  )
}

/**
 * A table header cell. Pass `sortKey` + `onSort` to make it clickable —
 * otherwise it renders as a plain <th> (used for action columns etc).
 */
export function Th({
  children,
  sortKey,
  activeSortKey,
  direction,
  onSort,
  className = '',
  align = 'left',
}: {
  children: ReactNode
  sortKey?: string
  activeSortKey?: string | null
  direction?: SortDirection
  onSort?: (key: string) => void
  className?: string
  align?: 'left' | 'right'
}) {
  if (!sortKey || !onSort) {
    return <th className={`px-4 py-2 ${className}`}>{children}</th>
  }
  const active = activeSortKey === sortKey
  return (
    <th className={`px-4 py-2 ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`flex items-center gap-1 text-xs font-mono-label text-text-muted hover:text-text ${
          align === 'right' ? 'ml-auto flex-row-reverse' : ''
        }`}
      >
        <span>{children}</span>
        <span className={active ? 'text-accent' : 'text-text-faint'}>
          {active ? (direction === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </button>
    </th>
  )
}

/**
 * A filter control for one column, rendered as its own <th> in a filter row
 * placed right under the header row (same column count/order keeps a plain
 * <table> auto-aligned). Pass `options` for a <select> (enum-style columns
 * like status/stage); omit it for a free-text "contains" input.
 */
export function FilterCell({
  value,
  onChange,
  options,
  placeholder = 'Filter…',
}: {
  value: string
  onChange: (value: string) => void
  options?: { value: string; label: string }[]
  placeholder?: string
}) {
  const fieldClass =
    'w-full rounded border border-border bg-sunken px-2 py-1 text-xs font-normal text-text placeholder:text-text-faint focus:border-accent focus:outline-none'
  return (
    <th className="px-4 pb-2 pt-0 font-normal">
      {options ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass}>
          <option value="">All</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={fieldClass}
        />
      )}
    </th>
  )
}

export function FilterSummary({ count, onClear }: { count: number; onClear: () => void }) {
  if (count === 0) return null
  return (
    <button
      type="button"
      onClick={onClear}
      className="mb-4 text-xs font-mono-label text-text-muted hover:text-accent"
    >
      {count} column {count === 1 ? 'filter' : 'filters'} active · Clear
    </button>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p className="text-sm text-danger">{children}</p>
}

export function StatTile({
  value,
  label,
  accent = false,
}: {
  value: ReactNode
  label: string
  accent?: boolean
}) {
  return (
    <div className="rounded-lg border border-border bg-sunken px-4 py-3">
      <p className={`font-display text-2xl font-semibold ${accent ? 'text-accent' : 'text-text'}`}>{value}</p>
      <p className="mt-0.5 text-xs font-mono-label text-text-dim">{label}</p>
    </div>
  )
}

export function DottedRule({ className = '' }: { className?: string }) {
  return <div className={`dotted-rule ${className}`} />
}
