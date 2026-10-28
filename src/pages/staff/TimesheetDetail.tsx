import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { approveTimesheet, getTimesheet, rejectTimesheet } from '../../lib/api'
import { DAY_TYPE_LABELS, STATUS_LABELS, type TimesheetEntryWithRelations } from '../../lib/types'
import { Button, Card, ErrorText, Label, StatusBadge, Textarea } from '../../components/ui'

export default function TimesheetDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [ts, setTs] = useState<TimesheetEntryWithRelations | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [rejectionNotes, setRejectionNotes] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)

  useEffect(() => {
    if (!id) return
    getTimesheet(id)
      .then(setTs)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load timesheet.'))
  }, [id])

  async function handleApprove() {
    if (!id || !profile) return
    setSaving(true)
    setError(null)
    try {
      await approveTimesheet(id, profile.id)
      navigate('/staff/timesheets')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve timesheet.')
    } finally {
      setSaving(false)
    }
  }

  async function handleReject() {
    if (!id || !profile || !rejectionNotes.trim()) return
    setSaving(true)
    setError(null)
    try {
      await rejectTimesheet(id, profile.id, rejectionNotes.trim())
      navigate('/staff/timesheets')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject timesheet.')
    } finally {
      setSaving(false)
    }
  }

  if (error && !ts) return <p className="text-sm text-danger">{error}</p>
  if (!ts) return <p className="text-sm text-text-muted">Loading…</p>

  return (
    <div className="max-w-xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">{ts.reference}</h1>
        <StatusBadge status={ts.status} label={STATUS_LABELS[ts.status]} />
      </div>

      <Card className="space-y-4">
        <Field label="Contractor" value={`${ts.field_engineer.name} (${ts.field_engineer.email})`} />
        <Field label="Client" value={ts.client.name} />
        {ts.project_reference && <Field label="Project reference" value={ts.project_reference} />}
        <Field label="Date worked" value={ts.work_date} />
        <Field label="Day type" value={DAY_TYPE_LABELS[ts.day_type]} />
        <Field label="Work description" value={ts.work_description || '—'} />

        {ts.status === 'approved' && ts.approver && (
          <Field label="Approved by" value={`${ts.approver.full_name} on ${new Date(ts.approved_on!).toLocaleString('en-GB')}`} />
        )}
        {ts.status === 'rejected' && (
          <>
            {ts.approver && (
              <Field label="Rejected by" value={`${ts.approver.full_name} on ${new Date(ts.approved_on!).toLocaleString('en-GB')}`} />
            )}
            <Field label="Rejection reason" value={ts.rejection_notes || '—'} />
          </>
        )}
      </Card>

      <ErrorText>{error}</ErrorText>

      {ts.status === 'submitted' && (
        <div className="mt-6">
          {!showRejectForm ? (
            <div className="flex gap-3">
              <Button onClick={handleApprove} disabled={saving}>
                {saving ? 'Approving…' : 'Approve'}
              </Button>
              <Button variant="danger" onClick={() => setShowRejectForm(true)} disabled={saving}>
                Reject
              </Button>
            </div>
          ) : (
            <Card>
              <Label>Reason for rejection</Label>
              <Textarea
                rows={3}
                value={rejectionNotes}
                onChange={(e) => setRejectionNotes(e.target.value)}
                placeholder="Let the contractor know what needs fixing…"
              />
              <div className="mt-3 flex gap-3">
                <Button
                  variant="danger"
                  onClick={handleReject}
                  disabled={saving || !rejectionNotes.trim()}
                >
                  {saving ? 'Rejecting…' : 'Confirm rejection'}
                </Button>
                <Button variant="secondary" onClick={() => setShowRejectForm(false)} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-mono-label text-text-muted">{label}</p>
      <p className="text-sm text-text">{value}</p>
    </div>
  )
}
