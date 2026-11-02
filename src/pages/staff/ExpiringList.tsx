import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listAllContractorSkills, listAllPersonDocuments, listFieldEngineers, listSkillCategories, listSkills } from '../../lib/api'
import { PERSON_DOCUMENT_LABELS, PERSON_KINDS, type FieldEngineer } from '../../lib/types'
import { ErrorText, Select } from '../../components/ui'
import AdminTabs from './admin/AdminTabs'
import UserAccountsTabs from './UserAccountsTabs'

// Admin → User Accounts → Expiring: certifications, clearances and (for
// admins) driving licences / passports coming up for renewal, across everyone.
// Expiry dates are entered on each profile (or by people on My Profile).

const WINDOWS = [
  { days: 30, label: 'Expired or due within 30 days' },
  { days: 60, label: 'Expired or due within 60 days' },
  { days: 90, label: 'Expired or due within 90 days' },
  { days: 365, label: 'Expired or due within a year' },
  { days: 0, label: 'Expired only' },
]

interface Item {
  key: string
  person: FieldEngineer
  what: string
  kind: string // category, or "ID document"
  expiresOn: string
  daysLeft: number
}

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000)
}

export default function ExpiringList() {
  const today = todayIso()
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [windowDays, setWindowDays] = useState(60)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [kindFilter, setKindFilter] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const [people, skills, categories, personSkills, documents] = await Promise.all([
          listFieldEngineers(),
          listSkills(),
          listSkillCategories(),
          listAllContractorSkills(),
          listAllPersonDocuments(), // only admins get other people's
        ])
        const personById = new Map(people.map((p) => [p.id, p]))
        const skillById = new Map(skills.map((s) => [s.id, s]))
        const categoryName = new Map(categories.map((c) => [c.id, c.name]))
        const list: Item[] = []
        for (const s of personSkills) {
          const person = personById.get(s.field_engineer_id)
          const skill = skillById.get(s.skill_id)
          if (!person || !skill || !s.expires_on) continue
          list.push({
            key: `s:${s.field_engineer_id}:${s.skill_id}`,
            person,
            what: skill.name,
            kind: categoryName.get(skill.category_id) ?? 'Skill',
            expiresOn: s.expires_on,
            daysLeft: daysBetween(today, s.expires_on),
          })
        }
        for (const d of documents) {
          const person = personById.get(d.field_engineer_id)
          if (!person || !d.expires_on) continue
          list.push({
            key: `d:${d.id}`,
            person,
            what: PERSON_DOCUMENT_LABELS[d.doc_type],
            kind: 'ID document',
            expiresOn: d.expires_on,
            daysLeft: daysBetween(today, d.expires_on),
          })
        }
        setItems(list.sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.person.name.localeCompare(b.person.name)))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load.')
      }
    })()
  }, [today])

  const kinds = useMemo(() => [...new Set((items ?? []).map((i) => i.kind))].sort(), [items])
  const visible = (items ?? []).filter(
    (i) =>
      (includeInactive || i.person.is_active) &&
      (!kindFilter || i.kind === kindFilter) &&
      (windowDays === 0 ? i.daysLeft < 0 : i.daysLeft <= windowDays),
  )

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-text">Admin · User Accounts · Expiring</h1>
      <AdminTabs />
      <UserAccountsTabs />

      <p className="mb-4 text-sm text-text-muted">
        Certifications, clearances and ID documents coming up for renewal, soonest first. Only items with an expiry
        date show here — add dates on each person&apos;s profile (or they can on My Profile). Driving licences and
        passports are only listed for admins.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} className="w-auto" aria-label="How far ahead">
          {WINDOWS.map((w) => (
            <option key={w.days} value={w.days}>
              {w.label}
            </option>
          ))}
        </Select>
        <Select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="w-auto" aria-label="Type">
          <option value="">All types</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm text-text-muted">
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
          Include inactive people
        </label>
      </div>

      <ErrorText>{error}</ErrorText>
      {!items && !error && <p className="text-sm text-text-muted">Loading…</p>}

      {items && (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-raised text-left text-xs font-mono-label text-text-muted">
              <tr>
                <th className="px-4 py-2">Person</th>
                <th className="px-4 py-2">What</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Expires</th>
                <th className="px-4 py-2 text-right">When</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-text-muted">
                    Nothing expiring in this period.
                  </td>
                </tr>
              ) : (
                visible.map((i) => (
                  <tr key={i.key} className="border-t border-border">
                    <td className="px-4 py-2">
                      <Link to={`${PERSON_KINDS[i.person.kind].path}/${i.person.id}`} className="text-text hover:text-accent hover:underline">
                        {i.person.name}
                      </Link>
                      <span className="block text-xs text-text-faint">
                        {i.person.kind === 'staff' ? 'Staff' : 'Contractor'}
                        {!i.person.is_active && ' · inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-text">{i.what}</td>
                    <td className="px-4 py-2 text-text-muted">{i.kind}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-text-muted">
                      {new Date(`${i.expiresOn}T00:00:00Z`).toLocaleDateString('en-GB', { dateStyle: 'medium', timeZone: 'UTC' })}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      {i.daysLeft < 0 ? (
                        <span className="font-semibold text-danger">Expired {-i.daysLeft} day{i.daysLeft === -1 ? '' : 's'} ago</span>
                      ) : i.daysLeft === 0 ? (
                        <span className="font-semibold text-danger">Expires today</span>
                      ) : (
                        <span className={i.daysLeft <= 60 ? 'text-warning' : 'text-text-muted'}>
                          in {i.daysLeft} day{i.daysLeft === 1 ? '' : 's'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
