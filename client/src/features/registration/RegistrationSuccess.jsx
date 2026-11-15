// PharmaTrace AI — Registration Success Confirmation
// Displays the one-time reference number and ephemeral tracking PIN with copy & print support
import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CheckCircle2,
  Copy,
  Check,
  Printer,
  ShieldAlert,
  ArrowRight,
  FileText,
  Building,
  Calendar,
  Layers
} from 'lucide-react'
import { Button } from '../../components/ui'

export default function RegistrationSuccess({ registrationData, onReset }) {
  const navigate = useNavigate()
  const [copiedRef, setCopiedRef] = useState(false)
  const [copiedPin, setCopiedPin] = useState(false)
  const [confirmedSaved, setConfirmedSaved] = useState(false)
  const [showExitWarning, setShowExitWarning] = useState(false)

  const {
    referenceNumber = 'REG-PENDING',
    trackingPin = '------',
    orgName = '',
    category = '',
    pharmacyClassification = '',
    documentsCount = 1,
    status = 'SUBMITTED',
    createdAt = new Date().toISOString()
  } = registrationData || {}

  // Prevent accidental navigation away without saving PIN
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (!confirmedSaved) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [confirmedSaved])

  async function handleCopyRef() {
    try {
      await navigator.clipboard.writeText(referenceNumber)
      setCopiedRef(true)
      setTimeout(() => setCopiedRef(false), 2500)
    } catch {
      // Fallback
    }
  }

  async function handleCopyPin() {
    try {
      await navigator.clipboard.writeText(trackingPin)
      setCopiedPin(true)
      setTimeout(() => setCopiedPin(false), 2500)
    } catch {
      // Fallback
    }
  }

  function handlePrint() {
    window.print()
  }

  function handleNavigateToTrack() {
    if (!confirmedSaved) {
      setShowExitWarning(true)
      return
    }
    navigate('/register/track')
  }

  function handleProceedExit() {
    navigate('/register/track')
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="text-center">
        <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-clinical-soft text-clinical">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-navy">Application Submitted Successfully</h1>
        <p className="mt-2 text-sm text-muted">
          Your organization registration application has been queued for Directorate General of Drug Administration (DGDA) regulatory review.
        </p>
      </div>

      {/* Critical Security Warning Card */}
      <div className="mt-6 rounded-lg border-2 border-amber-line bg-amber-soft p-5 text-amber-ink">
        <div className="flex items-start gap-3">
          <ShieldAlert className="h-6 w-6 flex-shrink-0 text-amber-ink mt-0.5" />
          <div className="space-y-1">
            <h2 className="text-sm font-bold uppercase tracking-wide">
              Important: Save Your Tracking Credentials Now
            </h2>
            <p className="text-xs leading-relaxed">
              Your <strong>Tracking PIN</strong> is shown below for this session only. For your security, this PIN is cryptographically hashed on the server and <strong>cannot be retrieved if lost</strong>. Store it securely to track your application status or respond to information requests.
            </p>
          </div>
        </div>
      </div>

      {/* Credentials Display Card */}
      <div className="mt-6 rounded-xl border border-line bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Reference Number */}
          <div className="rounded-lg border border-line bg-surface p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted">
              Application Reference Number
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="font-mono text-xl font-bold text-navy">{referenceNumber}</span>
              <button
                type="button"
                onClick={handleCopyRef}
                aria-label="Copy reference number"
                className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-xs font-semibold text-navy border border-line hover:bg-slate-50 transition"
              >
                {copiedRef ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-clinical" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Tracking PIN */}
          <div className="rounded-lg border border-line bg-surface p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted">
              Six-Digit Tracking PIN
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="font-mono text-xl font-bold tracking-widest text-clinical">
                {trackingPin}
              </span>
              <button
                type="button"
                onClick={handleCopyPin}
                aria-label="Copy tracking PIN"
                className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-xs font-semibold text-navy border border-line hover:bg-slate-50 transition"
              >
                {copiedPin ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-clinical" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Confirmation checkbox */}
        <div className="mt-5 flex items-start gap-2.5 rounded-lg bg-slate-50 p-3 text-xs text-ink">
          <input
            id="confirm-saved"
            type="checkbox"
            checked={confirmedSaved}
            onChange={(e) => setConfirmedSaved(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-line text-navy focus:ring-navy"
          />
          <label htmlFor="confirm-saved" className="font-medium cursor-pointer">
            I confirm that I have copied and securely saved both my Reference Number and Tracking PIN.
          </label>
        </div>

        {/* Dossier Summary */}
        <div className="mt-6 border-t border-line pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
            Submission Details
          </h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Building className="h-4 w-4 text-muted flex-shrink-0" />
              <dt className="text-muted">Organization:</dt>
              <dd className="font-semibold text-navy truncate">{orgName}</dd>
            </div>
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted flex-shrink-0" />
              <dt className="text-muted">Category:</dt>
              <dd className="font-semibold text-navy capitalize">
                {category}
                {pharmacyClassification && pharmacyClassification !== 'NOT_APPLICABLE' && (
                  <span className="ml-1 text-muted font-normal">({pharmacyClassification})</span>
                )}
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted flex-shrink-0" />
              <dt className="text-muted">Submitted:</dt>
              <dd className="font-medium text-navy">
                {new Date(createdAt).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })}
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted flex-shrink-0" />
              <dt className="text-muted">Documents Uploaded:</dt>
              <dd className="font-semibold text-navy">{documentsCount} file(s)</dd>
            </div>
          </dl>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-3.5 py-2 text-sm font-semibold text-ink hover:bg-surface transition"
          >
            <Printer className="h-4 w-4 text-muted" />
            <span>Print Receipt</span>
          </button>

          <Button
            type="button"
            onClick={handleNavigateToTrack}
            variant="primary"
            className="inline-flex items-center gap-2"
          >
            <span>Track Application Status</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Next steps explanation */}
      <div className="mt-6 rounded-lg border border-line bg-white p-5 text-xs text-muted space-y-2">
        <h4 className="font-semibold text-navy uppercase tracking-wider">What happens next?</h4>
        <ol className="list-decimal pl-4 space-y-1.5 leading-relaxed">
          <li>A DGDA regulatory officer will review your organization details and uploaded legal licenses.</li>
          <li>If supplementary documentation is required, you will be notified via email with instructions to resubmit.</li>
          <li>Upon approval, your organization will be automatically provisioned in the national track-and-trace registry and account activation will be coordinated with your registered primary contact.</li>
        </ol>
      </div>

      {/* Exit Warning Modal */}
      {showExitWarning && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="exit-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-amber-soft p-2 text-amber-ink">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <h3 id="exit-modal-title" className="text-base font-bold text-navy">
                  Have You Saved Your Tracking PIN?
                </h3>
                <p className="mt-1 text-xs text-muted leading-relaxed">
                  Your tracking PIN ({trackingPin}) will not be accessible after leaving this page. Are you certain you have copied or printed it?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowExitWarning(false)}
                className="rounded-md border border-line bg-white px-3.5 py-2 text-xs font-semibold text-ink hover:bg-surface"
              >
                Go Back and Save
              </button>
              <button
                type="button"
                onClick={handleProceedExit}
                className="rounded-md bg-quarantine px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-800"
              >
                I Understand, Leave Page
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
