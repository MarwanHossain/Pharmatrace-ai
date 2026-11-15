// PharmaTrace AI — Registration Tracking Interface
// Queries application status, displays regulatory review notes, and initiates resubmission
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ShieldCheck,
  Search,
  ArrowLeft,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  FileQuestion,
  FileEdit,
  Building,
  Calendar,
  Layers,
  FileText
} from 'lucide-react'
import { Button } from '../../components/ui'
import { trackRegistration } from '../../services/registrationApi'

const STATUS_CONFIG = {
  SUBMITTED: {
    label: 'Application Submitted',
    tone: 'bg-blue-50 text-blue-800 border-blue-200',
    Icon: Clock,
    description: 'Your application has been received and is queued for DGDA regulatory officer assignment.'
  },
  UNDER_REVIEW: {
    label: 'Under Regulatory Review',
    tone: 'bg-amber-soft text-amber-ink border-amber-line',
    Icon: Clock,
    description: 'A DGDA regulatory officer is actively verifying your organization details and licensing documents.'
  },
  INFORMATION_REQUESTED: {
    label: 'Information Requested',
    tone: 'bg-amber-soft text-amber-ink border-amber-line',
    Icon: FileQuestion,
    description: 'The regulatory reviewer has requested additional information or updated licensing documentation.'
  },
  APPROVED: {
    label: 'Approved & Provisioned',
    tone: 'bg-clinical-soft text-emerald-800 border-emerald-300',
    Icon: CheckCircle2,
    description: 'Your organization has been approved and provisioned in the national track-and-trace registry. Account activation and onboarding instructions will be coordinated with your registered primary contact.'
  },
  REJECTED: {
    label: 'Application Rejected',
    tone: 'bg-quarantine-soft text-quarantine border-quarantine-line',
    Icon: XCircle,
    description: 'The regulatory review concluded that this application does not meet DGDA licensing requirements.'
  }
}

export default function RegistrationTracking() {
  const navigate = useNavigate()
  const [credentials, setCredentials] = useState({
    referenceNumber: '',
    trackingPin: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [applicationData, setApplicationData] = useState(null)

  function handleChange(field, value) {
    setCredentials(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setApplicationData(null)

    const cleanRef = credentials.referenceNumber.trim().toUpperCase()
    const cleanPin = credentials.trackingPin.trim()

    if (!cleanRef || !cleanPin) {
      setError('Please provide both your application Reference Number and 6-digit Tracking PIN.')
      return
    }

    setLoading(true)

    try {
      const data = await trackRegistration({
        referenceNumber: cleanRef,
        trackingPin: cleanPin
      })
      setApplicationData(data)
    } catch (err) {
      if (err.statusCode === 429) {
        setError('Too many status checks or failed attempts. For security reasons, please wait 15 minutes before retrying.')
      } else if (err.statusCode === 401 || err.statusCode === 404 || err.code === 'INVALID_CREDENTIALS') {
        setError('Invalid application reference number or tracking PIN. Please check your credentials and try again.')
      } else {
        setError(err.message || 'Unable to check application status. Please verify your connection and try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  function handleProceedToResubmit() {
    // Navigate to /resubmit passing the active credentials in React Router location state
    navigate('/resubmit', {
      state: {
        authMethod: 'pin',
        referenceNumber: applicationData.referenceNumber,
        trackingPin: credentials.trackingPin,
        preloadedData: applicationData
      }
    })
  }

  const currentStatusConfig = applicationData
    ? STATUS_CONFIG[applicationData.status] || {
        label: applicationData.status,
        tone: 'bg-slate-100 text-slate-700 border-slate-200',
        Icon: Clock,
        description: ''
      }
    : null

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy text-white">
              <ShieldCheck className="h-5 w-5 text-clinical" />
            </div>
            <div>
              <span className="text-sm font-bold tracking-tight text-navy">PharmaTrace AI</span>
              <span className="ml-1.5 rounded bg-clinical-soft px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                Application Tracking
              </span>
            </div>
          </Link>

          <Link
            to="/register"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-navy transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>New Registration</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold text-navy sm:text-3xl">
            Track Registration Application
          </h1>
          <p className="mt-2 text-xs text-muted max-w-lg mx-auto">
            Check the live DGDA regulatory review status of your organization application using your official Reference Number and 6-digit Tracking PIN.
          </p>
        </div>

        {/* Inquiry Form */}
        <div className="mt-8 rounded-xl border border-line bg-white p-6 shadow-sm">
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="referenceNumber" className="block text-xs font-semibold text-navy">
                  Application Reference Number
                </label>
                <input
                  id="referenceNumber"
                  type="text"
                  required
                  placeholder="e.g. REG-2026-0004"
                  value={credentials.referenceNumber}
                  onChange={(e) => handleChange('referenceNumber', e.target.value)}
                  disabled={loading}
                  className="mt-1 block w-full rounded-md border border-line px-3 py-2 text-xs uppercase font-mono text-ink placeholder:normal-case placeholder:font-sans focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                />
              </div>

              <div>
                <label htmlFor="trackingPin" className="block text-xs font-semibold text-navy">
                  Six-Digit Tracking PIN
                </label>
                <input
                  id="trackingPin"
                  type="password"
                  required
                  maxLength={6}
                  placeholder="••••••"
                  value={credentials.trackingPin}
                  onChange={(e) => handleChange('trackingPin', e.target.value)}
                  disabled={loading}
                  className="mt-1 block w-full rounded-md border border-line px-3 py-2 text-xs font-mono tracking-widest text-ink focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-quarantine-line bg-quarantine-soft p-3 text-xs text-quarantine"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                disabled={loading}
                variant="primary"
                className="inline-flex items-center gap-2 min-w-[140px]"
              >
                {loading ? (
                  <>
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Inquiring...</span>
                  </>
                ) : (
                  <>
                    <Search className="h-3.5 w-3.5" />
                    <span>Inquire Status</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>

        {/* Application Dossier View */}
        {applicationData && currentStatusConfig && (
          <div className="mt-8 space-y-6">
            {/* Status Card */}
            <div className="rounded-xl border border-line bg-white p-6 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
                <div>
                  <span className="text-xs font-mono text-muted uppercase">
                    Ref: {applicationData.referenceNumber}
                  </span>
                  <h2 className="text-xl font-bold text-navy mt-0.5">{applicationData.orgName}</h2>
                </div>

                <div
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${currentStatusConfig.tone}`}
                >
                  <currentStatusConfig.Icon className="h-4 w-4" />
                  <span>{currentStatusConfig.label}</span>
                </div>
              </div>

              <p className="text-xs text-muted leading-relaxed">
                {currentStatusConfig.description}
              </p>

              {/* Regulatory Information Request Alert */}
              {applicationData.status === 'INFORMATION_REQUESTED' && (
                <div className="rounded-lg border-2 border-amber-line bg-amber-soft p-5 text-amber-ink space-y-3">
                  <div className="flex items-start gap-2.5">
                    <FileQuestion className="h-5 w-5 flex-shrink-0 text-amber-ink mt-0.5" />
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider">
                        Regulatory Reviewer Note
                      </h3>
                      <p className="mt-1 text-xs whitespace-pre-wrap leading-relaxed">
                        {applicationData.reviewNotes || 'The reviewer requested revisions or supplementary legal documents.'}
                      </p>
                    </div>
                  </div>

                  {applicationData.canResubmit && (
                    <div className="pt-2 border-t border-amber-line/60 flex justify-end">
                      <Button
                        type="button"
                        onClick={handleProceedToResubmit}
                        variant="primary"
                        className="inline-flex items-center gap-2 text-xs"
                      >
                        <FileEdit className="h-3.5 w-3.5" />
                        <span>Resubmit Requested Information</span>
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Rejection Alert */}
              {applicationData.status === 'REJECTED' && applicationData.rejectionReason && (
                <div className="rounded-lg border border-quarantine-line bg-quarantine-soft p-4 text-quarantine space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                    <XCircle className="h-4 w-4" />
                    <span>Rejection Reason</span>
                  </div>
                  <p className="text-xs whitespace-pre-wrap leading-relaxed">
                    {applicationData.rejectionReason}
                  </p>
                </div>
              )}

              {/* Application Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-line pt-4 text-xs">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted flex-shrink-0" />
                  <span className="text-muted">Category:</span>
                  <span className="font-semibold text-navy capitalize">
                    {applicationData.category}
                    {applicationData.pharmacyClassification && applicationData.pharmacyClassification !== 'NOT_APPLICABLE' && (
                      <span className="ml-1 text-muted font-normal">
                        ({applicationData.pharmacyClassification})
                      </span>
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted flex-shrink-0" />
                  <span className="text-muted">Submission Version:</span>
                  <span className="font-semibold text-navy">
                    Version {applicationData.currentVersion || 1}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted flex-shrink-0" />
                  <span className="text-muted">Initial Submission:</span>
                  <span className="font-medium text-navy">
                    {applicationData.submittedAt
                      ? new Date(applicationData.submittedAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })
                      : '—'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted flex-shrink-0" />
                  <span className="text-muted">Last Updated:</span>
                  <span className="font-medium text-navy">
                    {applicationData.updatedAt
                      ? new Date(applicationData.updatedAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })
                      : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
