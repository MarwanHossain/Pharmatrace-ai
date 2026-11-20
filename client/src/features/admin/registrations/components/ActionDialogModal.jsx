// PharmaTrace AI — Administrator Action Dialog Modal
// Accessible modal dialog implementing review, information requests, approval, rejection, and token resends

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ShieldAlert, FileQuestion, Send, XCircle } from 'lucide-react'
import { Modal, Button } from '../../../../components/ui'
import {
  startReview,
  requestInformation,
  resendInformationLink,
  approveRegistration,
  rejectRegistration,
  resendActivation
} from '../../../../services/adminRegistrationApi'

export default function ActionDialogModal({
  open,
  actionType,
  registration,
  onClose,
  onSuccess
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Form states
  const [reviewNotes, setReviewNotes] = useState('')
  const [reason, setReason] = useState('')
  const [cureDays, setCureDays] = useState(7)
  const [dghsVerified, setDghsVerified] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [rejectionExplanation, setRejectionExplanation] = useState('')

  if (!open || !registration) return null

  const isGovPharmacy =
    registration.category === 'pharmacy' &&
    registration.pharmacyClassification === 'GOVERNMENT'

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      let result = null

      if (actionType === 'start-review') {
        result = await startReview(registration.id, { reviewNotes })
      } else if (actionType === 'request-info') {
        if (!reason.trim() || reason.trim().length < 10) {
          setError('Reason for requesting information must be at least 10 characters.')
          setLoading(false)
          return
        }
        result = await requestInformation(registration.id, {
          reason: reason.trim(),
          cureDays: Number(cureDays) || 7
        })
      } else if (actionType === 'resend-link') {
        result = await resendInformationLink(registration.id, {
          cureDays: Number(cureDays) || 7
        })
      } else if (actionType === 'approve') {
        if (isGovPharmacy && !dghsVerified) {
          setError('Mandatory DGHS health facility verification attestation is required for Government Pharmacies.')
          setLoading(false)
          return
        }
        result = await approveRegistration(registration.id, {
          reviewNotes: reviewNotes.trim() || undefined,
          dghsVerified: isGovPharmacy ? true : false
        })
      } else if (actionType === 'reject') {
        if (!rejectionReason.trim() || rejectionReason.trim().length < 3) {
          setError('Rejection reason code or title must be at least 3 characters.')
          setLoading(false)
          return
        }
        if (!rejectionExplanation.trim() || rejectionExplanation.trim().length < 10) {
          setError('Rejection explanation must be at least 10 characters.')
          setLoading(false)
          return
        }
        result = await rejectRegistration(registration.id, {
          rejectionReason: rejectionReason.trim(),
          rejectionExplanation: rejectionExplanation.trim()
        })
      } else if (actionType === 'resend-activation') {
        result = await resendActivation(registration.id)
      }

      onSuccess(result, actionType)
      onClose()
    } catch (err) {
      if (err.statusCode === 409) {
        setError(`Conflict (409): ${err.message}. The dossier may have been updated concurrently.`)
      } else {
        setError(err.message || 'Action failed to execute. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  // Titles and descriptions
  let title = 'Perform Administrative Action'
  let Icon = ShieldAlert
  let iconColor = 'text-navy'

  if (actionType === 'start-review') {
    title = 'Start Regulatory Review'
    Icon = CheckCircle2
    iconColor = 'text-clinical'
  } else if (actionType === 'request-info') {
    title = 'Request Additional Information'
    Icon = FileQuestion
    iconColor = 'text-amber-ink'
  } else if (actionType === 'resend-link') {
    title = 'Resend Information Request Link'
    Icon = Send
    iconColor = 'text-navy'
  } else if (actionType === 'approve') {
    title = 'Approve Organization Registration'
    Icon = CheckCircle2
    iconColor = 'text-clinical'
  } else if (actionType === 'reject') {
    title = 'Reject Organization Registration'
    Icon = XCircle
    iconColor = 'text-quarantine'
  } else if (actionType === 'resend-activation') {
    title = 'Resend Account Activation Token'
    Icon = Send
    iconColor = 'text-navy'
  }

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3 text-xs">
          <Icon size={20} className={`shrink-0 ${iconColor}`} />
          <div>
            <div className="font-semibold text-navy">
              {registration.orgName} ({registration.referenceNumber})
            </div>
            <div className="text-muted">
              Current Status: <span className="font-semibold">{registration.status}</span> · Category:{' '}
              <span className="capitalize">{registration.category}</span>
            </div>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded border border-quarantine-line bg-quarantine-soft p-3 text-xs font-medium text-quarantine"
          >
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Action-Specific Inputs */}
        {actionType === 'start-review' && (
          <div>
            <label htmlFor="reviewNotes" className="block text-xs font-semibold text-navy">
              Reviewer Notes (Optional)
            </label>
            <textarea
              id="reviewNotes"
              rows={3}
              value={reviewNotes}
              onChange={e => setReviewNotes(e.target.value)}
              placeholder="e.g. Commencing verification of trade license and pharmaceutical manufacturing credentials."
              className="mt-1 w-full rounded border border-line bg-white p-2.5 text-xs text-ink focus:border-navy focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-muted">
              Application status will transition to <span className="font-semibold">UNDER_REVIEW</span>.
            </p>
          </div>
        )}

        {actionType === 'request-info' && (
          <div className="space-y-3">
            <div>
              <label htmlFor="reason" className="block text-xs font-semibold text-navy">
                Reason for Additional Documentation <span className="text-quarantine">*</span>
              </label>
              <textarea
                id="reason"
                rows={3}
                required
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Specify required corrections or documents (minimum 10 characters)..."
                className="mt-1 w-full rounded border border-line bg-white p-2.5 text-xs text-ink focus:border-navy focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-muted">Minimum 10 characters. This reason is visible to the applicant.</p>
            </div>

            <div>
              <label htmlFor="cureDays" className="block text-xs font-semibold text-navy">
                Cure Window (Days)
              </label>
              <input
                id="cureDays"
                type="number"
                min={1}
                max={30}
                value={cureDays}
                onChange={e => setCureDays(e.target.value)}
                className="mt-1 w-24 rounded border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-navy focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-muted">
                A single-use link will be issued valid for this duration. Any previously active links will be revoked.
              </p>
            </div>
          </div>
        )}

        {actionType === 'resend-link' && (
          <div>
            <label htmlFor="resendCureDays" className="block text-xs font-semibold text-navy">
              Cure Window Extension (Days)
            </label>
            <input
              id="resendCureDays"
              type="number"
              min={1}
              max={30}
              value={cureDays}
              onChange={e => setCureDays(e.target.value)}
              className="mt-1 w-24 rounded border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-navy focus:outline-none"
            />
            <p className="mt-1.5 text-[11px] text-muted">
              Reissues a fresh single-use information request access link and revokes previously issued tokens.
            </p>
          </div>
        )}

        {actionType === 'approve' && (
          <div className="space-y-3">
            <div className="rounded border border-amber-line bg-amber-soft p-3 text-xs text-amber-ink">
              <span className="font-bold">Permanent Provisioning Warning:</span> Approving this application will
              atomically create a production organization and initial user account in the track-and-trace registry.
            </div>

            {isGovPharmacy && (
              <div className="rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                <div className="mb-1 font-bold">Government Health Facility Attestation</div>
                <div className="mb-2 text-[11px]">
                  DGHS Facility Code: <span className="font-semibold">{registration.dghsFacilityCode || 'Not provided'}</span>
                </div>
                <label className="flex items-start gap-2 font-medium">
                  <input
                    type="checkbox"
                    checked={dghsVerified}
                    onChange={e => setDghsVerified(e.target.checked)}
                    className="mt-0.5 rounded border-line text-navy focus:ring-navy"
                  />
                  <span>
                    I attest that I have verified the DGHS Health Facility Code against the official Directorate General of Health Services registry.
                  </span>
                </label>
              </div>
            )}

            <div>
              <label htmlFor="approveReviewNotes" className="block text-xs font-semibold text-navy">
                Approval Notes (Optional)
              </label>
              <textarea
                id="approveReviewNotes"
                rows={2}
                value={reviewNotes}
                onChange={e => setReviewNotes(e.target.value)}
                placeholder="e.g. All DGDA licensing criteria verified. Production provisioning authorized."
                className="mt-1 w-full rounded border border-line bg-white p-2.5 text-xs text-ink focus:border-navy focus:outline-none"
              />
            </div>
          </div>
        )}

        {actionType === 'reject' && (
          <div className="space-y-3">
            <div className="rounded border border-quarantine-line bg-quarantine-soft p-3 text-xs text-quarantine">
              <span className="font-bold">Irreversible Action:</span> Rejecting an application permanently terminates
              the review cycle. All outstanding tokens will be immediately invalidated.
            </div>

            <div>
              <label htmlFor="rejectionReason" className="block text-xs font-semibold text-navy">
                Statutory Reason Code / Title <span className="text-quarantine">*</span>
              </label>
              <input
                id="rejectionReason"
                type="text"
                required
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="e.g. EXPIRED_DRUG_LICENSE or INSUFFICIENT_GMP_DOCUMENTATION"
                className="mt-1 w-full rounded border border-line bg-white px-3 py-1.5 text-xs text-ink focus:border-navy focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-muted">Minimum 3 characters.</p>
            </div>

            <div>
              <label htmlFor="rejectionExplanation" className="block text-xs font-semibold text-navy">
                Detailed Regulatory Explanation <span className="text-quarantine">*</span>
              </label>
              <textarea
                id="rejectionExplanation"
                rows={3}
                required
                value={rejectionExplanation}
                onChange={e => setRejectionExplanation(e.target.value)}
                placeholder="Explain the regulatory grounds for rejection (minimum 10 characters)..."
                className="mt-1 w-full rounded border border-line bg-white p-2.5 text-xs text-ink focus:border-navy focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-muted">Minimum 10 characters.</p>
            </div>
          </div>
        )}

        {actionType === 'resend-activation' && (
          <div className="text-xs text-muted">
            <p>
              Reissues a fresh 72-hour account activation token for the primary contact of this approved organization.
              Previous unused activation tokens will be invalidated.
            </p>
          </div>
        )}

        {/* Modal Actions */}
        <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={actionType === 'reject' ? 'primary' : actionType === 'approve' ? 'success' : 'primary'}
            disabled={loading || (actionType === 'approve' && isGovPharmacy && !dghsVerified)}
            className={actionType === 'reject' ? 'bg-quarantine hover:bg-red-700' : ''}
          >
            {loading ? 'Processing...' : title}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
