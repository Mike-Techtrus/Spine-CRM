import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { getMyFieldEngineer, listMyAssignments, listMyTimesheets } from '../../lib/api'
import { DAY_TYPE_LABELS, STATUS_LABELS, timesheetProjectLabel, type TimesheetEntryWithRelations } from '../../lib/types'
import { Button, Card, StatusBadge } from '../../components/ui'
import WeeklyTimesheet from '../../components/WeeklyTimesheet'
import TimesheetTabs, { type LayoutContext } from '../../components/TimesheetTabs'
import TimesheetGuide from '../../components/TimesheetGuide'
import { addDays, mondayOf } from '../../lib/availability'

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function weekLabel(monday: string) {
  return new Date(`${monday}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export default function MyTimesheets() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const { refreshActionCounts } = useOutletContext<LayoutContext>()
  const [timesheets, setTimesheets] = useState<TimesheetEntryWithRelations[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [noEngineerRecord, setNoEngineerRecord] = useState(false)
  const [engineerId, setEngineerId] = useState<string | null>(null)
  const [isStaff, setIsStaff] = useState(false)
  const [hasActiveProject, setHasActiveProject] = useState(false)
  const [jumpTo, setJumpTo] = useState<{ week: string; at: number } | undefined>()

  async function loadList(id: string) {
    setTimesheets(await listMyTimesheets(id))
  }

  useEffect(() => {
    if (!session) return
    ;(async () => {
      try {
        const engineer = await getMyFieldEngineer(session.user.id)
        if (!engineer) {
          setNoEngineerRecord(true)
          return
        }
        setEngineerId(engineer.id)
        setIsStaff(engineer.kind === 'staff')
        await loadList(engineer.id)
        const mine = await listMyAssignments(engineer.id)
        setHasActiveProject(mine.some((a) => a.project_line.project.status === 'active'))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load timesheets.')
      }
    })()
  }, [session])

  // Reminders: drafts from past weeks never submitted, rejected days, and a
  // quiet last week when they're on an active project (badge count: 0044).
  const reminders = useMemo(() => {
    if (!timesheets) return null
    const thisMonday = mondayOf(todayIso())
    const lastMonday = addDays(thisMonday, -7)
    const draftWeeks = new Map<string, number>()
    for (const t of timesheets) {
      if (t.status === 'draft' && t.work_date < thisMonday) {
        const w = mondayOf(t.work_date)
        draftWeeks.set(w, (draftWeeks.get(w) ?? 0) + 1)
      }
    }
    const rejected = timesheets.filter((t) => t.status === 'rejected')
    const loggedLastWeek = timesheets.some(
      (t) => t.status !== 'rejected' && t.work_date >= lastMonday && t.work_date < thisMonday,
    )
    return {
      draftWeeks: [...draftWeeks.entries()].sort(([a], [b]) => a.localeCompare(b)),
      rejected,
      quietLastWeek: hasActiveProject && !loggedLastWeek ? lastMonday : null,
    }
  }, [timesheets, hasActiveProject])

  if (noEngineerRecord) {
    return (
      <Card>
        <p className="text-sm text-text">
          Your login isn't linked to a contractor or staff profile yet. Ask a Spine CRM admin to link your
          account before you can submit timesheets.
        </p>
      </Card>
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Timesheets</h1>
        <Link to="/my/timesheets/new">
          <Button variant="secondary">Log other time</Button>
        </Link>
      </div>
      <TimesheetTabs />

      {reminders && (reminders.draftWeeks.length > 0 || reminders.rejected.length > 0 || reminders.quietLastWeek) && (
        <Card className="mb-6 border-warning/40">
          <p className="mb-2 text-sm font-semibold text-text">Needs your attention</p>
          <ul className="space-y-1.5 text-sm">
            {reminders.draftWeeks.map(([week, count]) => (
              <li key={week}>
                <span className="text-warning">Not submitted:</span> {count} day{count === 1 ? '' : 's'} in the week of{' '}
                {weekLabel(week)} {count === 1 ? 'is' : 'are'} still {count === 1 ? 'a draft' : 'drafts'}.{' '}
                <button type="button" onClick={() => setJumpTo({ week, at: Date.now() })} className="text-accent hover:underline">
                  Open that week
                </button>
              </li>
            ))}
            {reminders.rejected.map((t) => (
              <li key={t.id}>
                <span className="text-danger">Rejected:</span> {t.work_date} — {timesheetProjectLabel(t) ?? t.client.name}
                {t.rejection_notes && <span className="text-text-muted"> (&ldquo;{t.rejection_notes}&rdquo;)</span>}.{' '}
                {t.project_assignment_id ? (
                  <button
                    type="button"
                    onClick={() => setJumpTo({ week: mondayOf(t.work_date), at: Date.now() })}
                    className="text-accent hover:underline"
                  >
                    Fix it on the grid
                  </button>
                ) : (
                  <Link to={`/my/timesheets/${t.id}`} className="text-accent hover:underline">
                    Open it
                  </Link>
                )}
              </li>
            ))}
            {reminders.quietLastWeek && (
              <li className="text-text-muted">
                No time logged for last week (w/c {weekLabel(reminders.quietLastWeek)}). If you worked on a project,{' '}
                <button
                  type="button"
                  onClick={() => setJumpTo({ week: reminders.quietLastWeek!, at: Date.now() })}
                  className="text-accent hover:underline"
                >
                  fill it in
                </button>
                .
              </li>
            )}
          </ul>
        </Card>
      )}

      {engineerId && <TimesheetGuide isStaff={isStaff} />}

      {engineerId && <WeeklyTimesheet fieldEngineerId={engineerId} autoApproved={isStaff} jumpTo={jumpTo} onChanged={() => {
            loadList(engineerId)
            refreshActionCounts() // a resubmitted rejected day clears the badge
          }} />}

      <h2 className="mb-3 text-sm font-semibold text-text">All my entries</h2>

      {error && <p className="text-sm text-danger">{error}</p>}

      {!timesheets && !error && <p className="text-sm text-text-muted">Loading…</p>}

      {timesheets && timesheets.length === 0 && (
        <Card>
          <p className="text-sm text-text-muted">
            No timesheet entries yet. Use the weekly grid above for project time, or "Log other time".
          </p>
        </Card>
      )}

      {timesheets && timesheets.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-raised text-left text-xs font-mono-label text-text-muted">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Project / client</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Ref</th>
              </tr>
            </thead>
            <tbody>
              {timesheets.map((ts) => (
                <tr
                  key={ts.id}
                  className="cursor-pointer border-t border-border hover:bg-surface-raised"
                  onClick={() => navigate(`/my/timesheets/${ts.id}`)}
                >
                  <td className="px-4 py-2 text-text">{ts.work_date}</td>
                  <td className="px-4 py-2 text-text">
                    {timesheetProjectLabel(ts) ?? ts.client.name}
                    {timesheetProjectLabel(ts) && <span className="block text-xs text-text-faint">{ts.client.name}</span>}
                  </td>
                  <td className="px-4 py-2 text-text-muted">{DAY_TYPE_LABELS[ts.day_type]}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={ts.status} label={STATUS_LABELS[ts.status]} />
                  </td>
                  <td className="px-4 py-2 font-mono-label text-text-muted">{ts.reference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
