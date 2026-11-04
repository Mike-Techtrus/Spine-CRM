import { useEffect, useState } from 'react'
import { showToast } from './Toast'
import { Link } from 'react-router-dom'
import { getOpportunity, listIntakeForOpportunity, saveOpportunityQualification, type IntakeItem } from '../lib/api'
import { JOB_TYPE_LABELS, qualificationProgress, type Qualification, type QualificationItem } from '../lib/intake'
import { Button, Card, ErrorText, Input } from './ui'

// The running qualification sheet on an opportunity (0054): built up from
// the emails linked to it in Opportunities → Intake, and editable by people.

export function QualificationTable({
  items,
  editing,
  onChange,
}: {
  items: QualificationItem[]
  editing?: boolean
  onChange?: (key: string, value: string) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-text-muted">
          <tr>
            <th className="py-1 pr-3 font-normal">Item</th>
            <th className="py-1 pr-3 font-normal">What we know</th>
            {!editing && <th className="py-1 font-normal">From</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.key} className="border-t border-border align-top">
              <td className="py-1.5 pr-3 text-text-muted">{i.label}</td>
              <td className="py-1.5 pr-3 text-text">
                {editing ? (
                  <Input value={i.value ?? ''} onChange={(e) => onChange?.(i.key, e.target.value)} />
                ) : (
                  (i.value ?? <span className="text-danger">Not known</span>)
                )}
              </td>
              {!editing && <td className="py-1.5 text-xs italic text-text-faint">{i.evidence ? `“${i.evidence}”` : ''}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function QualificationCard({ opportunityId }: { opportunityId: string }) {
  const [sheet, setSheet] = useState<Qualification | null | undefined>(undefined)
  const [emails, setEmails] = useState<IntakeItem[]>([])
  const [editing, setEditing] = useState<Qualification | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const [opp, linked] = await Promise.all([getOpportunity(opportunityId), listIntakeForOpportunity(opportunityId)])
      setSheet(opp.qualification)
      setEmails(linked)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the qualification.')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunityId])

  async function handleSave() {
    if (!editing) return
    setSaving(true)
    setError(null)
    try {
      // Typed-in values count as known: drop them from "still to find out", and note a person edited them.
      const items = editing.items.map((i) => {
        const before = sheet?.items.find((b) => b.key === i.key)
        const value = i.value?.trim() ? i.value.trim() : null
        return value === (before?.value ?? null) ? i : { ...i, value, evidence: value ? 'Entered in Spine' : null }
      })
      const known = new Set(items.filter((i) => i.value).map((i) => i.key))
      const next = { ...editing, items, missing: editing.missing.filter((m) => !known.has(m.key)) }
      await saveOpportunityQualification(opportunityId, next)
      setSheet(next)
      setEditing(null)
      showToast('Qualification saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  if (sheet === undefined) return null
  const shown = editing ?? sheet
  const progress = shown ? qualificationProgress(shown) : null

  return (
    <Card className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-mono-label text-text-muted">
          Qualification
          {shown && ` · ${JOB_TYPE_LABELS[shown.job_type]}`}
          {progress && ` · ${progress.known} of ${progress.total} known`}
        </h2>
        {sheet &&
          (editing ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setEditing(sheet)}>
              Edit
            </Button>
          ))}
      </div>

      {!shown ? (
        <p className="text-sm text-text-muted">
          No qualification sheet yet. Link an email to this opportunity from{' '}
          <Link to="/staff/opportunities/intake" className="text-accent hover:underline">
            Opportunities → Intake
          </Link>{' '}
          and the AI starts one.
        </p>
      ) : (
        <>
          {(shown.quote_due || shown.flags.length > 0) && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              {shown.quote_due && (
                <span className="text-text">Quote due {new Date(shown.quote_due).toLocaleDateString('en-GB')}</span>
              )}
              {shown.flags.map((f) => (
                <span key={f} className="rounded-full border border-warning/40 bg-warning/10 px-2.5 py-0.5 text-xs text-warning">
                  {f}
                </span>
              ))}
            </div>
          )}
          <QualificationTable
            items={shown.items}
            editing={Boolean(editing)}
            onChange={(key, value) =>
              setEditing((e) => e && { ...e, items: e.items.map((i) => (i.key === key ? { ...i, value } : i)) })
            }
          />
          {!editing && shown.missing.length > 0 && (
            <>
              <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-text-muted">Still to find out</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-text">
                {shown.missing.map((m) => (
                  <li key={m.key}>
                    {m.label} <span className="text-text-muted">— {m.why}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {emails.length > 0 && (
        <>
          <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-text-muted">Emails ({emails.length})</h3>
          <ul className="space-y-1 text-sm">
            {emails.map((e) => (
              <li key={e.id}>
                <Link to={`/staff/opportunities/intake?item=${e.id}`} className="text-accent hover:underline">
                  {e.subject || '(no subject)'}
                </Link>{' '}
                <span className="text-text-muted">
                  · {e.from_name || e.from_email} · {new Date(e.received_at).toLocaleDateString('en-GB')}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </Card>
  )
}
