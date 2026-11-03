import { useState, type ReactNode } from 'react'
import { Card } from './ui'

function storageKey(id: string) {
  return `spine.guide.${id}.open`
}

// Remember per browser whether someone opened or closed this guide.
function initialOpen(id: string, defaultOpen: boolean) {
  try {
    const saved = localStorage.getItem(storageKey(id))
    return saved === null ? defaultOpen : saved === 'true'
  } catch {
    return defaultOpen
  }
}

export function GuideStep({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
        {n}
      </span>
      <div>
        <p className="font-medium text-text">{title}</p>
        <div className="mt-0.5 text-text-muted">{children}</div>
      </div>
    </li>
  )
}

/** Numbered steps; children are GuideStep elements. */
export function GuideSteps({ children }: { children: ReactNode }) {
  return <ol className="space-y-4">{children}</ol>
}

/** A short "Good to know" list under the steps. */
export function GuideTips({ title = 'Good to know', children }: { title?: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 font-medium text-text">{title}</p>
      <ul className="list-disc space-y-1 pl-5 text-text-muted">{children}</ul>
    </div>
  )
}

/** Where this page sits in the sales flow, with the current step picked out. */
export function SalesFlow({ current }: { current: string }) {
  const steps = ['Opportunity', 'Quote', 'Sales order', 'Project', 'Invoice', 'Payment']
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-sunken p-3 text-xs">
      {steps.map((s, i) => (
        <span key={s} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-text-faint">→</span>}
          <span className={s === current ? 'rounded bg-accent/15 px-1.5 py-0.5 font-semibold text-accent' : 'text-text-muted'}>
            {s}
          </span>
        </span>
      ))}
    </div>
  )
}

/** Collapsible "How to" panel at the top of a page. Closed by default unless `defaultOpen`; remembered per browser. */
export default function HowToGuide({
  id,
  title,
  defaultOpen = false,
  className = 'mb-6',
  children,
}: {
  id: string
  title: string
  defaultOpen?: boolean
  className?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(() => initialOpen(id, defaultOpen))

  function toggle() {
    const next = !open
    setOpen(next)
    try {
      localStorage.setItem(storageKey(id), String(next))
    } catch {
      // Not remembered — fine.
    }
  }

  return (
    <Card className={`${className} print:hidden`}>
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="flex items-center gap-2 text-sm font-semibold text-text">
          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-accent/40 text-xs text-accent">?</span>
          {title}
        </span>
        <span className="shrink-0 text-xs text-text-muted">{open ? 'Hide guide ▲' : 'Show guide ▼'}</span>
      </button>
      {open && <div className="mt-4 space-y-5 text-sm">{children}</div>}
    </Card>
  )
}
