import SectionTabs from '../../components/SectionTabs'

// Opportunities area: the pipeline, and emails waiting to be turned into (or linked to) opportunities (0054).
export default function OpportunityTabs() {
  return (
    <SectionTabs
      sections={[
        { label: 'Opportunities', path: '/staff/opportunities', end: true },
        { label: 'Intake', path: '/staff/opportunities/intake' },
      ]}
    />
  )
}
