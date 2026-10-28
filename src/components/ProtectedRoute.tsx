import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { canAccess, homePath } from '../lib/permissions'
import type { AppArea, UserRole } from '../lib/types'

export default function ProtectedRoute({
  children,
  allowedRoles,
  area,
}: {
  children: React.ReactNode
  allowedRoles?: UserRole[]
  area?: AppArea // staff pages: also require this area in the user's permissions
}) {
  const { session, profile, loading, passwordRecovery } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-text-muted">
        Loading…
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  if (passwordRecovery && location.pathname !== '/set-password') {
    return <Navigate to="/set-password" replace />
  }

  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    return <Navigate to={homePath(profile)} replace />
  }

  if (area && profile && !canAccess(profile, area)) {
    return <Navigate to={homePath(profile)} replace />
  }

  return <>{children}</>
}
