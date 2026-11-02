import { useOutletContext } from 'react-router-dom'
import SectionTabs from '../../components/SectionTabs'
import type { LayoutContext } from '../../components/TimesheetTabs'
import { PERSON_KINDS } from '../../lib/types'

export const EXPIRING_PATH = '/staff/admin/user-accounts/expiring'

// Sub-tabs under Admin → User Accounts. "Expiring" shows a count of
// certifications / clearances (and, for admins, ID documents) due within 60 days.
export default function UserAccountsTabs() {
  const { actionCounts } = useOutletContext<LayoutContext>()
  return (
    <SectionTabs
      sections={[
        ...(['contractor', 'staff'] as const).map((k) => ({ label: PERSON_KINDS[k].plural, path: PERSON_KINDS[k].path })),
        { label: 'Find & availability', path: '/staff/admin/user-accounts/availability' },
        {
          label: 'Expiring',
          path: EXPIRING_PATH,
          badge: actionCounts.expiring ?? 0,
          badgeTitle: 'Expiring within 60 days or already expired',
        },
      ]}
    />
  )
}
