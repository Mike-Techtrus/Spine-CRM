import { NavLink } from 'react-router-dom'
import { CountBadge } from './ui'

export interface SectionTab {
  label: string
  path: string
  badge?: number // things waiting on you in this section
  badgeTitle?: string
}

// Sub-navigation under a top-level tab, e.g. Admin → Logins / Skills.
export default function SectionTabs({ sections }: { sections: SectionTab[] }) {
  return (
    <div className="mb-6 flex gap-1 border-b border-border">
      {sections.map((s) => (
        <NavLink
          key={s.path}
          to={s.path}
          className={({ isActive }) =>
            `-mb-px flex items-center border-b-2 px-3 py-2 text-sm transition-colors ${
              isActive ? 'border-accent text-text' : 'border-transparent text-text-muted hover:text-text'
            }`
          }
        >
          {s.label}
          <CountBadge count={s.badge ?? 0} title={s.badgeTitle} />
        </NavLink>
      ))}
    </div>
  )
}
