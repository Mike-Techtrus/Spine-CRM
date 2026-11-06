import { useEffect, useState, type FormEvent } from 'react'
import { showToast } from '../../components/Toast'
import { useAuth } from '../../contexts/AuthContext'
import {
  createSkillRequest,
  getMyFieldEngineer,
  listContractorSkills,
  listPersonDocuments,
  listMySkillRequests,
  listSkillCategories,
  listSkills,
  setMyReminderEmails,
  updateMyProfile,
  withdrawSkillRequest,
} from '../../lib/api'
import {
  PERSON_DOCUMENT_LABELS,
  SKILL_REQUEST_STATUS_BADGE,
  SKILL_REQUEST_STATUS_LABELS,
  type ContractorSkill,
  type FieldEngineer,
  type PersonDocument,
  type Skill,
  type SkillCategory,
  type SkillRequest,
} from '../../lib/types'
import { Button, Card, ErrorText, Input, Label, Select, StatusBadge, Textarea } from '../../components/ui'
import { MyProfileGuide } from '../../components/guides'
import {
  CvCard,
  errorMessage,
  formatDate,
  IdentityDocumentsCard,
  PhotoCard,
  ProfilePhoto,
  SkillsCard,
} from '../../components/profile/ProfileCards'

// My Profile: contractors and staff (linked to a staff profile) keep their own
// details, documents and skills up to date (migration 0036).
export default function MyProfile() {
  const { session } = useAuth()
  const [engineer, setEngineer] = useState<FieldEngineer | null>(null)
  const [notLinked, setNotLinked] = useState(false)
  const [categories, setCategories] = useState<SkillCategory[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [profileSkills, setProfileSkills] = useState<ContractorSkill[]>([])
  const [requests, setRequests] = useState<SkillRequest[]>([])
  const [documents, setDocuments] = useState<PersonDocument[]>([])
  const [error, setError] = useState<string | null>(null)

  async function refreshSkills(id: string) {
    const [c, s, ps, r, d] = await Promise.all([
      listSkillCategories(),
      listSkills(),
      listContractorSkills(id),
      listMySkillRequests(id),
      listPersonDocuments(id),
    ])
    setDocuments(d)
    setCategories(c)
    setSkills(s)
    setProfileSkills(ps)
    setRequests(r)
  }

  useEffect(() => {
    if (!session) return
    ;(async () => {
      try {
        const me = await getMyFieldEngineer(session.user.id)
        if (!me) {
          setNotLinked(true)
          return
        }
        setEngineer(me)
        await refreshSkills(me.id)
      } catch (err) {
        setError(errorMessage(err, 'Failed to load your profile.'))
      }
    })()
  }, [session])

  if (notLinked) {
    return (
      <Card>
        <p className="text-sm text-text">
          Your login isn't linked to a contractor or staff profile yet. Ask a Spine CRM admin to link your account.
        </p>
      </Card>
    )
  }

  if (!engineer) return error ? <ErrorText>{error}</ErrorText> : <p className="text-sm text-text-muted">Loading…</p>

  const reloadSkills = () => refreshSkills(engineer.id).catch((err) => setError(errorMessage(err, 'Failed to reload.')))

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <ProfilePhoto engineer={engineer} className="h-12 w-12 text-sm" />
        <div>
          <h1 className="text-xl font-semibold text-text">My Profile</h1>
          <p className="text-sm text-text-muted">
            {engineer.name} · {engineer.kind === 'staff' ? 'Staff' : 'Contractor'}
          </p>
        </div>
      </div>

      <ErrorText>{error}</ErrorText>

      <MyProfileGuide />

      <ExpiryReminder
        items={[
          ...profileSkills.map((ps) => ({ what: skills.find((sk) => sk.id === ps.skill_id)?.name ?? 'A skill', expiresOn: ps.expires_on })),
          ...documents.map((d) => ({ what: PERSON_DOCUMENT_LABELS[d.doc_type], expiresOn: d.expires_on })),
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <MyDetailsCard engineer={engineer} onSaved={setEngineer} onError={setError} />
          <ReminderEmailsCard onError={setError} />
          <PhotoCard engineer={engineer} self onChanged={setEngineer} onError={setError} />
          <CvCard engineer={engineer} self onChanged={setEngineer} onError={setError} />
          <IdentityDocumentsCard engineer={engineer} self onError={setError} />
        </div>
        <div className="space-y-6 lg:col-span-2">
          <SkillsCard
            engineer={engineer}
            categories={categories}
            skills={skills}
            profileSkills={profileSkills}
            self
            onChanged={reloadSkills}
            onError={setError}
          />
          <SkillRequestsCard
            engineer={engineer}
            categories={categories}
            requests={requests}
            onChanged={reloadSkills}
            onError={setError}
          />
        </div>
      </div>
    </div>
  )
}

// ── Reminder emails on/off (0058) ────────────────────────────────────────────

function ReminderEmailsCard({ onError }: { onError: (m: string | null) => void }) {
  const { profile, refreshProfile } = useAuth()
  const [busy, setBusy] = useState(false)
  const on = profile?.reminder_emails !== false

  async function toggle() {
    setBusy(true)
    onError(null)
    try {
      await setMyReminderEmails(!on)
      await refreshProfile()
      showToast(on ? 'Reminder emails turned off' : 'Reminder emails turned on')
    } catch (err) {
      onError(errorMessage(err, 'Failed to change reminder emails.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-2 text-sm font-semibold text-text">Reminder emails</h2>
      <label className="flex items-start gap-3 text-sm text-text">
        <input type="checkbox" className="mt-1" checked={on} disabled={busy || !profile} onChange={toggle} />
        <span>
          Email me reminders
          <span className="block text-xs text-text-muted">
            Fridays at 3pm if this week&apos;s timesheet isn&apos;t submitted, and Mondays at 9am if timesheets are
            waiting for your approval. You&apos;ll always be emailed if a timesheet is rejected.
          </span>
        </span>
      </label>
    </Card>
  )
}

// ── Reminder: your own certifications / documents due within 60 days ─────────

const REMINDER_DAYS = 60 // same window as the badge (my_action_counts, 0042)

function ExpiryReminder({ items }: { items: { what: string; expiresOn: string | null }[] }) {
  const now = new Date()
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const due = items
    .filter((i): i is { what: string; expiresOn: string } => Boolean(i.expiresOn))
    .map((i) => ({ ...i, daysLeft: Math.round((Date.parse(`${i.expiresOn}T00:00:00Z`) - today) / 86_400_000) }))
    .filter((i) => i.daysLeft <= REMINDER_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft)
  if (due.length === 0) return null
  return (
    <Card className="mb-6 border-warning/40">
      <p className="mb-2 text-sm font-semibold text-text">Coming up for renewal</p>
      <ul className="space-y-1 text-sm">
        {due.map((i) => (
          <li key={i.what + i.expiresOn}>
            <span className="text-text">{i.what}</span>{' '}
            {i.daysLeft < 0 ? (
              <span className="text-danger">expired on {formatDate(i.expiresOn)}</span>
            ) : (
              <span className="text-warning">
                expires on {formatDate(i.expiresOn)} ({i.daysLeft === 0 ? 'today' : `in ${i.daysLeft} day${i.daysLeft === 1 ? '' : 's'}`})
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-text-faint">Once renewed, update the expiry date below (and upload the new copy for ID documents).</p>
    </Card>
  )
}

// ── Details: phone and address only ─────────────────────────────────────────

function toForm(engineer: FieldEngineer) {
  return {
    phone: engineer.phone ?? '',
    address_line_1: engineer.address_line_1 ?? '',
    address_line_2: engineer.address_line_2 ?? '',
    city: engineer.city ?? '',
    postcode: engineer.postcode ?? '',
  }
}

function MyDetailsCard({
  engineer,
  onSaved,
  onError,
}: {
  engineer: FieldEngineer
  onSaved: (e: FieldEngineer) => void
  onError: (message: string | null) => void
}) {
  const initial = toForm(engineer)
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    onError(null)
    try {
      const updated = await updateMyProfile(form)
      onSaved(updated)
      setForm(toForm(updated))
      setSaved(true)
      showToast('Your details are saved')
    } catch (err) {
      onError(errorMessage(err, 'Failed to save your details.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold text-text">My details</h2>
      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <Label>Name</Label>
          <p className="rounded-md border border-border bg-sunken px-3 py-2 text-sm text-text-muted">{engineer.name}</p>
        </div>
        <div>
          <Label>Email</Label>
          <p className="break-all rounded-md border border-border bg-sunken px-3 py-2 text-sm text-text-muted">
            {engineer.email}
          </p>
          <p className="mt-1 text-xs text-text-faint">Ask an admin if your name or email needs changing.</p>
        </div>
        <div>
          <Label>Phone</Label>
          <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="space-y-2 pt-1">
          <Label>Address</Label>
          <Input
            aria-label="Address line 1"
            placeholder="Address line 1"
            value={form.address_line_1}
            onChange={(e) => setForm({ ...form, address_line_1: e.target.value })}
          />
          <Input
            aria-label="Address line 2"
            placeholder="Address line 2"
            value={form.address_line_2}
            onChange={(e) => setForm({ ...form, address_line_2: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              aria-label="Town or city"
              placeholder="Town / city"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
            <Input
              aria-label="Postcode"
              placeholder="Postcode"
              value={form.postcode}
              onChange={(e) => setForm({ ...form, postcode: e.target.value })}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save details'}
          </Button>
          {saved && !dirty && <span className="text-xs text-accent">Saved.</span>}
        </div>
      </form>
    </Card>
  )
}

// ── Request a skill that isn't in the list ──────────────────────────────────

const emptyRequest = { category_id: '', name: '', details: '' }

function SkillRequestsCard({
  engineer,
  categories,
  requests,
  onChanged,
  onError,
}: {
  engineer: FieldEngineer
  categories: SkillCategory[]
  requests: SkillRequest[]
  onChanged: () => void
  onError: (message: string | null) => void
}) {
  const [form, setForm] = useState(emptyRequest)
  const [busy, setBusy] = useState(false)
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    onError(null)
    try {
      await createSkillRequest({
        field_engineer_id: engineer.id,
        category_id: form.category_id || null,
        name: form.name.trim(),
        details: form.details.trim() || null,
      })
      setForm(emptyRequest)
      showToast('Skill request sent')
      onChanged()
    } catch (err) {
      onError(errorMessage(err, 'Failed to send your request.'))
    } finally {
      setBusy(false)
    }
  }

  async function handleWithdraw(r: SkillRequest) {
    if (!window.confirm(`Withdraw your request for "${r.name}"?`)) return
    onError(null)
    try {
      await withdrawSkillRequest(r.id)
      onChanged()
    } catch (err) {
      onError(errorMessage(err, 'Failed to withdraw the request.'))
    }
  }

  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-text">Request a skill</h2>
      <p className="mb-4 text-xs text-text-muted">
        Can&apos;t find a skill or certification in the list above? Ask for it to be added. Once an admin approves it,
        it&apos;s added to the skills list and to your profile.
      </p>

      <form onSubmit={handleSubmit} className="mb-6 space-y-3 rounded-lg border border-border p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Skill name</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Category (optional)</Label>
            <Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">Not sure</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Anything the admin should know (optional)</Label>
            <Textarea
              rows={2}
              value={form.details}
              placeholder="e.g. awarding body, level, or why it's relevant"
              onChange={(e) => setForm({ ...form, details: e.target.value })}
            />
          </div>
        </div>
        <Button type="submit" disabled={busy || !form.name.trim()}>
          {busy ? 'Sending…' : 'Send request'}
        </Button>
      </form>

      {requests.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-raised text-left text-xs font-mono-label text-text-muted">
              <tr>
                <th className="px-3 py-2">Skill</th>
                <th className="px-3 py-2">Requested</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="px-3 py-2">
                    <p className="text-text">{r.name}</p>
                    {categoryName(r.category_id) && <p className="text-xs text-text-faint">{categoryName(r.category_id)}</p>}
                    {r.response && <p className="mt-1 text-xs text-text-muted">Admin: {r.response}</p>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-text-muted">{formatDate(r.created_at)}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={SKILL_REQUEST_STATUS_BADGE[r.status]} label={SKILL_REQUEST_STATUS_LABELS[r.status]} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.status === 'pending' && (
                      <button onClick={() => handleWithdraw(r)} className="text-xs text-text-muted hover:text-danger">
                        Withdraw
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
