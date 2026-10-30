import { useEffect, useState, type FormEvent } from 'react'
import { getCompanySettings, updateCompanySettings } from '../../../lib/api'
import type { CompanySettings } from '../../../lib/types'
import { Button, Card, ErrorText, Input, Label, Textarea } from '../../../components/ui'
import AdminTabs from './AdminTabs'

// Company details printed on every invoice (Invoice → Print / Export PDF).
// Stored in the database (company_settings, migration 0018) so the bank
// details never sit in the public GitHub repo.
export default function InvoiceSettings() {
  const [saved, setSaved] = useState<CompanySettings | null>(null)
  const [form, setForm] = useState<CompanySettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    getCompanySettings()
      .then((s) => {
        setSaved(s)
        setForm(s)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load.'))
  }, [])

  const dirty = JSON.stringify(form) !== JSON.stringify(saved)

  function field(key: keyof CompanySettings) {
    return {
      value: form?.[key] ?? '',
      onChange: (e: { target: { value: string } }) => {
        setJustSaved(false)
        setForm((f) => (f ? { ...f, [key]: e.target.value } : f))
      },
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    setSaving(true)
    setError(null)
    try {
      const {
        company_name,
        vat_reg,
        company_number,
        registered_address,
        payment_terms,
        payment_terms_text,
        bank_account_name,
        bank_account_number,
        bank_sort_code,
      } = form
      const next = await updateCompanySettings({
        company_name: company_name.trim(),
        vat_reg: vat_reg.trim(),
        company_number: company_number.trim(),
        registered_address: registered_address.trim(),
        payment_terms: payment_terms.trim(),
        payment_terms_text: payment_terms_text.trim(),
        bank_account_name: bank_account_name.trim(),
        bank_account_number: bank_account_number.trim(),
        bank_sort_code: bank_sort_code.trim(),
      })
      setSaved(next)
      setForm(next)
      setJustSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-text">Admin · Invoice settings</h1>
      <AdminTabs />

      <p className="mb-6 text-sm text-text-muted">
        Printed on every invoice (open an invoice → Print / Export PDF). Changes apply to invoices printed from now on.
      </p>

      {!form ? (
        error ? <ErrorText>{error}</ErrorText> : <p className="text-sm text-text-muted">Loading…</p>
      ) : (
        <form onSubmit={handleSave} className="max-w-2xl space-y-6">
          <Card>
            <h2 className="mb-4 text-sm font-semibold text-text">Company</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label>Company name</Label>
                <Input {...field('company_name')} />
              </div>
              <div>
                <Label>Company VAT reg</Label>
                <Input {...field('vat_reg')} />
              </div>
              <div>
                <Label>Company registration number</Label>
                <Input {...field('company_number')} />
              </div>
              <div className="sm:col-span-3">
                <Label>Registered address</Label>
                <Input {...field('registered_address')} />
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-sm font-semibold text-text">Payment terms</h2>
            <div className="space-y-4">
              <p className="text-xs text-text-muted">
                Each client&apos;s payment terms (standard 30 days) are set on Admin → Customer Accounts → Edit and
                shown as &quot;Terms&quot; on its invoices.
              </p>
              <div className="max-w-xs">
                <Label>Terms if an invoice has no client</Label>
                <Input placeholder="e.g. 30 Days" {...field('payment_terms')} />
              </div>
              <div>
                <Label>Terms wording — write {'{days}'} where the client&apos;s number of days should go</Label>
                <Textarea rows={3} {...field('payment_terms_text')} />
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-sm font-semibold text-text">Bank details</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label>Account name</Label>
                <Input autoComplete="off" {...field('bank_account_name')} />
              </div>
              <div>
                <Label>Account number</Label>
                <Input autoComplete="off" inputMode="numeric" {...field('bank_account_number')} />
              </div>
              <div>
                <Label>Sort code</Label>
                <Input autoComplete="off" placeholder="00-00-00" {...field('bank_sort_code')} />
              </div>
            </div>
            {!saved?.bank_account_number && (
              <p className="mt-3 text-xs text-warning">
                No bank details yet — invoices will print without them until they're filled in.
              </p>
            )}
          </Card>

          <ErrorText>{error}</ErrorText>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save settings'}
            </Button>
            {justSaved && !dirty && <span className="text-xs text-text-muted">Saved.</span>}
          </div>
        </form>
      )}
    </div>
  )
}
