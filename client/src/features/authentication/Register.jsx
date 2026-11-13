import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck, CheckCircle2, ArrowLeft } from 'lucide-react'
import { Button } from '../../components/ui'

const ORG_TYPES = ['Manufacturer', 'Distributor', 'Wholesaler', 'Pharmacy', 'Regulatory / Investigation']
const ROLE_OPTIONS = [
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'distributor', label: 'Distributor' },
  { value: 'wholesaler', label: 'Wholesaler' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'investigator', label: 'Investigation Officer' },
  { value: 'admin', label: 'System Administrator' }
]

export default function Register() {
  const [orgName, setOrgName] = useState('')
  const [orgType, setOrgType] = useState('Manufacturer')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('manufacturer')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    if (!orgName.trim() || !contactName.trim() || !email.trim()) return
    setSubmitted(true)
  }

  return (
    <div className="grid min-h-screen place-items-center bg-surface p-4">
      <div className="w-full max-w-md rounded-lg border border-line bg-white p-8">
        <div className="mb-5 flex items-center gap-2 text-xl font-bold text-navy">
          <ShieldCheck className="text-clinical" aria-hidden="true" />
          PharmaTrace AI
        </div>

        <h1 className="text-lg font-bold text-navy">Organization registration request</h1>
        <p className="mt-3 rounded border border-amber-line bg-amber-soft p-3 text-xs text-amber-ink">
          <b>Demo UI only</b> — no backend account creation occurs. Submitting this form previews the onboarding request flow.
        </p>

        {submitted ? (
          <div className="mt-5 rounded-md border border-emerald-200 bg-clinical-soft p-4 text-sm">
            <div className="flex items-center gap-2 font-bold text-emerald-900">
              <CheckCircle2 size={18} aria-hidden="true" />
              Demo request submitted
            </div>
            <p className="mt-2 text-xs text-emerald-900">
              Preview confirmation for <span className="font-semibold">{orgName}</span> ({orgType}) — contact{' '}
              <span className="font-semibold">{contactName}</span> ({email}), requested role:{' '}
              <span className="font-semibold">{ROLE_OPTIONS.find(r => r.value === role)?.label ?? role}</span>.
            </p>
            <div className="mt-4">
              <Link to="/login">
                <Button variant="primary" className="w-full">
                  Return to demo sign-in
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="reg-org-name" className="block text-xs font-semibold text-navy">
                Organization Name
              </label>
              <input
                id="reg-org-name"
                required
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                placeholder="e.g. Meridian Pharma Ltd"
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="reg-org-type" className="block text-xs font-semibold text-navy">
                Organization Type
              </label>
              <select
                id="reg-org-type"
                value={orgType}
                onChange={e => setOrgType(e.target.value)}
                className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
              >
                {ORG_TYPES.map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="reg-contact" className="block text-xs font-semibold text-navy">
                Contact Name
              </label>
              <input
                id="reg-contact"
                required
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                placeholder="Full name"
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="reg-email" className="block text-xs font-semibold text-navy">
                Email
              </label>
              <input
                id="reg-email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@organization.demo"
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="reg-role" className="block text-xs font-semibold text-navy">
                Role
              </label>
              <select
                id="reg-role"
                value={role}
                onChange={e => setRole(e.target.value)}
                className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
              >
                {ROLE_OPTIONS.map(r => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit" variant="success" className="w-full">
              Submit demo request
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
