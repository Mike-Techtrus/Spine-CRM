import { useEffect, useState, type FormEvent } from 'react'
import {
  createAdminUser,
  listAdminUsers,
  sendPasswordReset,
  setUserDisabled,
  setUserPassword,
  updateAdminUser,
} from '../../../lib/api'
import { APP_AREAS, USER_ROLE_LABELS, type AdminUser, type AppArea, type UserRole } from '../../../lib/types'
import { useAuth } from '../../../contexts/AuthContext'
import { Button, Card, ErrorText, Input, Label, SearchInput, Select, Th } from '../../../components/ui'
import { useSort } from '../../../lib/useSort'
import { useSearch } from '../../../lib/useSearch'
import AdminTabs from './AdminTabs'

// New staff get everything except admin by default — tick it deliberately.
const DEFAULT_STAFF_AREAS: AppArea[] = APP_AREAS.filter((a) => a.key !== 'admin').map((a) => a.key)

const emptyNewUser = {
  full_name: '',
  email: '',
  role: 'staff' as UserRole,
  permissions: DEFAULT_STAFF_AREAS,
  passwordMode: 'set' as 'set' | 'email',
  password: '',
}

function getSearchText(u: AdminUser) {
  return [u.full_name, u.email, USER_ROLE_LABELS[u.role], u.disabled ? 'Disabled' : 'Active'].join(' ')
}

function getSortValue(u: AdminUser, key: string) {
  switch (key) {
    case 'name':
      return u.full_name
    case 'email':
      return u.email
    case 'role':
      return USER_ROLE_LABELS[u.role]
    case 'last_sign_in':
      return u.last_sign_in_at ?? ''
    case 'status':
      return u.disabled ? 'Disabled' : 'Active'
    default:
      return ''
  }
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Never'
}

function areaSummary(u: AdminUser) {
  if (u.role !== 'staff') return 'Own timesheets only'
  if (u.permissions.length === APP_AREAS.length) return 'All areas'
  if (u.permissions.length === 0) return 'None'
  return APP_AREAS.filter((a) => u.permissions.includes(a.key))
    .map((a) => a.label)
    .join(', ')
}

function PermissionPicker({
  value,
  onChange,
  disabledAreas = [],
}: {
  value: AppArea[]
  onChange: (value: AppArea[]) => void
  disabledAreas?: AppArea[]
}) {
  function toggle(key: AppArea) {
    onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key])
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {APP_AREAS.map((a) => (
        <label key={a.key} className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={value.includes(a.key)}
            disabled={disabledAreas.includes(a.key)}
            onChange={() => toggle(a.key)}
            className="accent-accent"
          />
          {a.label}
        </label>
      ))}
    </div>
  )
}

function AddUserForm({ onAdded }: { onAdded: () => Promise<void> }) {
  const [form, setForm] = useState(emptyNewUser)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await createAdminUser({
        full_name: form.full_name,
        email: form.email,
        role: form.role,
        permissions: form.role === 'staff' ? form.permissions : [],
        ...(form.passwordMode === 'set' ? { password: form.password } : { send_reset_email: true }),
      })
      setNotice(
        form.passwordMode === 'set'
          ? `${form.email} can now sign in with the password you set.`
          : `${form.email} has been emailed a link to choose their password.`,
      )
      setForm(emptyNewUser)
      await onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add user.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mb-6">
      <h2 className="mb-4 text-sm font-semibold text-text">Add login</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label>Full name</Label>
            <Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
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
            <Label>Profile</Label>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
              {Object.entries(USER_ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {form.role === 'staff' ? (
          <div>
            <Label>Areas they can use</Label>
            <PermissionPicker value={form.permissions} onChange={(permissions) => setForm({ ...form, permissions })} />
          </div>
        ) : (
          <p className="text-xs text-text-muted">
            Contractors only see their own timesheets. If a Contractor record with this email already
            exists, the login is linked to it automatically.
          </p>
        )}

        <div>
          <Label>Password</Label>
          <div className="mb-2 flex flex-wrap gap-4 text-sm text-text">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={form.passwordMode === 'set'}
                onChange={() => setForm({ ...form, passwordMode: 'set' })}
                className="accent-accent"
              />
              Set it now
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={form.passwordMode === 'email'}
                onChange={() => setForm({ ...form, passwordMode: 'email' })}
                className="accent-accent"
              />
              Email them a link to choose their own
            </label>
          </div>
          {form.passwordMode === 'set' && (
            <Input
              required
              type="password"
              minLength={8}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="max-w-sm"
            />
          )}
        </div>

        <ErrorText>{error}</ErrorText>
        {notice && <p className="text-sm text-accent">{notice}</p>}
        <Button type="submit" disabled={saving}>
          {saving ? 'Adding…' : 'Add login'}
        </Button>
      </form>
    </Card>
  )
}

function EditUserPanel({
  user,
  isSelf,
  onClose,
  onSaved,
}: {
  user: AdminUser
  isSelf: boolean
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [fullName, setFullName] = useState(user.full_name)
  const [role, setRole] = useState<UserRole>(user.role)
  const [permissions, setPermissions] = useState<AppArea[]>(user.permissions)
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      setNotice(success)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  function handleSave(e: FormEvent) {
    e.preventDefault()
    run(async () => {
      await updateAdminUser(user.id, { full_name: fullName, role, permissions: role === 'staff' ? permissions : [] })
      await onSaved()
    }, 'Changes saved.')
  }

  function handleSetPassword(e: FormEvent) {
    e.preventDefault()
    run(async () => {
      await setUserPassword(user.id, newPassword)
      setNewPassword('')
    }, `Password updated — let ${user.full_name || user.email} know their new password.`)
  }

  function handleSendReset() {
    run(() => sendPasswordReset(user.id), `Reset link emailed to ${user.email}.`)
  }

  function handleToggleDisabled() {
    const name = user.full_name || user.email
    if (!user.disabled && !window.confirm(`Disable ${name}? They won't be able to sign in until re-enabled.`)) return
    run(
      async () => {
        await setUserDisabled(user.id, !user.disabled)
        await onSaved()
      },
      user.disabled ? `${name} can sign in again.` : `${name} is disabled and can no longer sign in.`,
    )
  }

  return (
    <Card className="mb-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-text">
            {user.full_name || user.email}
            {user.disabled && <span className="ml-2 text-xs font-mono-label text-danger">Disabled</span>}
          </h2>
          <p className="text-xs text-text-muted">
            {user.email} · last signed in {formatDate(user.last_sign_in_at)}
          </p>
        </div>
        <button onClick={onClose} className="text-xs font-mono-label text-text-muted hover:text-text">
          Close ✕
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <Label>Profile</Label>
            <Select value={role} disabled={isSelf} onChange={(e) => setRole(e.target.value as UserRole)}>
              {Object.entries(USER_ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {role === 'staff' && (
          <div>
            <Label>Areas they can use</Label>
            <PermissionPicker
              value={permissions}
              onChange={setPermissions}
              disabledAreas={isSelf ? ['admin'] : []}
            />
            {isSelf && (
              <p className="mt-2 text-xs text-text-faint">
                You can't remove your own admin access or profile — another admin has to.
              </p>
            )}
          </div>
        )}
        <Button type="submit" disabled={busy}>
          Save changes
        </Button>
      </form>

      <div className="mt-6 border-t border-border pt-4">
        <Label>Password</Label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <form onSubmit={handleSetPassword} className="flex items-center gap-3">
            <Input
              required
              type="password"
              minLength={8}
              autoComplete="new-password"
              placeholder="New password (8+ characters)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="min-w-0 flex-1 sm:w-64 sm:flex-none"
            />
            <Button type="submit" variant="secondary" disabled={busy} className="shrink-0 whitespace-nowrap">
              Set password
            </Button>
          </form>
          <span className="text-xs text-text-faint">or</span>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={handleSendReset}
            className="self-start whitespace-nowrap sm:self-auto"
          >
            Email reset link
          </Button>
        </div>
      </div>

      {!isSelf && (
        <div className="mt-6 border-t border-border pt-4">
          <Label>Account access</Label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant={user.disabled ? 'secondary' : 'danger'}
              disabled={busy}
              onClick={handleToggleDisabled}
              className="self-start whitespace-nowrap sm:self-auto"
            >
              {user.disabled ? 'Enable account' : 'Disable account'}
            </Button>
            <p className="text-xs text-text-faint">
              {user.disabled
                ? 'This account is disabled — they can’t sign in. Their records and history are kept.'
                : 'Stops them signing in. Nothing is deleted, and you can re-enable them any time.'}
            </p>
          </div>
        </div>
      )}

      <div className="mt-4">
        <ErrorText>{error}</ErrorText>
        {notice && <p className="text-sm text-accent">{notice}</p>}
      </div>
    </Card>
  )
}

export default function UserAdmin() {
  const { profile, refreshProfile } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { query, setQuery, filtered } = useSearch(users, getSearchText)
  const { sorted, sortKey, direction, toggleSort } = useSort(filtered, getSortValue, 'admin-users')

  async function refresh() {
    setUsers(await listAdminUsers())
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load users.'))
  }, [])

  const selected = users.find((u) => u.id === selectedId) ?? null

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Admin · Logins</h1>
        <Button variant={showAdd ? 'secondary' : 'primary'} onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : 'Add login'}
        </Button>
      </div>
      <AdminTabs />

      {showAdd && <AddUserForm onAdded={refresh} />}

      {selected && (
        <EditUserPanel
          key={selected.id}
          user={selected}
          isSelf={selected.id === profile?.id}
          onClose={() => setSelectedId(null)}
          onSaved={async () => {
            await refresh()
            // Your own name/areas may have changed — keep the nav in step.
            if (selected.id === profile?.id) await refreshProfile()
          }}
        />
      )}

      <ErrorText>{error}</ErrorText>

      <SearchInput value={query} onChange={setQuery} placeholder="Search logins…" className="mb-4 max-w-sm" />

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised text-left text-xs font-mono-label text-text-muted">
            <tr>
              <Th sortKey="name" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                Name
              </Th>
              <Th sortKey="email" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                Email
              </Th>
              <Th sortKey="role" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                Profile
              </Th>
              <Th>Areas</Th>
              <Th sortKey="last_sign_in" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                Last sign-in
              </Th>
              <Th sortKey="status" activeSortKey={sortKey} direction={direction} onSort={toggleSort}>
                Status
              </Th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {sorted && sorted.length > 0 ? (
              sorted.map((u) => (
                <tr key={u.id} className={`border-t border-border ${u.id === selectedId ? 'bg-surface-raised' : ''}`}>
                  <td className="px-4 py-2 text-text">{u.full_name || '—'}</td>
                  <td className="px-4 py-2 text-text-muted">{u.email}</td>
                  <td className="px-4 py-2 text-text-muted">{USER_ROLE_LABELS[u.role]}</td>
                  <td className="px-4 py-2 text-xs text-text-muted">{areaSummary(u)}</td>
                  <td className="px-4 py-2 text-text-muted">{formatDate(u.last_sign_in_at)}</td>
                  <td className={`px-4 py-2 ${u.disabled ? 'text-danger' : 'text-text-muted'}`}>
                    {u.disabled ? 'Disabled' : 'Active'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => setSelectedId(u.id)} className="text-xs text-accent hover:underline">
                      Manage
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-text-muted">
                  {users.length === 0 && !error ? 'Loading users…' : 'No users match your search.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
