import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { getMyFieldEngineer, listMyTimesheets } from '../../lib/api'
import { DAY_TYPE_LABELS, STATUS_LABELS, type TimesheetEntryWithRelations } from '../../lib/types'
import { Button, Card, StatusBadge } from '../../components/ui'

export default function MyTimesheets() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [timesheets, setTimesheets] = useState<TimesheetEntryWithRelations[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [noEngineerRecord, setNoEngineerRecord] = useState(false)

  useEffect(() => {
    if (!session) return
    ;(async () => {
      try {
        const engineer = await getMyFieldEngineer(session.user.id)
        if (!engineer) {
          setNoEngineerRecord(true)
          return
        }
        setTimesheets(await listMyTimesheets(engineer.id))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load timesheets.')
      }
    })()
  }, [session])

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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">My Timesheets</h1>
        <Link to="/my/timesheets/new">
          <Button>New entry</Button>
        </Link>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {!timesheets && !error && <p className="text-sm text-text-muted">Loading…</p>}

      {timesheets && timesheets.length === 0 && (
        <Card>
          <p className="text-sm text-text-muted">
            No timesheet entries yet. Click "New entry" to log your first day.
          </p>
        </Card>
      )}

      {timesheets && timesheets.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-raised text-left text-xs font-mono-label text-text-muted">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Client</th>
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
                  <td className="px-4 py-2 text-text">{ts.client.name}</td>
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
