import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  listAllContractorSkills,
  listAllProjectLines,
  listAssignmentTimesheets,
  listFieldEngineers,
  listProjectAssignments,
  listProjects,
  listSkillCategories,
  listSkills,
  listTimesheetDaysBetween,
} from '../../lib/api'
import {
  DAY_TYPE_DAYS,
  PERSON_KINDS,
  SKILL_LEVEL_LABELS,
  type ContractorSkill,
  type FieldEngineer,
  type Skill,
  type SkillCategory,
  type SkillLevel,
} from '../../lib/types'
import {
  WORKING_DAYS_PER_WEEK,
  addDays,
  mondayOf,
  personAvailability,
  skillCounts,
  weekStarts,
  type AllocationPlan,
  type LoggedDay,
  type PersonAvailability,
} from '../../lib/availability'
import { Card, ErrorText, Label, Select } from '../../components/ui'
import AdminTabs from './admin/AdminTabs'
import UserAccountsTabs from './UserAccountsTabs'

// Admin → User Accounts → Find & availability: who has these skills, and
// who's free over the next 8 weeks (lib/availability.ts explains the sums).

const WEEKS = 8
const SOON_WEEKS = 4 // "free soon" = the next 4 weeks, used for sorting

type PersonSkill = Pick<ContractorSkill, 'field_engineer_id' | 'skill_id' | 'level' | 'expires_on'>

interface Row {
  person: FieldEngineer
  matches: PersonSkill[]
  availability: PersonAvailability
  freeSoon: number
}

function days(n: number) {
  return n.toLocaleString('en-GB', { maximumFractionDigits: 1 })
}

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function FindPeople() {
  const today = todayIso()
  const weeks = useMemo(() => weekStarts(mondayOf(today), WEEKS), [today])

  const [people, setPeople] = useState<FieldEngineer[]>([])
  const [categories, setCategories] = useState<SkillCategory[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [personSkills, setPersonSkills] = useState<PersonSkill[]>([])
  const [allocations, setAllocations] = useState<AllocationPlan[]>([])
  const [logged, setLogged] = useState<LoggedDay[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [wanted, setWanted] = useState<string[]>([])
  const [minLevel, setMinLevel] = useState<SkillLevel | ''>('')
  const [includeStaff, setIncludeStaff] = useState(false)
  const [includeExpired, setIncludeExpired] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const [everyone, cats, allSkills, ps, projects, lines, assignments, window] = await Promise.all([
          listFieldEngineers(),
          listSkillCategories(),
          listSkills(),
          listAllContractorSkills(),
          listProjects(),
          listAllProjectLines(),
          listProjectAssignments(),
          listTimesheetDaysBetween(weeks[0], addDays(weeks[weeks.length - 1], 6)),
        ])
        const entries = await listAssignmentTimesheets(assignments.map((a) => a.id))

        // Allocations on active projects, with the sales order's dates.
        const projectById = new Map(projects.map((p) => [p.id, p]))
        const lineProject = new Map(lines.map((l) => [l.id, l.project_id]))
        const loggedOn = new Map<string, number>()
        for (const e of entries) {
          if (e.status === 'rejected') continue
          loggedOn.set(e.project_assignment_id, (loggedOn.get(e.project_assignment_id) ?? 0) + DAY_TYPE_DAYS[e.day_type])
        }
        const plans: AllocationPlan[] = []
        for (const a of assignments) {
          const project = projectById.get(lineProject.get(a.project_line_id) ?? '')
          if (!project || project.status !== 'active') continue
          plans.push({
            fieldEngineerId: a.field_engineer_id,
            allocatedDays: Number(a.allocated_days),
            loggedDays: loggedOn.get(a.id) ?? 0,
            start: project.sales_order.start_date,
            end: project.sales_order.end_date,
          })
        }

        setPeople(everyone)
        setCategories(cats)
        setSkills(allSkills)
        setPersonSkills(ps)
        setAllocations(plans)
        setLogged(window.map((t) => ({ fieldEngineerId: t.field_engineer_id, workDate: t.work_date, days: DAY_TYPE_DAYS[t.day_type] })))
        setLoaded(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load.')
      }
    })()
  }, [weeks])

  const skillById = useMemo(() => new Map(skills.map((s) => [s.id, s])), [skills])

  const rows: Row[] = useMemo(() => {
    const list: Row[] = []
    for (const person of people) {
      if (!person.is_active) continue
      if (person.kind === 'staff' && !includeStaff) continue
      const theirs = personSkills.filter(
        (s) => s.field_engineer_id === person.id && skillCounts(s, minLevel, includeExpired, today),
      )
      const matches = wanted.map((id) => theirs.find((s) => s.skill_id === id)).filter((s): s is PersonSkill => Boolean(s))
      if (matches.length < wanted.length) continue // must have every chosen skill
      const availability = personAvailability(person.id, weeks, today, allocations, logged)
      const freeSoon = weeks.slice(0, SOON_WEEKS).reduce((s, w) => s + (availability.weeks.get(w)?.free ?? 0), 0)
      list.push({ person, matches, availability, freeSoon })
    }
    return list.sort((a, b) => b.freeSoon - a.freeSoon || a.person.name.localeCompare(b.person.name))
  }, [people, personSkills, wanted, minLevel, includeStaff, includeExpired, allocations, logged, weeks, today])

  const addSkill = (id: string) => id && !wanted.includes(id) && setWanted([...wanted, id])

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-text">Admin · User Accounts · Find &amp; availability</h1>
      <AdminTabs />
      <UserAccountsTabs />

      <ErrorText>{error}</ErrorText>

      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <Label>Skills needed (they must have all of them)</Label>
            <Select value="" onChange={(e) => addSkill(e.target.value)}>
              <option value="">Add a skill…</option>
              {categories.map((c) => (
                <optgroup key={c.id} label={c.name}>
                  {skills
                    .filter((s) => s.category_id === c.id && s.is_active && !wanted.includes(s.id))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </Select>
            {wanted.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {wanted.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setWanted(wanted.filter((w) => w !== id))}
                    className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs text-accent hover:bg-accent/20"
                    title="Remove"
                  >
                    {skillById.get(id)?.name ?? 'Skill'} ✕
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <Label>Minimum level</Label>
            <Select value={minLevel} onChange={(e) => setMinLevel(e.target.value as SkillLevel | '')}>
              <option value="">Any (including not rated)</option>
              {(Object.entries(SKILL_LEVEL_LABELS) as [SkillLevel, string][]).map(([value, label]) => (
                <option key={value} value={value}>
                  {label} or above
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-muted">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={includeStaff} onChange={(e) => setIncludeStaff(e.target.checked)} />
            Include staff
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={includeExpired} onChange={(e) => setIncludeExpired(e.target.checked)} />
            Count expired certifications
          </label>
        </div>
      </Card>

      {!loaded && !error && <p className="text-sm text-text-muted">Loading…</p>}

      {loaded && (
        <>
          <p className="mb-2 text-sm text-text-muted">
            {rows.length} {rows.length === 1 ? 'person' : 'people'}
            {wanted.length > 0 ? ' with those skills' : ''}, most free over the next {SOON_WEEKS} weeks first.
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-surface-raised text-left text-xs font-mono-label text-text-muted">
                <tr>
                  <th className="px-3 py-2">Person</th>
                  {wanted.length > 0 && <th className="px-3 py-2">Matching skills</th>}
                  <th className="px-3 py-2 text-right">Day rate</th>
                  <th className="px-3 py-2 text-right" title={`Free working days over the next ${SOON_WEEKS} weeks`}>
                    Free ({SOON_WEEKS} wks)
                  </th>
                  {weeks.map((w) => (
                    <th key={w} className="w-14 px-1 py-2 text-center font-normal">
                      {new Date(`${w}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4 + weeks.length} className="px-4 py-6 text-center text-text-muted">
                      Nobody matches. Try fewer skills, a lower level, or include staff.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.person.id} className="border-t border-border align-top">
                      <td className="px-3 py-2">
                        <Link
                          to={`${PERSON_KINDS[r.person.kind].path}/${r.person.id}`}
                          className="text-text hover:text-accent hover:underline"
                        >
                          {r.person.name}
                        </Link>
                        <span className="block text-xs text-text-faint">
                          {r.person.kind === 'staff' ? 'Staff' : 'Contractor'}
                          {r.availability.committed > 0 && ` · ${days(r.availability.committed)} days still allocated`}
                          {r.availability.unscheduled > 0 && (
                            <span className="text-warning"> ({days(r.availability.unscheduled)} past their dates)</span>
                          )}
                        </span>
                      </td>
                      {wanted.length > 0 && (
                        <td className="px-3 py-2 text-xs text-text-muted">
                          {r.matches.map((m) => (
                            <span key={m.skill_id} className="mr-2 inline-block">
                              {skillById.get(m.skill_id)?.name}
                              {m.level && <span className="text-text-faint"> · {SKILL_LEVEL_LABELS[m.level]}</span>}
                              {m.expires_on && m.expires_on < today && <span className="text-warning"> · expired</span>}
                            </span>
                          ))}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-3 py-2 text-right text-text-muted">
                        {r.person.day_rate != null ? `£${Number(r.person.day_rate).toLocaleString('en-GB')}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-text">{days(r.freeSoon)}</td>
                      {weeks.map((w) => (
                        <WeekCell key={w} booking={r.availability.weeks.get(w)} />
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-text-faint">
            Each week shows free working days (out of {WORKING_DAYS_PER_WEEK}). Booked time is what people have entered on
            their timesheets — including future drafts — plus any allocated project days not yet logged, spread evenly
            over the rest of the sales order&apos;s start and end dates. That second part is an estimate: allocations
            don&apos;t have their own dates. Hover a week for the breakdown.
          </p>
        </>
      )}
    </div>
  )
}

function WeekCell({ booking }: { booking: { logged: number; expected: number; free: number } | undefined }) {
  const b = booking ?? { logged: 0, expected: 0, free: WORKING_DAYS_PER_WEEK }
  const tone =
    b.free >= 4 ? 'bg-accent/20 text-accent' : b.free > 0 ? 'bg-accent/10 text-text' : 'bg-sunken text-text-faint'
  return (
    <td className="px-1 py-2 text-center">
      <span
        className={`inline-block w-11 rounded px-1 py-0.5 text-xs ${tone}`}
        title={`${days(b.free)} free · ${days(b.logged)} on timesheets · ${days(b.expected)} expected from allocations`}
      >
        {days(b.free)}
      </span>
    </td>
  )
}
