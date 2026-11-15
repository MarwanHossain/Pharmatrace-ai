// PharmaTrace AI — Dynamic Public Registration Form
// Adapts intake fields and documentation requirements based on organization category
import { useState } from 'react'
import { ArrowLeft, Send, AlertCircle, Building2, User, Phone, Mail, MapPin, FileBadge, Info } from 'lucide-react'
import { Button } from '../../components/ui'
import DocumentUploadField from './components/DocumentUploadField'
import { submitRegistration } from '../../services/registrationApi'

const CATEGORY_TITLES = {
  manufacturer: 'Pharmaceutical Manufacturer',
  distributor: 'Pharmaceutical Distributor',
  wholesaler: 'Pharmaceutical Wholesaler',
  pharmacy: 'Retail / Hospital Pharmacy'
}

export default function RegistrationForm({ category, policy, onBack, onSuccess }) {
  const [formData, setFormData] = useState({
    org_name: '',
    license_number: '',
    address: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    pharmacy_classification: category === 'pharmacy' ? 'PRIVATE_COMMERCIAL' : 'NOT_APPLICABLE',
    dghs_facility_code: '',
    applicant_note: ''
  })

  const [files, setFiles] = useState([])
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError] = useState(null)

  function handleChange(field, value) {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (fieldErrors[field]) {
      setFieldErrors(prev => ({ ...prev, [field]: null }))
    }
  }

  function validate() {
    const errors = {}

    // Org Name: 2-255 characters
    const trimmedOrgName = formData.org_name.trim()
    if (!trimmedOrgName || trimmedOrgName.length < 2 || trimmedOrgName.length > 255) {
      errors.org_name = 'Organization name must be between 2 and 255 characters.'
    }

    // License Number: 2-128 characters
    const trimmedLicense = formData.license_number.trim()
    if (!trimmedLicense || trimmedLicense.length < 2 || trimmedLicense.length > 128) {
      errors.license_number = 'Official license number must be between 2 and 128 characters.'
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
      errors.contact_email = 'Please provide a valid corporate or official email address (max 128 characters).'
    }

    // Contact Phone: 6-32 characters
    const trimmedPhone = formData.contact_phone.trim()
    if (!trimmedPhone || trimmedPhone.length < 6 || trimmedPhone.length > 32) {
      errors.contact_phone = 'Contact phone number must be between 6 and 32 characters.'
    }

    // Pharmacy classification
    if (category === 'pharmacy') {
      if (!['GOVERNMENT', 'PRIVATE_COMMERCIAL'].includes(formData.pharmacy_classification)) {
        errors.pharmacy_classification = 'Please select a valid pharmacy classification.'
      }
    }

    // Applicant Note: max 2000 characters
    if (formData.applicant_note && formData.applicant_note.length > 2000) {
      errors.applicant_note = 'Applicant notes cannot exceed 2000 characters.'
    }

    // Documents: at least 1 document required
    if (!files || files.length === 0) {
      errors.documents = 'At least one supporting legal document (PDF, JPEG, or PNG) is required.'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setApiError(null)

    if (!validate()) {
      return
    }

    setSubmitting(true)

    try {
      const payload = new FormData()
      payload.append('category', category)
      payload.append('org_name', formData.org_name.trim())
      payload.append('license_number', formData.license_number.trim())
      payload.append('address', formData.address.trim())
      payload.append('contact_name', formData.contact_name.trim())
      payload.append('contact_email', formData.contact_email.trim())
      payload.append('contact_phone', formData.contact_phone.trim())

      if (category === 'pharmacy') {
        payload.append('pharmacy_classification', formData.pharmacy_classification)
        if (formData.pharmacy_classification === 'GOVERNMENT' && formData.dghs_facility_code.trim()) {
          payload.append('dghs_facility_code', formData.dghs_facility_code.trim())
        }
      }

      if (formData.applicant_note.trim()) {
        payload.append('applicant_note', formData.applicant_note.trim())
      }

      // Append files and their document types
      files.forEach((item) => {
        // Append with documentType fieldname for automatic type mapping in backend upload
        payload.append(item.documentType || 'OTHER', item.file, item.file.name)
        payload.append('document_types', item.documentType || 'OTHER')
      })

      const result = await submitRegistration(payload)
      if (onSuccess) {
        onSuccess(result)
      }
    } catch (err) {
      setApiError(err.message || 'An error occurred during submission. Please check your data and retry.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Back Button */}
      <button
        type="button"
        onClick={onBack}
        disabled={submitting}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-navy transition disabled:opacity-50"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to Category Selection</span>
      </button>

      {/* Header */}
      <div className="border-b border-line pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-clinical">
              Organization Intake Application
            </span>
            <h1 className="mt-1 text-2xl font-bold text-navy">
              {CATEGORY_TITLES[category] || category}
            </h1>
          </div>
          <span className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink capitalize">
            Category: {category}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted">
          All fields marked with an asterisk (<span className="text-quarantine">*</span>) are mandatory. Passwords are never collected during registration; authorized user accounts are activated via secure email verification upon DGDA approval.
        </p>
      </div>

      {/* API Error Notification */}
      {apiError && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-2.5 rounded-lg border border-quarantine-line bg-quarantine-soft p-4 text-xs text-quarantine"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold">Submission Rejected</div>
            <div>{apiError}</div>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-6">
        {/* Pharmacy Classification Switcher (if applicable) */}
        {category === 'pharmacy' && (
          <fieldset className="rounded-lg border border-line bg-surface/50 p-4 space-y-3">
            <legend className="px-1 text-xs font-bold uppercase tracking-wider text-navy">
              Pharmacy Classification <span className="text-quarantine">*</span>
            </legend>
            <p className="text-xs text-muted">
              Specify whether this entity is a DGHS government healthcare facility or a licensed private commercial pharmacy.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${
                  formData.pharmacy_classification === 'PRIVATE_COMMERCIAL'
                    ? 'border-navy bg-white shadow-sm ring-1 ring-navy'
                    : 'border-line bg-white hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="pharmacy_classification"
                  value="PRIVATE_COMMERCIAL"
                  checked={formData.pharmacy_classification === 'PRIVATE_COMMERCIAL'}
                  onChange={(e) => handleChange('pharmacy_classification', e.target.value)}
                  className="mt-0.5 text-navy focus:ring-navy"
                  disabled={submitting}
                />
                <div>
                  <div className="text-xs font-bold text-navy">Private Commercial Pharmacy</div>
                  <div className="text-xs text-muted mt-0.5">
                    Retail pharmacies, community drugstores, and private hospital dispensaries.
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${
                  formData.pharmacy_classification === 'GOVERNMENT'
                    ? 'border-navy bg-white shadow-sm ring-1 ring-navy'
                    : 'border-line bg-white hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="pharmacy_classification"
                  value="GOVERNMENT"
                  checked={formData.pharmacy_classification === 'GOVERNMENT'}
                  onChange={(e) => handleChange('pharmacy_classification', e.target.value)}
                  className="mt-0.5 text-navy focus:ring-navy"
                  disabled={submitting}
                />
                <div>
                  <div className="text-xs font-bold text-navy">Government Healthcare Facility</div>
                  <div className="text-xs text-muted mt-0.5">
                    DGHS-managed public hospitals, upazila health complexes, and community clinics.
                  </div>
                </div>
              </label>
            </div>

            {formData.pharmacy_classification === 'GOVERNMENT' && (
              <div className="mt-3 pt-3 border-t border-line">
                <label htmlFor="dghs_facility_code" className="block text-xs font-semibold text-navy">
                  DGHS Facility Code <span className="text-muted font-normal">(Optional)</span>
                </label>
                <input
                  id="dghs_facility_code"
                  type="text"
                  value={formData.dghs_facility_code}
                  onChange={(e) => handleChange('dghs_facility_code', e.target.value)}
                  placeholder="e.g. DGHS-FAC-10024"
                  maxLength={64}
                  disabled={submitting}
                  className="mt-1 block w-full rounded-md border border-line bg-white px-3 py-2 text-xs text-ink focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                />
                <p className="mt-1 text-xs text-muted">
                  The DGHS Management Information System (MIS) Facility Identifier, if assigned.
                </p>
              </div>
            )}
          </fieldset>
        )}

        {/* Section 1: Entity Information */}
        <div className="space-y-4 rounded-xl border border-line bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 border-b border-line pb-2 text-sm font-bold text-navy">
            <Building2 className="h-4 w-4 text-clinical" />
            <span>Organization Legal Information</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Org Name */}
            <div className="sm:col-span-2">
              <label htmlFor="org_name" className="block text-xs font-semibold text-navy">
                Legal Entity Name <span className="text-quarantine">*</span>
              </label>
              <input
                id="org_name"
                type="text"
                required
                maxLength={255}
                value={formData.org_name}
                onChange={(e) => handleChange('org_name', e.target.value)}
                placeholder="e.g. Acme Pharmaceuticals Bangladesh Ltd."
                disabled={submitting}
                className={`mt-1 block w-full rounded-md border px-3 py-2 text-xs text-ink transition focus:outline-none focus:ring-1 ${
                  fieldErrors.org_name
                    ? 'border-quarantine focus:border-quarantine focus:ring-quarantine'
                    : 'border-line focus:border-navy focus:ring-navy'
                }`}
              />
              {fieldErrors.org_name && (
                <p className="mt-1 text-xs text-quarantine">{fieldErrors.org_name}</p>
              )}
            </div>

            {/* License Number */}
            <div>
              <label htmlFor="license_number" className="block text-xs font-semibold text-navy">
                Primary License / Registration Number <span className="text-quarantine">*</span>
              </label>
              <input
                id="license_number"
                type="text"
                required
                maxLength={128}
                value={formData.license_number}
                onChange={(e) => handleChange('license_number', e.target.value)}
                placeholder="e.g. DL-2024-8849"
                disabled={submitting}
                className={`mt-1 block w-full rounded-md border px-3 py-2 text-xs text-ink transition focus:outline-none focus:ring-1 ${
                  fieldErrors.license_number
                    ? 'border-quarantine focus:border-quarantine focus:ring-quarantine'
                    : 'border-line focus:border-navy focus:ring-navy'
                }`}
              />
              {fieldErrors.license_number && (
                <p className="mt-1 text-xs text-quarantine">{fieldErrors.license_number}</p>
              )}
            </div>

            {/* Address */}
            <div className="sm:col-span-2">
              <label htmlFor="address" className="block text-xs font-semibold text-navy">
                Physical Facility / Registered Address <span className="text-quarantine">*</span>
              </label>
              <textarea
                id="address"
                rows={2}
                required
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                placeholder="Street address, Thana/Upazila, District, Division, Postal Code"
                disabled={submitting}
                className={`mt-1 block w-full rounded-md border px-3 py-2 text-xs text-ink transition focus:outline-none focus:ring-1 ${
                  fieldErrors.address
                    ? 'border-quarantine focus:border-quarantine focus:ring-quarantine'
                    : 'border-line focus:border-navy focus:ring-navy'
                }`}
              />
              {fieldErrors.address && (
                <p className="mt-1 text-xs text-quarantine">{fieldErrors.address}</p>
              )}
            </div>
          </div>
        </div>

        {/* Section 2: Authorized Representative */}
        <div className="space-y-4 rounded-xl border border-line bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 border-b border-line pb-2 text-sm font-bold text-navy">
            <User className="h-4 w-4 text-clinical" />
            <span>Authorized Contact Representative</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Contact Name */}
            <div>
              <label htmlFor="contact_name" className="block text-xs font-semibold text-navy">
                Full Name <span className="text-quarantine">*</span>
              </label>
              <input
                id="contact_name"
                type="text"
                required
                maxLength={128}
                value={formData.contact_name}
                onChange={(e) => handleChange('contact_name', e.target.value)}
                placeholder="e.g. Dr. Tareq Rahman"
                disabled={submitting}
                className={`mt-1 block w-full rounded-md border px-3 py-2 text-xs text-ink transition focus:outline-none focus:ring-1 ${
                  fieldErrors.contact_name
                    ? 'border-quarantine focus:border-quarantine focus:ring-quarantine'
                    : 'border-line focus:border-navy focus:ring-navy'
                }`}
              />
              {fieldErrors.contact_name && (
                <p className="mt-1 text-xs text-quarantine">{fieldErrors.contact_name}</p>
              )}
            </div>

            {/* Contact Email */}
            <div>
              <label htmlFor="contact_email" className="block text-xs font-semibold text-navy">
                Corporate Email Address <span className="text-quarantine">*</span>
              </label>
              <input
                id="contact_email"
                type="email"
                required
                maxLength={128}
                value={formData.contact_email}
                onChange={(e) => handleChange('contact_email', e.target.value)}
                placeholder="regulatory@org.com"
                disabled={submitting}
                className={`mt-1 block w-full rounded-md border px-3 py-2 text-xs text-ink transition focus:outline-none focus:ring-1 ${
                  fieldErrors.contact_email
                    ? 'border-quarantine focus:border-quarantine focus:ring-quarantine'
                    : 'border-line focus:border-navy focus:ring-navy'
                }`}
              />
              {fieldErrors.contact_email && (
                <p className="mt-1 text-xs text-quarantine">{fieldErrors.contact_email}</p>
              )}
            </div>

            {/* Contact Phone */}
            <div>
              <label htmlFor="contact_phone" className="block text-xs font-semibold text-navy">
                Contact Phone <span className="text-quarantine">*</span>
              </label>
              <input
                id="contact_phone"
                type="tel"
                required
                maxLength={32}
                value={formData.contact_phone}
                onChange={(e) => handleChange('contact_phone', e.target.value)}
                placeholder="+880 1700-000000"
                disabled={submitting}
                className={`mt-1 block w-full rounded-md border px-3 py-2 text-xs text-ink transition focus:outline-none focus:ring-1 ${
                  fieldErrors.contact_phone
                    ? 'border-quarantine focus:border-quarantine focus:ring-quarantine'
                    : 'border-line focus:border-navy focus:ring-navy'
                }`}
              />
              {fieldErrors.contact_phone && (
                <p className="mt-1 text-xs text-quarantine">{fieldErrors.contact_phone}</p>
              )}
            </div>
          </div>
        </div>

        {/* Section 3: Supporting Verification Documents */}
        <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
          <DocumentUploadField
            files={files}
            onChange={setFiles}
            category={category}
            classification={formData.pharmacy_classification}
            disabled={submitting}
            error={fieldErrors.documents}
          />
        </div>

        {/* Section 4: Applicant Note */}
        <div className="rounded-xl border border-line bg-white p-5 shadow-sm space-y-2">
          <label htmlFor="applicant_note" className="block text-xs font-semibold text-navy">
            Applicant Regulatory Note <span className="text-muted font-normal">(Optional, max 2000 characters)</span>
          </label>
          <textarea
            id="applicant_note"
            rows={3}
            maxLength={2000}
            value={formData.applicant_note}
            onChange={(e) => handleChange('applicant_note', e.target.value)}
            placeholder="Include any supplementary licensing remarks, DGDA dossier references, or facility details."
            disabled={submitting}
            className="block w-full rounded-md border border-line px-3 py-2 text-xs text-ink focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
          />
          <div className="text-right text-[10px] text-muted">
            {formData.applicant_note.length} / 2000 characters
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={onBack}
            disabled={submitting}
            className="rounded-md border border-line bg-white px-4 py-2 text-xs font-semibold text-ink hover:bg-surface disabled:opacity-50"
          >
            Cancel
          </button>

          <Button
            type="submit"
            disabled={submitting}
            variant="primary"
            className="inline-flex items-center gap-2 min-w-[180px]"
          >
            {submitting ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Submitting Application...</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>Submit Application</span>
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
