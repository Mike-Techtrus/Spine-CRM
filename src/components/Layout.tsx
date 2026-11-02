import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { getMyActionCounts, getMyFieldEngineer, NO_ACTION_COUNTS, type ActionCounts } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { CountBadge, DottedRule } from './ui'
import SpineMark from './icons/SpineMark'
import { isTimesheetPath, timesheetSections, type LayoutContext } from './TimesheetTabs'
import { adminHomePath, canAccess } from '../lib/permissions'
import { ADMIN_BASE_PATH, APP_AREAS } from '../lib/types'

const MY_PROFILE_PATH = '/my/profile'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-surface-raised text-accent' : 'text-text-muted hover:text-text'
  }`

export default function Layout() {
  const { profile, signOut } = useAuth()
  const { pathname } = useLocation()
  const adminPath = adminHomePath(profile)

  // Staff whose login is linked to a staff profile (Admin → User Accounts → Staff) can log
  // their own timesheets too.
  const [hasStaffProfile, setHasStaffProfile] = useState(false)
  useEffect(() => {
    if (profile?.role !== 'staff') return
    getMyFieldEngineer(profile.id)
      .then((record) => setHasStaffProfile(record !== null))
      .catch(() => setHasStaffProfile(false))
  }, [profile?.id, profile?.role])
  // Badges: what's waiting on this person (0037). Re-checked on every page
  // change, when the window regains focus and once a minute.
  const [counts, setCounts] = useState<ActionCounts>(NO_ACTION_COUNTS)
  const refreshActionCounts = useCallback(() => {
    if (!profile) return
    getMyActionCounts()
      .then(setCounts)
      .catch(() => {}) // badges are a nicety — never break the page over them
  }, [profile?.id])
  useEffect(refreshActionCounts, [refreshActionCounts, pathname])
  useEffect(() => {
    const timer = window.setInterval(refreshActionCounts, 60_000)
    window.addEventListener('focus', refreshActionCounts)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshActionCounts)
    }
  }, [refreshActionCounts])

  const sections = timesheetSections(profile, hasStaffProfile, counts)
  const outletContext: LayoutContext = { timesheetSections: sections, actionCounts: counts, refreshActionCounts }
  const timesheetCount = sections.reduce((n, s) => n + (s.badge ?? 0), 0)

  const timesheetsTab = sections.length > 0 && (
    <NavLink
      key="timesheets"
      to={sections[0].path}
      className={() => `${navLinkClass({ isActive: isTimesheetPath(pathname) })} inline-flex items-center`}
    >
      Timesheets
      <CountBadge count={timesheetCount} title={sections.map((s) => (s.badge ? `${s.label}: ${s.badge}` : '')).filter(Boolean).join(' · ')} />
    </NavLink>
  )

  // My Profile: contractors, and staff linked to a staff profile.
  const myProfileTab = (profile?.role === 'field_engineer' || hasStaffProfile) && (
    <NavLink to={MY_PROFILE_PATH} className={(s) => `${navLinkClass(s)} inline-flex items-center`}>
      My Profile
      <CountBadge count={counts.my_expiring ?? 0} title="Your certifications or documents expiring soon" />
    </NavLink>
  )

  return (
    <div className="min-h-screen bg-bg dot-grid-bg print:min-h-0 print:bg-white">
      <header className="border-b border-border bg-bg/95 backdrop-blur print:hidden">
        <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3">
          <div className="flex items-center">
            <img src="/techtrus-logo.png" alt="Techtrus" className="h-5 w-auto sm:h-6" />
          </div>
          <div className="flex items-center justify-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-contrast">
              <SpineMark className="h-4 w-4" />
            </span>
            <div className="leading-tight">
              <p className="font-display text-base font-semibold text-text">Spine CRM</p>
              <p className="hidden font-mono-label text-[10px] text-text-faint sm:block">techtrus // internal</p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            <span className="hidden text-sm text-text-muted sm:inline">{profile?.full_name || '…'}</span>
            <button
              onClick={() => signOut()}
              className="text-xs font-mono-label text-text-muted hover:text-danger"
            >
              Sign out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 pb-3">
          {profile?.role === 'staff' ? (
            <>
              {APP_AREAS.filter((a) => !a.inAdmin).map((a) =>
                // Timesheets: one tab for My + Team timesheets, shown even without the
                // "timesheets" area if they can log their own.
                a.key === 'timesheets' ? (
                  timesheetsTab
                ) : canAccess(profile, a.key) ? (
                  <NavLink key={a.key} to={a.path} className={navLinkClass}>
                    {a.label}
                  </NavLink>
                ) : null,
              )}
              {/* One Admin tab for everything under /staff/admin, whichever sections they can open */}
              {adminPath && (
                <NavLink
                  to={adminPath}
                  className={() => `${navLinkClass({ isActive: pathname.startsWith(ADMIN_BASE_PATH) })} inline-flex items-center`}
                >
                  Admin
                  <CountBadge
                    count={(counts.skill_requests ?? 0) + (counts.expiring ?? 0)}
                    title={[
                      counts.skill_requests ? `Skill requests: ${counts.skill_requests}` : '',
                      counts.expiring ? `Expiring: ${counts.expiring}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  />
                </NavLink>
              )}
              {myProfileTab}
            </>
          ) : (
            <>
              {timesheetsTab}
              {myProfileTab}
            </>
          )}
        </nav>
        <DottedRule />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8 print:max-w-none print:p-0">
        <Outlet context={outletContext} />
      </main>
    </div>
  )
}
