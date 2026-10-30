import { Navigate, Route, createBrowserRouter, createRoutesFromElements, RouterProvider, useParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import MyTimesheets from './pages/engineer/MyTimesheets'
import TimesheetForm from './pages/engineer/TimesheetForm'
import AllTimesheets from './pages/staff/AllTimesheets'
import TimesheetDetail from './pages/staff/TimesheetDetail'
import PeopleList from './pages/staff/PeopleList'
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
import ProjectList from './pages/staff/ProjectList'
import ProjectDetail from './pages/staff/ProjectDetail'
import UserAdmin from './pages/staff/admin/UserAdmin'
import SkillsAdmin from './pages/staff/admin/SkillsAdmin'
import InvoiceSettings from './pages/staff/admin/InvoiceSettings'
import RateCardsAdmin from './pages/staff/admin/RateCardsAdmin'
import PersonProfile from './pages/staff/PersonProfile'
import SetPassword from './pages/SetPassword'
import NoAccess from './pages/NoAccess'
import { adminHomePath, homePath } from './lib/permissions'
import { PERSON_KINDS, type AppArea } from './lib/types'

function RoleHome() {
  const { profile, loading } = useAuth()
  if (loading) return null
  return <Navigate to={homePath(profile)} replace />
}

// /staff/admin on its own: the first Admin section this person can open.
function AdminHome() {
  const { profile, loading } = useAuth()
  if (loading) return null
  return <Navigate to={adminHomePath(profile) ?? homePath(profile)} replace />
}

// Old Users addresses (/staff/users/...), kept so bookmarks still work.
function OldUsersLink() {
  const { kind, id } = useParams()
  const base = kind === 'staff' ? PERSON_KINDS.staff.path : PERSON_KINDS.contractor.path
  return <Navigate to={id ? `${base}/${id}` : base} replace />
}

function Staff({ area, children }: { area: AppArea; children: React.ReactNode }) {
  return (
    <ProtectedRoute allowedRoles={['staff']} area={area}>
      {children}
    </ProtectedRoute>
  )
}

function OldContractorLink() {
  const { id } = useParams()
  return <Navigate to={`${PERSON_KINDS.contractor.path}/${id}`} replace />
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

        {/* My timesheets: contractors, and staff linked to a staff profile */}
        <Route
          path="/my/timesheets"
          element={
            <ProtectedRoute allowedRoles={['field_engineer', 'staff']}>
              <MyTimesheets />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my/timesheets/new"
          element={
            <ProtectedRoute allowedRoles={['field_engineer', 'staff']}>
              <TimesheetForm />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my/timesheets/:id"
          element={
            <ProtectedRoute allowedRoles={['field_engineer', 'staff']}>
              <TimesheetForm />
            </ProtectedRoute>
          }
        />

        {/* Staff: dashboard */}
        <Route path="/staff/dashboard" element={<Staff area="dashboard"><Dashboard /></Staff>} />

        {/* Staff: timesheets */}
        <Route path="/staff/timesheets" element={<Staff area="timesheets"><AllTimesheets /></Staff>} />
        <Route path="/staff/timesheets/:id" element={<Staff area="timesheets"><TimesheetDetail /></Staff>} />

        {/* Old Users, Contractors and Accounts addresses (now under Admin), kept so bookmarks still work */}
        <Route path="/staff/users" element={<OldUsersLink />} />
        <Route path="/staff/users/:kind" element={<OldUsersLink />} />
        <Route path="/staff/users/:kind/:id" element={<OldUsersLink />} />
        <Route path="/staff/engineers" element={<OldUsersLink />} />
        <Route path="/staff/engineers/:id" element={<OldContractorLink />} />
        <Route path="/staff/accounts" element={<Navigate to="/staff/admin/customer-accounts" replace />} />

        {/* Staff: sales pipeline */}

        <Route path="/staff/opportunities" element={<Staff area="opportunities"><OpportunityList /></Staff>} />
        <Route path="/staff/opportunities/new" element={<Staff area="opportunities"><OpportunityForm /></Staff>} />
        <Route path="/staff/opportunities/:id" element={<Staff area="opportunities"><OpportunityForm /></Staff>} />

        <Route path="/staff/quotes" element={<Staff area="quotes"><QuoteList /></Staff>} />
        <Route path="/staff/quotes/new" element={<Staff area="quotes"><QuoteForm /></Staff>} />
        <Route path="/staff/quotes/:id" element={<Staff area="quotes"><QuoteForm /></Staff>} />

        <Route path="/staff/sales-orders" element={<Staff area="sales_orders"><SalesOrderList /></Staff>} />
        <Route path="/staff/sales-orders/new" element={<Staff area="sales_orders"><SalesOrderForm /></Staff>} />
        <Route path="/staff/sales-orders/:id" element={<Staff area="sales_orders"><SalesOrderForm /></Staff>} />

        <Route path="/staff/projects" element={<Staff area="projects"><ProjectList /></Staff>} />
        <Route path="/staff/projects/:id" element={<Staff area="projects"><ProjectDetail /></Staff>} />

        <Route path="/staff/invoices" element={<Staff area="invoices"><InvoiceList /></Staff>} />
        <Route path="/staff/invoices/new" element={<Staff area="invoices"><InvoiceForm /></Staff>} />
        <Route path="/staff/invoices/:id" element={<Staff area="invoices"><InvoiceForm /></Staff>} />

        {/* Staff: administration */}
        <Route path="/staff/admin" element={<AdminHome />} />
        <Route path="/staff/admin/users" element={<Navigate to="/staff/admin/logins" replace />} />
        <Route path="/staff/admin/customer-accounts" element={<Staff area="accounts"><Accounts /></Staff>} />
        {/* User Accounts: contractor and staff profiles — permission key "engineers" */}
        <Route path="/staff/admin/user-accounts" element={<Navigate to={PERSON_KINDS.contractor.path} replace />} />
        <Route path="/staff/admin/user-accounts/contractors" element={<Staff area="engineers"><PeopleList key="contractor" kind="contractor" /></Staff>} />
        <Route path="/staff/admin/user-accounts/staff" element={<Staff area="engineers"><PeopleList key="staff" kind="staff" /></Staff>} />
        <Route path="/staff/admin/user-accounts/contractors/:id" element={<Staff area="engineers"><PersonProfile /></Staff>} />
        <Route path="/staff/admin/user-accounts/staff/:id" element={<Staff area="engineers"><PersonProfile /></Staff>} />
        <Route path="/staff/admin/logins" element={<Staff area="admin"><UserAdmin /></Staff>} />
        <Route path="/staff/admin/skills" element={<Staff area="admin"><SkillsAdmin /></Staff>} />
        <Route path="/staff/admin/rate-cards" element={<Staff area="admin"><RateCardsAdmin /></Staff>} />
        <Route path="/staff/admin/invoice-settings" element={<Staff area="admin"><InvoiceSettings /></Staff>} />
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
