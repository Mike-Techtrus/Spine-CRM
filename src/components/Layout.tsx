import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { getMyFieldEngineer } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { DottedRule } from './ui'
import SpineMark from './icons/SpineMark'
import { isTimesheetPath, timesheetSections, type LayoutContext } from './TimesheetTabs'
import { adminHomePath, canAccess } from '../lib/permissions'
import { ADMIN_BASE_PATH, APP_AREAS } from '../lib/types'

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
  const sections = timesheetSections(profile, hasStaffProfile)
  const outletContext: LayoutContext = { timesheetSections: sections }

  const timesheetsTab = sections.length > 0 && (
    <NavLink key="timesheets" to={sections[0].path} className={() => navLinkClass({ isActive: isTimesheetPath(pathname) })}>
      Timesheets
    </NavLink>
  )

  return (
    <div className="min-h-screen bg-bg dot-grid-bg print:min-h-0 print:bg-white">
      <header className="border-b border-border bg-bg/95 backdrop-blur print:hidden">
        <div className="mx-auto grid max-w-6xl grid-cols-3 items-center px-4 py-3">
          <div className="flex items-center">
            <img src="/techtrus-logo.png" alt="Techtrus" className="h-6 w-auto" />
          </div>
          <div className="flex items-center justify-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-contrast">
              <SpineMark className="h-4 w-4" />
            </span>
            <div className="leading-tight">
              <p className="font-display text-base font-semibold text-text">Spine CRM</p>
              <p className="font-mono-label text-[10px] text-text-faint">techtrus // internal</p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            <span className="text-sm text-text-muted">{profile?.full_name || '…'}</span>
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
                <NavLink to={adminPath} className={() => navLinkClass({ isActive: pathname.startsWith(ADMIN_BASE_PATH) })}>
                  Admin
                </NavLink>
              )}
            </>
          ) : (
            timesheetsTab
          )}
        </nav>
        <DottedRule />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 print:max-w-none print:p-0">
        <Outlet context={outletContext} />
      </main>
    </div>
  )
}
