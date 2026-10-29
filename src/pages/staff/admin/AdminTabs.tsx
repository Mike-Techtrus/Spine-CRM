import { NavLink } from 'react-router-dom'

// Sections of the Admin area. Add new admin pages here and in App.tsx.
const SECTIONS = [
  { label: 'Users', path: '/staff/admin/users' },
  { label: 'Skills', path: '/staff/admin/skills' },
]

export default function AdminTabs() {
  return (
    <div className="mb-6 flex gap-1 border-b border-border">
      {SECTIONS.map((s) => (
        <NavLink
          key={s.path}
          to={s.path}
          className={({ isActive }) =>
            `-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              isActive ? 'border-accent text-text' : 'border-transparent text-text-muted hover:text-text'
            }`
          }
        >
          {s.label}
        </NavLink>
      ))}
    </div>
  )
}
