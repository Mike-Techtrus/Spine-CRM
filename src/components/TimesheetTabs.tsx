import { useOutletContext } from 'react-router-dom'
import SectionTabs from './SectionTabs'
import { canAccess } from '../lib/permissions'
import type { Profile } from '../lib/types'

// The one Timesheets tab covers two pages:
//   My timesheets   — your own week (contractors, and staff linked to a staff profile)
//   Team timesheets — everyone's, to review and approve (staff with the "timesheets" area)
// Sub-tabs only show when someone can open both.
export interface TimesheetSection {
  label: string
  path: string
}

export const MY_TIMESHEETS_PATH = '/my/timesheets'
export const TEAM_TIMESHEETS_PATH = '/staff/timesheets'

export function timesheetSections(profile: Profile | null, hasOwnProfile: boolean): TimesheetSection[] {
  const sections: TimesheetSection[] = []
  if (profile?.role === 'field_engineer' || hasOwnProfile) sections.push({ label: 'My timesheets', path: MY_TIMESHEETS_PATH })
  if (canAccess(profile, 'timesheets')) sections.push({ label: 'Team timesheets', path: TEAM_TIMESHEETS_PATH })
  return sections
}

export function isTimesheetPath(pathname: string) {
  return pathname.startsWith(MY_TIMESHEETS_PATH) || pathname.startsWith(TEAM_TIMESHEETS_PATH)
}

// Layout passes the list down through <Outlet context>, so it's only worked out once.
export interface LayoutContext {
  timesheetSections: TimesheetSection[]
}

export default function TimesheetTabs() {
  const { timesheetSections: sections } = useOutletContext<LayoutContext>()
  return sections.length > 1 ? <SectionTabs sections={sections} /> : null
}
