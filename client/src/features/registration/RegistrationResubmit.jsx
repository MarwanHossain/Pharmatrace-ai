// PharmaTrace AI — Registration Resubmission Interface
// Handles secure fragment-token extraction, Bearer verification, and PIN-based resubmission
import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ShieldCheck,
  FileEdit,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  FileQuestion,
  Lock,
  Send,
  Building,
  Layers,
  FileText
} from 'lucide-react'
import { Button } from '../../components/ui'
import DocumentUploadField from './components/DocumentUploadField'
import { verifyAccessToken, resubmitRegistration } from '../../services/registrationApi'

export default function RegistrationResubmit() {
  const location = useLocation()
  const navigate = useNavigate()

  // Authentication mode: 'token' or 'pin'
  const [authMode, setAuthMode] = useState(null)
  const [token, setToken] = useState(null)
  const [pinAuth, setPinAuth] = useState({
    referenceNumber: '',
    trackingPin: ''
  })

  // State for token verification
  const [verifying, setVerifying] = useState(false)
  const [verificationError, setVerificationError] = useState(null)

  // Application data
  const [applicationData, setApplicationData] = useState(null)

  // Resubmission form fields
  const [formData, setFormData] = useState({
    org_name: '',
    license_number: '',
    address: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    dghs_facility_code: '',
    applicant_note: ''
  })

  const [files, setFiles] = useState([])
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [resubmitSuccess, setResubmitSuccess] = useState(null)

  // Extract token from fragment on mount & scrub address bar
  useEffect(() => {
    // 1. Check for insecure query parameter token
    const queryParams = new URLSearchParams(window.location.search)
    if (queryParams.has('token') || queryParams.has('access_token')) {
      // Immediately scrub query parameter from URL
      window.history.replaceState(null, '', window.location.pathname)
      setVerificationError(
        'Insecure link format rejected. Access tokens transmitted via URL query parameters are forbidden by security policy. Please use the secure fragment link sent to your email.'
      )
      return
    }

    // 2. Check for secure URL fragment token (#token=<hex>)
    const hash = window.location.hash
    if (hash && hash.startsWith('#token=')) {
      const rawToken = hash.replace('#token=', '').trim()
      // Immediately remove fragment from visible address bar & referrer
      window.history.replaceState(null, '', window.location.pathname)

      if (/^[0-9a-fA-F]{64}$/.test(rawToken)) {
        setToken(rawToken) // Keep purely in React state memory
        setAuthMode('token')
        runTokenVerification(rawToken)
        return
      } else {
        setVerificationError('The access token provided in the link is invalid or malformed.')
        return
      }
    }

    // 3. Check if arrived via React Router location state from Tracking page
    if (location.state && location.state.authMethod === 'pin') {
      const { referenceNumber, trackingPin, preloadedData } = location.state
      setAuthMode('pin')
      setPinAuth({ referenceNumber: referenceNumber || '', trackingPin: trackingPin || '' })
      if (preloadedData) {
        setApplicationData(preloadedData)
        populateFormFromData(preloadedData)
      }
      return
    }

    // 4. Default: No token provided, allow manual PIN input
    setAuthMode('pin')
  }, [location.state])

  async function runTokenVerification(rawToken) {
    setVerifying(true)
    setVerificationError(null)

    try {
      const result = await verifyAccessToken(rawToken)
      setApplicationData(result)
      populateFormFromData(result)
    } catch (err) {
      if (err.statusCode === 404 || err.code === 'INVALID_TOKEN') {
        setVerificationError('This access token is invalid, expired, or has already been used.')
      } else if (err.code === 'INSECURE_TOKEN_TRANSPORT') {
        setVerificationError('Insecure token transport rejected by server.')
      } else {
        setVerificationError(err.message || 'Unable to verify access token.')
      }
    } finally {
      setVerifying(false)
    }
  }

  function populateFormFromData(data) {
    if (!data) return
    setFormData(prev => ({
      ...prev,
      org_name: data.orgName || data.org_name || prev.org_name,
      license_number: data.licenseNumber || data.license_number || prev.license_number,
      address: data.address || prev.address,
      contact_name: data.contactName || data.contact_name || prev.contact_name,
      contact_email: data.contactEmail || data.contact_email || prev.contact_email,
      contact_phone: data.contactPhone || data.contact_phone || prev.contact_phone,
      dghs_facility_code: data.dghsFacilityCode || data.dghs_facility_code || prev.dghs_facility_code
    }))
  }

  function handleFieldChange(field, value) {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (fieldErrors[field]) {
      setFieldErrors(prev => ({ ...prev, [field]: null }))
    }
  }

  function validate() {
    const errors = {}

    // If using PIN auth and no applicationData yet, reference and PIN required
    if (authMode === 'pin' && !applicationData) {
      if (!pinAuth.referenceNumber.trim()) {
        errors.referenceNumber = 'Application reference number is required.'
      }
      if (!pinAuth.trackingPin.trim()) {
        errors.trackingPin = '6-digit tracking PIN is required.'
      }
    }

    // Org Name: 2-255 characters
    const trimmedOrgName = formData.org_name.trim()
    if (!trimmedOrgName || trimmedOrgName.length < 2 || trimmedOrgName.length > 255) {
      errors.org_name = 'Organization name must be between 2 and 255 characters.'
    }

    // License Number: 2-128 characters
    const trimmedLicense = formData.license_number.trim()
    if (!trimmedLicense || trimmedLicense.length < 2 || trimmedLicense.length > 128) {
      errors.license_number = 'License number must be between 2 and 128 characters.'
    }

    // Address: minimum 5 characters
    const trimmedAddress = formData.address.trim()
    if (!trimmedAddress || trimmedAddress.length < 5) {
      errors.address = 'Physical facility address must be at least 5 characters.'
    }

    // Contact Name: 2-128 characters
    const trimmedContactName = formData.contact_name.trim()
    if (!trimmedContactName || trimmedContactName.length < 2 || trimmedContactName.length > 128) {
      errors.contact_name = 'Contact representative name must be between 2 and 128 characters.'
    }

    // Contact Email: valid regex, max 128 characters
    const trimmedEmail = formData.contact_email.trim()
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!trimmedEmail || !emailRegex.test(trimmedEmail) || trimmedEmail.length > 128) {
      errors.contact_email = 'Valid contact email address required (max 128 characters).'
    }

    // Contact Phone: 6-32 characters
    const trimmedPhone = formData.contact_phone.trim()
    if (!trimmedPhone || trimmedPhone.length < 6 || trimmedPhone.length > 32) {
      errors.contact_phone = 'Contact phone number must be between 6 and 32 characters.'
    }

    // Applicant Note: max 2000 characters
    if (formData.applicant_note && formData.applicant_note.length > 2000) {
      errors.applicant_note = 'Applicant notes cannot exceed 2000 characters.'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitError(null)

    if (!validate()) {
      return
    }

    setSubmitting(true)

    try {
      const payload = new FormData()

      // Mutable fields
      payload.append('org_name', formData.org_name.trim())
      payload.append('license_number', formData.license_number.trim())
      payload.append('address', formData.address.trim())
      payload.append('contact_name', formData.contact_name.trim())
      payload.append('contact_email', formData.contact_email.trim())
      payload.append('contact_phone', formData.contact_phone.trim())

      if (formData.dghs_facility_code && formData.dghs_facility_code.trim()) {
        payload.append('dghs_facility_code', formData.dghs_facility_code.trim())
      }

      if (formData.applicant_note.trim()) {
        payload.append('applicant_note', formData.applicant_note.trim())
      }

      // Attach new/revised documents if selected
      files.forEach((item) => {
        payload.append(item.documentType || 'OTHER', item.file, item.file.name)
        payload.append('document_types', item.documentType || 'OTHER')
      })

      // Strictly enforce mutual exclusivity
      const auth = {}
      if (authMode === 'token' && token) {
        auth.token = token
      } else if (authMode === 'pin') {
        const ref = applicationData?.referenceNumber || pinAuth.referenceNumber
        auth.referenceNumber = ref.trim()
        auth.trackingPin = pinAuth.trackingPin.trim()
      }

      const result = await resubmitRegistration({ auth, formData: payload })
      setResubmitSuccess(result.data)
    } catch (err) {
      setSubmitError(err.message || 'Failed to resubmit application. Please verify your data and retry.')
    } finally {
      setSubmitting(false)
    }
  }

  // If resubmission succeeded, show confirmation
  if (resubmitSuccess) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center space-y-6">
        <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-clinical-soft text-clinical">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold text-navy">Application Resubmitted Successfully</h1>
        <p className="text-xs text-muted max-w-md mx-auto leading-relaxed">
          Your revised information and supplementary documents have been submitted to the DGDA reviewer. Your application status is now updated to <strong>Under Review</strong>.
        </p>

        <div className="rounded-xl border border-line bg-white p-6 shadow-sm text-left max-w-lg mx-auto space-y-3 text-xs">
          <div className="flex justify-between border-b border-line pb-2">
            <span className="text-muted">Reference Number:</span>
            <span className="font-mono font-bold text-navy">{resubmitSuccess.referenceNumber}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-2">
            <span className="text-muted">Updated Status:</span>
            <span className="font-semibold text-amber-ink">UNDER_REVIEW</span>
          </div>
          <div className="flex justify-between border-b border-line pb-2">
            <span className="text-muted">Submission Version:</span>
            <span className="font-semibold text-navy">Version {resubmitSuccess.submissionVersion || resubmitSuccess.version || 2}</span>
          </div>
          <div className="flex justify-between pt-1">
            <span className="text-muted">Resubmitted At:</span>
            <span className="font-medium text-navy">
              {new Date(resubmitSuccess.resubmittedAt || Date.now()).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="pt-4 flex justify-center gap-3">
          <Link
            to="/register/track"
            className="rounded-md bg-navy px-4 py-2 text-xs font-semibold text-white hover:bg-navy-deep transition"
          >
            Track Application Status
          </Link>
        </div>
      </div>
    )
  }

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
                Application Resubmission
              </span>
            </div>
          </Link>

          <Link
            to="/register/track"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-navy transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Status Tracking</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold text-navy sm:text-3xl">
            Resubmit Regulatory Information
          </h1>
          <p className="mt-2 text-xs text-muted max-w-lg mx-auto">
            Provide the supplementary documentation or revised legal information requested by the DGDA regulatory reviewer.
          </p>
        </div>

        {/* Verifying Token State */}
        {verifying && (
          <div className="mt-8 rounded-xl border border-line bg-white p-8 text-center space-y-3">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-navy border-t-transparent" />
            <div className="text-sm font-medium text-navy">Verifying single-use access token...</div>
            <p className="text-xs text-muted">Establishing secure Bearer authorization with DGDA registry.</p>
          </div>
        )}

        {/* Verification Error */}
        {verificationError && (
          <div
            role="alert"
            className="mt-8 rounded-xl border border-quarantine-line bg-quarantine-soft p-5 text-xs text-quarantine space-y-2"
          >
            <div className="flex items-center gap-2 font-bold text-sm">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span>Authorization Failed</span>
            </div>
            <p>{verificationError}</p>
            <div className="pt-2">
              <Link
                to="/register/track"
                className="font-semibold underline hover:text-red-900"
              >
                Track your application using Reference Number and PIN instead &rarr;
              </Link>
            </div>
          </div>
        )}

        {/* Resubmission Form (rendered when verified via token or using PIN) */}
        {!verifying && !verificationError && (
          <div className="mt-8 space-y-6">
            {/* Reviewer Note Display (if available) */}
            {applicationData?.reviewNotes && (
              <div className="rounded-xl border-2 border-amber-line bg-amber-soft p-5 text-amber-ink space-y-2">
                <div className="flex items-start gap-2.5">
                  <FileQuestion className="h-5 w-5 flex-shrink-0 text-amber-ink mt-0.5" />
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider">
                      Regulatory Reviewer Information Request
                    </h3>
                    <p className="mt-1 text-xs whitespace-pre-wrap leading-relaxed">
                      {applicationData.reviewNotes}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Application Identifier Card */}
            {applicationData && (
              <div className="rounded-xl border border-line bg-white p-4 text-xs flex flex-wrap items-center justify-between gap-3 shadow-sm">
                <div>
                  <span className="text-muted">Application Reference:</span>
                  <span className="ml-1.5 font-mono font-bold text-navy">
                    {applicationData.referenceNumber}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-surface px-2 py-0.5 text-muted border border-line font-medium capitalize">
                    {applicationData.category}
                  </span>
                  <span className="rounded bg-blue-50 px-2 py-0.5 text-blue-800 font-semibold border border-blue-200">
                    Version {applicationData.currentVersion || 1} &rarr; 2
                  </span>
                </div>
              </div>
            )}

            {/* Error Notification */}
            {submitError && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-quarantine-line bg-quarantine-soft p-4 text-xs text-quarantine"
              >
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold">Resubmission Failed</div>
                  <div>{submitError}</div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-6">
              {/* PIN Credentials section (if in PIN auth mode and not pre-authenticated) */}
              {authMode === 'pin' && !applicationData && (
                <div className="rounded-xl border border-line bg-white p-5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 border-b border-line pb-2 text-sm font-bold text-navy">
                    <Lock className="h-4 w-4 text-clinical" />
                    <span>Application Identification</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="resubmit-ref" className="block text-xs font-semibold text-navy">
                        Reference Number <span className="text-quarantine">*</span>
                      </label>
                      <input
                        id="resubmit-ref"
                        type="text"
                        required
                        placeholder="REG-2026-0004"
                        value={pinAuth.referenceNumber}
                        onChange={(e) => setPinAuth(prev => ({ ...prev, referenceNumber: e.target.value }))}
                        className="mt-1 block w-full rounded-md border border-line px-3 py-2 text-xs uppercase font-mono text-ink focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                      />
                      {fieldErrors.referenceNumber && (
                        <p className="mt-1 text-xs text-quarantine">{fieldErrors.referenceNumber}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="resubmit-pin" className="block text-xs font-semibold text-navy">
                        Six-Digit Tracking PIN <span className="text-quarantine">*</span>
                      </label>
                      <input
                        id="resubmit-pin"
                        type="password"
                        required
                        maxLength={6}
                        placeholder="••••••"
                        value={pinAuth.trackingPin}
                        onChange={(e) => setPinAuth(prev => ({ ...prev, trackingPin: e.target.value }))}
                        className="mt-1 block w-full rounded-md border border-line px-3 py-2 text-xs font-mono tracking-widest text-ink focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                      />
                      {fieldErrors.trackingPin && (
                        <p className="mt-1 text-xs text-quarantine">{fieldErrors.trackingPin}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Mutable Fields: Entity & Contact Details */}
              <div className="rounded-xl border border-line bg-white p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 border-b border-line pb-2 text-sm font-bold text-navy">
                  <Building className="h-4 w-4 text-clinical" />
                  <span>Revised Organization Information</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label htmlFor="resubmit-org" className="block text-xs font-semibold text-navy">
                      Legal Entity Name <span className="text-quarantine">*</span>
                    </label>
                    <input
                      id="resubmit-org"
                      type="text"
                      required
                      value={formData.org_name}
                      onChange={(e) => handleFieldChange('org_name', e.target.value)}
                      disabled={submitting}
                      className="mt-1 block w-full rounded-md border border-line px-3 py-2 text-xs text-ink focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                    />
                    {fieldErrors.org_name && (
                      <p className="mt-1 text-xs text-quarantine">{fieldErrors.org_name}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="resubmit-license" className="block text-xs font-semibold text-navy">
                      License Number <span className="text-quarantine">*</span>
                    </label>
                    <input
                      id="resubmit-license"
                      type="text"
                      required
                      value={formData.license_number}
                      onChange={(e) => handleFieldChange('license_number', e.target.value)}
                      disabled={submitting}
                      className="mt-1 block w-full rounded-md border border-line px-3 py-2 text-xs text-ink focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                    />
                    {fieldErrors.license_number && (
                      <p className="mt-1 text-xs text-quarantine">{fieldErrors.license_number}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="resubmit-cname" className="block text-xs font-semibold text-navy">
                      Contact Name <span className="text-quarantine">*</span>
                    </label>
                    <input
                      id="resubmit-cname"
                      type="text"
                      required
                      value={formData.contact_name}
                      onChange={(e) => handleFieldChange('contact_name', e.target.value)}
                      disabled={submitting}
                      className="mt-1 block w-full rounded-md border border-line px-3 py-2 text-xs text-ink focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                    />
                    {fieldErrors.contact_name && (
                      <p className="mt-1 text-xs text-quarantine">{fieldErrors.contact_name}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="resubmit-email" className="block text-xs font-semibold text-navy">
                      Corporate Email <span className="text-quarantine">*</span>
                    </label>
                    <input
                      id="resubmit-email"
                      type="email"
                      required
                      value={formData.contact_email}
                      onChange={(e) => handleFieldChange('contact_email', e.target.value)}
                      disabled={submitting}
                      className="mt-1 block w-full rounded-md border border-line px-3 py-2 text-xs text-ink focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                    />
                    {fieldErrors.contact_email && (
                      <p className="mt-1 text-xs text-quarantine">{fieldErrors.contact_email}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="resubmit-phone" className="block text-xs font-semibold text-navy">
                      Contact Phone <span className="text-quarantine">*</span>
                    </label>
                    <input
                      id="resubmit-phone"
                      type="tel"
                      required
                      value={formData.contact_phone}
                      onChange={(e) => handleFieldChange('contact_phone', e.target.value)}
                      disabled={submitting}
                      className="mt-1 block w-full rounded-md border border-line px-3 py-2 text-xs text-ink focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                    />
                    {fieldErrors.contact_phone && (
                      <p className="mt-1 text-xs text-quarantine">{fieldErrors.contact_phone}</p>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="resubmit-address" className="block text-xs font-semibold text-navy">
                      Physical Facility Address <span className="text-quarantine">*</span>
                    </label>
                    <textarea
                      id="resubmit-address"
                      rows={2}
                      required
                      value={formData.address}
                      onChange={(e) => handleFieldChange('address', e.target.value)}
                      disabled={submitting}
                      className="mt-1 block w-full rounded-md border border-line px-3 py-2 text-xs text-ink focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                    />
                    {fieldErrors.address && (
                      <p className="mt-1 text-xs text-quarantine">{fieldErrors.address}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Supplementary Documents */}
              <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
                <DocumentUploadField
                  files={files}
                  onChange={setFiles}
                  category={applicationData?.category || 'manufacturer'}
                  classification={applicationData?.pharmacyClassification || 'NOT_APPLICABLE'}
                  required={false}
                  disabled={submitting}
                />
                <p className="mt-2 text-xs text-muted">
                  Note: Any newly uploaded files will be added to your existing dossier. Historical documents previously submitted remain safely preserved on record.
                </p>
              </div>

              {/* Applicant Note */}
              <div className="rounded-xl border border-line bg-white p-5 shadow-sm space-y-2">
                <label htmlFor="resubmit-notes" className="block text-xs font-semibold text-navy">
                  Applicant Response to Reviewer <span className="text-muted font-normal">(Optional, max 2000 characters)</span>
                </label>
                <textarea
                  id="resubmit-notes"
                  rows={3}
                  maxLength={2000}
                  value={formData.applicant_note}
                  onChange={(e) => handleFieldChange('applicant_note', e.target.value)}
                  placeholder="Explain the changes made or details regarding newly uploaded documentation."
                  disabled={submitting}
                  className="block w-full rounded-md border border-line px-3 py-2 text-xs text-ink focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <Link
                  to="/register/track"
                  className="rounded-md border border-line bg-white px-4 py-2 text-xs font-semibold text-ink hover:bg-surface"
                >
                  Cancel
                </Link>

                <Button
                  type="submit"
                  disabled={submitting}
                  variant="primary"
                  className="inline-flex items-center gap-2 min-w-[170px]"
                >
                  {submitting ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Resubmitting...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      <span>Resubmit for Review</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  )
}
