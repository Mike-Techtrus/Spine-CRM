import { useEffect, useState } from 'react'
import type { ColumnPrefs, TableColumn } from '../lib/useColumnPrefs'
import { Button } from './ui'

/**
 * "Columns" button + box for choosing which columns a list table shows and
 * in what order. Changes apply straight away; tick boxes show/hide, drag a
 * row (or use ▲ ▼) to reorder. At least one column always stays visible.
 */
export default function ColumnPicker<T>({
  columns,
  prefs,
  onChange,
  onReset,
  onHide,
}: {
  columns: TableColumn<T>[]
  prefs: ColumnPrefs
  onChange: (prefs: ColumnPrefs) => void
  onReset: () => void
  onHide?: (key: string) => void // e.g. clear that column's filter so it can't filter invisibly
}) {
  const [open, setOpen] = useState(false)
  const [dragKey, setDragKey] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const byKey = new Map(columns.map((c) => [c.key, c]))
  const visibleCount = prefs.order.filter((k) => !prefs.hidden.includes(k)).length

  function toggle(key: string) {
    const hidden = prefs.hidden.includes(key)
    if (!hidden && visibleCount <= 1) return
    onChange({ ...prefs, hidden: hidden ? prefs.hidden.filter((k) => k !== key) : [...prefs.hidden, key] })
    if (!hidden) onHide?.(key)
  }

  function move(key: string, to: number) {
    const order = prefs.order.filter((k) => k !== key)
    order.splice(Math.max(0, Math.min(to, order.length)), 0, key)
    onChange({ ...prefs, order })
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} className="py-2">
        Columns
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-16"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Choose columns"
            className="w-full max-w-sm rounded-lg border border-border bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text">Columns</h2>
              <button onClick={() => setOpen(false)} className="text-xs font-mono-label text-text-muted hover:text-text">
                Close
              </button>
            </div>
            <p className="mb-4 text-xs text-text-muted">Tick to show, drag or use the arrows to reorder.</p>

            <ul className="mb-4 divide-y divide-border rounded-md border border-border">
              {prefs.order.map((key, index) => {
                const column = byKey.get(key)
                if (!column) return null
                const shown = !prefs.hidden.includes(key)
                return (
                  <li
                    key={key}
                    draggable
                    onDragStart={() => setDragKey(key)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragKey && dragKey !== key) move(dragKey, index)
                      setDragKey(null)
                    }}
                    onDragEnd={() => setDragKey(null)}
                    className={`flex items-center gap-3 px-3 py-2 text-sm ${dragKey === key ? 'opacity-40' : ''}`}
                  >
                    <span className="cursor-grab select-none text-text-faint" aria-hidden>
                      ⋮⋮
                    </span>
                    <label className="flex flex-1 cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={shown}
                        disabled={shown && visibleCount <= 1}
                        onChange={() => toggle(key)}
                      />
                      <span className={shown ? 'text-text' : 'text-text-muted'}>{column.label}</span>
                    </label>
                    <span className="flex gap-1">
                      <button
                        type="button"
                        aria-label={`Move ${column.label} up`}
                        disabled={index === 0}
                        onClick={() => move(key, index - 1)}
                        className="px-1 text-xs text-text-muted hover:text-text disabled:opacity-30"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${column.label} down`}
                        disabled={index === prefs.order.length - 1}
                        onClick={() => move(key, index + 1)}
                        className="px-1 text-xs text-text-muted hover:text-text disabled:opacity-30"
                      >
                        ▼
                      </button>
                    </span>
                  </li>
                )
              })}
            </ul>

            <div className="flex items-center justify-between">
              <button onClick={onReset} className="text-xs font-mono-label text-text-muted hover:text-accent">
                Reset to default
              </button>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
