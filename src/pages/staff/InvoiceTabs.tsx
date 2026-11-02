import SectionTabs from '../../components/SectionTabs'

// Invoices area: money in (customer invoices) and money out (contractor costs, 0043).
export default function InvoiceTabs() {
  return (
    <SectionTabs
      sections={[
        { label: 'Customer invoices', path: '/staff/invoices', end: true },
        { label: 'Contractor costs', path: '/staff/invoices/contractor-costs' },
      ]}
    />
  )
}
