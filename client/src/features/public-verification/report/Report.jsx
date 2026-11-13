import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ShieldCheck, ArrowLeft, CheckCircle2, Send } from 'lucide-react'
import { Button } from '../../../components/ui'
import { useDemoData } from '../../../contexts/DemoData'

const ISSUE_TYPES = [
  { value: 'suspicious_origin', label: 'Suspicious origin or unverified seller' },
  { value: 'damaged_packaging', label: 'Damaged or tampered packaging' },
  { value: 'expired_sold', label: 'Expired medicine offered for sale' },
  { value: 'verification_mismatch', label: 'Verification result does not match pack' },
  { value: 'other', label: 'Other issue' }
]

export default function Report() {
  const [searchParams] = useSearchParams()
  const { submitReport, locksSupported, locksUnavailableError } = useDemoData()

  const initialSerial = searchParams.get('serial') ?? ''
  const [serial, setSerial] = useState(initialSerial)
  const [type, setType] = useState('suspicious_origin')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')
  const [submitted, setSubmitted] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return
    const trimmedDesc = description.trim()
    if (!trimmedDesc) return
    setSubmitting(true)
    setErr('')
    try {
      const created = await submitReport({
        serial: serial.trim().toUpperCase() || null,
        type,
        description: trimmedDesc
      })
      if (!created || created.ok === false) {
        setErr(created?.error || 'Unable to submit report.')
        return
      }
      setSubmitted(created)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-navy-deep py-3 text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4">
          <Link to="/verify" className="flex items-center gap-2 font-bold text-white">
            <ShieldCheck className="text-emerald-400" aria-hidden="true" />
            PharmaTrace AI
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/verify" className="text-sm font-medium text-slate-300 hover:text-white">
              Verify medicine
            </Link>
            <Link to="/login" className="text-sm font-medium text-slate-300 hover:text-white">
              Demo sign-in →
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10">
        <Link
          to="/verify"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-navy"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          Back to verification
        </Link>

        <h1 className="mt-4 text-2xl font-bold text-navy">Report a package problem</h1>
        <p className="mt-1 text-sm text-muted">
          Submit a concern about a medicine package, damaged seal, or suspicious verification result.
        </p>

        {!locksSupported && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-quarantine-line bg-quarantine-soft p-3 text-xs font-medium text-quarantine"
          >
            {locksUnavailableError}
          </p>
        )}

        {submitted ? (
          <section
            aria-live="polite"
            className="mt-6 rounded-lg border border-emerald-200 bg-white p-6"
          >
            <div className="flex items-center gap-2 text-clinical">
              <CheckCircle2 size={20} aria-hidden="true" />
              <h2 className="text-lg font-bold text-navy">Report recorded</h2>
            </div>
            <p className="mt-2 text-sm text-ink">
              Your report has been recorded in demo state for review by Investigation Officers.
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-2 rounded-md border border-line bg-surface p-4 text-sm">
              <dt className="text-muted">Reference ID</dt>
              <dd className="id-text font-semibold text-navy">{submitted.id}</dd>
              <dt className="text-muted">Serial number</dt>
              <dd className="id-text font-semibold">{submitted.serial || 'Not provided'}</dd>
              <dt className="text-muted">Issue type</dt>
              <dd>{ISSUE_TYPES.find(t => t.value === submitted.type)?.label ?? submitted.type}</dd>
              <dt className="text-muted">Recorded date</dt>
              <dd className="id-text">{submitted.created}</dd>
            </dl>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link to="/verify">
                <Button variant="primary">Back to verification</Button>
              </Link>
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  setSubmitted(null)
                  setDescription('')
                }}
              >
                Submit another report
              </Button>
            </div>
          </section>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-6 space-y-5 rounded-lg border border-line bg-white p-6"
          >
            <div>
              <label htmlFor="report-serial" className="block text-sm font-semibold text-navy">
                Package serial number <span className="font-normal text-muted">(optional)</span>
              </label>
              <input
                id="report-serial"
                value={serial}
                onChange={e => setSerial(e.target.value)}
                placeholder="e.g. DEMO-PCM-2601-00048"
                className="id-text mt-1.5 w-full rounded-md border border-line px-3.5 py-2.5 text-sm"
              />
            </div>

            <div>
              <label htmlFor="report-type" className="block text-sm font-semibold text-navy">
                Issue type
              </label>
              <select
                id="report-type"
                value={type}
                onChange={e => setType(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-line bg-white px-3.5 py-2.5 text-sm"
              >
                {ISSUE_TYPES.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="report-description" className="block text-sm font-semibold text-navy">
                Description <span className="text-quarantine">*</span>
              </label>
              <textarea
                id="report-description"
                required
                rows={4}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe where the package was obtained and what issue was observed..."
                className="mt-1.5 w-full rounded-md border border-line px-3.5 py-2.5 text-sm"
              />
            </div>

            {err && (
              <p role="alert" className="rounded-md border border-quarantine-line bg-quarantine-soft p-3 text-xs font-semibold text-quarantine">
                {err}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <span className="text-xs text-muted">
                Demo mode: reports are stored locally in this browser for demo preview.
              </span>
              <Button type="submit" variant="success" disabled={!description.trim() || submitting}>
                <Send size={15} aria-hidden="true" />
                {submitting ? 'Submitting...' : 'Submit report'}
              </Button>
            </div>
          </form>
        )}
      </main>
    </div>
  )
}
