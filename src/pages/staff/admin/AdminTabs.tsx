import SectionTabs from '../../../components/SectionTabs'

// Sections of the Admin area. Add new admin pages here and in App.tsx.
const SECTIONS = [
  { label: 'Users', path: '/staff/admin/users' },
  { label: 'Skills', path: '/staff/admin/skills' },
]

export default function AdminTabs() {
  return <SectionTabs sections={SECTIONS} />
}
