import { NavLink, Outlet, Navigate, Link } from 'react-router-dom'
import { useState } from 'react'
import { Menu, ShieldCheck, LogOut, ShieldAlert } from 'lucide-react'
import { ROLES } from '../constants/navigation'
import { useDemoSession } from '../contexts/DemoSession'
import { useDemoData } from '../contexts/DemoData'

export default function AppShell({ role }) {
  const { initialized, role: current, user, organization, logout } = useDemoSession()
  const { locksSupported, locksUnavailableError, syncConflict } = useDemoData()
  const [open, setOpen] = useState(false)
  const cfg = ROLES[role]

  if (!initialized) return null
  if (!current) return <Navigate to="/login" replace />
  if (current !== role) return <Navigate to="/access-denied" replace />

  const orgDisplay = organization?.name ?? cfg.org

  return (
    <div className="flex min-h-screen">
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 transform bg-navy-deep text-slate-200 transition md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-5 py-4 font-bold text-white">
          <ShieldCheck className="text-emerald-400" size={20} />
          PharmaTrace AI
        </div>
        <div className="px-5 py-3 text-xs text-slate-400">
          {cfg.label}
          <div className="font-semibold text-slate-200">{orgDisplay}</div>
          {user && <div className="mt-0.5 text-[11px] text-slate-400">Signed in: {user.name}</div>}
        </div>
        <nav className="px-2">
          {cfg.nav.map(n => (
            <NavLink
              key={n.path}
              to={`/${role}/${n.path}`}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `mb-0.5 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
                  isActive ? 'bg-white/10 text-white' : 'hover:bg-white/5'
                }`
              }
            >
              <n.icon size={16} />
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3">
          <button className="md:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu />
          </button>
          <span className="rounded bg-amber-soft px-2 py-0.5 text-xs font-semibold text-amber-ink">
            Demo preview · local browser storage · no backend
          </span>
          <Link
            to="/login"
            onClick={() => logout()}
            className="flex items-center gap-1 text-sm text-muted hover:text-navy"
          >
            <LogOut size={14} />
            Exit demo
          </Link>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">
          {!locksSupported && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2.5 rounded-md border border-quarantine-line bg-quarantine-soft px-4 py-3 text-xs font-medium text-quarantine"
            >
              <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{locksUnavailableError}</span>
            </div>
          )}
          {syncConflict && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2.5 rounded-md border border-amber-line bg-amber-soft px-4 py-3 text-xs font-medium text-amber-ink"
            >
              <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{syncConflict}</span>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  )
}
