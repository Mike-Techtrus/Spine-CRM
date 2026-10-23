import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { UserRole } from '../lib/types'

export default function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode
  allowedRoles?: UserRole[]
}) {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-text-muted">
        Loading…
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    const fallback = profile.role === 'staff' ? '/staff/dashboard' : '/my/timesheets'
    return <Navigate to={fallback} replace />
  }

  return <>{children}</>
}
