import { NavLink } from 'react-router-dom'

// Sub-navigation under a top-level tab, e.g. Admin → Logins / Skills.
export default function SectionTabs({ sections }: { sections: { label: string; path: string }[] }) {
  return (
    <div className="mb-6 flex gap-1 border-b border-border">
      {sections.map((s) => (
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
