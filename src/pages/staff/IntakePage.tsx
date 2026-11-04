import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  addPastedEmail,
  createOpportunityFromIntake,
  dismissIntake,
  getIntakeItem,
  linkIntakeToOpportunity,
  listAccounts,
  listIntakeItems,
  listOpportunities,
  reopenIntake,
  triageIntake,
  TO_REVIEW,
  type IntakeItem,
  type IntakeStatus,
} from '../../lib/api'
import { findAccountByName, INTAKE_CATEGORY_LABELS, JOB_TYPE_LABELS, mergeQualification, qualificationProgress } from '../../lib/intake'
import type { Account, OpportunityWithRelations } from '../../lib/types'
import { Button, Card, ErrorText, Input, Label, Select, StatusBadge, Textarea } from '../../components/ui'
import OpportunityTabs from './OpportunityTabs'
import { QualificationTable } from '../../components/QualificationCard'
import { IntakeGuide } from '../../components/guides'

// Opportunities → Intake (0054): emails about opportunities, read by AI
// (triage-email / mailbox-poll), waiting for a person to create an
// opportunity, link them to one, or dismiss them. Nothing happens to
// opportunities until someone presses a button here.

const DONE: IntakeStatus[] = ['linked', 'created', 'dismissed']

const STATUS_BADGE: Record<IntakeStatus, { status: string; label: string }> = {
  new: { status: 'draft', label: 'Not checked' },
  triaged: { status: 'submitted', label: 'To review' },
  error: { status: 'rejected', label: 'AI error' },
  linked: { status: 'approved', label: 'Linked' },
  created: { status: 'approved', label: 'Opportunity created' },
  dismissed: { status: 'expired', label: 'Dismissed' },
}

const CONFIDENCE_STYLE: Record<string, string> = {
  high: 'text-accent',
  medium: 'text-warning',
  low: 'text-text-muted',
  none: 'text-text-muted',
}

function when(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

function errorText(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

export default function IntakePage() {
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('item')
  const [view, setView] = useState<'review' | 'done'>('review')
  const [items, setItems] = useState<IntakeItem[] | null>(null)
  const [selected, setSelected] = useState<IntakeItem | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [opportunities, setOpportunities] = useState<OpportunityWithRelations[]>([])
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadList() {
    try {
      setItems(await listIntakeItems(view === 'review' ? TO_REVIEW : DONE))
    } catch (err) {
      setError(errorText(err, 'Failed to load.'))
    }
  }

  useEffect(() => {
    loadList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  useEffect(() => {
    Promise.all([listAccounts(true), listOpportunities()])
      .then(([a, o]) => {
        setAccounts(a)
        setOpportunities(o)
      })
      .catch((err) => setError(errorText(err, 'Failed to load.')))
  }, [])

  useEffect(() => {
    if (!selectedId) return setSelected(null)
    getIntakeItem(selectedId)
      .then(setSelected)
      .catch((err) => setError(errorText(err, 'Failed to load the email.')))
  }, [selectedId])

  function select(id: string | null) {
    setParams(id ? { item: id } : {})
  }

  async function refresh(id: string) {
    await loadList()
    setSelected(await getIntakeItem(id))
  }

  return (
    <div>
      <OpportunityTabs />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text">Opportunity intake</h1>
        <Button onClick={() => setAdding((v) => !v)}>{adding ? 'Close' : 'Add email'}</Button>
      </div>
      <IntakeGuide />
      <ErrorText>{error}</ErrorText>

      {adding && (
        <AddEmailCard
          onAdded={async (id) => {
            setAdding(false)
            setView('review')
            await loadList()
            select(id)
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div>
          <div className="mb-3 flex gap-2">
            <Button variant={view === 'review' ? 'primary' : 'secondary'} onClick={() => setView('review')}>
              To review
            </Button>
            <Button variant={view === 'done' ? 'primary' : 'secondary'} onClick={() => setView('done')}>
              Done
            </Button>
          </div>
          {items === null ? (
            <p className="text-sm text-text-muted">Loading…</p>
          ) : items.length === 0 ? (
            <Card>
              <p className="text-sm text-text-muted">
                {view === 'review' ? 'Nothing waiting. Paste an email in with Add email.' : 'Nothing dealt with yet.'}
              </p>
            </Card>
          ) : (
            <ul className="space-y-2">
              {items.map((i) => (
                <li key={i.id}>
                  <button
                    onClick={() => select(i.id)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      i.id === selectedId ? 'border-accent bg-surface-raised' : 'border-border bg-surface hover:bg-surface-raised'
                    }`}
                  >
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <span className="line-clamp-2 text-sm font-medium text-text">{i.subject || '(no subject)'}</span>
                      <StatusBadge {...STATUS_BADGE[i.status]} />
                    </div>
                    <p className="text-xs text-text-muted">
                      {i.from_name || i.from_email || 'Unknown sender'} · {when(i.received_at)}
                    </p>
                    {i.ai && (
                      <p className="mt-1 text-xs text-text-muted">
                        {INTAKE_CATEGORY_LABELS[i.ai.category]}
                        {i.ai.match.opportunity_number ? ` · ${i.ai.match.opportunity_number}` : ''}
                        {i.opportunity ? ` → ${i.opportunity.opportunity_number}` : ''}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lg:col-span-2">
          {selected ? (
            <IntakeDetail
              key={selected.id}
              item={selected}
              accounts={accounts}
              opportunities={opportunities}
              onChanged={() => refresh(selected.id)}
            />
          ) : (
            <Card>
              <p className="text-sm text-text-muted">Pick an email on the left to see what the AI made of it.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function AddEmailCard({ onAdded }: { onAdded: (id: string) => void }) {
  const [form, setForm] = useState({ from_name: '', from_email: '', subject: '', received: '', body: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd() {
    if (!form.body.trim()) return setError('Paste the email text in first.')
    setBusy(true)
    setError(null)
    try {
      const item = await addPastedEmail({
        from_name: form.from_name.trim() || null,
        from_email: form.from_email.trim() || null,
        subject: form.subject.trim() || null,
        received_at: form.received ? new Date(form.received).toISOString() : new Date().toISOString(),
        body_text: form.body.trim(),
      })
      // Saved first, so a failed AI check can simply be re-run from the item.
      await triageIntake(item.id).catch(() => {})
      onAdded(item.id)
    } catch (err) {
      setError(errorText(err, 'Failed to add the email.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mb-6">
      <h2 className="mb-1 text-sm font-semibold text-text">Add an email</h2>
      <p className="mb-4 text-xs text-text-muted">
        Paste in an email (and earlier replies under it, if there are any). The AI reads it, says whether it&apos;s new or
        about an existing opportunity, and fills in the qualification sheet. Nothing is created until you choose to.
      </p>
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>From (name)</Label>
          <Input value={form.from_name} onChange={(e) => setForm({ ...form, from_name: e.target.value })} />
        </div>
        <div>
          <Label>From (email)</Label>
          <Input type="email" value={form.from_email} onChange={(e) => setForm({ ...form, from_email: e.target.value })} />
        </div>
        <div>
          <Label>Subject</Label>
          <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
        </div>
        <div>
          <Label>Received</Label>
          <Input type="datetime-local" value={form.received} onChange={(e) => setForm({ ...form, received: e.target.value })} />
        </div>
      </div>
      <Label>Email text</Label>
      <Textarea rows={10} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={handleAdd} disabled={busy}>
          {busy ? 'Adding and reading…' : 'Add and check with AI'}
        </Button>
        <ErrorText>{error}</ErrorText>
      </div>
    </Card>
  )
}

function IntakeDetail({
  item,
  accounts,
  opportunities,
  onChanged,
}: {
  item: IntakeItem
  accounts: Account[]
  opportunities: OpportunityWithRelations[]
  onChanged: () => Promise<void>
}) {
  const navigate = useNavigate()
  const r = item.ai
  const decided = DONE.includes(item.status)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showEmail, setShowEmail] = useState(!r)
  const [copied, setCopied] = useState(false)
  const [linkTo, setLinkTo] = useState(r?.match.opportunity_id ?? '')

  const cdw = accounts.find((a) => a.name === 'CDW')
  const [draft, setDraft] = useState(() => ({
    name: r?.new_opportunity.name ?? item.subject ?? '',
    customer_opportunity_number: r?.new_opportunity.customer_opportunity_number ?? '',
    billing_account_id: findAccountByName(accounts, r?.new_opportunity.client_name ?? null)?.id ?? cdw?.id ?? '',
    client_id: findAccountByName(accounts, r?.new_opportunity.end_client_name ?? null)?.id ?? '',
    description: r?.new_opportunity.description ?? '',
  }))
  // Accounts can arrive after the item; fill the pickers once they do.
  useEffect(() => {
    setDraft((d) => ({
      ...d,
      billing_account_id: d.billing_account_id || findAccountByName(accounts, r?.new_opportunity.client_name ?? null)?.id || cdw?.id || '',
      client_id: d.client_id || findAccountByName(accounts, r?.new_opportunity.end_client_name ?? null)?.id || '',
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts])

  const sheet = useMemo(() => (r ? mergeQualification(null, r, item.id) : null), [r, item.id])
  const progress = sheet ? qualificationProgress(sheet) : null
  const openOpps = useMemo(
    () => opportunities.filter((o) => o.stage === 'qualifying' || o.stage === 'quoting' || o.id === linkTo),
    [opportunities, linkTo],
  )

  async function run(label: string, action: () => Promise<unknown>, fallback: string) {
    setBusy(label)
    setError(null)
    try {
      await action()
      await onChanged()
    } catch (err) {
      setError(errorText(err, fallback))
    } finally {
      setBusy(null)
    }
  }

  async function handleCreate() {
    if (!draft.name.trim()) return setError('Give the opportunity a name.')
    setBusy('create')
    setError(null)
    try {
      const id = await createOpportunityFromIntake(item, {
        name: draft.name.trim(),
        customer_opportunity_number: draft.customer_opportunity_number.trim() || null,
        billing_account_id: draft.billing_account_id || null,
        client_id: draft.client_id || null,
        description: draft.description.trim() || null,
      })
      navigate(`/staff/opportunities/${id}`)
    } catch (err) {
      setError(errorText(err, 'Failed to create the opportunity.'))
      setBusy(null)
    }
  }

  const suggestedNew = r && (r.category === 'new_opportunity' || !r.match.opportunity_id)
  const endClientUnknown = r?.new_opportunity.end_client_name && !draft.client_id

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-text">{item.subject || '(no subject)'}</h2>
            <p className="text-xs text-text-muted">
              {item.from_name} {item.from_email && `<${item.from_email}>`} · {when(item.received_at)} ·{' '}
              {item.source === 'mailbox' ? 'from the mailbox' : 'pasted in'}
            </p>
            {item.attachment_names.length > 0 && (
              <p className="text-xs text-text-muted">Attachments: {item.attachment_names.join(', ')}</p>
            )}
          </div>
          <StatusBadge {...STATUS_BADGE[item.status]} />
        </div>

        {item.status === 'error' && <p className="mb-2 text-sm text-danger">The AI check failed: {item.ai_error}</p>}

        {r ? (
          <>
            <p className="mb-2 text-sm text-text">
              <span className="font-medium">{INTAKE_CATEGORY_LABELS[r.category]}</span> · {JOB_TYPE_LABELS[r.job_type]}
              {r.quote_due && <> · quote due {new Date(r.quote_due).toLocaleDateString('en-GB')}</>}
            </p>
            <p className="mb-3 text-sm text-text-muted">{r.summary}</p>
            {r.flags.length > 0 && (
              <ul className="mb-3 flex flex-wrap gap-2">
                {r.flags.map((f) => (
                  <li key={f} className="rounded-full border border-warning/40 bg-warning/10 px-2.5 py-0.5 text-xs text-warning">
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="mb-3 text-sm text-text-muted">Not read by the AI yet.</p>
        )}

        <div className="flex flex-wrap gap-2">
          {!decided && (
            <Button
              variant="secondary"
              disabled={busy !== null}
              onClick={() => run('ai', () => triageIntake(item.id), 'The AI check failed.')}
            >
              {busy === 'ai' ? 'Reading…' : r ? 'Check again' : 'Check with AI'}
            </Button>
          )}
          <Button variant="secondary" onClick={() => setShowEmail((v) => !v)}>
            {showEmail ? 'Hide email' : 'Show email'}
          </Button>
          {decided ? (
            <Button variant="secondary" disabled={busy !== null} onClick={() => run('reopen', () => reopenIntake(item), 'Failed.')}>
              Back to review
            </Button>
          ) : (
            <Button
              variant="secondary"
              disabled={busy !== null}
              onClick={() => {
                const reason = window.prompt('Dismiss this email? Reason (optional):', r?.category === 'not_relevant' ? 'Not relevant' : '')
                if (reason !== null) run('dismiss', () => dismissIntake(item.id, reason.trim() || null), 'Failed to dismiss.')
              }}
            >
              Dismiss
            </Button>
          )}
        </div>
        {item.status === 'dismissed' && item.dismissed_reason && (
          <p className="mt-2 text-xs text-text-muted">Dismissed: {item.dismissed_reason}</p>
        )}
        {item.opportunity && (
          <p className="mt-2 text-sm">
            {item.status === 'created' ? 'Created ' : 'Linked to '}
            <Link to={`/staff/opportunities/${item.opportunity.id}`} className="text-accent hover:underline">
              {item.opportunity.opportunity_number} · {item.opportunity.name}
            </Link>
          </p>
        )}
        <ErrorText>{error}</ErrorText>
        {showEmail && (
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-raised p-3 text-xs text-text">
            {item.body_text}
          </pre>
        )}
      </Card>

      {r && !decided && (
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-text">What to do with it</h3>
          {r.match.opportunity_id ? (
            <p className="mb-3 text-sm text-text">
              Looks like{' '}
              <Link to={`/staff/opportunities/${r.match.opportunity_id}`} className="text-accent hover:underline">
                {r.match.opportunity_number}
              </Link>{' '}
              <span className={CONFIDENCE_STYLE[r.match.confidence]}>({r.match.confidence} confidence)</span> —{' '}
              <span className="text-text-muted">{r.match.reason}</span>
            </p>
          ) : (
            <p className="mb-3 text-sm text-text-muted">No existing opportunity matches. {r.match.reason}</p>
          )}

          <div className="mb-4 flex flex-wrap items-end gap-2">
            <div className="min-w-[16rem] flex-1">
              <Label>Link to an existing opportunity</Label>
              <Select value={linkTo} onChange={(e) => setLinkTo(e.target.value)}>
                <option value="">— choose —</option>
                {openOpps.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.opportunity_number} · {o.name}
                    {o.end_client ? ` · ${o.end_client.name}` : ''}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              variant={suggestedNew ? 'secondary' : 'primary'}
              disabled={!linkTo || busy !== null}
              onClick={() => run('link', () => linkIntakeToOpportunity(item, linkTo), 'Failed to link.')}
            >
              {busy === 'link' ? 'Linking…' : 'Link and update its sheet'}
            </Button>
          </div>

          <details open={Boolean(suggestedNew)} className="rounded-lg border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium text-text">Or create a new opportunity</summary>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Name</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div>
                <Label>Client (who we invoice)</Label>
                <Select value={draft.billing_account_id} onChange={(e) => setDraft({ ...draft, billing_account_id: e.target.value })}>
                  <option value="">—</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>End client</Label>
                <Select value={draft.client_id} onChange={(e) => setDraft({ ...draft, client_id: e.target.value })}>
                  <option value="">—</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
                {endClientUnknown && (
                  <p className="mt-1 text-xs text-warning">
                    &ldquo;{r.new_opportunity.end_client_name}&rdquo; isn&apos;t a customer account yet — add it in Admin →
                    Customer Accounts, or pick the right one.
                  </p>
                )}
              </div>
              <div>
                <Label>CDW opportunity number</Label>
                <Input
                  value={draft.customer_opportunity_number}
                  onChange={(e) => setDraft({ ...draft, customer_opportunity_number: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Description</Label>
                <Textarea rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
            </div>
            <Button className="mt-3" disabled={busy !== null} onClick={handleCreate}>
              {busy === 'create' ? 'Creating…' : 'Create opportunity'}
            </Button>
          </details>
        </Card>
      )}

      {r && sheet && (
        <Card>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-text">Qualification from this email</h3>
            {progress && (
              <span className="text-xs text-text-muted">
                {progress.known} of {progress.total} known
              </span>
            )}
          </div>
          <QualificationTable items={sheet.items} />
          {r.missing.length > 0 && (
            <>
              <h4 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-text-muted">Still to find out</h4>
              <ul className="list-disc space-y-1 pl-5 text-sm text-text">
                {r.missing.map((m) => (
                  <li key={m.key}>
                    {m.label} <span className="text-text-muted">— {m.why}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      {r && r.questions_email.trim() && (
        <Card>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-text">Draft reply asking for the missing details</h3>
            <Button
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(r.questions_email)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <p className="mb-2 text-xs text-text-muted">Nothing is sent from Spine — copy it into Outlook, edit and send.</p>
          <pre className="whitespace-pre-wrap rounded-lg border border-border bg-surface-raised p-3 text-sm text-text">
            {r.questions_email}
          </pre>
        </Card>
      )}

      {r && r.contacts.length > 0 && (
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-text">People in this email</h3>
          <ul className="space-y-1 text-sm text-text">
            {r.contacts.map((c, i) => (
              <li key={i}>
                {c.name}
                <span className="text-text-muted">
                  {[c.role, c.company, c.email, c.phone].filter(Boolean).length > 0 &&
                    ` — ${[c.role, c.company, c.email, c.phone].filter(Boolean).join(' · ')}`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
