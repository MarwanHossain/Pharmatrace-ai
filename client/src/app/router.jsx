import {createBrowserRouter,Navigate,Link} from 'react-router-dom'
import AppShell from '../layouts/AppShell'
import {ROLES} from '../constants/navigation'
import Login from '../features/authentication/Login'
import Verify from '../features/public-verification/verify/Verify'
import Placeholder from '../features/shared/Placeholder'
import MfgDashboard from '../features/manufacturer/dashboard/Dashboard'
import Serialization from '../features/manufacturer/serialization/Serialization'
const IMPL={'manufacturer/dashboard':<MfgDashboard/>,'manufacturer/serialization':<Serialization/>}
const Msg=({t})=><div className="grid min-h-screen place-items-center"><div className="text-center"><h1 className="text-xl font-bold text-navy">{t}</h1><Link to="/login" className="text-clinical">Back to start</Link></div></div>
export const router=createBrowserRouter([
 {path:'/',element:<Navigate to="/login" replace/>},{path:'/login',element:<Login/>},{path:'/verify',element:<Verify/>},
 {path:'/access-denied',element:<Msg t="Access denied"/>},
 ...Object.entries(ROLES).map(([role,cfg])=>({path:`/${role}`,element:<AppShell role={role}/>,children:[{index:true,element:<Navigate to="dashboard" replace/>},
  ...cfg.nav.map(n=>({path:n.path,element:IMPL[`${role}/${n.path}`]??<Placeholder title={n.label}/>}))]})),
 {path:'*',element:<Msg t="Page not found"/>}])
