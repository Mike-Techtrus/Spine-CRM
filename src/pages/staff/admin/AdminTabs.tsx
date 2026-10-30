import SectionTabs from '../../../components/SectionTabs'
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
]

export default function AdminTabs() {
  const { profile } = useAuth()
  return <SectionTabs sections={SECTIONS.filter((s) => canAccess(profile, s.area))} />
}
