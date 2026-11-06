import { useOutletContext } from 'react-router-dom'
import SectionTabs, { type SectionTab } from './SectionTabs'
import { canAccess } from '../lib/permissions'
import type { Profile } from '../lib/types'
import type { ActionCounts } from '../lib/api'

// The one Timesheets tab covers two pages:
//   My timesheets   — your own week (contractors, and staff linked to a staff profile)
//   Team timesheets — everyone's, to review and approve (staff with the "timesheets" area)
// Sub-tabs only show when someone can open both.
export type TimesheetSection = SectionTab

export const MY_TIMESHEETS_PATH = '/my/timesheets'
export const TEAM_TIMESHEETS_PATH = '/staff/timesheets'

export function timesheetSections(profile: Profile | null, hasOwnProfile: boolean, counts: ActionCounts): TimesheetSection[] {
  const sections: TimesheetSection[] = []
  if (profile?.role === 'field_engineer' || hasOwnProfile)
    sections.push({
      label: 'My timesheets',
      path: MY_TIMESHEETS_PATH,
      badge: (counts.my_rejected_timesheets ?? 0) + (counts.my_unsubmitted ?? 0) + (counts.my_rejected_expenses ?? 0),
      badgeTitle: 'Rejected timesheets or expenses, or days from past weeks not submitted yet',
    })
  if (canAccess(profile, 'timesheets'))
    sections.push({
      label: 'Team timesheets',
      path: TEAM_TIMESHEETS_PATH,
      badge: (counts.timesheets_to_approve ?? 0) + (counts.expenses_to_approve ?? 0),
      badgeTitle: 'Timesheets and expenses waiting for your approval',
    })
  return sections
}

export function isTimesheetPath(pathname: string) {
  return pathname.startsWith(MY_TIMESHEETS_PATH) || pathname.startsWith(TEAM_TIMESHEETS_PATH)
}

// Layout passes these down through <Outlet context>, so they're only worked out once.
export interface LayoutContext {
  timesheetSections: TimesheetSection[]
  actionCounts: ActionCounts
  refreshActionCounts: () => void // call after approving/rejecting something without leaving the page
}

export default function TimesheetTabs() {
  const { timesheetSections: sections } = useOutletContext<LayoutContext>()
  return sections.length > 1 ? <SectionTabs sections={sections} /> : null
}
