import { useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ShieldCheck, RotateCcw } from 'lucide-react'
import { ROLES } from '../../constants/navigation'
import { useDemoSession } from '../../contexts/DemoSession'
import { useDemoData } from '../../contexts/DemoData'

export default function Login() {
  const {
    users,
    organizations,
    orgName,
    resetDemoData,
    locksSupported,
    locksUnavailableError,
    syncConflict
  } = useDemoData()
  const { loginWithRole, loginWithUser, logout } = useDemoSession()
  const nav = useNavigate()

  const defaultSelectableUser = useMemo(
    () => users.find(u => u.status === 'active')?.id ?? users[0]?.id ?? '',
    [users]
  )
  const [selectedUserId, setSelectedUserId] = useState(defaultSelectableUser)
  const resolvedSelectedUserId = useMemo(
    () => (users.some(u => u.id === selectedUserId) ? selectedUserId : defaultSelectableUser),
    [users, selectedUserId, defaultSelectableUser]
  )
  const [err, setErr] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [notice, setNotice] = useState('')

  function handleRolePreview(roleKey) {
    setErr('')
    setNotice('')
    const res = loginWithRole(roleKey)
    if (!res.ok) {
      setErr(res.error)
      return
    }
    nav(`/${res.session.role}/dashboard`)
  }

  function handleAccountLogin(e) {
    e.preventDefault()
    setErr('')
    setNotice('')
    const res = loginWithUser(resolvedSelectedUserId)
    if (!res.ok) {
      setErr(res.error)
      return
    }
    nav(`/${res.session.role}/dashboard`)
  }

  async function handleResetConfirm() {
    if (resetting) return
    setResetting(true)
    setErr('')
    setNotice('')
    try {
      const res = await resetDemoData()
      if (!res?.ok) {
        setErr(res?.error || 'Unable to restore clean starting state.')
        return
      }
      logout()
      setConfirmReset(false)
      setNotice('Clean starting state restored in browser local storage.')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-surface p-4">
      <div className="w-full max-w-md rounded-lg border border-line bg-white p-8">
        <h1 className="mb-6 flex items-center gap-2 text-xl font-bold text-navy">
          <ShieldCheck className="text-clinical" aria-hidden="true" />
          PharmaTrace AI
        </h1>
        <p className="mb-4 rounded border border-amber-line bg-amber-soft p-3 text-xs text-amber-ink">
          <b>Development demo.</b> Real sign-in needs the backend, which does not exist yet. Choosing a role or demo account below is a local browser preview only, not production authentication.
        </p>

        {!locksSupported && (
          <p
            role="alert"
            className="mb-4 rounded border border-quarantine-line bg-quarantine-soft p-3 text-xs font-medium text-quarantine"
          >
            {locksUnavailableError}
          </p>
        )}

        {syncConflict && (
          <p
            role="alert"
            className="mb-4 rounded border border-amber-line bg-amber-soft p-3 text-xs font-medium text-amber-ink"
          >
            {syncConflict}
          </p>
        )}

        {err && (
          <p
            role="alert"
            className="mb-4 rounded border border-quarantine-line bg-quarantine-soft p-3 text-xs font-medium text-quarantine"
          >
            {err}
          </p>
        )}

        {notice && (
          <p
            role="status"
            className="mb-4 rounded border border-emerald-200 bg-clinical-soft p-3 text-xs font-medium text-emerald-900"
          >
            {notice}
          </p>
        )}

        <div className="grid gap-2">
          {Object.entries(ROLES).map(([k, r]) => (
            <button
              key={k}
              type="button"
              onClick={() => handleRolePreview(k)}
              className="rounded-md border border-line px-4 py-2.5 text-left text-sm font-semibold hover:border-clinical hover:bg-clinical-soft"
            >
              Preview as {r.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleAccountLogin} className="mt-5 border-t border-line pt-4">
          <label htmlFor="demo-account-select" className="block text-xs font-semibold text-navy">
            Or sign in as a specific account &amp; organization
          </label>
          <div className="mt-1.5 flex gap-2">
            <select
              id="demo-account-select"
              aria-label="Select demo account"
              value={resolvedSelectedUserId}
              onChange={e => {
                setSelectedUserId(e.target.value)
                setErr('')
              }}
              className="min-w-0 flex-1 rounded-md border border-line bg-white px-2.5 py-2 text-xs text-ink"
            >
              {users.map(u => {
                const org = u.orgId ? organizations.find(o => o.id === u.orgId) : null
                const orgSuspended = org && (org.status ?? 'active') !== 'active'
                const suspendedTag =
                  (u.status ?? 'active') !== 'active'
                    ? ' [User suspended]'
                    : orgSuspended
                      ? ' [Org suspended]'
                      : ''
                const roleLabel = ROLES[u.role]?.label ?? u.role
                const scopeLabel = u.orgId ? orgName(u.orgId) : 'Platform'
                return (
                  <option key={u.id} value={u.id}>
                    {u.name} ({roleLabel} · {scopeLabel}){suspendedTag}
                  </option>
                )
              })}
            </select>
            <button
              type="submit"
              className="shrink-0 rounded-md bg-navy px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Sign in
            </button>
          </div>
        </form>

        <Link to="/verify" className="mt-5 block text-center text-sm font-semibold text-clinical">
          Public medicine verification →
        </Link>

        <div className="mt-4 flex flex-col items-center gap-1.5 border-t border-line pt-4 text-xs text-muted">
          <Link to="/register" className="hover:text-navy hover:underline">
            Register organization with DGDA
          </Link>
          <Link to="/register/track" className="hover:text-navy hover:underline">
            Track registration application
          </Link>
          <Link to="/forgot-password" className="hover:text-navy hover:underline">
            Forgot password? (demo)
          </Link>
          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="mt-1 inline-flex items-center gap-1 text-xs text-muted hover:text-navy hover:underline"
            >
              <RotateCcw size={12} aria-hidden="true" />
              Reset demo data to defaults
            </button>
          ) : (
            <div className="mt-2 flex items-center gap-2 rounded border border-amber-line bg-amber-soft px-3 py-1.5 text-xs text-amber-ink">
              <span>Reset to clean starting state?</span>
              <button
                type="button"
                disabled={resetting}
                onClick={handleResetConfirm}
                className="font-bold text-quarantine hover:underline disabled:opacity-50"
              >
                {resetting ? 'Resetting...' : 'Confirm reset'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="font-semibold text-navy hover:underline"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
