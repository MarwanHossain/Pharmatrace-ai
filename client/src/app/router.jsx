import { createBrowserRouter, Navigate, Link } from 'react-router-dom'
import AppShell from '../layouts/AppShell'
import { ROLES } from '../constants/navigation'
import Login from '../features/authentication/Login'
import RegistrationLanding from '../features/registration/RegistrationLanding'
import RegistrationTracking from '../features/registration/RegistrationTracking'
import RegistrationResubmit from '../features/registration/RegistrationResubmit'
import ForgotPassword from '../features/authentication/ForgotPassword'
import Verify from '../features/public-verification/verify/Verify'
import VerifyResults from '../features/public-verification/results/Results'
import Report from '../features/public-verification/report/Report'
import Placeholder from '../features/shared/Placeholder'

import MfgDashboard from '../features/manufacturer/dashboard/Dashboard'
import MfgProductsBatches from '../features/manufacturer/products-batches/ProductsBatches'
import Serialization from '../features/manufacturer/serialization/Serialization'
import MfgShipments from '../features/manufacturer/shipments/Shipments'

import DistDashboard from '../features/distributor/dashboard/Dashboard'
import DistIncoming from '../features/distributor/incoming/Incoming'
import DistInventory from '../features/distributor/inventory/Inventory'
import DistOutgoing from '../features/distributor/outgoing/Outgoing'

import WholDashboard from '../features/wholesaler/dashboard/Dashboard'
import WholIncoming from '../features/wholesaler/incoming/Incoming'
import WholInventory from '../features/wholesaler/inventory/Inventory'
import WholOutgoing from '../features/wholesaler/outgoing/Outgoing'

import PharmDashboard from '../features/pharmacy/dashboard/Dashboard'
import PharmIncoming from '../features/pharmacy/incoming/Incoming'
import PharmInventory from '../features/pharmacy/inventory/Inventory'
import PharmVerifyDispense from '../features/pharmacy/verify-dispense/VerifyDispense'

import AdminDashboard from '../features/admin/dashboard/Dashboard'
import AdminOrganizations from '../features/admin/organizations/Organizations'
import AdminUsers from '../features/admin/users/Users'

import InvDashboard from '../features/investigator/dashboard/Dashboard'
import InvAlerts from '../features/investigator/alerts/Alerts'
import InvSearch from '../features/investigator/search/Search'
import InvInvestigations from '../features/investigator/investigations/Investigations'

const IMPL = {
  'manufacturer/dashboard': <MfgDashboard />,
  'manufacturer/products-batches': <MfgProductsBatches />,
  'manufacturer/serialization': <Serialization />,
  'manufacturer/shipments': <MfgShipments />,
  'distributor/dashboard': <DistDashboard />,
  'distributor/incoming': <DistIncoming />,
  'distributor/inventory': <DistInventory />,
  'distributor/outgoing': <DistOutgoing />,
  'wholesaler/dashboard': <WholDashboard />,
  'wholesaler/incoming': <WholIncoming />,
  'wholesaler/inventory': <WholInventory />,
  'wholesaler/outgoing': <WholOutgoing />,
  'pharmacy/dashboard': <PharmDashboard />,
  'pharmacy/incoming': <PharmIncoming />,
  'pharmacy/inventory': <PharmInventory />,
  'pharmacy/verify-dispense': <PharmVerifyDispense />,
  'admin/dashboard': <AdminDashboard />,
  'admin/organizations': <AdminOrganizations />,
  'admin/users': <AdminUsers />,
  'investigator/dashboard': <InvDashboard />,
  'investigator/alerts': <InvAlerts />,
  'investigator/search': <InvSearch />,
  'investigator/investigations': <InvInvestigations />
}

const Msg = ({ t }) => (
  <div className="grid min-h-screen place-items-center">
    <div className="text-center">
      <h1 className="text-xl font-bold text-navy">{t}</h1>
      <Link to="/login" className="text-clinical">
        Back to start
      </Link>
    </div>
  </div>
)

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/login', element: <Login /> },
  { path: '/register', element: <RegistrationLanding /> },
  { path: '/register/track', element: <RegistrationTracking /> },
  { path: '/resubmit', element: <RegistrationResubmit /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/verify', element: <Verify /> },
  { path: '/verify/results/:serial', element: <VerifyResults /> },
  { path: '/report', element: <Report /> },
  { path: '/access-denied', element: <Msg t="Access denied" /> },
  ...Object.entries(ROLES).map(([role, cfg]) => ({
    path: `/${role}`,
    element: <AppShell role={role} />,
    children: [
      { index: true, element: <Navigate to="dashboard" replace /> },
      ...cfg.nav.map(n => ({
        path: n.path,
        element: IMPL[`${role}/${n.path}`] ?? <Placeholder title={n.label} />
      }))
    ]
  })),
  { path: '*', element: <Msg t="Page not found" /> }
])
