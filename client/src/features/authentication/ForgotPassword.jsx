import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck, CheckCircle2, ArrowLeft } from 'lucide-react'
import { Button } from '../../components/ui'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    if (!email.trim()) return
    setSubmitted(true)
  }

  return (
    <div className="grid min-h-screen place-items-center bg-surface p-4">
      <div className="w-full max-w-md rounded-lg border border-line bg-white p-8">
        <div className="mb-5 flex items-center gap-2 text-xl font-bold text-navy">
          <ShieldCheck className="text-clinical" aria-hidden="true" />
          PharmaTrace AI
        </div>

        <h1 className="text-lg font-bold text-navy">Reset password</h1>
        <p className="mt-3 rounded border border-amber-line bg-amber-soft p-3 text-xs text-amber-ink">
          <b>Demo UI only</b> — no email or password reset occurs. Use the role preview buttons on the sign-in screen to explore the app.
        </p>

        {submitted ? (
          <div className="mt-5 rounded-md border border-emerald-200 bg-clinical-soft p-4 text-sm">
            <div className="flex items-center gap-2 font-bold text-emerald-900">
              <CheckCircle2 size={18} aria-hidden="true" />
              Demo reset request recorded
            </div>
            <p className="mt-2 text-xs text-emerald-900">
              If this were connected to a backend, a password reset link would be sent to{' '}
              <span className="font-semibold">{email}</span>.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="reset-email" className="block text-xs font-semibold text-navy">
                Account email
              </label>
              <input
                id="reset-email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@organization.demo"
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
              />
            </div>
            <Button type="submit" variant="primary" className="w-full">
              Request demo reset
            </Button>
          </form>
        )}

        <Link
          to="/login"
          className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-navy"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to demo sign-in
        </Link>
      </div>
    </div>
  )
}
