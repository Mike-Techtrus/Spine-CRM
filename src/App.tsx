import { Navigate, Route, createBrowserRouter, createRoutesFromElements, RouterProvider } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import MyTimesheets from './pages/engineer/MyTimesheets'
import TimesheetForm from './pages/engineer/TimesheetForm'
import AllTimesheets from './pages/staff/AllTimesheets'
import TimesheetDetail from './pages/staff/TimesheetDetail'
import FieldEngineers from './pages/staff/FieldEngineers'
import Dashboard from './pages/staff/Dashboard'
import Accounts from './pages/staff/Accounts'
import OpportunityList from './pages/staff/OpportunityList'
import OpportunityForm from './pages/staff/OpportunityForm'
import QuoteList from './pages/staff/QuoteList'
import QuoteForm from './pages/staff/QuoteForm'
import SalesOrderList from './pages/staff/SalesOrderList'
import SalesOrderForm from './pages/staff/SalesOrderForm'
import InvoiceList from './pages/staff/InvoiceList'
import InvoiceForm from './pages/staff/InvoiceForm'
import UserAdmin from './pages/staff/admin/UserAdmin'
import SkillsAdmin from './pages/staff/admin/SkillsAdmin'
import ContractorProfile from './pages/staff/ContractorProfile'
import SetPassword from './pages/SetPassword'
import NoAccess from './pages/NoAccess'
import { homePath } from './lib/permissions'
import type { AppArea } from './lib/types'

function RoleHome() {
  const { profile, loading } = useAuth()
  if (loading) return null
  return <Navigate to={homePath(profile)} replace />
}

function Staff({ area, children }: { area: AppArea; children: React.ReactNode }) {
  return (
    <ProtectedRoute allowedRoles={['staff']} area={area}>
      {children}
    </ProtectedRoute>
  )
}

// A data router (rather than plain <BrowserRouter>) is required for
// useBlocker, which powers the "unsaved changes" navigation warning on
// forms — see src/lib/useUnsavedChangesGuard.ts.
const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<RoleHome />} />
        <Route path="/set-password" element={<SetPassword />} />
        <Route path="/no-access" element={<NoAccess />} />

        {/* Field engineer area */}
        <Route
          path="/my/timesheets"
          element={
            <ProtectedRoute allowedRoles={['field_engineer']}>
              <MyTimesheets />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my/timesheets/new"
          element={
            <ProtectedRoute allowedRoles={['field_engineer']}>
              <TimesheetForm />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my/timesheets/:id"
          element={
            <ProtectedRoute allowedRoles={['field_engineer']}>
              <TimesheetForm />
            </ProtectedRoute>
          }
        />

        {/* Staff: dashboard */}
        <Route path="/staff/dashboard" element={<Staff area="dashboard"><Dashboard /></Staff>} />

        {/* Staff: timesheets */}
        <Route path="/staff/timesheets" element={<Staff area="timesheets"><AllTimesheets /></Staff>} />
        <Route path="/staff/timesheets/:id" element={<Staff area="timesheets"><TimesheetDetail /></Staff>} />
        <Route path="/staff/engineers" element={<Staff area="engineers"><FieldEngineers /></Staff>} />
        <Route path="/staff/engineers/:id" element={<Staff area="engineers"><ContractorProfile /></Staff>} />

        {/* Staff: sales pipeline */}
        <Route path="/staff/accounts" element={<Staff area="accounts"><Accounts /></Staff>} />

        <Route path="/staff/opportunities" element={<Staff area="opportunities"><OpportunityList /></Staff>} />
        <Route path="/staff/opportunities/new" element={<Staff area="opportunities"><OpportunityForm /></Staff>} />
        <Route path="/staff/opportunities/:id" element={<Staff area="opportunities"><OpportunityForm /></Staff>} />

        <Route path="/staff/quotes" element={<Staff area="quotes"><QuoteList /></Staff>} />
        <Route path="/staff/quotes/new" element={<Staff area="quotes"><QuoteForm /></Staff>} />
        <Route path="/staff/quotes/:id" element={<Staff area="quotes"><QuoteForm /></Staff>} />

        <Route path="/staff/sales-orders" element={<Staff area="sales_orders"><SalesOrderList /></Staff>} />
        <Route path="/staff/sales-orders/new" element={<Staff area="sales_orders"><SalesOrderForm /></Staff>} />
        <Route path="/staff/sales-orders/:id" element={<Staff area="sales_orders"><SalesOrderForm /></Staff>} />

        <Route path="/staff/invoices" element={<Staff area="invoices"><InvoiceList /></Staff>} />
        <Route path="/staff/invoices/new" element={<Staff area="invoices"><InvoiceForm /></Staff>} />
        <Route path="/staff/invoices/:id" element={<Staff area="invoices"><InvoiceForm /></Staff>} />

        {/* Staff: administration */}
        <Route path="/staff/admin" element={<Navigate to="/staff/admin/users" replace />} />
        <Route path="/staff/admin/users" element={<Staff area="admin"><UserAdmin /></Staff>} />
        <Route path="/staff/admin/skills" element={<Staff area="admin"><SkillsAdmin /></Staff>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </>,
  ),
)

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
