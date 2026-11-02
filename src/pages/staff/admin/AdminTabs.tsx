import { useOutletContext } from 'react-router-dom'
import SectionTabs, { type SectionTab } from '../../../components/SectionTabs'
import type { LayoutContext } from '../../../components/TimesheetTabs'
import { useAuth } from '../../../contexts/AuthContext'
import { canAccess } from '../../../lib/permissions'
import type { AppArea } from '../../../lib/types'

// Sections of the Admin area. Add new admin pages here and in App.tsx.
// Each needs its own area permission: Customer Accounts and User Accounts
// can be given to staff who aren't admins.
const SECTIONS: { label: string; path: string; area: AppArea }[] = [
  { label: 'Customer Accounts', path: '/staff/admin/customer-accounts', area: 'accounts' },
  { label: 'User Accounts', path: '/staff/admin/user-accounts', area: 'engineers' },
  { label: 'Logins', path: '/staff/admin/logins', area: 'admin' },
  { label: 'Skills', path: '/staff/admin/skills', area: 'admin' },
  { label: 'Rate cards', path: '/staff/admin/rate-cards', area: 'admin' },
  { label: 'Invoice settings', path: '/staff/admin/invoice-settings', area: 'admin' },
  { label: 'Activity', path: '/staff/admin/activity', area: 'admin' },
  { label: 'Data checks', path: '/staff/admin/data-checks', area: 'admin' },
]

export default function AdminTabs() {
  const { profile } = useAuth()
  const { actionCounts } = useOutletContext<LayoutContext>()
  const tabs: SectionTab[] = SECTIONS.filter((s) => canAccess(profile, s.area)).map((s) =>
    s.path === '/staff/admin/skills'
      ? { ...s, badge: actionCounts.skill_requests, badgeTitle: 'Skill requests waiting for approval' }
      : s.path === '/staff/admin/user-accounts'
        ? { ...s, badge: actionCounts.expiring ?? 0, badgeTitle: 'Certifications or documents expiring within 60 days' }
        : s,
  )
  return <SectionTabs sections={tabs} />
}
