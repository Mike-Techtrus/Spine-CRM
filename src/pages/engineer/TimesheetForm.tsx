import { useEffect, useState, type SyntheticEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import {
  createTimesheet,
  getMyFieldEngineer,
  getTimesheet,
  listAccounts,
  submitTimesheet,
  updateTimesheet,
} from '../../lib/api'
import type { Account, DayType, FieldEngineer } from '../../lib/types'
import { Button, Card, ErrorText, Input, Label, Select, StatusBadge, Textarea } from '../../components/ui'
import { DAY_TYPE_LABELS, STATUS_LABELS } from '../../lib/types'
import { preventEnterSubmit } from '../../lib/preventEnterSubmit'
import { useUnsavedChangesGuard } from '../../lib/useUnsavedChangesGuard'

const emptyForm = {
  client_id: '',
  project_reference: '',
  work_date: new Date().toISOString().slice(0, 10),
  day_type: 'full_day' as DayType,
  work_description: '',
}

export default function TimesheetForm() {
  const { id } = useParams()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const { session } = useAuth()

  const [engineer, setEngineer] = useState<FieldEngineer | null>(null)
  const [clients, setClients] = useState<Account[]>([])
  const [form, setForm] = useState(emptyForm)
  const [status, setStatus] = useState<string>('draft')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rejectionNotes, setRejectionNotes] = useState<string | null>(null)

  const [initialSnapshot, setInitialSnapshot] = useState(() => JSON.stringify(emptyForm))
  const isDirty = !loading && JSON.stringify(form) !== initialSnapshot
  const { allowNextNavigation } = useUnsavedChangesGuard(isDirty)

  useEffect(() => {
    if (!session) return
    ;(async () => {
      try {
        const [eng, clientList] = await Promise.all([getMyFieldEngineer(session.user.id), listAccounts(true)])
        setEngineer(eng)
        setClients(clientList)

        if (id) {
          const ts = await getTimesheet(id)
          const loaded = {
            client_id: ts.client_id,
            project_reference: ts.project_reference ?? '',
            work_date: ts.work_date,
            day_type: ts.day_type,
            work_description: ts.work_description ?? '',
          }
          setForm(loaded)
          setInitialSnapshot(JSON.stringify(loaded))
          setStatus(ts.status)
          setRejectionNotes(ts.rejection_notes)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load form.')
      } finally {
        setLoading(false)
      }
    })()
  }, [session, id])

  const readOnly = status === 'submitted' || status === 'approved'

  async function handleSave(e: SyntheticEvent, submit: boolean) {
    e.preventDefault()
    if (!engineer) return
    setSaving(true)
    setError(null)
    try {
      const input = {
        client_id: form.client_id,
        project_reference: form.project_reference || null,
        work_date: form.work_date,
        day_type: form.day_type,
        work_description: form.work_description || null,
      }

      let savedId = id
      if (isEditing && id) {
        await updateTimesheet(id, input)
      } else {
        const created = await createTimesheet(engineer.id, input)
        savedId = created.id
      }

      if (submit && savedId) {
        await submitTimesheet(savedId)
      }

      allowNextNavigation()
      navigate('/my/timesheets')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save timesheet.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-text-muted">Loading…</p>

  if (!engineer) {
    return (
      <Card>
        <p className="text-sm text-text">
          Your login isn't linked to a field engineer record yet. Ask a Spine CRM admin to link your
          account before you can submit timesheets.
        </p>
      </Card>
    )
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">{isEditing ? 'Edit entry' : 'New entry'}</h1>
        {isEditing && <StatusBadge status={status} label={STATUS_LABELS[status as keyof typeof STATUS_LABELS]} />}
      </div>

      {status === 'rejected' && rejectionNotes && (
        <Card className="mb-4 border-danger/40">
          <p className="text-xs font-mono-label text-danger">Rejected — reason given</p>
          <p className="mt-1 text-sm text-text">{rejectionNotes}</p>
        </Card>
      )}

      <Card>
        <form onSubmit={(e) => handleSave(e, false)} onKeyDown={preventEnterSubmit} className="space-y-4">
          <div>
            <Label>Client</Label>
            <Select
              required
              disabled={readOnly}
              value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}
            >
              <option value="" disabled>
                Select a client…
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label>Project / job reference (optional)</Label>
            <Input
              disabled={readOnly}
              value={form.project_reference}
              onChange={(e) => setForm({ ...form, project_reference: e.target.value })}
              placeholder="e.g. opportunity or PO reference"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Date worked</Label>
              <Input
                type="date"
                required
                disabled={readOnly}
                value={form.work_date}
                onChange={(e) => setForm({ ...form, work_date: e.target.value })}
              />
            </div>
            <div>
              <Label>Day type</Label>
              <Select
                disabled={readOnly}
                value={form.day_type}
                onChange={(e) => setForm({ ...form, day_type: e.target.value as DayType })}
              >
                {Object.entries(DAY_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label>Work description</Label>
            <Textarea
              rows={4}
              disabled={readOnly}
              value={form.work_description}
              onChange={(e) => setForm({ ...form, work_description: e.target.value })}
              placeholder="What did you work on?"
            />
          </div>

          <ErrorText>{error}</ErrorText>

          {!readOnly && (
            <div className="flex gap-3 pt-2">
              <Button type="submit" variant="secondary" disabled={saving}>
                Save draft
              </Button>
              <Button type="button" onClick={(e) => handleSave(e, true)} disabled={saving}>
                {saving ? 'Submitting…' : 'Submit for approval'}
              </Button>
            </div>
          )}
        </form>
      </Card>
    </div>
  )
}
