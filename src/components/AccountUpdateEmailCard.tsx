import { useEffect, useState } from 'react'
import {
  getAccountUpdateSettings,
  lastAccountUpdateSent,
  previewAccountUpdate,
  saveAccountUpdateSettings,
  sendAccountUpdateTest,
} from '../lib/api/accountUpdates'
import { Button, Card, ErrorText, Input, Label, Textarea } from './ui'
import { showToast } from './Toast'

// Customer Accounts → Edit: the weekly account update email (migration 0061).
// Off until switched on here; Preview and "Send me a test" never email the customer.

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export default function AccountUpdateEmailCard({ accountId, accountName }: { accountId: string; accountName: string }) {
  const [loaded, setLoaded] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [recipients, setRecipients] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState('')
  const [last, setLast] = useState<{ created_at: string; recipient: string; status: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null)

  const snapshot = () => JSON.stringify([enabled, recipients.trim(), replyTo.trim(), note.trim()])

  useEffect(() => {
    setLoaded(false)
    Promise.all([getAccountUpdateSettings(accountId), lastAccountUpdateSent(accountId)])
      .then(([s, l]) => {
        const r = (s?.recipients ?? []).join('\n')
        setEnabled(s?.enabled ?? false)
        setRecipients(r)
        setReplyTo(s?.reply_to ?? '')
        setNote(s?.note ?? '')
        setSaved(JSON.stringify([s?.enabled ?? false, r, s?.reply_to ?? '', s?.note ?? '']))
        setLast(l)
        setLoaded(true)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load.'))
  }, [accountId])

  const list = recipients
    .split(/[\n,;]+/)
    .map((x) => x.trim())
    .filter(Boolean)
  const bad = list.filter((x) => !EMAIL.test(x))
  const replyBad = replyTo.trim() !== '' && !EMAIL.test(replyTo.trim())
  const dirty = loaded && snapshot() !== saved

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(null)
    }
  }

  function save() {
    if (bad.length) return setError(`Check these addresses: ${bad.join(', ')}`)
    if (replyBad) return setError('Check the reply-to address.')
    if (enabled && list.length === 0) return setError('Add at least one recipient before switching it on.')
    if (enabled && !replyTo.trim()) return setError('Add a reply-to address so their replies reach you.')
    if (
      enabled &&
      !JSON.parse(saved)[0] &&
      !window.confirm(`Switch on the weekly update? ${accountName} (${list.join(', ')}) will be emailed every Monday at 8am.`)
    )
      return
    run('save', async () => {
      await saveAccountUpdateSettings({
        account_id: accountId,
        name: accountName,
        enabled,
        recipients: list,
        reply_to: replyTo.trim() || null,
        note: note.trim() || null,
      })
      setRecipients(list.join('\n'))
      setSaved(JSON.stringify([enabled, list.join('\n'), replyTo.trim(), note.trim()]))
      showToast(`Weekly update ${enabled ? 'on' : 'settings saved'} for ${accountName}`)
    })
  }

  return (
    <Card className="mb-6">
      <h2 className="mb-1 text-sm font-semibold text-text">Weekly account update email</h2>
      <p className="mb-4 text-xs text-text-muted">
        Every Monday at 8am: their outstanding invoices, quotes awaiting their decision, opportunities in progress, work
        waiting for a PO and project progress — sent from Techtrus, with replies going to the address below. Internal
        figures (rebate, margins, costs, notes) are never included.
      </p>
      {!loaded && !error ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label>Send to (one address per line)</Label>
            <Textarea rows={3} value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="name@cdw.co.uk" />
          </div>
          <div className="space-y-4">
            <div>
              <Label>Replies go to</Label>
              <Input type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="e.g. sales@techtrus.com" />
            </div>
            <div>
              <Label>Short note under the greeting (optional)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Thanks for the BHFT go-ahead last week." />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-text md:col-span-2">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Send the weekly update to {accountName}
          </label>
          <div className="flex flex-wrap items-center gap-2 md:col-span-2">
            <Button type="button" disabled={busy !== null || !dirty} onClick={save}>
              {busy === 'save' ? 'Saving…' : 'Save'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy !== null}
              onClick={() => run('preview', async () => setPreview(await previewAccountUpdate(accountId, note.trim() || null)))}
            >
              {busy === 'preview' ? 'Building…' : 'Preview'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy !== null || replyBad}
              onClick={() =>
                run('test', async () => {
                  const r = await sendAccountUpdateTest(accountId, note.trim() || null, replyTo.trim() || null)
                  showToast(`Test sent to ${r.sentTo}`)
                })
              }
            >
              {busy === 'test' ? 'Sending…' : 'Send me a test'}
            </Button>
            <span className="text-xs text-text-faint">
              {last
                ? `Last sent ${new Date(last.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} to ${last.recipient}${last.status === 'failed' ? ' (failed)' : ''}`
                : enabled
                  ? 'Not sent yet — the first goes next Monday at 8am.'
                  : 'Off.'}
            </span>
          </div>
        </div>
      )}
      <ErrorText>{error}</ErrorText>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-2 py-6" onClick={() => setPreview(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Email preview"
            className="w-full max-w-3xl rounded-lg border border-border bg-surface p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-mono-label text-text-dim">Subject</p>
                <p className="text-sm text-text">{preview.subject}</p>
              </div>
              <button type="button" onClick={() => setPreview(null)} className="text-xs font-mono-label text-text-muted hover:text-text">
                Close
              </button>
            </div>
            <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-[75vh] w-full rounded border border-border bg-white" />
          </div>
        </div>
      )}
    </Card>
  )
}
