import {useNavigate,Link} from 'react-router-dom'
import {ShieldCheck} from 'lucide-react'
import {ROLES} from '../../constants/navigation'
import {useDemoSession} from '../../contexts/DemoSession'
export default function Login(){
 const{setRole}=useDemoSession();const nav=useNavigate()
 return<div className="grid min-h-screen place-items-center bg-surface p-4"><div className="w-full max-w-md rounded-lg border border-line bg-white p-8">
 <h1 className="mb-6 flex items-center gap-2 text-xl font-bold text-navy"><ShieldCheck className="text-clinical" aria-hidden="true"/>PharmaTrace AI</h1>
 <p className="mb-4 rounded border border-amber-line bg-amber-soft p-3 text-xs text-amber-ink"><b>Development demo.</b> Real sign-in needs the backend, which does not exist yet. Choosing a role below is a preview only, not authentication.</p>
 <div className="grid gap-2">{Object.entries(ROLES).map(([k,r])=><button key={k} onClick={()=>{setRole(k);nav(`/${k}/dashboard`)}} className="rounded-md border border-line px-4 py-2.5 text-left text-sm font-semibold hover:border-clinical hover:bg-clinical-soft">Preview as {r.label}</button>)}</div>
 <Link to="/verify" className="mt-5 block text-center text-sm font-semibold text-clinical">Public medicine verification →</Link></div></div>}
