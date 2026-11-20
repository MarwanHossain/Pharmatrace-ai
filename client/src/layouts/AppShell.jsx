import { NavLink, Outlet, Navigate, Link } from 'react-router-dom'
import { useState } from 'react'
import { Menu, ShieldCheck, LogOut, ShieldAlert, KeyRound } from 'lucide-react'
import { ROLES } from '../constants/navigation'
import { useDemoSession } from '../contexts/DemoSession'
import { useDemoData } from '../contexts/DemoData'
import { useAuth } from '../contexts/AuthContext'
import ChangePasswordModal from '../components/auth/ChangePasswordModal'

export default function AppShell({ role }) {
  const { initialized, role: current, user, organization, logout: demoLogout } = useDemoSession()
  const { locksSupported, locksUnavailableError, syncConflict } = useDemoData()
  const { currentUser, isAuthenticated, isLoading, logout: realLogout } = useAuth()
  const [open, setOpen] = useState(false)
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false)
  const cfg = ROLES[role]

  const isLiveAuth = isAuthenticated && currentUser?.role === role

  const CANONICAL_LIVE_ROLES = new Set(['admin', 'investigator', 'manufacturer', 'distributor', 'wholesaler', 'pharmacy'])

  // Enforce live authentication for role === 'manufacturer' and all canonical roles
  if (CANONICAL_LIVE_ROLES.has(role)) {
    if (isLoading) {
      return (
        <div className="grid min-h-screen place-items-center bg-surface">
          <div className="text-center text-sm font-semibold text-navy">
            Verifying {cfg.label} session...
          </div>
        </div>
      )
    }
    if (!isLiveAuth) {
      if (isAuthenticated && currentUser?.role !== role) {
        return <Navigate to="/access-denied" replace />
      }
      return <Navigate to="/login" replace />
    }
  }

  const orgDisplay = isLiveAuth
    ? (currentUser?.orgName || (role === 'admin' ? 'Directorate General of Drug Administration (DGDA)' : (organization?.name ?? cfg.org)))
    : (organization?.name ?? cfg.org)
  const userDisplay = isLiveAuth
    ? currentUser?.email
    : (user?.name || cfg.label)
  const userEmailForModal = isLiveAuth ? currentUser?.email : `${role}@pharmatrace.test`

  const handlePasswordChangeSuccess = async () => {
    await realLogout()
    demoLogout()
    window.location.href = '/login?message=password_changed'
  }

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
          {userDisplay && <div className="mt-0.5 text-[11px] text-slate-400">Signed in: {userDisplay}</div>}
          {isLiveAuth && (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setIsChangePasswordOpen(true)
              }}
              className="mt-2 flex items-center gap-1.5 rounded bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-white/10 hover:text-white transition"
            >
              <KeyRound size={12} className="text-emerald-400" />
              Change Password
            </button>
          )}
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
          {isLiveAuth ? (
            <span className="rounded border border-emerald-300 bg-clinical-soft px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
              {role === 'admin' ? 'DGDA Administrator' : cfg.label} · Live Session
            </span>
          ) : (
            <span className="rounded bg-amber-soft px-2 py-0.5 text-xs font-semibold text-amber-ink">
              Operational Preview
            </span>
          )}
          <div className="flex items-center gap-3">
            {isLiveAuth && (
              <button
                type="button"
                onClick={() => setIsChangePasswordOpen(true)}
                className="flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-navy transition shadow-xs"
              >
                <KeyRound size={13} className="text-slate-500" />
                Change Password
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                await realLogout()
                demoLogout()
                window.location.href = '/login'
              }}
              className="flex items-center gap-1 text-sm text-muted hover:text-navy"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
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

      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        userEmail={userEmailForModal}
        userRole={role}
        onSuccess={handlePasswordChangeSuccess}
      />
    </div>
  )
}
