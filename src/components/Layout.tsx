import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { DottedRule } from './ui'
import SpineMark from './icons/SpineMark'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-surface-raised text-accent' : 'text-text-muted hover:text-text'
  }`

export default function Layout() {
  const { profile, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-bg dot-grid-bg">
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
              <NavLink to="/staff/dashboard" className={navLinkClass}>
                Dashboard
              </NavLink>
              <NavLink to="/staff/opportunities" className={navLinkClass}>
                Opportunities
              </NavLink>
              <NavLink to="/staff/quotes" className={navLinkClass}>
                Quotes
              </NavLink>
              <NavLink to="/staff/sales-orders" className={navLinkClass}>
                Sales Orders
              </NavLink>
              <NavLink to="/staff/invoices" className={navLinkClass}>
                Invoices
              </NavLink>
              <NavLink to="/staff/timesheets" className={navLinkClass}>
                Timesheets
              </NavLink>
              <NavLink to="/staff/accounts" className={navLinkClass}>
                Accounts
              </NavLink>
              <NavLink to="/staff/engineers" className={navLinkClass}>
                Field Engineers
              </NavLink>
            </>
          ) : (
            <NavLink to="/my/timesheets" className={navLinkClass}>
              My Timesheets
            </NavLink>
          )}
        </nav>
        <DottedRule />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
