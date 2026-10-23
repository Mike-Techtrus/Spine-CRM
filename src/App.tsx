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

function RoleHome() {
  const { profile, loading } = useAuth()
  if (loading) return null
  return <Navigate to={profile?.role === 'staff' ? '/staff/dashboard' : '/my/timesheets'} replace />
}

function Staff({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute allowedRoles={['staff']}>{children}</ProtectedRoute>
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
        <Route path="/staff/dashboard" element={<Staff><Dashboard /></Staff>} />

        {/* Staff: timesheets */}
        <Route path="/staff/timesheets" element={<Staff><AllTimesheets /></Staff>} />
        <Route path="/staff/timesheets/:id" element={<Staff><TimesheetDetail /></Staff>} />
        <Route path="/staff/engineers" element={<Staff><FieldEngineers /></Staff>} />

        {/* Staff: sales pipeline */}
        <Route path="/staff/accounts" element={<Staff><Accounts /></Staff>} />

        <Route path="/staff/opportunities" element={<Staff><OpportunityList /></Staff>} />
        <Route path="/staff/opportunities/new" element={<Staff><OpportunityForm /></Staff>} />
        <Route path="/staff/opportunities/:id" element={<Staff><OpportunityForm /></Staff>} />

        <Route path="/staff/quotes" element={<Staff><QuoteList /></Staff>} />
        <Route path="/staff/quotes/new" element={<Staff><QuoteForm /></Staff>} />
        <Route path="/staff/quotes/:id" element={<Staff><QuoteForm /></Staff>} />

        <Route path="/staff/sales-orders" element={<Staff><SalesOrderList /></Staff>} />
        <Route path="/staff/sales-orders/new" element={<Staff><SalesOrderForm /></Staff>} />
        <Route path="/staff/sales-orders/:id" element={<Staff><SalesOrderForm /></Staff>} />

        <Route path="/staff/invoices" element={<Staff><InvoiceList /></Staff>} />
        <Route path="/staff/invoices/new" element={<Staff><InvoiceForm /></Staff>} />
        <Route path="/staff/invoices/:id" element={<Staff><InvoiceForm /></Staff>} />
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
