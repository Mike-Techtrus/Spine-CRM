import { APP_AREAS, type AppArea, type Profile } from './types'

export function canAccess(profile: Profile | null, area: AppArea) {
  return profile?.role === 'staff' && (profile.permissions ?? []).includes(area)
}

// Where to send someone when they land on "/" or on a page they can't open.
export function homePath(profile: Profile | null) {
  if (profile?.role !== 'staff') return '/my/timesheets'
  return APP_AREAS.find((a) => canAccess(profile, a.key))?.path ?? '/no-access'
}
