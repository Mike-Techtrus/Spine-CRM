import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  createLineItem,
  createLineType,
  createRateCard,
  deleteRateCard,
  listAccounts,
  listLineItems,
  listLineTypes,
  listRateCardPrices,
  listRateCards,
  setRateCardPrice,
  updateLineItem,
  updateLineType,
  updateRateCard,
} from '../../../lib/api'
import type { Account, LineItem, RateCard, RateCardPrice } from '../../../lib/types'
import { LINE_TYPE_BILLING_LABELS, type LineType, type LineTypeBilling } from '../../../lib/types'
import { Button, Card, ErrorText, Input, Label, SearchInput, Select } from '../../../components/ui'
import AdminTabs from './AdminTabs'

function friendlyError(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : fallback
  if (message.includes('line_items_part_code_key')) return 'A line item with that part code already exists.'
  if (message.includes('rate_cards_name_key')) return 'A rate card with that name already exists.'
  return message
}

function money(v: number | undefined) {
  return v === undefined ? '—' : `£${Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
}

// Admin → Rate cards: the Default card, custom (account-specific) cards, and
// the line items they price. Quotes copy a line's unit cost when it's added,
// so nothing here changes existing quotes.
export default function RateCardsAdmin() {
  const [cards, setCards] = useState<RateCard[]>([])
  const [items, setItems] = useState<LineItem[]>([])
  const [prices, setPrices] = useState<RateCardPrice[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [newCardName, setNewCardName] = useState('')
  const [newItem, setNewItem] = useState({ line_type: 'Resource', part_code: '', description: '' })
  const [lineTypes, setLineTypes] = useState<LineType[]>([])
  const [newType, setNewType] = useState<{ name: string; billing: LineTypeBilling }>({ name: '', billing: 'manual' })
  const activeTypes = lineTypes.filter((t) => t.is_active)

  async function refresh() {
    const [c, i, p, a, t] = await Promise.all([
      listRateCards(),
      listLineItems(),
      listRateCardPrices(),
      listAccounts(),
      listLineTypes(),
    ])
    setLineTypes(t)
    setCards(c)
    setItems(i)
    setPrices(p)
    setAccounts(a)
    setSelectedId((prev) => (prev && c.some((card) => card.id === prev) ? prev : (c.find((card) => card.is_default)?.id ?? null)))
  }

  useEffect(() => {
    refresh().catch((err) => setError(friendlyError(err, 'Failed to load.')))
  }, [])

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(null)
    try {
      await action()
      await refresh()
      return true
    } catch (err) {
      setError(friendlyError(err, fallback))
      return false
    }
  }

  const defaultCard = cards.find((c) => c.is_default)
  const selected = cards.find((c) => c.id === selectedId)
  const priceMap = useMemo(() => new Map(prices.map((p) => [`${p.rate_card_id}:${p.line_item_id}`, p.unit_cost])), [prices])
  const priceOf = (cardId: string | undefined, itemId: string) => (cardId ? priceMap.get(`${cardId}:${itemId}`) : undefined)
  const accountsUsing = (cardId: string) => accounts.filter((a) => a.rate_card_id === cardId)
  const defaultUsers = accounts.filter((a) => !a.rate_card_id).length

  const visibleItems = items
    .filter((i) => showInactive || i.is_active)
    .filter((i) => {
      const q = query.trim().toLowerCase()
      return !q || `${i.part_code} ${i.line_type} ${i.description ?? ''}`.toLowerCase().includes(q)
    })

  async function handleAddCard(e: FormEvent) {
    e.preventDefault()
    const name = newCardName.trim()
    if (!name) return
    let createdId: string | null = null
    const ok = await run(async () => {
      createdId = (await createRateCard(name, null)).id
    }, 'Failed to add rate card.')
    if (ok) {
      setNewCardName('')
      setSelectedId(createdId)
    }
  }

  function renameCard(card: RateCard) {
    const name = window.prompt('Rename rate card', card.name)?.trim()
    if (!name || name === card.name) return
    run(() => updateRateCard(card.id, { name }), 'Failed to rename rate card.')
  }

  function removeCard(card: RateCard) {
    const users = accountsUsing(card.id).length
    const warning = users
      ? ` ${users} account${users === 1 ? '' : 's'} using it will go back to the Default rate card.`
      : ''
    if (!window.confirm(`Delete the "${card.name}" rate card?${warning} Existing quotes are not affected.`)) return
    run(() => deleteRateCard(card.id), 'Failed to delete rate card.')
  }

  async function handleAddItem(e: FormEvent) {
    e.preventDefault()
    const ok = await run(
      () =>
        createLineItem({
          line_type: newItem.line_type,
          part_code: newItem.part_code.trim(),
          description: newItem.description.trim() || null,
        }),
      'Failed to add line item.',
    )
    if (ok) setNewItem({ ...newItem, part_code: '', description: '' })
  }

  // Line type is changed with the dropdown in the table.
  function editItem(item: LineItem) {
    const part_code = window.prompt('Part code', item.part_code)?.trim()
    if (part_code === undefined || part_code === '') return
    const description = window.prompt('Default description (optional)', item.description ?? '')
    if (description === null) return
    run(
      () => updateLineItem(item.id, { part_code, description: description.trim() || null }),
      'Failed to update line item.',
    )
  }

  async function handleAddType(e: FormEvent) {
    e.preventDefault()
    const name = newType.name.trim()
    if (!name) return
    const nextOrder = Math.max(0, ...lineTypes.map((t) => t.sort_order)) + 1
    if (await run(() => createLineType(name, newType.billing, nextOrder), 'Failed to add line type.')) {
      setNewType({ name: '', billing: 'manual' })
    }
  }

  function renameType(t: LineType) {
    const name = window.prompt('Rename line type (its line items follow)', t.name)?.trim()
    if (!name || name === t.name) return
    run(() => updateLineType(t.id, { name }), 'Failed to rename line type.')
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-text">Admin · Rate cards</h1>
      <AdminTabs />

      <p className="mb-6 text-sm text-text-muted">
        Prices used when adding lines to a quote. Every account uses the <strong>Default</strong> card unless it's
        given a custom one (Admin → Customer Accounts → Edit). A custom card only needs prices that differ — anything it leaves blank
        uses the Default price. Changing prices here never changes quotes already written.
      </p>

      <ErrorText>{error}</ErrorText>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Rate card list */}
        <Card className="lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold text-text">Rate cards</h2>
          <ul className="mb-4 space-y-1">
            {cards.map((c) => {
              const users = c.is_default ? defaultUsers : accountsUsing(c.id).length
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                      c.id === selectedId ? 'bg-surface-raised text-accent' : 'text-text hover:bg-surface-raised'
                    }`}
                  >
                    {c.name}
                    <span className="block text-xs text-text-faint">
                      {users} account{users === 1 ? '' : 's'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <form onSubmit={handleAddCard} className="space-y-2">
            <Input placeholder="New custom card, e.g. CDW" value={newCardName} onChange={(e) => setNewCardName(e.target.value)} />
            <Button type="submit" variant="secondary" className="w-full" disabled={!newCardName.trim()}>
              Add rate card
            </Button>
          </form>
        </Card>

        {/* Prices for the selected card */}
        <Card className="lg:col-span-3">
          {selected && (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-text">{selected.name}</h2>
                  <p className="text-xs text-text-muted">
                    {selected.is_default
                      ? 'Used by every account without a custom card.'
                      : accountsUsing(selected.id).length
                        ? `Used by ${accountsUsing(selected.id)
                            .map((a) => a.name)
                            .join(', ')}.`
                        : 'Not assigned to any account yet — assign it from Admin → Customer Accounts → Edit.'}
                  </p>
                </div>
                {!selected.is_default && (
                  <span className="flex gap-3 text-xs">
                    <button onClick={() => renameCard(selected)} className="text-text-muted hover:text-text">
                      Rename
                    </button>
                    <button onClick={() => removeCard(selected)} className="text-text-muted hover:text-danger">
                      Delete
                    </button>
                  </span>
                )}
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-3">
                <SearchInput value={query} onChange={setQuery} placeholder="Search line items…" className="max-w-xs flex-1" />
                <label className="flex items-center gap-2 text-sm text-text-muted">
                  <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                  Show inactive
                </label>
              </div>

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-surface-raised text-left text-xs font-mono-label text-text-muted">
                    <tr>
                      <th className="px-3 py-2">Part code</th>
                      <th className="px-3 py-2">Line type</th>
                      {!selected.is_default && <th className="px-3 py-2 text-right">Default</th>}
                      <th className="w-40 px-3 py-2 text-right">{selected.is_default ? 'Unit cost (£)' : `${selected.name} (£)`}</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((item) => (
                      <tr key={item.id} className="border-t border-border">
                        <td className="px-3 py-2">
                          <p className={item.is_active ? 'text-text' : 'text-text-faint'}>
                            {item.part_code}
                            {!item.is_active && <span className="ml-2 text-xs">(inactive)</span>}
                          </p>
                          {item.description && <p className="text-xs text-text-muted">{item.description}</p>}
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            aria-label={`Line type for ${item.part_code}`}
                            value={item.line_type}
                            onChange={(e) =>
                              run(() => updateLineItem(item.id, { line_type: e.target.value }), 'Failed to update line type.')
                            }
                            className="py-1 text-xs"
                          >
                            {lineTypes
                              .filter((t) => t.is_active || t.name === item.line_type)
                              .map((t) => (
                                <option key={t.id} value={t.name}>
                                  {t.name}
                                </option>
                              ))}
                          </Select>
                        </td>
                        {!selected.is_default && (
                          <td className="px-3 py-2 text-right text-text-muted">{money(priceOf(defaultCard?.id, item.id))}</td>
                        )}
                        <td className="px-3 py-2 text-right">
                          <PriceInput
                            key={`${selected.id}:${item.id}:${priceOf(selected.id, item.id) ?? ''}`}
                            value={priceOf(selected.id, item.id)}
                            placeholder={selected.is_default ? 'No price' : 'Uses default'}
                            onSave={(v) => run(() => setRateCardPrice(selected.id, item.id, v), 'Failed to save price.')}
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className="flex justify-end gap-3 text-xs">
                            <button onClick={() => editItem(item)} className="text-accent hover:underline">
                              Edit
                            </button>
                            <button
                              onClick={() => run(() => updateLineItem(item.id, { is_active: !item.is_active }), 'Failed to update.')}
                              className="text-text-muted hover:text-text"
                            >
                              {item.is_active ? 'Deactivate' : 'Reactivate'}
                            </button>
                          </span>
                        </td>
                      </tr>
                    ))}
                    {visibleItems.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-sm text-text-muted">
                          No line items match.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-text-faint">
                Prices save when you leave the box. Clear a box to remove that price
                {selected.is_default ? '' : ' (the Default price is then used)'}. Deactivated items stay on existing
                quotes but can't be added to new ones.
              </p>
            </>
          )}
        </Card>
      </div>

      {/* Add a line item */}
      <Card className="mt-6">
        <h2 className="mb-4 text-sm font-semibold text-text">Add line item</h2>
        <form onSubmit={handleAddItem} className="grid grid-cols-1 items-end gap-4 sm:grid-cols-4">
          <div>
            <Label>Part code</Label>
            <Input required value={newItem.part_code} onChange={(e) => setNewItem({ ...newItem, part_code: e.target.value })} />
          </div>
          <div>
            <Label>Line type</Label>
            <Select value={newItem.line_type} onChange={(e) => setNewItem({ ...newItem, line_type: e.target.value })}>
              {activeTypes.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Default description (optional)</Label>
            <Input value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} />
          </div>
          <Button type="submit" disabled={!newItem.part_code.trim()}>
            Add line item
          </Button>
        </form>
        <p className="mt-2 text-xs text-text-faint">Then give it a price on the Default card (and any custom cards) above.</p>
      </Card>

      {/* Line types */}
      <Card className="mt-6">
        <h2 className="mb-1 text-sm font-semibold text-text">Line types</h2>
        <p className="mb-4 text-xs text-text-muted">
          How each type gets onto an invoice. <strong>From timesheets (T&amp;M)</strong> types will be added to invoices
          automatically from approved timesheets once the timesheet module does invoicing; <strong>Added manually</strong>{' '}
          types are put on an invoice by hand. <strong>Earns rebate</strong>: a client's agreed rebate (Customer Accounts, e.g. CDW 7.5%) is
          only worked out on lines of the ticked types (changing a tick affects quotes and invoices when they're next
          edited, not past figures).
        </p>
        <div className="mb-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-raised text-left text-xs font-mono-label text-text-muted">
              <tr>
                <th className="px-3 py-2">Line type</th>
                <th className="w-64 px-3 py-2">Billed</th>
                <th className="px-3 py-2">Earns rebate</th>
                <th className="px-3 py-2">Line items</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lineTypes.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className={`px-3 py-2 ${t.is_active ? 'text-text' : 'text-text-faint'}`}>
                    {t.name}
                    {!t.is_active && <span className="ml-2 text-xs">(inactive)</span>}
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      aria-label={`How ${t.name} is billed`}
                      value={t.billing}
                      onChange={(e) =>
                        run(() => updateLineType(t.id, { billing: e.target.value as LineTypeBilling }), 'Failed to update.')
                      }
                      className="py-1 text-xs"
                    >
                      {BILLING_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`${t.name} earns rebate`}
                      checked={t.rebate_eligible}
                      onChange={(e) =>
                        run(() => updateLineType(t.id, { rebate_eligible: e.target.checked }), 'Failed to update.')
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-text-muted">{items.filter((i) => i.line_type === t.name).length}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="flex justify-end gap-3 text-xs">
                      <button onClick={() => renameType(t)} className="text-accent hover:underline">
                        Rename
                      </button>
                      <button
                        onClick={() => run(() => updateLineType(t.id, { is_active: !t.is_active }), 'Failed to update.')}
                        className="text-text-muted hover:text-text"
                      >
                        {t.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form onSubmit={handleAddType} className="flex flex-wrap items-end gap-3">
          <div>
            <Label>New line type</Label>
            <Input value={newType.name} onChange={(e) => setNewType({ ...newType, name: e.target.value })} />
          </div>
          <div>
            <Label>Billed</Label>
            <Select
              value={newType.billing}
              onChange={(e) => setNewType({ ...newType, billing: e.target.value as LineTypeBilling })}
            >
              {BILLING_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary" disabled={!newType.name.trim()}>
            Add line type
          </Button>
        </form>
      </Card>
    </div>
  )
}

const BILLING_OPTIONS = Object.entries(LINE_TYPE_BILLING_LABELS) as [LineTypeBilling, string][]

// A price box that saves when you leave it (only if the value changed).
function PriceInput({
  value,
  placeholder,
  onSave,
}: {
  value: number | undefined
  placeholder: string
  onSave: (v: number | null) => Promise<unknown>
}) {
  const initial = value === undefined ? '' : String(value)
  const [text, setText] = useState(initial)
  const [saving, setSaving] = useState(false)

  async function commit() {
    const trimmed = text.trim()
    if (trimmed === initial) return
    const next = trimmed === '' ? null : Number(trimmed)
    if (next !== null && (Number.isNaN(next) || next < 0)) {
      setText(initial)
      return
    }
    setSaving(true)
    await onSave(next)
    setSaving(false)
  }

  return (
    <Input
      type="number"
      step="0.01"
      min="0"
      aria-label="Unit cost"
      placeholder={placeholder}
      value={text}
      disabled={saving}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="text-right"
    />
  )
}
