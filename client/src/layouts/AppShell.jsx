import {NavLink,Outlet,Navigate,Link} from 'react-router-dom'
import {useState} from 'react'
import {Menu,ShieldCheck,LogOut} from 'lucide-react'
import {ROLES} from '../constants/navigation'
import {useDemoSession} from '../contexts/DemoSession'
export default function AppShell({role}){
 const{role:current,setRole}=useDemoSession();const[open,setOpen]=useState(false);const cfg=ROLES[role]
 if(!current)return<Navigate to="/login" replace/>
 if(current!==role)return<Navigate to="/access-denied" replace/>
 return<div className="flex min-h-screen">
 <aside className={`fixed inset-y-0 left-0 z-30 w-64 transform bg-navy-deep text-slate-200 transition md:static md:translate-x-0 ${open?'translate-x-0':'-translate-x-full'}`}>
 <div className="flex items-center gap-2 border-b border-white/10 px-5 py-4 font-bold text-white"><ShieldCheck className="text-emerald-400" size={20}/>PharmaTrace AI</div>
 <div className="px-5 py-3 text-xs text-slate-400">{cfg.label}<div className="font-semibold text-slate-200">{cfg.org}</div></div>
 <nav className="px-2">{cfg.nav.map(n=><NavLink key={n.path} to={`/${role}/${n.path}`} onClick={()=>setOpen(false)} className={({isActive})=>`mb-0.5 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${isActive?'bg-white/10 text-white':'hover:bg-white/5'}`}><n.icon size={16}/>{n.label}</NavLink>)}</nav></aside>
 <div className="flex min-w-0 flex-1 flex-col"><header className="flex items-center justify-between border-b border-line bg-white px-4 py-3"><button className="md:hidden" aria-label="Open menu" onClick={()=>setOpen(true)}><Menu/></button><span className="rounded bg-amber-soft px-2 py-0.5 text-xs font-semibold text-amber-ink">Demo preview · mock data · no backend</span>
 <Link to="/login" onClick={()=>setRole(null)} className="flex items-center gap-1 text-sm text-muted hover:text-navy"><LogOut size={14}/>Exit demo</Link></header>
 <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8"><Outlet/></main></div></div>}
