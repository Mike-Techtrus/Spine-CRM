import SectionTabs from '../../../components/SectionTabs'

// Reports area. Add new reports here and in App.tsx.
const REPORTS = [{ label: 'Rebate', path: '/staff/reports/rebate' }]

export default function ReportTabs() {
  return <SectionTabs sections={REPORTS} />
}
