import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import {
  addContractorSkill,
  CV_ACCEPT,
  CV_MAX_BYTES,
  getContractorCvUrl,
  getFieldEngineer,
  listContractorSkills,
  listSkillCategories,
  listSkills,
  removeContractorCv,
  removeContractorSkill,
  updateContractorSkill,
  updateFieldEngineer,
  uploadContractorCv,
  type ContractorSkillInput,
} from '../../lib/api'
import {
  PERSON_KINDS,
  SKILL_LEVEL_LABELS,
  type PersonKind,
  type ContractorSkill,
  type FieldEngineer,
  type Skill,
  type SkillCategory,
  type SkillLevel,
} from '../../lib/types'
import { Button, Card, ErrorText, Input, Label, Select, Textarea } from '../../components/ui'

const LEVELS = Object.entries(SKILL_LEVEL_LABELS) as [SkillLevel, string][]

// Certifications expiring within this many days are flagged.
const EXPIRY_WARNING_DAYS = 60

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString('en-GB', { dateStyle: 'medium' }) : '—'
}

function expiryClass(expires_on: string | null) {
  if (!expires_on) return 'text-text-muted'
  const days = (new Date(expires_on).getTime() - Date.now()) / 86_400_000
  if (days < 0) return 'text-danger'
  if (days < EXPIRY_WARNING_DAYS) return 'text-warning'
  return 'text-text-muted'
}

function errorMessage(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : fallback
  if (message.includes('contractor_skills_field_engineer_id_skill_id_key')) return 'That skill is already on this profile.'
  if (message.includes('field_engineers_email_key')) return 'Someone in Contractors or Staff already has that email.'
  return message
}

// Profile page for a contractor or staff member (Users → click a name).
export default function PersonProfile() {
  const { id } = useParams<{ id: string }>()
  const kindFromUrl = useLocationKind()
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
        <h1 className="text-xl font-semibold text-text">{engineer.name}</h1>
        {!engineer.is_active && <span className="text-xs font-mono-label text-text-muted">Inactive</span>}
      </div>

      <ErrorText>{error}</ErrorText>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <DetailsCard engineer={engineer} onSaved={setEngineer} onError={setError} />
          <CvCard engineer={engineer} onChanged={setEngineer} onError={setError} />
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

function DetailsCard({
  engineer,
  onSaved,
  onError,
}: {
  engineer: FieldEngineer
  onSaved: (e: FieldEngineer) => void
  onError: (message: string | null) => void
}) {
  const initial = {
    name: engineer.name,
    email: engineer.email,
    phone: engineer.phone ?? '',
    day_rate: engineer.day_rate?.toString() ?? '',
  }
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    onError(null)
    try {
      onSaved(
        await updateFieldEngineer(engineer.id, {
          name: form.name,
          email: form.email,
          phone: form.phone || null,
          day_rate: form.day_rate ? Number(form.day_rate) : null,
        }),
      )
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
        <Button type="submit" disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save details'}
        </Button>
      </form>
    </Card>
  )
}

// ── CV ───────────────────────────────────────────────────────────────────────

function CvCard({
  engineer,
  onChanged,
  onError,
}: {
  engineer: FieldEngineer
  onChanged: (e: FieldEngineer) => void
  onError: (message: string | null) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (file.size > CV_MAX_BYTES) {
      onError('That file is over 10 MB — please upload a smaller copy.')
      return
    }
    setBusy(true)
    onError(null)
    try {
      onChanged(await uploadContractorCv(engineer, file))
    } catch (err) {
      onError(errorMessage(err, 'Failed to upload CV.'))
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function handleDownload() {
    onError(null)
    try {
      window.location.href = await getContractorCvUrl(engineer)
    } catch (err) {
      onError(errorMessage(err, 'Failed to download CV.'))
    }
  }

  async function handleRemove() {
    if (!window.confirm(`Remove ${engineer.name}'s CV?`)) return
    setBusy(true)
    onError(null)
    try {
      onChanged(await removeContractorCv(engineer))
    } catch (err) {
      onError(errorMessage(err, 'Failed to remove CV.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold text-text">CV</h2>
      {engineer.cv_path ? (
        <div className="mb-4">
          <button onClick={handleDownload} className="break-all text-left text-sm text-accent hover:underline">
            {engineer.cv_file_name}
          </button>
          <p className="text-xs text-text-muted">Uploaded {formatDate(engineer.cv_uploaded_at)}</p>
        </div>
      ) : (
        <p className="mb-4 text-sm text-text-muted">No CV uploaded yet.</p>
      )}
      <input
        ref={fileInput}
        type="file"
        accept={CV_ACCEPT}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>
          {busy ? 'Working…' : engineer.cv_path ? 'Replace CV' : 'Upload CV'}
        </Button>
        {engineer.cv_path && (
          <Button variant="secondary" disabled={busy} onClick={handleRemove}>
            Remove
          </Button>
        )}
      </div>
      <p className="mt-3 text-xs text-text-faint">PDF or Word, up to 10 MB.</p>
    </Card>
  )
}

// ── Skills ───────────────────────────────────────────────────────────────────

const emptySkillForm = { level: '', obtained_on: '', expires_on: '', notes: '' }
type SkillForm = typeof emptySkillForm

function toInput(form: SkillForm): ContractorSkillInput {
  return {
    level: (form.level || null) as SkillLevel | null,
    obtained_on: form.obtained_on || null,
    expires_on: form.expires_on || null,
    notes: form.notes.trim() || null,
  }
}

function SkillsCard({
  engineer,
  categories,
  skills,
  profileSkills,
  onChanged,
  onError,
}: {
  engineer: FieldEngineer
  categories: SkillCategory[]
  skills: Skill[]
  profileSkills: ContractorSkill[]
  onChanged: () => void
  onError: (message: string | null) => void
}) {
  const [skillId, setSkillId] = useState('')
  const [form, setForm] = useState(emptySkillForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(emptySkillForm)

  const skillById = useMemo(() => Object.fromEntries(skills.map((s) => [s.id, s])), [skills])
  const onProfile = useMemo(() => new Set(profileSkills.map((ps) => ps.skill_id)), [profileSkills])

  // Profile skills grouped under their category, in category order.
  const grouped = useMemo(
    () =>
      categories
        .map((c) => ({
          category: c,
          rows: profileSkills
            .filter((ps) => skillById[ps.skill_id]?.category_id === c.id)
            .sort((a, b) => skillById[a.skill_id].name.localeCompare(skillById[b.skill_id].name)),
        }))
        .filter((g) => g.rows.length > 0),
    [categories, profileSkills, skillById],
  )

  async function run(action: () => Promise<unknown>, fallback: string) {
    onError(null)
    try {
      await action()
      onChanged()
      return true
    } catch (err) {
      onError(errorMessage(err, fallback))
      return false
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (await run(() => addContractorSkill(engineer.id, skillId, toInput(form)), 'Failed to add skill.')) {
      setSkillId('')
      setForm(emptySkillForm)
    }
  }

  function startEdit(ps: ContractorSkill) {
    setEditingId(ps.id)
    setEditForm({
      level: ps.level ?? '',
      obtained_on: ps.obtained_on ?? '',
      expires_on: ps.expires_on ?? '',
      notes: ps.notes ?? '',
    })
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault()
    if (!editingId) return
    if (await run(() => updateContractorSkill(editingId, toInput(editForm)), 'Failed to save skill.')) {
      setEditingId(null)
    }
  }

  function handleRemove(ps: ContractorSkill) {
    if (!window.confirm(`Remove "${skillById[ps.skill_id]?.name}" from ${engineer.name}'s profile?`)) return
    run(() => removeContractorSkill(ps.id), 'Failed to remove skill.')
  }

  const available = (categoryId: string) =>
    skills.filter((s) => s.category_id === categoryId && s.is_active && !onProfile.has(s.id))

  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold text-text">Skills profile</h2>

      <form onSubmit={handleAdd} className="mb-6 space-y-3 rounded-lg border border-border p-4">
        <div>
          <Label>Add a skill</Label>
          <Select required value={skillId} onChange={(e) => setSkillId(e.target.value)}>
            <option value="">Choose from the skills database…</option>
            {categories.map((c) =>
              available(c.id).length > 0 ? (
                <optgroup key={c.id} label={c.name}>
                  {available(c.id).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              ) : null,
            )}
          </Select>
        </div>
        {skillId && (
          <>
            <SkillDetailFields value={form} onChange={setForm} />
            <Button type="submit">Add to profile</Button>
          </>
        )}
        {skills.length === 0 && (
          <p className="text-xs text-text-muted">
            The skills database is empty — an admin can add skills under Admin → Skills.
          </p>
        )}
      </form>

      {grouped.length === 0 ? (
        <p className="text-sm text-text-muted">No skills on this profile yet.</p>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ category, rows }) => (
            <div key={category.id}>
              <h3 className="mb-2 text-xs font-mono-label text-text-muted">{category.name}</h3>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-surface-raised text-left text-xs font-mono-label text-text-muted">
                    <tr>
                      <th className="px-3 py-2">Skill</th>
                      <th className="px-3 py-2">Level</th>
                      <th className="px-3 py-2">Obtained</th>
                      <th className="px-3 py-2">Expires</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((ps) =>
                      editingId === ps.id ? (
                        <tr key={ps.id} className="border-t border-border">
                          <td colSpan={5} className="px-3 py-3">
                            <form onSubmit={handleSaveEdit} className="space-y-3">
                              <p className="text-sm text-text">{skillById[ps.skill_id]?.name}</p>
                              <SkillDetailFields value={editForm} onChange={setEditForm} />
                              <div className="flex gap-2">
                                <Button type="submit">Save</Button>
                                <Button type="button" variant="secondary" onClick={() => setEditingId(null)}>
                                  Cancel
                                </Button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      ) : (
                        <tr key={ps.id} className="border-t border-border align-top">
                          <td className="px-3 py-2">
                            <p className="text-text">
                              {skillById[ps.skill_id]?.name}
                              {skillById[ps.skill_id] && !skillById[ps.skill_id].is_active && (
                                <span className="ml-2 text-xs text-text-faint">(inactive)</span>
                              )}
                            </p>
                            {ps.notes && <p className="text-xs text-text-muted">{ps.notes}</p>}
                          </td>
                          <td className="px-3 py-2 text-text-muted">{ps.level ? SKILL_LEVEL_LABELS[ps.level] : '—'}</td>
                          <td className="px-3 py-2 text-text-muted">{formatDate(ps.obtained_on)}</td>
                          <td className={`px-3 py-2 ${expiryClass(ps.expires_on)}`}>{formatDate(ps.expires_on)}</td>
                          <td className="px-3 py-2 text-right">
                            <span className="flex justify-end gap-3 text-xs">
                              <button onClick={() => startEdit(ps)} className="text-accent hover:underline">
                                Edit
                              </button>
                              <button onClick={() => handleRemove(ps)} className="text-text-muted hover:text-danger">
                                Remove
                              </button>
                            </span>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function SkillDetailFields({ value, onChange }: { value: SkillForm; onChange: (v: SkillForm) => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div>
        <Label>Level (optional)</Label>
        <Select value={value.level} onChange={(e) => onChange({ ...value, level: e.target.value })}>
          <option value="">—</option>
          {LEVELS.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Obtained (optional)</Label>
        <Input
          type="date"
          value={value.obtained_on}
          onChange={(e) => onChange({ ...value, obtained_on: e.target.value })}
        />
      </div>
      <div>
        <Label>Expires (optional)</Label>
        <Input
          type="date"
          value={value.expires_on}
          onChange={(e) => onChange({ ...value, expires_on: e.target.value })}
        />
      </div>
      <div className="sm:col-span-3">
        <Label>Notes (optional)</Label>
        <Textarea rows={2} value={value.notes} onChange={(e) => onChange({ ...value, notes: e.target.value })} />
      </div>
    </div>
  )
}
