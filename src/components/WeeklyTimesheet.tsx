import { useEffect, useMemo, useState } from 'react'
import {
  createProjectTimesheet,
  deleteTimesheet,
  listAssignmentTimesheets,
  listMyAssignments,
  listMyTimesheetsBetween,
  submitTimesheets,
  updateTimesheetDay,
  type MyAssignment,
} from '../lib/api'
import { DAY_TYPE_DAYS, type DayType, type TimesheetEntry, type TimesheetStatus } from '../lib/types'
import { Button, Card, ErrorText } from './ui'

// ── Dates (local, ISO yyyy-mm-dd) ────────────────────────────────────────────

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function mondayOf(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

const CELL_OPTIONS: { value: DayType | ''; label: string }[] = [
  { value: '', label: '—' },
  { value: 'full_day', label: 'Full' },
  { value: 'half_day_am', label: 'AM' },
  { value: 'half_day_pm', label: 'PM' },
]
const CELL_LABEL: Record<DayType, string> = { full_day: 'Full', half_day_am: 'AM', half_day_pm: 'PM' }

const LOCKED_STYLE: Record<TimesheetStatus, string> = {
  draft: '',
  submitted: 'border-warning/40 bg-warning/10 text-warning',
  approved: 'border-accent/40 bg-accent/10 text-accent',
  rejected: '',
}

function days(n: number) {
  return n.toLocaleString('en-GB', { maximumFractionDigits: 1 })
}

const key = (assignmentId: string, date: string) => `${assignmentId}:${date}`

/**
 * Timesheets → My timesheets → weekly grid: one row per project line I'm assigned to,
 * Mon–Sun cells (Full / AM / PM). Save keeps drafts; Submit week sends the
 * week's drafts for approval. The database blocks anything that would take an
 * allocation past its days, or put more than a day on one date.
 */
export default function WeeklyTimesheet({ fieldEngineerId, onChanged }: { fieldEngineerId: string; onChanged: () => void }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))
  const [assignments, setAssignments] = useState<MyAssignment[]>([])
  const [entries, setEntries] = useState<TimesheetEntry[]>([])
  const [usage, setUsage] = useState<{ project_assignment_id: string; day_type: DayType; status: TimesheetStatus }[]>([])
  const [cells, setCells] = useState<Map<string, DayType | ''>>(new Map())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const from = iso(dates[0])
  const to = iso(dates[6])

  async function load() {
    setLoading(true)
    try {
      const mine = await listMyAssignments(fieldEngineerId)
      const [week, used] = await Promise.all([
        listMyTimesheetsBetween(fieldEngineerId, from, to),
        listAssignmentTimesheets(mine.map((a) => a.id)),
      ])
      setAssignments(mine)
      setEntries(week)
      setUsage(used)
      const next = new Map<string, DayType | ''>()
      for (const e of week) if (e.project_assignment_id && e.status !== 'rejected') next.set(key(e.project_assignment_id, e.work_date), e.day_type)
      for (const e of week)
        if (e.project_assignment_id && e.status === 'rejected' && !next.has(key(e.project_assignment_id, e.work_date)))
          next.set(key(e.project_assignment_id, e.work_date), e.day_type)
      setCells(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load timesheets.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setError(null)
    setMessage(null)
    load()
  }, [fieldEngineerId, from])

  // Entry already saved for a row/day (live one first, else a rejected one).
  const entryAt = (assignmentId: string, date: string) =>
    entries.find((e) => e.project_assignment_id === assignmentId && e.work_date === date && e.status !== 'rejected') ??
    entries.find((e) => e.project_assignment_id === assignmentId && e.work_date === date)

  // Rows: active projects, plus any with entries this week.
  const rows = assignments
    .filter((a) => a.project_line.project.status === 'active' || entries.some((e) => e.project_assignment_id === a.id))
    .sort((x, y) =>
      `${x.project_line.project.reference} ${x.project_line.part_code}`.localeCompare(
        `${y.project_line.project.reference} ${y.project_line.part_code}`,
      ),
    )

  // Days per allocation: submitted + approved anywhere, plus drafts outside
  // this week; this week's cells are added on top as "planned".
  function rowNumbers(a: MyAssignment) {
    const mine = usage.filter((u) => u.project_assignment_id === a.id)
    const sum = (list: { day_type: DayType }[]) => list.reduce((s, x) => s + DAY_TYPE_DAYS[x.day_type], 0)
    const committed = sum(mine.filter((u) => u.status === 'submitted' || u.status === 'approved'))
    const weekDrafts = sum(entries.filter((e) => e.project_assignment_id === a.id && e.status === 'draft'))
    const draftsElsewhere = sum(mine.filter((u) => u.status === 'draft')) - weekDrafts
    const plannedThisWeek = dates.reduce((s, d) => {
      const date = iso(d)
      const e = entryAt(a.id, date)
      if (e && (e.status === 'submitted' || e.status === 'approved')) return s
      const v = cells.get(key(a.id, date))
      return s + (v ? DAY_TYPE_DAYS[v] : 0)
    }, 0)
    const allocated = Number(a.allocated_days)
    const left = allocated - committed - draftsElsewhere - plannedThisWeek
    return { allocated, left }
  }

  // Per-date totals across project rows, plus any non-project time that day.
  function dayTotal(date: string) {
    const otherTime = entries
      .filter((e) => !e.project_assignment_id && e.work_date === date && e.status !== 'rejected')
      .reduce((s, e) => s + DAY_TYPE_DAYS[e.day_type], 0)
    return rows.reduce((s, a) => {
      const v = cells.get(key(a.id, date))
      return s + (v ? DAY_TYPE_DAYS[v] : 0)
    }, otherTime)
  }

  // Write the grid to the database: create, change or clear drafts.
  async function save(): Promise<boolean> {
    for (const a of rows) {
      for (const d of dates) {
        const date = iso(d)
        const want = cells.get(key(a.id, date)) ?? ''
        const e = entryAt(a.id, date)
        if (e && (e.status === 'submitted' || e.status === 'approved')) continue
        if (!e) {
          if (want) await createProjectTimesheet(fieldEngineerId, { project_assignment_id: a.id, work_date: date, day_type: want, work_description: null })
          continue
        }
        if (!want) {
          if (e.status === 'rejected') await updateTimesheetDay(e.id, { day_type: e.day_type, status: 'draft' })
          await deleteTimesheet(e.id)
        } else if (e.day_type !== want || e.status === 'rejected') {
          await updateTimesheetDay(e.id, { day_type: want, status: 'draft' })
        }
      }
    }
    return true
  }

  async function handleSave() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await save()
      await load()
      onChanged()
      setMessage('Saved as draft.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function handleSubmit() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await save()
      const week = await listMyTimesheetsBetween(fieldEngineerId, from, to)
      const draftEntries = week.filter((e) => e.project_assignment_id && e.status === 'draft')
      const drafts = draftEntries.map((e) => e.id)
      const draftDays = draftEntries.reduce((s, e) => s + DAY_TYPE_DAYS[e.day_type], 0)
      if (drafts.length === 0) {
        setMessage('Nothing to submit this week.')
      } else {
        await submitTimesheets(drafts)
        setMessage(`Submitted ${days(draftDays)} day${draftDays === 1 ? '' : 's'} for approval.`)
      }
      await load()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit.')
      await load()
    } finally {
      setBusy(false)
    }
  }

  const weekLabel = `${dates[0].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${dates[6].toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
  const today = iso(new Date())

  return (
    <Card className="mb-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-text">Project time · week of {weekLabel}</h2>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" className="px-3 py-1.5" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            ← Prev
          </Button>
          <Button type="button" variant="secondary" className="px-3 py-1.5" onClick={() => setWeekStart(mondayOf(new Date()))}>
            This week
          </Button>
          <Button type="button" variant="secondary" className="px-3 py-1.5" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            Next →
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-text-muted">
          You're not assigned to any active project lines yet. Once a project owner assigns you days, they'll appear here.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-surface-raised text-left text-xs font-mono-label text-text-muted">
                <tr>
                  <th className="px-3 py-2">Project line</th>
                  {dates.map((d) => (
                    <th key={iso(d)} className={`w-20 px-1 py-2 text-center ${iso(d) === today ? 'text-accent' : ''}`}>
                      {d.toLocaleDateString('en-GB', { weekday: 'short' })}
                      <span className="block font-normal">{d.getDate()}</span>
                    </th>
                  ))}
                  <th className="w-24 px-3 py-2 text-right">Days left</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const n = rowNumbers(a)
                  const p = a.project_line.project
                  return (
                    <tr key={a.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <p className="text-text">
                          <span className="font-mono-label text-text-muted">{p.reference}</span> ·{' '}
                          {a.project_line.part_code || a.project_line.line_type}
                        </p>
                        <p className="text-xs text-text-faint">
                          {p.name}
                          {p.status === 'complete' && ' (complete)'}
                        </p>
                      </td>
                      {dates.map((d) => {
                        const date = iso(d)
                        const e = entryAt(a.id, date)
                        if (e && (e.status === 'submitted' || e.status === 'approved')) {
                          return (
                            <td key={date} className="px-1 py-2 text-center">
                              <span
                                className={`inline-block w-16 rounded border px-1 py-1 text-xs ${LOCKED_STYLE[e.status]}`}
                                title={e.status === 'approved' ? 'Approved' : 'Submitted — waiting for approval'}
                              >
                                {CELL_LABEL[e.day_type]}
                              </span>
                            </td>
                          )
                        }
                        const rejected = e?.status === 'rejected'
                        return (
                          <td key={date} className="px-1 py-2 text-center">
                            <select
                              aria-label={`${p.reference} ${a.project_line.part_code ?? ''} ${date}`}
                              value={cells.get(key(a.id, date)) ?? ''}
                              disabled={busy || p.status === 'complete'}
                              title={rejected ? `Rejected: ${e?.rejection_notes ?? ''}` : undefined}
                              onChange={(ev) => {
                                const next = new Map(cells)
                                next.set(key(a.id, date), ev.target.value as DayType | '')
                                setCells(next)
                              }}
                              className={`w-16 rounded border bg-sunken px-1 py-1 text-xs text-text focus:border-accent focus:outline-none ${
                                rejected ? 'border-danger' : e ? 'border-border-strong' : 'border-border'
                              }`}
                            >
                              {CELL_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        )
                      })}
                      <td className={`px-3 py-2 text-right ${n.left < 0 ? 'font-semibold text-danger' : 'text-text-muted'}`}>
                        {days(n.left)}
                        <span className="block text-xs text-text-faint">of {days(n.allocated)}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border text-xs text-text-muted">
                  <td className="px-3 py-2 text-right font-mono-label">Day total</td>
                  {dates.map((d) => {
                    const t = dayTotal(iso(d))
                    return (
                      <td key={iso(d)} className={`px-1 py-2 text-center ${t > 1 ? 'font-semibold text-danger' : ''}`}>
                        {t ? days(t) : ''}
                      </td>
                    )
                  })}
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="mt-2 text-xs text-text-faint">
            Pick Full, AM or PM for each day worked. Grey cells are saved drafts; amber are submitted, green approved; a red
            border means rejected (hover for the reason) — change it and submit again. Submitting is blocked if it would
            take you over the days allocated to you.
          </p>

          <ErrorText>{error}</ErrorText>
          {message && !error && <p className="mt-2 text-sm text-accent">{message}</p>}

          <div className="mt-4 flex gap-3">
            <Button type="button" variant="secondary" onClick={handleSave} disabled={busy}>
              {busy ? 'Working…' : 'Save draft'}
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={busy}>
              Submit week
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}
