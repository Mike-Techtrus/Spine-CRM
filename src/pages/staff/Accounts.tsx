import { useEffect, useState, type FormEvent } from 'react'
import { createAccount, listAccounts, listRateCards, updateAccount } from '../../lib/api'
import type { Account, RateCard } from '../../lib/types'
import { Button, Card, ErrorText, FilterCell, FilterSummary, Input, SearchInput, Select, Th } from '../../components/ui'
import { useSort } from '../../lib/useSort'
import { useSearch } from '../../lib/useSearch'
import { useColumnFilters } from '../../lib/useColumnFilters'

const emptyForm = {
  name: '',
  website: '',
  phone: '',
  email: '',
  billing_name: '',
  address_line_1: '',
  address_line_2: '',
  city: '',
  postcode: '',
  rate_card_id: '', // '' = Default rate card
}
type AccountForm = typeof emptyForm

function toForm(a: Account): AccountForm {
  return {
    name: a.name,
    website: a.website ?? '',
    phone: a.phone ?? '',
    email: a.email ?? '',
    billing_name: a.billing_name ?? '',
    address_line_1: a.address_line_1 ?? '',
    address_line_2: a.address_line_2 ?? '',
    city: a.city ?? '',
    postcode: a.postcode ?? '',
    rate_card_id: a.rate_card_id ?? '',
  }
}

function toInput(form: AccountForm) {
  const orNull = (v: string) => v.trim() || null
  return {
    name: form.name.trim(),
    website: orNull(form.website),
    phone: orNull(form.phone),
    email: orNull(form.email),
    billing_name: orNull(form.billing_name),
    address_line_1: orNull(form.address_line_1),
    address_line_2: orNull(form.address_line_2),
    city: orNull(form.city),
    postcode: form.postcode.trim().toUpperCase() || null,
    rate_card_id: form.rate_card_id || null,
  }
}

// Shared by Add account and Edit account. The billing name and address are
// what print under "Invoice To" on invoices.
function AccountFields({
  form,
  onChange,
  rateCards,
}: {
  form: AccountForm
  onChange: (f: AccountForm) => void
  rateCards: RateCard[]
}) {
  const field = (key: keyof AccountForm) => ({
    value: form[key],
    onChange: (e: { target: { value: string } }) => onChange({ ...form, [key]: e.target.value }),
  })
  const label = 'mb-1 block text-xs font-mono-label text-text-muted'
  return (
    <>
      <div>
        <label className={label}>Name</label>
        <Input required {...field('name')} />
      </div>
      <div>
        <label className={label}>Website</label>
        <Input {...field('website')} />
      </div>
      <div>
        <label className={label}>Phone</label>
        <Input {...field('phone')} />
      </div>
      <div>
        <label className={label}>Email</label>
        <Input {...field('email')} />
      </div>
      <div className="col-span-2">
        <label className={label}>Name on invoices (if different, e.g. "CDW Limited")</label>
        <Input placeholder={form.name} {...field('billing_name')} />
      </div>
      <div>
        <label className={label}>Rate card (prices on new quote lines)</label>
        <Select value={form.rate_card_id} onChange={(e) => onChange({ ...form, rate_card_id: e.target.value })}>
          <option value="">Default</option>
          {rateCards
            .filter((c) => !c.is_default)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </Select>
      </div>
      <div className="col-span-3">
        <label className={label}>Billing address</label>
        <div className="grid grid-cols-2 gap-2">
          <Input aria-label="Address line 1" placeholder="Address line 1" {...field('address_line_1')} />
          <Input aria-label="Address line 2" placeholder="Address line 2" {...field('address_line_2')} />
          <Input aria-label="Town or city" placeholder="Town / city" {...field('city')} />
          <Input aria-label="Postcode" placeholder="Postcode" {...field('postcode')} />
        </div>
      </div>
    </>
  )
}
const STATUS_OPTIONS = [
  { value: 'Active', label: 'Active' },
  { value: 'Inactive', label: 'Inactive' },
]

function getSearchText(a: Account) {
  return [a.name, a.city, a.phone, a.email, a.website, a.postcode, a.is_active ? 'Active' : 'Inactive']
    .filter((v) => v !== null && v !== undefined)
    .join(' ')
}

function getSortValue(a: Account, key: string) {
  switch (key) {
    case 'name':
      return a.name
    case 'city':
      return a.city ?? ''
    case 'phone':
      return a.phone ?? ''
    case 'email':
      return a.email ?? ''
    case 'status':
      return a.is_active ? 'Active' : 'Inactive'
    default:
      return ''
  }
}

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [rateCards, setRateCards] = useState<RateCard[]>([])
  const { query, setQuery, filtered } = useSearch(accounts, getSearchText)
  const {
    filters,
    setFilter,
    clearFilters,
    activeCount,
    filtered: columnFiltered,
  } = useColumnFilters(filtered, getSortValue, 'accounts')
  const { sorted, sortKey, direction, toggleSort } = useSort(columnFiltered, getSortValue, 'accounts')

  async function refresh() {
    const [nextAccounts, nextCards] = await Promise.all([listAccounts(), listRateCards()])
    setAccounts(nextAccounts)
    setRateCards(nextCards)
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load.'))
  }, [])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await createAccount(toInput(form))
      setForm(emptyForm)
      setShowForm(false)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add account.')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(account: Account) {
    setShowForm(false)
    setEditing(account)
    setEditForm(toForm(account))
    setError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault()
    if (!editing || !editForm.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await updateAccount(editing.id, toInput(editForm))
      setEditing(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save account.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(account: Account) {
    await updateAccount(account.id, { is_active: !account.is_active })
    await refresh()
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Accounts</h1>
        <Button
          onClick={() => {
            setEditing(null)
            setShowForm((s) => !s)
          }}
        >
          {showForm ? 'Cancel' : 'Add account'}
        </Button>
      </div>

      {editing && (
        <Card className="mb-6">
          <h2 className="mb-4 text-sm font-semibold text-text">Edit {editing.name}</h2>
          <form onSubmit={handleSaveEdit} className="grid grid-cols-3 gap-4">
            <AccountFields form={editForm} onChange={setEditForm} rateCards={rateCards} />
            <div className="col-span-3 flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </form>
          <ErrorText>{error}</ErrorText>
        </Card>
      )}

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={handleAdd} className="grid grid-cols-3 gap-4">
            <AccountFields form={form} onChange={setForm} rateCards={rateCards} />
            <div className="col-span-3">
              <Button type="submit" disabled={saving}>
                {saving ? 'Adding…' : 'Save account'}
              </Button>
            </div>
          </form>
          <ErrorText>{error}</ErrorText>
        </Card>
      )}

      <SearchInput value={query} onChange={setQuery} placeholder="Search accounts…" className="mb-4 max-w-sm" />

      <FilterSummary count={activeCount} onClear={clearFilters} />

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised text-left text-xs font-mono-label text-text-muted">
            <tr>
              <Th sortKey="name" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                Name
              </Th>
              <Th sortKey="city" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                City
              </Th>
              <Th sortKey="phone" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                Phone
              </Th>
              <Th sortKey="email" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                Email
              </Th>
              <th className="px-4 py-2">Rate card</th>
              <Th sortKey="status" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                Status
              </Th>
              <th className="px-4 py-2"></th>
            </tr>
            <tr>
              <FilterCell value={filters.name ?? ''} onChange={(v) => setFilter('name', v)} />
              <FilterCell value={filters.city ?? ''} onChange={(v) => setFilter('city', v)} />
              <FilterCell value={filters.phone ?? ''} onChange={(v) => setFilter('phone', v)} />
              <FilterCell value={filters.email ?? ''} onChange={(v) => setFilter('email', v)} />
              <th className="px-4 pb-2 pt-0"></th>
              <FilterCell value={filters.status ?? ''} onChange={(v) => setFilter('status', v)} options={STATUS_OPTIONS} />
              <th className="px-4 pb-2 pt-0"></th>
            </tr>
          </thead>
          <tbody>
            {sorted && sorted.length > 0 ? (
              sorted.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <button onClick={() => startEdit(a)} className="text-left text-text hover:text-accent hover:underline">
                      {a.name}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-text-muted">{a.city || '—'}</td>
                  <td className="px-4 py-2 text-text-muted">{a.phone || '—'}</td>
                  <td className="px-4 py-2 text-text-muted">{a.email || '—'}</td>
                  <td className="px-4 py-2 text-text-muted">
                    {(a.rate_card_id && rateCards.find((c) => c.id === a.rate_card_id)?.name) || 'Default'}
                  </td>
                  <td className="px-4 py-2 text-text-muted">{a.is_active ? 'Active' : 'Inactive'}</td>
                  <td className="px-4 py-2 text-right">
                    <span className="flex justify-end gap-3 text-xs">
                      <button onClick={() => startEdit(a)} className="text-accent hover:underline">
                        Edit
                      </button>
                      <button onClick={() => toggleActive(a)} className="text-text-muted hover:text-text">
                        {a.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-text-muted">
                  No accounts match your search/filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
