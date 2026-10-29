import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { createFieldEngineer, listFieldEngineers, listPersonLogins, updateFieldEngineer } from '../../lib/api'
import { PERSON_KINDS, type FieldEngineer, type PersonKind, type PersonLogin } from '../../lib/types'
import { Button, Card, ErrorText, FilterCell, FilterSummary, Input, Label, SearchInput, Select, Th } from '../../components/ui'
import SectionTabs from '../../components/SectionTabs'
import { useSort } from '../../lib/useSort'
import { useSearch } from '../../lib/useSearch'
import { useColumnFilters } from '../../lib/useColumnFilters'

const USER_TABS = (['contractor', 'staff'] as const).map((k) => ({ label: PERSON_KINDS[k].plural, path: PERSON_KINDS[k].path }))

const emptyForm = { name: '', email: '', phone: '', day_rate: '', user_id: '' }
const STATUS_OPTIONS = [
  { value: 'Active', label: 'Active' },
  { value: 'Inactive', label: 'Inactive' },
]

// A login can only be linked to one record (field_engineers.user_id is
// unique), so logins already used elsewhere are listed but greyed out.
// `everyone` covers both kinds so "linked to …" can name any record.
function LoginOptions({
  logins,
  everyone,
  currentRecordId,
}: {
  logins: PersonLogin[]
  everyone: FieldEngineer[]
  currentRecordId: string | null
}) {
  return (
    <>
      <option value="">Not linked</option>
      {logins.map((l) => {
        const linkedTo =
          l.linked_engineer_id && l.linked_engineer_id !== currentRecordId
            ? everyone.find((e) => e.id === l.linked_engineer_id)
            : undefined
        const label = [
          l.full_name ? `${l.full_name} (${l.email})` : l.email,
          l.disabled ? '— disabled' : '',
          linkedTo ? `— linked to ${linkedTo.name}` : '',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <option key={l.id} value={l.id} disabled={Boolean(linkedTo)}>
            {label}
          </option>
        )
      })}
    </>
  )
}

function friendlyError(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : fallback
  if (message.includes('field_engineers_user_id_key')) return 'That login is already linked to someone else.'
  if (message.includes('field_engineers_email_key')) return 'Someone in Contractors or Staff already has that email.'
  return message
}

function getSearchText(e: FieldEngineer) {
  return [e.name, e.email, e.phone, e.day_rate, e.is_active ? 'Active' : 'Inactive']
    .filter((v) => v !== null && v !== undefined)
    .join(' ')
}

function getSortValue(e: FieldEngineer, key: string) {
  switch (key) {
    case 'name':
      return e.name
    case 'email':
      return e.email
    case 'day_rate':
      return e.day_rate ?? null
    case 'login':
      return e.user_id ? 'Linked' : ''
    case 'status':
      return e.is_active ? 'Active' : 'Inactive'
    default:
      return ''
  }
}

// Users → Contractors and Users → Staff. Both live in field_engineers,
// told apart by `kind`; staff see "Cost rate" where contractors see "Day rate".
export default function PeopleList({ kind }: { kind: PersonKind }) {
  const meta = PERSON_KINDS[kind]
  const [everyone, setEveryone] = useState<FieldEngineer[]>([])
  const [allLogins, setAllLogins] = useState<PersonLogin[]>([])
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const people = useMemo(() => everyone.filter((e) => e.kind === kind), [everyone, kind])
  // Contractor records link to Contractor logins, staff records to Staff logins.
  const logins = useMemo(() => allLogins.filter((l) => l.role === meta.loginRole), [allLogins, meta.loginRole])

  const { query, setQuery, filtered } = useSearch(people, getSearchText)
  const {
    filters,
    setFilter,
    clearFilters,
    activeCount,
    filtered: columnFiltered,
  } = useColumnFilters(filtered, getSortValue, `people-${kind}`)
  const { sorted, sortKey, direction, toggleSort } = useSort(columnFiltered, getSortValue, `people-${kind}`)

  async function refresh() {
    const [nextPeople, nextLogins] = await Promise.all([listFieldEngineers(), listPersonLogins()])
    setEveryone(nextPeople)
    setAllLogins(nextLogins)
  }

  // Picking a login fills in name and email if they haven't been typed yet.
  function pickLogin(userId: string) {
    const login = logins.find((l) => l.id === userId)
    setForm({
      ...form,
      user_id: userId,
      name: form.name || login?.full_name || '',
      email: form.email || login?.email || '',
    })
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load.'))
  }, [])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createFieldEngineer({
        kind,
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        day_rate: form.day_rate ? Number(form.day_rate) : null,
        user_id: form.user_id || null,
      })
      setForm(emptyForm)
      await refresh()
    } catch (err) {
      setError(friendlyError(err, `Failed to add ${meta.singular}.`))
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(person: FieldEngineer) {
    await updateFieldEngineer(person.id, { is_active: !person.is_active })
    await refresh()
  }

  async function linkLogin(person: FieldEngineer, userId: string) {
    setError(null)
    try {
      await updateFieldEngineer(person.id, { user_id: userId || null })
      await refresh()
    } catch (err) {
      setError(friendlyError(err, 'Failed to link login.'))
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-text">Users · {meta.plural}</h1>
      <SectionTabs sections={USER_TABS} />

      <Card className="mb-6">
        <form onSubmit={handleAdd} className="grid grid-cols-4 items-end gap-4">
          <div>
            <Label>Name</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <Label>{meta.rateLabel} (£)</Label>
            <Input
              type="number"
              step="0.01"
              value={form.day_rate}
              onChange={(e) => setForm({ ...form, day_rate: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <Label>Login</Label>
            <Select value={form.user_id} onChange={(e) => pickLogin(e.target.value)}>
              <LoginOptions logins={logins} everyone={everyone} currentRecordId={null} />
            </Select>
          </div>
          <div className="col-span-4">
            <Button type="submit" disabled={saving}>
              {saving ? 'Adding…' : `Add ${meta.singular}`}
            </Button>
          </div>
        </form>
        <ErrorText>{error}</ErrorText>
      </Card>

      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder={`Search ${meta.plural.toLowerCase()}…`}
        className="mb-4 max-w-sm"
      />

      <FilterSummary count={activeCount} onClear={clearFilters} />

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised text-left text-xs font-mono-label text-text-muted">
            <tr>
              <Th sortKey="name" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                Name
              </Th>
              <Th sortKey="email" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                Email
              </Th>
              <Th sortKey="day_rate" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                {meta.rateLabel}
              </Th>
              <Th sortKey="login" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                Login
              </Th>
              <Th sortKey="status" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                Status
              </Th>
              <th className="px-4 py-2"></th>
            </tr>
            <tr>
              <FilterCell value={filters.name ?? ''} onChange={(v) => setFilter('name', v)} />
              <FilterCell value={filters.email ?? ''} onChange={(v) => setFilter('email', v)} />
              <FilterCell value={filters.day_rate ?? ''} onChange={(v) => setFilter('day_rate', v)} />
              <th className="px-4 pb-2 pt-0"></th>
              <FilterCell value={filters.status ?? ''} onChange={(v) => setFilter('status', v)} options={STATUS_OPTIONS} />
              <th className="px-4 pb-2 pt-0"></th>
            </tr>
          </thead>
          <tbody>
            {sorted && sorted.length > 0 ? (
              sorted.map((e) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <Link to={`${meta.path}/${e.id}`} className="text-text hover:text-accent hover:underline">
                      {e.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-text-muted">{e.email}</td>
                  <td className="px-4 py-2 text-text-muted">{e.day_rate ? `£${Number(e.day_rate).toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-2">
                    <Select
                      aria-label={`Login for ${e.name}`}
                      value={e.user_id ?? ''}
                      onChange={(ev) => linkLogin(e, ev.target.value)}
                      className="py-1 text-xs"
                    >
                      <LoginOptions logins={logins} everyone={everyone} currentRecordId={e.id} />
                    </Select>
                  </td>
                  <td className="px-4 py-2 text-text-muted">{e.is_active ? 'Active' : 'Inactive'}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => toggleActive(e)} className="text-xs text-text-muted hover:text-text">
                      {e.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-text-muted">
                  No {meta.plural.toLowerCase()} match your search/filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-text-muted">
        {kind === 'contractor'
          ? 'Pick a contractor’s login from the Login dropdown — only logins with the Contractor profile are listed. To create one: Admin → Logins → Add login with the Contractor profile (a matching email links automatically).'
          : 'Pick a staff member’s login from the Login dropdown — only logins with the Staff profile are listed. Once linked, they get a My Timesheets tab. To create one: Admin → Logins → Add login with the Staff profile (a matching email links automatically).'}{' '}
        Each login can be linked to one person. Click a name to open their profile (skills and CV).
      </p>
    </div>
  )
}
