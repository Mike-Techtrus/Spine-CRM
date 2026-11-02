import { useState } from 'react'
import { approveSkillRequest, declineSkillRequest, type PendingSkillRequest } from '../../../lib/api'
import type { SkillCategory } from '../../../lib/types'
import { Button, Card, Input, Label, Select } from '../../../components/ui'

// Admin → Skills: skills that contractors/staff asked for from My Profile (0036).
// Approving creates the skill (or reuses one with the same name in that
// category) and adds it to the person's profile.
export default function SkillRequestsPanel({
  requests,
  categories,
  onChanged,
  onError,
}: {
  requests: PendingSkillRequest[]
  categories: SkillCategory[]
  onChanged: () => Promise<void>
  onError: (message: string | null) => void
}) {
  if (requests.length === 0) return null
  return (
    <Card className="mb-6 border-warning/40">
      <h2 className="mb-1 text-sm font-semibold text-text">Skill requests ({requests.length})</h2>
      <p className="mb-4 text-xs text-text-muted">
        Asked for from My Profile. Check the name and category, then approve to add it to the skills list and the
        person&apos;s profile — or decline with a short reason they&apos;ll see.
      </p>
      <div className="space-y-3">
        {requests.map((r) => (
          <RequestRow key={r.id} request={r} categories={categories} onChanged={onChanged} onError={onError} />
        ))}
      </div>
    </Card>
  )
}

function RequestRow({
  request,
  categories,
  onChanged,
  onError,
}: {
  request: PendingSkillRequest
  categories: SkillCategory[]
  onChanged: () => Promise<void>
  onError: (message: string | null) => void
}) {
  const [form, setForm] = useState({
    category_id: request.category_id ?? '',
    name: request.name,
    description: '',
    response: '',
  })
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<unknown>, fallback: string) {
    setBusy(true)
    onError(null)
    try {
      await action()
      await onChanged()
    } catch (err) {
      const message = err instanceof Error ? err.message : fallback
      onError(message.includes('skills_category_name_key') ? 'A skill with that name already exists in that category.' : message)
    } finally {
      setBusy(false)
    }
  }

  function handleDecline() {
    if (!window.confirm(`Decline "${request.name}" for ${request.person.name}?`)) return
    run(() => declineSkillRequest(request.id, form.response), 'Failed to decline the request.')
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-sm text-text">
        <span className="font-medium">{request.person.name}</span>{' '}
        <span className="text-text-muted">
          ({request.person.kind === 'staff' ? 'Staff' : 'Contractor'}) asked for “{request.name}” on{' '}
          {new Date(request.created_at).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
        </span>
      </p>
      {request.details && <p className="mt-1 text-xs text-text-muted">“{request.details}”</p>}

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>Category</Label>
          <Select value={form.category_id} disabled={busy} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
            <option value="">Choose…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Skill name</Label>
          <Input value={form.name} disabled={busy} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <Label>Description (optional)</Label>
          <Input value={form.description} disabled={busy} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <Label>Note to {request.person.name.split(' ')[0]} (optional)</Label>
          <Input value={form.response} disabled={busy} onChange={(e) => setForm({ ...form, response: e.target.value })} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={busy || !form.category_id || !form.name.trim()}
          onClick={() => run(() => approveSkillRequest(request.id, form), 'Failed to approve the request.')}
        >
          {busy ? 'Working…' : 'Approve and add'}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={handleDecline}>
          Decline
        </Button>
      </div>
    </div>
  )
}
