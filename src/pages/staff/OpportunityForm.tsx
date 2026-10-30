import { useEffect, useState, type SyntheticEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  createOpportunity,
  getOpportunity,
  listAccounts,
  listQuotesByOpportunity,
  updateOpportunity,
} from '../../lib/api'
import type { Account, OpportunitySource, OpportunityStage, QuoteWithRelations } from '../../lib/types'
import { OPPORTUNITY_SOURCE_LABELS, OPPORTUNITY_STAGE_LABELS, QUOTE_STATUS_LABELS } from '../../lib/types'
import { Button, Card, ErrorText, Input, Label, Select, StatusBadge, Textarea } from '../../components/ui'
import AccountQuickAdd from '../../components/AccountQuickAdd'
import { preventEnterSubmit } from '../../lib/preventEnterSubmit'
import { useUnsavedChangesGuard } from '../../lib/useUnsavedChangesGuard'

const QUOTE_STATUS_BADGE_MAP: Record<string, string> = {
  draft: 'draft',
  sent: 'submitted',
  accepted: 'approved',
  declined: 'rejected',
  expired: 'expired',
}

const emptyForm = {
  name: '',
  customer_opportunity_number: '',
  opportunity_owner: '',
  billing_account_id: '',
  client_id: '',
  description: '',
  estimated_value: '',
  expected_close_date: '',
  source: '' as OpportunitySource | '',
  stage: 'qualifying' as OpportunityStage,
}

export default function OpportunityForm() {
  const { id } = useParams()
  const isEditing = Boolean(id)
  const navigate = useNavigate()

  const [accounts, setAccounts] = useState<Account[]>([])
  const [addingAccountFor, setAddingAccountFor] = useState<'billing_account_id' | 'client_id' | null>(null)
  const [opportunityNumber, setOpportunityNumber] = useState<string | null>(null)
  const [linkedQuotes, setLinkedQuotes] = useState<QuoteWithRelations[]>([])
  // Accepted quotes that have a Value — these set the estimate (0026/0027).
  const acceptedQuotes = linkedQuotes.filter((q) => q.status === 'accepted' && q.value !== null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [initialSnapshot, setInitialSnapshot] = useState(() => JSON.stringify(emptyForm))
  const isDirty = !loading && JSON.stringify(form) !== initialSnapshot
  const { allowNextNavigation } = useUnsavedChangesGuard(isDirty)

  useEffect(() => {
    ;(async () => {
      try {
        const accountList = await listAccounts(true)
        setAccounts(accountList)

        if (id) {
          const [opp, quotes] = await Promise.all([getOpportunity(id), listQuotesByOpportunity(id)])
          setOpportunityNumber(opp.opportunity_number)
          setLinkedQuotes(quotes)
          const loaded = {
            name: opp.name,
            customer_opportunity_number: opp.customer_opportunity_number ?? '',
            opportunity_owner: opp.opportunity_owner ?? '',
            billing_account_id: opp.billing_account_id ?? '',
            client_id: opp.client_id ?? '',
            description: opp.description ?? '',
            estimated_value: opp.estimated_value?.toString() ?? '',
            expected_close_date: opp.expected_close_date ?? '',
            source: (opp.source ?? '') as OpportunitySource | '',
            stage: opp.stage,
          }
          setForm(loaded)
          setInitialSnapshot(JSON.stringify(loaded))
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load.')
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  function handleAccountCreated(account: Account) {
    setAccounts((prev) => [...prev, account].sort((a, b) => a.name.localeCompare(b.name)))
    if (addingAccountFor) setForm((f) => ({ ...f, [addingAccountFor]: account.id }))
    setAddingAccountFor(null)
  }

  async function handleSave(e: SyntheticEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const input = {
        name: form.name,
        customer_opportunity_number: form.customer_opportunity_number || null,
        opportunity_owner: form.opportunity_owner || null,
        billing_account_id: form.billing_account_id || null,
        client_id: form.client_id || null,
        description: form.description || null,
        // Worked out from accepted quotes by the database (0026) once there are
        // any — don't send it then, or a stale value could overwrite it.
        ...(acceptedQuotes.length > 0
          ? {}
          : { estimated_value: form.estimated_value ? Number(form.estimated_value) : null }),
        expected_close_date: form.expected_close_date || null,
        source: form.source || null,
        stage: form.stage,
      }

      if (isEditing && id) {
        await updateOpportunity(id, input)
      } else {
        await createOpportunity(input)
      }
      allowNextNavigation()
      navigate('/staff/opportunities')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save opportunity.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-text-muted">Loading…</p>

  return (
    <div className="max-w-4xl">
      <h1 className="mb-6 text-xl font-semibold text-text">
        {isEditing ? `Edit opportunity ${opportunityNumber ?? ''}` : 'New opportunity'}
      </h1>

      <Card className="max-w-xl">
        <form onSubmit={handleSave} onKeyDown={preventEnterSubmit} className="space-y-4">
          <div>
            <Label>Customer Opp Name</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Opportunity Owner</Label>
              <Input
                value={form.opportunity_owner}
                onChange={(e) => setForm({ ...form, opportunity_owner: e.target.value })}
              />
            </div>
            <div>
              <Label>Customer Opp #</Label>
              <Input
                value={form.customer_opportunity_number}
                onChange={(e) => setForm({ ...form, customer_opportunity_number: e.target.value })}
                placeholder="e.g. OPP123456"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label>Client</Label>
                <button
                  type="button"
                  onClick={() => setAddingAccountFor('billing_account_id')}
                  className="text-xs text-accent hover:underline"
                >
                  + New account
                </button>
              </div>
              <Select
                value={form.billing_account_id}
                onChange={(e) => setForm({ ...form, billing_account_id: e.target.value })}
              >
                <option value="">—</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label>End client</Label>
                <button
                  type="button"
                  onClick={() => setAddingAccountFor('client_id')}
                  className="text-xs text-accent hover:underline"
                >
                  + New account
                </button>
              </div>
              <Select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
                <option value="">—</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {addingAccountFor && (
            <AccountQuickAdd onCreated={handleAccountCreated} onCancel={() => setAddingAccountFor(null)} />
          )}

          <div>
            <Label>Description</Label>
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Estimated value (£)</Label>
              <Input
                type="number"
                step="0.01"
                disabled={acceptedQuotes.length > 0}
                value={form.estimated_value}
                onChange={(e) => setForm({ ...form, estimated_value: e.target.value })}
              />
              {acceptedQuotes.length > 0 ? (
                <p className="mt-1 text-xs text-text-faint">
                  Total Value of {acceptedQuotes.length} accepted quote{acceptedQuotes.length === 1 ? '' : 's'} — updates
                  automatically.
                </p>
              ) : (
                <p className="mt-1 text-xs text-text-faint">Optional — set automatically once a quote is accepted.</p>
              )}
            </div>
            <div>
              <Label>Stage</Label>
              <Select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value as OpportunityStage })}>
                {Object.entries(OPPORTUNITY_STAGE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Source</Label>
              <Select
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value as OpportunitySource })}
              >
                <option value="">—</option>
                {Object.entries(OPPORTUNITY_SOURCE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Expected close date</Label>
              <Input
                type="date"
                value={form.expected_close_date}
                onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })}
              />
            </div>
          </div>

          <ErrorText>{error}</ErrorText>

          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save opportunity'}
          </Button>
        </form>
      </Card>

      {isEditing && (
        <Card className="mt-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-mono-label text-text-muted">
              Linked quotes {linkedQuotes.length > 0 ? `(${linkedQuotes.length})` : ''}
            </h2>
            {id && (
              <Link to={`/staff/quotes/new?opportunityId=${id}`}>
                <Button variant="secondary">New quote</Button>
              </Link>
            )}
          </div>

          {linkedQuotes.length === 0 ? (
            <p className="text-sm text-text-muted">No quotes linked to this opportunity yet.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface-raised text-left text-xs font-mono-label text-text-muted">
                  <tr>
                    <th className="px-4 py-2">Quote #</th>
                    <th className="px-4 py-2">Quote date</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Net value</th>
                  </tr>
                </thead>
                <tbody>
                  {linkedQuotes.map((q) => (
                    <tr
                      key={q.id}
                      className="cursor-pointer border-t border-border hover:bg-surface-raised"
                      onClick={() => navigate(`/staff/quotes/${q.id}`)}
                    >
                      <td className="px-4 py-2 font-mono-label text-text-muted">{q.quote_number}</td>
                      <td className="px-4 py-2 text-text-muted">{q.quote_date || '—'}</td>
                      <td className="px-4 py-2">
                        <StatusBadge status={QUOTE_STATUS_BADGE_MAP[q.status]} label={QUOTE_STATUS_LABELS[q.status]} />
                      </td>
                      <td className="px-4 py-2 text-text-muted">
                        {q.net_value ? `£${Number(q.net_value).toLocaleString('en-GB')}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
