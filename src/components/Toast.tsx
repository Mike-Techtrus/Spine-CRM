import { useEffect, useState } from 'react'

// A small "Saved" message in the bottom corner that fades after a few seconds.
// Call showToast('Quote T11453 saved') from anywhere — it survives the page
// change that usually follows a save, because <Toaster /> sits at the app root.

type Toast = { id: number; message: string }

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<(t: Toast[]) => void>()

function publish() {
  for (const l of listeners) l(toasts)
}

export function showToast(message: string) {
  const id = nextId++
  toasts = [...toasts.slice(-2), { id, message }]
  publish()
  window.setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    publish()
  }, 3500)
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>(toasts)

  useEffect(() => {
    listeners.add(setItems)
    return () => {
      listeners.delete(setItems)
    }
  }, [])

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end print:hidden"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex items-center gap-2 rounded-lg border border-accent/50 bg-surface px-4 py-3 text-sm text-text shadow-lg"
        >
          <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-xs font-bold text-black">
            ✓
          </span>
          {t.message}
        </div>
      ))}
    </div>
  )
}
