import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { getFieldEngineer, listContractorSkills, listSkillCategories, listSkills, updateFieldEngineer } from '../../lib/api'
import {
  PERSON_KINDS,
  type PersonKind,
  type ContractorSkill,
  type FieldEngineer,
  type Skill,
  type SkillCategory,
} from '../../lib/types'
import { Button, Card, ErrorText, Input, Label } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { canAccess } from '../../lib/permissions'
import {
  CvCard,
  errorMessage,
  IdentityDocumentsCard,
  PhotoCard,
  ProfilePhoto,
  SkillsCard,
} from '../../components/profile/ProfileCards'

// Profile page for a contractor or staff member (Admin → User Accounts → click a name).
export default function PersonProfile() {
  const { id } = useParams<{ id: string }>()
  const kindFromUrl = useLocationKind()
  const { profile } = useAuth()
  const [engineer, setEngineer] = useState<FieldEngineer | null>(null)
  const [categories, setCategories] = useState<SkillCategory[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [profileSkills, setProfileSkills] = useState<ContractorSkill[]>([])
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    if (!id) return
    const [e, c, s, ps] = await Promise.all([
      getFieldEngineer(id),
      listSkillCategories(),
      listSkills(),
      listContractorSkills(id),
    ])
    setEngineer(e)
    setCategories(c)
    setSkills(s)
    setProfileSkills(ps)
  }

  useEffect(() => {
    refresh().catch((err) => setError(errorMessage(err, 'Failed to load.')))
  }, [id])

  if (!engineer) {
    return (
      <div>
        <BackLink kind={kindFromUrl} />
        {error ? <ErrorText>{error}</ErrorText> : <p className="text-sm text-text-muted">Loading…</p>}
      </div>
    )
  }

  return (
    <div>
      <BackLink kind={engineer.kind} />
      <div className="mb-6 flex items-center gap-3">
        <ProfilePhoto engineer={engineer} className="h-12 w-12 text-sm" />
        <h1 className="text-xl font-semibold text-text">{engineer.name}</h1>
        {!engineer.is_active && <span className="text-xs font-mono-label text-text-muted">Inactive</span>}
      </div>

      <ErrorText>{error}</ErrorText>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <DetailsCard engineer={engineer} onSaved={setEngineer} onError={setError} />
          <PhotoCard engineer={engineer} onChanged={setEngineer} onError={setError} />
          <CvCard engineer={engineer} onChanged={setEngineer} onError={setError} />
          {/* Driving licence / passport: admins only (enforced in the database too) */}
          {canAccess(profile, 'admin') && <IdentityDocumentsCard engineer={engineer} onError={setError} />}
        </div>
        <div className="lg:col-span-2">
          <SkillsCard
            engineer={engineer}
            categories={categories}
            skills={skills}
            profileSkills={profileSkills}
            onChanged={() => refresh().catch((err) => setError(errorMessage(err, 'Failed to reload.')))}
            onError={setError}
          />
        </div>
      </div>
    </div>
  )
}

// Before the record loads, the address says which list we came from.
function useLocationKind(): PersonKind {
  return useLocation().pathname.startsWith(PERSON_KINDS.staff.path) ? 'staff' : 'contractor'
}

function BackLink({ kind }: { kind: PersonKind }) {
  return (
    <Link to={PERSON_KINDS[kind].path} className="mb-4 inline-block text-xs font-mono-label text-text-muted hover:text-accent">
      ← {PERSON_KINDS[kind].plural}
    </Link>
  )
}

// ── Details ──────────────────────────────────────────────────────────────────

function toDetailsForm(engineer: FieldEngineer) {
  return {
    name: engineer.name,
    email: engineer.email,
    phone: engineer.phone ?? '',
    day_rate: engineer.day_rate?.toString() ?? '',
    address_line_1: engineer.address_line_1 ?? '',
    address_line_2: engineer.address_line_2 ?? '',
    city: engineer.city ?? '',
    postcode: engineer.postcode ?? '',
  }
}

function DetailsCard({
  engineer,
  onSaved,
  onError,
}: {
  engineer: FieldEngineer
  onSaved: (e: FieldEngineer) => void
  onError: (message: string | null) => void
}) {
  const initial = toDetailsForm(engineer)
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    onError(null)
    try {
      const saved = await updateFieldEngineer(engineer.id, {
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        day_rate: form.day_rate ? Number(form.day_rate) : null,
        address_line_1: form.address_line_1.trim() || null,
        address_line_2: form.address_line_2.trim() || null,
        city: form.city.trim() || null,
        postcode: form.postcode.trim().toUpperCase() || null,
      })
      onSaved(saved)
      // Show what was stored (trimmed, postcode in capitals) so the form isn't left "unsaved".
      setForm(toDetailsForm(saved))
    } catch (err) {
      onError(errorMessage(err, 'Failed to save details.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold text-text">Details</h2>
      <form onSubmit={handleSave} className="space-y-3">
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
          <Label>{PERSON_KINDS[engineer.kind].rateLabel} (£)</Label>
          <Input
            type="number"
            step="0.01"
            value={form.day_rate}
            onChange={(e) => setForm({ ...form, day_rate: e.target.value })}
          />
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
        <Button type="submit" disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save details'}
        </Button>
      </form>
    </Card>
  )
}

