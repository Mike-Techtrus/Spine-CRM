import { useState, type SyntheticEvent } from 'react'
import { createAccount } from '../lib/api'
import type { Account } from '../lib/types'
import { Button, Card, ErrorText, Input, Label } from './ui'

const emptyForm = { name: '', website: '', phone: '', email: '', city: '', postcode: '' }

/**
 * Inline "add an account without leaving this page" form — drop it under a
 * Client/End client <Select> (triggered by a small "+ New account" link) so
 * staff don't have to abandon whatever they're creating just because the
 * account doesn't exist yet. Calls `onCreated` with the saved Account once
 * it's in the database; the caller decides what to do with it (add it to a
 * local accounts list, select it in the triggering field, etc).
 */
export default function AccountQuickAdd({
  onCreated,
  onCancel,
}: {
  onCreated: (account: Account) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave(e?: SyntheticEvent) {
    e?.preventDefault()
    if (!form.name.trim()) {
      setError('Name is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const created = await createAccount({
        name: form.name.trim(),
        website: form.website || null,
        phone: form.phone || null,
        email: form.email || null,
        city: form.city || null,
        postcode: form.postcode || null,
      })
      onCreated(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add account.')
      setSaving(false)
    }
  }

  // Deliberately a <div>, not a <form>: this component is always dropped
  // inline inside another form (e.g. the Opportunity form), and HTML forms
  // can't be nested — a nested <form>'s submit event bubbles up and also
  // fires the outer form's onSubmit, which previously caused the outer
  // form to save/navigate unexpectedly when clicking "Add account". Enter
  // in a field still submits, via the keydown handler below.
  return (
    <Card className="bg-sunken">
      <div
        className="space-y-3"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            handleSave()
          }
        }}
      >
        <div className="flex items-center justify-between">
          <p className="text-xs font-mono-label text-text-muted">New account</p>
          <button type="button" onClick={onCancel} className="text-xs text-text-faint hover:text-text">
            Cancel
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Name</Label>
            <Input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>City</Label>
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div>
            <Label>Postcode</Label>
            <Input value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value })} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Website</Label>
            <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          </div>
        </div>

        <ErrorText>{error}</ErrorText>

        <Button type="button" onClick={() => handleSave()} variant="secondary" disabled={saving}>
          {saving ? 'Adding…' : 'Add account'}
        </Button>
      </div>
    </Card>
  )
}
