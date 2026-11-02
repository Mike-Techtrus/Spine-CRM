import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  addContractorSkill,
  CV_ACCEPT,
  CV_MAX_BYTES,
  getContractorCvUrl,
  getPersonDocumentUrl,
  getProfilePhotoUrl,
  ID_DOCUMENT_ACCEPT,
  ID_DOCUMENT_MAX_BYTES,
  listPersonDocuments,
  PHOTO_ACCEPT,
  PHOTO_MAX_BYTES,
  removeContractorCv,
  removeContractorSkill,
  removePersonDocument,
  removeProfilePhoto,
  updateContractorSkill,
  updatePersonDocumentExpiry,
  uploadContractorCv,
  uploadPersonDocument,
  uploadProfilePhoto,
  type ContractorSkillInput,
} from '../../lib/api'
import {
  PERSON_DOCUMENT_LABELS,
  SKILL_LEVEL_LABELS,
  type ContractorSkill,
  type FieldEngineer,
  type PersonDocument,
  type PersonDocumentType,
  type Skill,
  type SkillCategory,
  type SkillLevel,
} from '../../lib/types'
import { Button, Card, Input, Label, Select, Textarea } from '../ui'

// Cards shared by the admin profile page (Admin → User Accounts → a person)
// and My Profile. `self` switches the wording to "you/your".

const LEVELS = Object.entries(SKILL_LEVEL_LABELS) as [SkillLevel, string][]

// Certifications and documents expiring within this many days are flagged.
const EXPIRY_WARNING_DAYS = 60

export function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString('en-GB', { dateStyle: 'medium' }) : '—'
}

export function expiryClass(expires_on: string | null) {
  if (!expires_on) return 'text-text-muted'
  const days = (new Date(expires_on).getTime() - Date.now()) / 86_400_000
  if (days < 0) return 'text-danger'
  if (days < EXPIRY_WARNING_DAYS) return 'text-warning'
  return 'text-text-muted'
}

export function errorMessage(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : fallback
  if (message.includes('contractor_skills_field_engineer_id_skill_id_key')) return 'That skill is already on this profile.'
  if (message.includes('field_engineers_email_key')) return 'Someone in Contractors or Staff already has that email.'
  if (message.includes('row-level security') && message.includes('contractor_skills'))
    return 'That skill can’t be added — it may have been switched off in the skills database.'
  return message
}

const possessive = (engineer: FieldEngineer, self: boolean) => (self ? 'your' : `${engineer.name}'s`)

// ── Photo ────────────────────────────────────────────────────────────────────

export function ProfilePhoto({ engineer, className = 'h-16 w-16' }: { engineer: FieldEngineer; className?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let current = true
    getProfilePhotoUrl(engineer).then((u) => current && setUrl(u))
    return () => {
      current = false
    }
  }, [engineer.photo_path])

  const initials = engineer.name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return url ? (
    <img src={url} alt={engineer.name} className={`${className} shrink-0 rounded-full border border-border object-cover`} />
  ) : (
    <span
      className={`${className} flex shrink-0 items-center justify-center rounded-full border border-border bg-surface-raised font-semibold text-text-muted`}
      aria-hidden
    >
      {initials}
    </span>
  )
}

export function PhotoCard({
  engineer,
  self = false,
  onChanged,
  onError,
}: {
  engineer: FieldEngineer
  self?: boolean
  onChanged: (e: FieldEngineer) => void
  onError: (message: string | null) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (file.size > PHOTO_MAX_BYTES) {
      onError('That photo is over 5 MB — please choose a smaller one.')
      return
    }
    setBusy(true)
    onError(null)
    try {
      onChanged(await uploadProfilePhoto(engineer, file))
    } catch (err) {
      onError(errorMessage(err, 'Failed to upload photo.'))
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function handleRemove() {
    if (!window.confirm(`Remove ${possessive(engineer, self)} profile photo?`)) return
    setBusy(true)
    onError(null)
    try {
      onChanged(await removeProfilePhoto(engineer))
    } catch (err) {
      onError(errorMessage(err, 'Failed to remove photo.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold text-text">Profile photo</h2>
      <div className="flex items-center gap-4">
        <ProfilePhoto engineer={engineer} className="h-20 w-20 text-lg" />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>
            {busy ? 'Working…' : engineer.photo_path ? 'Change photo' : 'Upload photo'}
          </Button>
          {engineer.photo_path && (
            <Button variant="secondary" disabled={busy} onClick={handleRemove}>
              Remove
            </Button>
          )}
        </div>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept={PHOTO_ACCEPT}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <p className="mt-3 text-xs text-text-faint">JPG, PNG or WebP, up to 5 MB. A clear head-and-shoulders photo works best.</p>
    </Card>
  )
}

// ── CV ───────────────────────────────────────────────────────────────────────

export function CvCard({
  engineer,
  self = false,
  onChanged,
  onError,
}: {
  engineer: FieldEngineer
  self?: boolean
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
    if (!window.confirm(`Remove ${possessive(engineer, self)} CV?`)) return
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

export function SkillsCard({
  engineer,
  categories,
  skills,
  profileSkills,
  self = false,
  onChanged,
  onError,
}: {
  engineer: FieldEngineer
  categories: SkillCategory[]
  skills: Skill[]
  profileSkills: ContractorSkill[]
  self?: boolean
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
    if (!window.confirm(`Remove "${skillById[ps.skill_id]?.name}" from ${possessive(engineer, self)} profile?`)) return
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
            {self
              ? 'There are no skills to choose from yet — use “Request a skill” to ask for one.'
              : 'The skills database is empty — an admin can add skills under Admin → Skills.'}
          </p>
        )}
      </form>

      {grouped.length === 0 ? (
        <p className="text-sm text-text-muted">{self ? 'You haven’t added any skills yet.' : 'No skills on this profile yet.'}</p>
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

export function SkillDetailFields({ value, onChange }: { value: SkillForm; onChange: (v: SkillForm) => void }) {
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

// ── Identity documents ───────────────────────────────────────────────────────

const DOCUMENT_TYPES = Object.entries(PERSON_DOCUMENT_LABELS) as [PersonDocumentType, string][]

// Driving licence and passport. Only the person and admins can see these
// (the database enforces it), so the admin page only shows this card to admins.
export function IdentityDocumentsCard({
  engineer,
  self = false,
  onError,
}: {
  engineer: FieldEngineer
  self?: boolean
  onError: (message: string | null) => void
}) {
  const [documents, setDocuments] = useState<PersonDocument[] | null>(null)

  async function refresh() {
    setDocuments(await listPersonDocuments(engineer.id))
  }

  useEffect(() => {
    refresh().catch((err) => onError(errorMessage(err, 'Failed to load documents.')))
  }, [engineer.id])

  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-text">Identity documents</h2>
      <p className="mb-4 text-xs text-text-faint">
        {self ? 'Only you and Spine admins can see these.' : `Only ${engineer.name} and admins can see these.`}
      </p>
      {documents === null ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : (
        <div className="space-y-4">
          {DOCUMENT_TYPES.map(([type, label]) => (
            <DocumentRow
              key={type}
              engineer={engineer}
              type={type}
              label={label}
              self={self}
              existing={documents.find((d) => d.doc_type === type)}
              onChanged={() => refresh().catch((err) => onError(errorMessage(err, 'Failed to reload documents.')))}
              onError={onError}
            />
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-text-faint">PDF or a photo (JPG, PNG, WebP), up to 10 MB each.</p>
    </Card>
  )
}

function DocumentRow({
  engineer,
  type,
  label,
  self,
  existing,
  onChanged,
  onError,
}: {
  engineer: FieldEngineer
  type: PersonDocumentType
  label: string
  self: boolean
  existing: PersonDocument | undefined
  onChanged: () => void
  onError: (message: string | null) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [expires, setExpires] = useState(existing?.expires_on ?? '')

  useEffect(() => setExpires(existing?.expires_on ?? ''), [existing?.expires_on])

  async function run(action: () => Promise<unknown>, fallback: string) {
    setBusy(true)
    onError(null)
    try {
      await action()
      onChanged()
    } catch (err) {
      onError(errorMessage(err, fallback))
    } finally {
      setBusy(false)
    }
  }

  function handleFile(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = ''
    if (!file) return
    if (file.size > ID_DOCUMENT_MAX_BYTES) {
      onError('That file is over 10 MB — please upload a smaller copy.')
      return
    }
    run(() => uploadPersonDocument(engineer.id, type, file, expires || null, existing), `Failed to upload ${label.toLowerCase()}.`)
  }

  async function handleDownload() {
    if (!existing) return
    onError(null)
    try {
      window.location.href = await getPersonDocumentUrl(existing)
    } catch (err) {
      onError(errorMessage(err, 'Failed to download.'))
    }
  }

  function handleRemove() {
    if (!existing || !window.confirm(`Remove ${possessive(engineer, self)} ${label.toLowerCase()}?`)) return
    run(() => removePersonDocument(existing), `Failed to remove ${label.toLowerCase()}.`)
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <p className="mb-2 text-sm font-medium text-text">{label}</p>
      {existing ? (
        <div className="mb-3">
          <button onClick={handleDownload} className="break-all text-left text-sm text-accent hover:underline">
            {existing.file_name}
          </button>
          <p className="text-xs text-text-muted">
            Uploaded {formatDate(existing.uploaded_at)}
            {existing.expires_on && (
              <>
                {' · '}
                <span className={expiryClass(existing.expires_on)}>Expires {formatDate(existing.expires_on)}</span>
              </>
            )}
          </p>
        </div>
      ) : (
        <p className="mb-3 text-sm text-text-muted">Not uploaded yet.</p>
      )}
      <div className="mb-3 max-w-[12rem]">
        <Label>Expiry date (optional)</Label>
        <Input type="date" value={expires} disabled={busy} onChange={(e) => setExpires(e.target.value)} />
      </div>
      <input ref={fileInput} type="file" accept={ID_DOCUMENT_ACCEPT} className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>
          {busy ? 'Working…' : existing ? 'Replace' : 'Upload'}
        </Button>
        {existing && (expires || null) !== existing.expires_on && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => run(() => updatePersonDocumentExpiry(existing.id, expires || null), 'Failed to save expiry date.')}
          >
            Save expiry date
          </Button>
        )}
        {existing && (
          <Button variant="secondary" disabled={busy} onClick={handleRemove}>
            Remove
          </Button>
        )}
      </div>
    </div>
  )
}
