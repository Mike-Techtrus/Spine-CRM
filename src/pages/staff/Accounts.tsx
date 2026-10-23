import { useEffect, useState, type FormEvent } from 'react'
import { createAccount, listAccounts, updateAccount } from '../../lib/api'
import type { Account } from '../../lib/types'
import { Button, Card, ErrorText, FilterCell, FilterSummary, Input, SearchInput, Th } from '../../components/ui'
import { useSort } from '../../lib/useSort'
import { useSearch } from '../../lib/useSearch'
import { useColumnFilters } from '../../lib/useColumnFilters'

const emptyForm = { name: '', website: '', phone: '', email: '', city: '', postcode: '' }
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
    setAccounts(await listAccounts())
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
      await createAccount({
        name: form.name.trim(),
        website: form.website || null,
        phone: form.phone || null,
        email: form.email || null,
        city: form.city || null,
        postcode: form.postcode || null,
      })
      setForm(emptyForm)
      setShowForm(false)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add account.')
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
        <Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : 'Add account'}</Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={handleAdd} className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-xs font-mono-label text-text-muted">Name</label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-mono-label text-text-muted">Website</label>
              <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-mono-label text-text-muted">Phone</label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-mono-label text-text-muted">Email</label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-mono-label text-text-muted">City</label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-mono-label text-text-muted">Postcode</label>
              <Input value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value })} />
            </div>
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
              <FilterCell value={filters.status ?? ''} onChange={(v) => setFilter('status', v)} options={STATUS_OPTIONS} />
              <th className="px-4 pb-2 pt-0"></th>
            </tr>
          </thead>
          <tbody>
            {sorted && sorted.length > 0 ? (
              sorted.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="px-4 py-2 text-text">{a.name}</td>
                  <td className="px-4 py-2 text-text-muted">{a.city || '—'}</td>
                  <td className="px-4 py-2 text-text-muted">{a.phone || '—'}</td>
                  <td className="px-4 py-2 text-text-muted">{a.email || '—'}</td>
                  <td className="px-4 py-2 text-text-muted">{a.is_active ? 'Active' : 'Inactive'}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => toggleActive(a)} className="text-xs text-text-muted hover:text-text">
                      {a.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-text-muted">
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
