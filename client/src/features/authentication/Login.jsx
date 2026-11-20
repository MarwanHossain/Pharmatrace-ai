import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import {
  ShieldCheck,
  ArrowLeft,
  Eye,
  EyeOff,
  Lock,
  ArrowRight
} from 'lucide-react'
import { ROLES } from '../../constants/navigation'
import { ROLE_CARDS, ROLE_KEY_SET } from '../../constants/loginCards'
import { useDemoSession } from '../../contexts/DemoSession'
import { useAuth } from '../../contexts/AuthContext'

export default function Login() {
  const { roleParam } = useParams()
  const [searchParams] = useSearchParams()
  const nav = useNavigate()

  const { login: authLogin, logout: authLogout, sessionError } = useAuth()
  const { loginWithRole } = useDemoSession()

  // Form states: initially strictly empty
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')

  // Determine active role from path param or query string
  const roleSlug = (roleParam || searchParams.get('role') || '').toLowerCase().trim()
  const activeRole = ROLE_KEY_SET.has(roleSlug) ? roleSlug : null
  const selectedRoleConfig = activeRole ? ROLE_CARDS.find(r => r.key === activeRole) : null

  // Check for password changed confirmation message
  useEffect(() => {
    if (searchParams.get('message') === 'password_changed') {
      setNotice('Password changed successfully! All previous sessions have been terminated. Please sign in with your new password.')
    }
  }, [searchParams])

  // Clear fields and error when returning to role selection
  function handleBackToRoles() {
    setAuthEmail('')
    setAuthPassword('')
    setShowPassword(false)
    setErr('')
    setNotice('')
    nav('/login')
  }

  // Navigate to role-specific login
  function handleSelectRole(roleKey) {
    setAuthEmail('')
    setAuthPassword('')
    setShowPassword(false)
    setErr('')
    setNotice('')
    nav(`/login/${roleKey}`)
  }

  // Handle role-specific credential submission
  async function handleAuthLogin(e) {
    e.preventDefault()
    setErr('')
    setNotice('')

    if (!authEmail.trim() || !authPassword) {
      setErr('Please enter both account email and password.')
      return
    }

    setAuthLoading(true)
    try {
      const res = await authLogin(authEmail.trim(), authPassword)
      const authenticatedUser = res?.user

      if (!authenticatedUser) {
        throw new Error('Authentication response did not contain user details.')
      }

      // Strict Role Mismatch Check: Reject if authenticated role differs from chosen portal
      if (authenticatedUser.role !== activeRole) {
        // Immediately revoke session/cookie on backend to prevent unwanted login
        await authLogout()

        const actualRoleLabel = ROLES[authenticatedUser.role]?.label || authenticatedUser.role
        const selectedRoleLabel = selectedRoleConfig?.label || activeRole

        setErr(
          `Account role mismatch: This account has the role "${actualRoleLabel}", but you are logging in under "${selectedRoleLabel}". Please return to role selection and choose the matching account type.`
        )
        return
      }

      // Synchronize demo context if needed and navigate to authoritative portal
      loginWithRole(authenticatedUser.role)
      nav(`/${authenticatedUser.role}/dashboard`)
    } catch (loginErr) {
      setErr(loginErr.message || 'Authentication failed. Please verify credentials.')
    } finally {
      setAuthLoading(false)
    }
  }

  const displayError = err || sessionError

  return (
    <div className="min-h-screen bg-surface px-4 py-8 md:py-12 flex flex-col justify-center items-center">
      <div className="w-full max-w-4xl">
        {/* Step 1: Role Selection Landing View */}
        {!selectedRoleConfig && (
          <div className="rounded-xl border border-line bg-white p-6 sm:p-8 md:p-10 shadow-xs">
            {/* Branding Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center gap-2 mb-2">
                <ShieldCheck className="text-clinical" size={32} aria-hidden="true" />
                <h1 className="text-2xl font-bold tracking-tight text-navy">PharmaTrace AI</h1>
              </div>
              <p className="text-xs text-muted max-w-md mx-auto">
                National Pharmaceutical Supply Chain Traceability & Verification Platform
              </p>
              <div className="mt-6 border-t border-line/60 pt-6">
                <h2 className="text-xl font-bold text-navy">Log in as</h2>
                <p className="mt-1 text-xs text-muted">
                  Select your assigned organization account type to proceed to the secure sign-in portal.
                </p>
              </div>
            </div>

            {notice && (
              <p
                role="status"
                className="mb-6 rounded-md border border-emerald-200 bg-clinical-soft p-3 text-xs font-medium text-emerald-900 text-center"
              >
                {notice}
              </p>
            )}

            {displayError && (
              <p
                role="alert"
                className="mb-6 rounded-md border border-quarantine-line bg-quarantine-soft p-3 text-xs font-medium text-quarantine text-center"
              >
                {displayError}
              </p>
            )}

            {/* Six Clickable Role Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ROLE_CARDS.map(role => {
                const IconComponent = role.icon
                return (
                  <button
                    key={role.key}
                    type="button"
                    onClick={() => handleSelectRole(role.key)}
                    className="group relative flex flex-col justify-between rounded-lg border border-line bg-white p-5 text-left transition duration-150 hover:-translate-y-0.5 hover:border-navy hover:shadow-md focus:outline-none focus:ring-2 focus:ring-navy focus:ring-offset-1"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className={`p-2.5 rounded-lg ${role.iconBg} ${role.iconColor} transition group-hover:scale-105`}>
                          <IconComponent size={22} aria-hidden="true" />
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${role.tagColor}`}>
                          {role.tag}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-navy group-hover:text-clinical transition mb-1.5">
                        {role.title}
                      </h3>
                      <p className="text-xs text-muted leading-relaxed line-clamp-3">
                        {role.description}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-clinical group-hover:text-navy transition">
                      <span>Access Portal</span>
                      <ArrowRight size={14} className="transform group-hover:translate-x-1 transition" />
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Public Access and Governance Links */}
            <div className="mt-8 pt-6 border-t border-line text-center text-xs text-muted flex flex-wrap justify-center gap-x-6 gap-y-2">
              <Link to="/verify" className="font-semibold text-clinical hover:text-navy transition">
                Public Medicine Verification →
              </Link>
              <Link to="/register" className="hover:text-navy hover:underline transition">
                Register Organization with DGDA
              </Link>
              <Link to="/register/track" className="hover:text-navy hover:underline transition">
                Track Application Status
              </Link>
            </div>
          </div>
        )}

        {/* Step 2: Role-Specific Login View */}
        {selectedRoleConfig && (
          <div className="max-w-md mx-auto rounded-xl border border-line bg-white p-6 sm:p-8 shadow-xs">
            {/* Back Button */}
            <button
              type="button"
              onClick={handleBackToRoles}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-navy transition mb-5"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              Back to role selection
            </button>

            {/* Header with PharmaTrace AI Branding & Selected Role */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="text-clinical" size={24} aria-hidden="true" />
                <span className="text-lg font-bold text-navy tracking-tight">PharmaTrace AI</span>
              </div>
              <h2 className="text-xl font-bold text-navy">
                {selectedRoleConfig.title}
              </h2>
              <p className="mt-1 text-xs text-muted">
                {selectedRoleConfig.welcomeText}
              </p>
            </div>

            {/* Selected Role Indicator Badge */}
            <div className="mb-5 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-2.5">
                <div className={`p-1.5 rounded-md ${selectedRoleConfig.iconBg} ${selectedRoleConfig.iconColor}`}>
                  <selectedRoleConfig.icon size={16} aria-hidden="true" />
                </div>
                <div>
                  <span className="text-[11px] uppercase font-bold tracking-wider text-muted block">Selected Portal</span>
                  <span className="text-xs font-bold text-navy">{selectedRoleConfig.label}</span>
                </div>
              </div>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${selectedRoleConfig.tagColor}`}>
                {selectedRoleConfig.tag}
              </span>
            </div>

            {notice && (
              <p
                role="status"
                className="mb-4 rounded-md border border-emerald-200 bg-clinical-soft p-3 text-xs font-medium text-emerald-900"
              >
                {notice}
              </p>
            )}

            {displayError && (
              <p
                role="alert"
                className="mb-4 rounded-md border border-quarantine-line bg-quarantine-soft p-3 text-xs font-medium text-quarantine"
              >
                {displayError}
              </p>
            )}

            {/* Role-Specific Sign-In Form (Initially Empty) */}
            <form onSubmit={handleAuthLogin} className="space-y-4">
              <div>
                <label htmlFor="account-email" className="block text-xs font-semibold text-navy mb-1">
                  Account Email
                </label>
                <input
                  id="account-email"
                  type="email"
                  autoComplete="email"
                  value={authEmail}
                  onChange={e => setAuthEmail(e.target.value)}
                  placeholder="user@organization.com"
                  className="w-full rounded-md border border-line bg-white px-3 py-2 text-xs text-ink placeholder-slate-400 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                  required
                />
              </div>

              <div>
                <label htmlFor="account-password" className="block text-xs font-semibold text-navy mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="account-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={authPassword}
                    onChange={e => setAuthPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full rounded-md border border-line bg-white px-3 py-2 pr-10 text-xs text-ink placeholder-slate-400 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-navy transition focus:outline-none"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full rounded-md bg-navy px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Lock size={13} aria-hidden="true" />
                {authLoading ? 'Authenticating...' : 'Log In'}
              </button>
            </form>

            {/* Distinguish Live Authentication from Prototype Portal Functionality */}
            {!selectedRoleConfig.isLivePortal && (
              <p className="mt-4 rounded border border-amber-line/60 bg-amber-soft/50 p-2.5 text-[11px] text-amber-ink leading-tight">
                <strong>Notice:</strong> Central authentication credentials are verified live by MariaDB identity services. Operational supply chain workflows for this role operate in regulatory preview mode.
              </p>
            )}

            {/* Secondary Actions */}
            <div className="mt-6 pt-4 border-t border-line text-center">
              <button
                type="button"
                onClick={handleBackToRoles}
                className="text-xs text-muted hover:text-navy transition"
              >
                ← Choose a different role
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
