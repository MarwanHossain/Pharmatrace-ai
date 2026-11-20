// PharmaTrace AI — Cross-Role Change Password Modal
// Revision 3.2 Security Specification Compliant
import { useState, useMemo, useEffect, useRef } from 'react'
import {
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  Circle,
  X,
  AlertCircle,
  CheckCircle,
  Loader2,
  ShieldCheck
} from 'lucide-react'
import { api } from '../../services/api.js'
import { validatePasswordComplexity } from '../../services/passwordValidation.js'

export { validatePasswordComplexity }

export default function ChangePasswordModal({
  isOpen,
  onClose,
  userEmail,
  userRole,
  onSuccess
}) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const modalRef = useRef(null)

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setShowCurrent(false)
      setShowNew(false)
      setShowConfirm(false)
      setError('')
      setSuccess(false)
      setLoading(false)
    }
  }, [isOpen])

  // Escape key handler
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen && !loading && !success) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, loading, success, onClose])

  const complexity = useMemo(() => validatePasswordComplexity(newPassword), [newPassword])

  const passwordsMatch = useMemo(() => {
    if (!confirmPassword) return null
    return newPassword === confirmPassword
  }, [newPassword, confirmPassword])

  const isIdentical = useMemo(() => {
    if (!currentPassword || !newPassword) return false
    return currentPassword === newPassword
  }, [currentPassword, newPassword])

  if (!isOpen) return null

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!currentPassword) {
      setError('Please enter your current password.')
      return
    }

    if (!newPassword) {
      setError('Please enter your new password.')
      return
    }

    if (isIdentical) {
      setError('New password cannot be identical to your current password.')
      return
    }

    if (!complexity.isValid) {
      if (!complexity.hasMaxLength) {
        setError('New password cannot exceed 72 bytes.')
      } else {
        setError('New password does not satisfy all complexity requirements.')
      }
      return
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match. Please verify your entries.')
      return
    }

    setLoading(true)

    try {
      await api.post('/v1/auth/change-password', {
        currentPassword,
        newPassword
      })

      setSuccess(true)
      setLoading(false)

      // Automatic redirection trigger after brief feedback delay
      setTimeout(() => {
        if (onSuccess) {
          onSuccess()
        } else {
          window.location.href = '/login?message=password_changed'
        }
      }, 1500)
    } catch (err) {
      setLoading(false)
      if (err.code === 'INVALID_CURRENT_PASSWORD') {
        setError('The current password you entered is incorrect.')
      } else if (err.code === 'IDENTICAL_PASSWORD') {
        setError('New password cannot be identical to your current password.')
      } else if (err.code === 'INVALID_PASSWORD_COMPLEXITY') {
        setError('New password does not meet the complexity rules.')
      } else if (err.code === 'PASSWORD_TOO_LONG') {
        setError('New password exceeds the 72-byte limit.')
      } else if (err.code === 'RATE_LIMIT_EXCEEDED') {
        setError('Too many attempts from this IP. Please wait 15 minutes before retrying.')
      } else if (err.code === 'SESSION_REVOKED' || err.code === 'AUTH_TOKEN_MISSING') {
        setError('Your session has expired. Please sign in again.')
      } else {
        setError(err.message || 'Unable to update password. Please try again.')
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-password-title"
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl transition-all"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
              <KeyRound size={18} />
            </div>
            <div>
              <h2 id="change-password-title" className="text-base font-semibold text-slate-900">
                Change Account Password
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                {userRole && (
                  <span className="font-medium capitalize text-slate-700">
                    Role: {userRole}
                  </span>
                )}
                {userEmail && (
                  <>
                    <span>·</span>
                    <span className="text-slate-500">{userEmail}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          {!loading && !success && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {success ? (
            <div className="py-6 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Password Changed Successfully!</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600">
                Your password has been securely updated. All previous active sessions across all devices
                have been terminated.
              </p>
              <p className="mt-4 text-xs font-semibold text-slate-400">
                Redirecting to login with fresh credentials...
              </p>
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    if (onSuccess) onSuccess()
                    else window.location.href = '/login?message=password_changed'
                  }}
                  className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Sign In with New Password
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-800"
                >
                  <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-600" />
                  <div className="font-medium leading-relaxed">{error}</div>
                </div>
              )}

              {/* Current Password Field */}
              <div>
                <label
                  htmlFor="change-pwd-current"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
                >
                  Current Password
                </label>
                <div className="relative mt-1.5">
                  <input
                    id="change-pwd-current"
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="current-password"
                    placeholder="Enter existing password"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    disabled={loading}
                    aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 focus:outline-none"
                  >
                    {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* New Password Field */}
              <div>
                <label
                  htmlFor="change-pwd-new"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
                >
                  New Password
                </label>
                <div className="relative mt-1.5">
                  <input
                    id="change-pwd-new"
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="new-password"
                    placeholder="Enter new strong password"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    disabled={loading}
                    aria-label={showNew ? 'Hide new password' : 'Show new password'}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 focus:outline-none"
                  >
                    {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {isIdentical && newPassword.length > 0 && (
                  <p className="mt-1 text-xs font-medium text-amber-600">
                    ⚠ New password cannot be identical to current password.
                  </p>
                )}

                {/* Password Complexity Checklist */}
                <div className="mt-2.5 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                  <div className="text-[11px] font-semibold text-slate-700">Password Requirements:</div>
                  <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      {complexity.hasMinLength ? (
                        <CheckCircle2 size={13} className="text-emerald-600" />
                      ) : (
                        <Circle size={13} className="text-slate-400" />
                      )}
                      <span className={complexity.hasMinLength ? 'text-emerald-800 font-medium' : 'text-slate-500'}>
                        At least 10 characters
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {complexity.hasUppercase ? (
                        <CheckCircle2 size={13} className="text-emerald-600" />
                      ) : (
                        <Circle size={13} className="text-slate-400" />
                      )}
                      <span className={complexity.hasUppercase ? 'text-emerald-800 font-medium' : 'text-slate-500'}>
                        At least 1 uppercase letter (A-Z)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {complexity.hasLowercase ? (
                        <CheckCircle2 size={13} className="text-emerald-600" />
                      ) : (
                        <Circle size={13} className="text-slate-400" />
                      )}
                      <span className={complexity.hasLowercase ? 'text-emerald-800 font-medium' : 'text-slate-500'}>
                        At least 1 lowercase letter (a-z)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {complexity.hasDigit ? (
                        <CheckCircle2 size={13} className="text-emerald-600" />
                      ) : (
                        <Circle size={13} className="text-slate-400" />
                      )}
                      <span className={complexity.hasDigit ? 'text-emerald-800 font-medium' : 'text-slate-500'}>
                        At least 1 number (0-9)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 sm:col-span-2">
                      {complexity.hasSymbol ? (
                        <CheckCircle2 size={13} className="text-emerald-600" />
                      ) : (
                        <Circle size={13} className="text-slate-400" />
                      )}
                      <span className={complexity.hasSymbol ? 'text-emerald-800 font-medium' : 'text-slate-500'}>
                        At least 1 special character (!@#$%^&*...)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Confirm New Password Field */}
              <div>
                <label
                  htmlFor="change-pwd-confirm"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
                >
                  Confirm New Password
                </label>
                <div className="relative mt-1.5">
                  <input
                    id="change-pwd-confirm"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="new-password"
                    placeholder="Re-enter new password"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    disabled={loading}
                    aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 focus:outline-none"
                  >
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {passwordsMatch !== null && (
                  <p
                    className={`mt-1 text-xs font-medium ${
                      passwordsMatch ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {passwordsMatch ? '✓ Passwords match' : '✗ Passwords do not match'}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    loading ||
                    !currentPassword ||
                    !newPassword ||
                    !confirmPassword ||
                    !complexity.isValid ||
                    isIdentical ||
                    passwordsMatch === false
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  {loading ? 'Changing Password...' : 'Update Password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
