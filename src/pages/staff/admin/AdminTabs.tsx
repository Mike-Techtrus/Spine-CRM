import SectionTabs from '../../../components/SectionTabs'

// Sections of the Admin area. Add new admin pages here and in App.tsx.
const SECTIONS = [
  { label: 'Logins', path: '/staff/admin/logins' },
  { label: 'Skills', path: '/staff/admin/skills' },
  { label: 'Rate cards', path: '/staff/admin/rate-cards' },
  { label: 'Invoice settings', path: '/staff/admin/invoice-settings' },
]

export default function AdminTabs() {
  return <SectionTabs sections={SECTIONS} />
}
