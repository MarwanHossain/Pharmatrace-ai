// PharmaTrace AI — Registration Dossier View
// Comprehensive administrative dossier inspecting organization details, documents, submission history, and audit log

import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  FileCheck,
  FileQuestion,
  History,
  Layers,
  Lock,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Send,
  ShieldAlert,
  User,
  XCircle,
  AlertCircle,
  FileText,
  Eye,
  Download
} from 'lucide-react'
import { Button, StatusBadge, DocumentPreviewModal } from '../../../components/ui'
import {
  getRegistrationDetail,
  downloadRegistrationDocument,
  fetchRegistrationDocumentBlob
} from '../../../services/adminRegistrationApi'
import ActionDialogModal from './components/ActionDialogModal'
import DossierDocumentsTable from './components/DossierDocumentsTable'
import DossierVersionHistory from './components/DossierVersionHistory'
import DossierAuditTimeline from './components/DossierAuditTimeline'

const STATUS_TONES = {
  SUBMITTED: 'bg-blue-50 text-blue-800 border-blue-200',
  UNDER_REVIEW: 'bg-amber-soft text-amber-ink border-amber-line',
  INFORMATION_REQUESTED: 'bg-amber-soft text-amber-ink border-amber-line',
  APPROVED: 'bg-clinical-soft text-emerald-800 border-emerald-300',
  REJECTED: 'bg-quarantine-soft text-quarantine border-quarantine-line'
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatDocType(type) {
  if (!type) return 'Other Document'
  return String(type)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, l => l.toUpperCase())
}

export default function RegistrationDossier() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [overviewPreviewDoc, setOverviewPreviewDoc] = useState(null)
  const [overviewDownloadingId, setOverviewDownloadingId] = useState(null)

  const urlTab = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState(
    ['overview', 'documents', 'history', 'audit'].includes(urlTab) ? urlTab : 'overview'
  )

  useEffect(() => {
    if (urlTab && ['overview', 'documents', 'history', 'audit'].includes(urlTab)) {
      setActiveTab(urlTab)
    }
  }, [urlTab])

  function handleTabChange(tab) {
    setActiveTab(tab)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('tab', tab)
      return next
    }, { replace: true })
  }

  async function handleOverviewDownload(doc) {
    setOverviewDownloadingId(doc.id)
    try {
      await downloadRegistrationDocument(id, doc.id, doc.originalFilename)
    } catch (err) {
      alert(`Failed to download ${doc.originalFilename}: ${err.message}`)
    } finally {
      setOverviewDownloadingId(null)
    }
  }

  // Action modal state
  const [actionModal, setActionModal] = useState({ open: false, type: null })
  const [notificationNotice, setNotificationNotice] = useState(null)

  const fetchDossier = useCallback(async () => {
    if (!id) return
    setError('')
    setLoading(true)
    try {
      const res = await getRegistrationDetail(id)
      setData(res)
    } catch (err) {
      setError(err.message || 'Failed to load registration dossier.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchDossier()
  }, [fetchDossier])

  function handleActionSuccess(result, actionType) {
    fetchDossier()

    // Map honest notification status UX
    if (result?.notificationStatus) {
      if (result.notificationStatus === 'DELIVERED') {
        setNotificationNotice({
          type: 'success',
          message: 'Notification successfully delivered to the registered primary contact.'
        })
      } else if (result.notificationStatus === 'NOT_CONFIGURED') {
        setNotificationNotice({
          type: 'warning',
          message: 'External email delivery service is not configured in this environment. Please communicate registration credentials via official operational channels.'
        })
      } else if (result.notificationStatus === 'FAILED') {
        setNotificationNotice({
          type: 'error',
          message: 'Notification email dispatch attempt failed. You can retry dispatching the link using the resend action.'
        })
      } else {
        setNotificationNotice({
          type: 'info',
          message: `Action recorded successfully. Notification status: ${result.notificationStatus}.`
        })
      }
    } else {
      setNotificationNotice({
        type: 'success',
        message: 'Administrative action recorded successfully in regulatory audit log.'
      })
    }
  }

  if (loading && !data) {
    return (
      <div className="flex min-h-[350px] items-center justify-center">
        <div className="text-center text-sm font-semibold text-navy">
          <RefreshCw size={20} className="mx-auto mb-2 animate-spin text-navy" />
          Loading registration dossier...
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="rounded-lg border border-quarantine-line bg-quarantine-soft p-6 text-center text-xs">
        <ShieldAlert size={24} className="mx-auto mb-2 text-quarantine" />
        <div className="font-bold text-quarantine">Failed to load dossier</div>
        <p className="mt-1 text-slate-700">{error}</p>
        <div className="mt-4 flex justify-center gap-3">
          <Link to="/admin/registrations" className="font-semibold text-navy hover:underline">
            ← Return to Registration Queue
          </Link>
          <Button variant="outline" onClick={fetchDossier}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  const reg = data.registration
  const status = reg.status || 'SUBMITTED'
  const isGovPharmacy = reg.category === 'pharmacy' && reg.pharmacyClassification === 'GOVERNMENT'

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/admin/registrations"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-navy"
        >
          <ArrowLeft size={14} />
          Back to Registration Queue
        </Link>
        <button
          type="button"
          onClick={fetchDossier}
          disabled={loading}
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-navy disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh Dossier
        </button>
      </div>

      {/* Notification Outcome Banner */}
      {notificationNotice && (
        <div
          role="status"
          className={`flex items-start justify-between gap-2 rounded-lg border p-3.5 text-xs font-medium ${
            notificationNotice.type === 'success'
              ? 'border-emerald-300 bg-clinical-soft text-emerald-900'
              : notificationNotice.type === 'warning'
                ? 'border-amber-line bg-amber-soft text-amber-ink'
                : 'border-quarantine-line bg-quarantine-soft text-quarantine'
          }`}
        >
          <div className="flex items-start gap-2">
            {notificationNotice.type === 'success' ? (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-700" />
            ) : notificationNotice.type === 'warning' ? (
              <FileQuestion size={16} className="mt-0.5 shrink-0 text-amber-800" />
            ) : (
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-quarantine" />
            )}
            <span>{notificationNotice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotificationNotice(null)}
            className="text-xs font-bold hover:opacity-75"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Cockpit Card */}
      <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-navy">{reg.orgName}</h1>
              <span
                className={`inline-flex items-center rounded border px-2.5 py-0.5 text-xs font-bold ${
                  STATUS_TONES[status] || 'border-slate-200 bg-slate-100 text-slate-700'
                }`}
              >
                {status}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              <span>
                Ref: <strong className="font-mono text-ink">{reg.referenceNumber}</strong>
              </span>
              <span>·</span>
              <span>
                Category: <strong className="capitalize text-ink">{reg.category}</strong>
              </span>
              <span>·</span>
              <span>
                License: <strong className="font-mono text-ink">{reg.licenseNumber}</strong>
              </span>
              <span>·</span>
              <span>
                Submitted: {reg.createdAt ? new Date(reg.createdAt).toLocaleDateString() : '—'}
              </span>
            </div>
          </div>

          {/* Context-Aware Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {status === 'SUBMITTED' && (
              <>
                <Button
                  variant="primary"
                  onClick={() => setActionModal({ open: true, type: 'start-review' })}
                >
                  Start Review
                </Button>
                <Button
                  variant="outline"
                  className="text-quarantine hover:bg-quarantine-soft"
                  onClick={() => setActionModal({ open: true, type: 'reject' })}
                >
                  Reject
                </Button>
              </>
            )}

            {status === 'UNDER_REVIEW' && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setActionModal({ open: true, type: 'request-info' })}
                >
                  Request Information
                </Button>
                <Button
                  variant="success"
                  onClick={() => setActionModal({ open: true, type: 'approve' })}
                >
                  Approve Application
                </Button>
                <Button
                  variant="outline"
                  className="text-quarantine hover:bg-quarantine-soft"
                  onClick={() => setActionModal({ open: true, type: 'reject' })}
                >
                  Reject
                </Button>
              </>
            )}

            {status === 'INFORMATION_REQUESTED' && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setActionModal({ open: true, type: 'resend-link' })}
                >
                  Resend Link
                </Button>
                <Button
                  variant="outline"
                  className="text-quarantine hover:bg-quarantine-soft"
                  onClick={() => setActionModal({ open: true, type: 'reject' })}
                >
                  Reject
                </Button>
              </>
            )}

            {status === 'APPROVED' && (
              <Button
                variant="outline"
                onClick={() => setActionModal({ open: true, type: 'resend-activation' })}
              >
                Resend Activation
              </Button>
            )}

            {status === 'REJECTED' && (
              <span className="rounded bg-quarantine-soft px-3 py-1.5 text-xs font-semibold text-quarantine">
                Application Formally Rejected
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Dossier Tabs */}
      <div className="border-b border-line">
        <nav className="flex space-x-6 text-xs font-semibold">
          <button
            type="button"
            onClick={() => handleTabChange('overview')}
            className={`border-b-2 pb-3 transition ${
              activeTab === 'overview'
                ? 'border-navy text-navy'
                : 'border-transparent text-muted hover:border-slate-300 hover:text-ink'
            }`}
          >
            Application Overview
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('documents')}
            className={`border-b-2 pb-3 transition ${
              activeTab === 'documents'
                ? 'border-navy text-navy'
                : 'border-transparent text-muted hover:border-slate-300 hover:text-ink'
            }`}
          >
            Regulatory Documents ({data.documents?.length || 0})
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('history')}
            className={`border-b-2 pb-3 transition ${
              activeTab === 'history'
                ? 'border-navy text-navy'
                : 'border-transparent text-muted hover:border-slate-300 hover:text-ink'
            }`}
          >
            Submission History ({data.submissions?.length || 1})
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('audit')}
            className={`border-b-2 pb-3 transition ${
              activeTab === 'audit'
                ? 'border-navy text-navy'
                : 'border-transparent text-muted hover:border-slate-300 hover:text-ink'
            }`}
          >
            Regulatory Audit Trail ({data.auditLog?.length || 0})
          </button>
        </nav>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Organization & Licensing */}
          <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-navy">
              <Building2 size={15} />
              Entity &amp; Licensing Information
            </h2>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between border-b border-line pb-2">
                <span className="text-muted">Entity Legal Name</span>
                <span className="font-semibold text-ink">{reg.orgName}</span>
              </div>
              <div className="flex justify-between border-b border-line pb-2">
                <span className="text-muted">Category</span>
                <span className="font-semibold capitalize text-ink">{reg.category}</span>
              </div>
              <div className="flex justify-between border-b border-line pb-2">
                <span className="text-muted">Drug / Trade License Number</span>
                <span className="font-mono font-semibold text-ink">{reg.licenseNumber}</span>
              </div>
              <div className="flex justify-between border-b border-line pb-2">
                <span className="text-muted">Physical Facility Address</span>
                <span className="max-w-[260px] text-right text-ink">{reg.address}</span>
              </div>
              {reg.category === 'pharmacy' && (
                <div className="flex justify-between border-b border-line pb-2">
                  <span className="text-muted">Pharmacy Classification</span>
                  <span className="font-semibold text-ink">
                    {reg.pharmacyClassification === 'GOVERNMENT'
                      ? 'Government Hospital / Community Clinic'
                      : 'Private Commercial Pharmacy'}
                  </span>
                </div>
              )}
              {isGovPharmacy && (
                <div className="flex justify-between border-b border-line pb-2">
                  <span className="text-muted">DGHS Health Facility Code</span>
                  <span className="font-mono font-bold text-navy">{reg.dghsFacilityCode || 'Not provided'}</span>
                </div>
              )}
              {reg.approvedOrgId && (
                <div className="flex justify-between border-b border-line pb-2">
                  <span className="text-muted">Provisioned Organization ID</span>
                  <span className="font-mono font-semibold text-emerald-800">{reg.approvedOrgId}</span>
                </div>
              )}
            </div>
          </div>

          {/* Primary Contact Person */}
          <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-navy">
              <User size={15} />
              Primary Contact &amp; Onboarding Recipient
            </h2>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between border-b border-line pb-2">
                <span className="text-muted">Authorized Representative</span>
                <span className="font-semibold text-ink">{reg.contactName}</span>
              </div>
              <div className="flex justify-between border-b border-line pb-2">
                <span className="text-muted">Official Email Address</span>
                <span className="font-semibold text-ink">{reg.contactEmail}</span>
              </div>
              <div className="flex justify-between border-b border-line pb-2">
                <span className="text-muted">Contact Phone Number</span>
                <span className="font-semibold text-ink">{reg.contactPhone}</span>
              </div>
              <div className="flex justify-between border-b border-line pb-2">
                <span className="text-muted">Last Application Update</span>
                <span className="text-ink">
                  {reg.updatedAt ? new Date(reg.updatedAt).toLocaleString() : '—'}
                </span>
              </div>
              {reg.reviewedBy && (
                <div className="flex justify-between border-b border-line pb-2">
                  <span className="text-muted">Assigned Reviewer</span>
                  <span className="font-semibold text-ink">{reg.reviewedBy}</span>
                </div>
              )}
              {reg.reviewedAt && (
                <div className="flex justify-between border-b border-line pb-2">
                  <span className="text-muted">Review Decision Timestamp</span>
                  <span className="text-ink">{new Date(reg.reviewedAt).toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* Review Notes / Rejection Reason Banners */}
            {reg.reviewNotes && (
              <div className="mt-4 rounded border border-line bg-slate-50 p-3 text-xs">
                <div className="font-bold text-navy">Administrator Review Notes:</div>
                <p className="mt-1 whitespace-pre-wrap text-slate-700">{reg.reviewNotes}</p>
              </div>
            )}

            {reg.rejectionReason && (
              <div className="mt-4 rounded border border-quarantine-line bg-quarantine-soft p-3 text-xs">
                <div className="font-bold text-quarantine">
                  Statutory Rejection Reason: {reg.rejectionReason}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-slate-700">{reg.rejectionExplanation}</p>
              </div>
            )}
          </div>
        </div>

        {/* Prominent Regulatory Documents Summary on Overview Tab */}
        <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line pb-4 mb-4">
            <div>
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-navy">
                <FileText size={15} />
                Regulatory Verification Documents ({data.documents?.length || 0})
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                Official regulatory licenses, certifications, and compliance attachments submitted by the applicant.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleTabChange('documents')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy hover:text-blue-700 hover:underline shrink-0"
            >
              <span>View Full Documents Tab</span>
              <span>→</span>
            </button>
          </div>

          {(!data.documents || data.documents.length === 0) ? (
            <div className="rounded border border-dashed border-line bg-surface p-6 text-center text-xs text-muted">
              No regulatory documents uploaded with this submission.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.documents.map(doc => {
                const canPreview = ['application/pdf', 'image/jpeg', 'image/png'].includes(doc.mimeType)
                const isDownloading = overviewDownloadingId === doc.id
                return (
                  <div
                    key={doc.id}
                    className="flex flex-col justify-between rounded-lg border border-line bg-slate-50/50 p-3.5 hover:border-slate-300 transition-colors"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className="font-semibold text-navy text-xs truncate" title={formatDocType(doc.documentType)}>
                          {formatDocType(doc.documentType)}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded uppercase">
                          {doc.mimeType === 'application/pdf' ? 'PDF' : doc.mimeType?.includes('image') ? 'IMAGE' : 'FILE'}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-ink truncate mb-1" title={doc.originalFilename}>
                        {doc.originalFilename}
                      </p>
                      <p className="text-[11px] text-muted">
                        {formatFileSize(doc.fileSizeBytes)} · v{doc.version || 1}
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex items-center gap-2">
                      {canPreview && (
                        <button
                          type="button"
                          onClick={() => setOverviewPreviewDoc(doc)}
                          className="flex-1 inline-flex items-center justify-center gap-1 rounded bg-white px-2.5 py-1.5 text-xs font-medium text-navy border border-line hover:bg-slate-100 transition shadow-xs cursor-pointer"
                        >
                          <Eye size={13} />
                          <span>Preview</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleOverviewDownload(doc)}
                        disabled={isDownloading}
                        className="flex-1 inline-flex items-center justify-center gap-1 rounded bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-line hover:bg-slate-100 transition disabled:opacity-50 shadow-xs cursor-pointer"
                      >
                        <Download size={13} />
                        <span>{isDownloading ? 'Saving...' : 'Download'}</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Tab 2: Regulatory Documents */}
      {activeTab === 'documents' && (
        <DossierDocumentsTable registrationId={id} documents={data.documents} />
      )}

      {/* Tab 3: Submission History */}
      {activeTab === 'history' && (
        <DossierVersionHistory submissions={data.submissions} />
      )}

      {/* Tab 4: Regulatory Audit Trail */}
      {activeTab === 'audit' && (
        <DossierAuditTimeline auditLog={data.auditLog} />
      )}

      {/* Modal Dialog */}
      <ActionDialogModal
        open={actionModal.open}
        actionType={actionModal.type}
        registration={reg}
        onClose={() => setActionModal({ open: false, type: null })}
        onSuccess={handleActionSuccess}
      />

      {/* Inline Preview Modal for Overview Tab */}
      <DocumentPreviewModal
        open={Boolean(overviewPreviewDoc)}
        onClose={() => setOverviewPreviewDoc(null)}
        title={overviewPreviewDoc?.originalFilename || 'Document Preview'}
        documentType={formatDocType(overviewPreviewDoc?.documentType)}
        mimeType={overviewPreviewDoc?.mimeType}
        fileSizeBytes={overviewPreviewDoc?.fileSizeBytes || 0}
        onDownload={() => handleOverviewDownload(overviewPreviewDoc)}
        fetchBlob={() => fetchRegistrationDocumentBlob(id, overviewPreviewDoc?.id)}
      />
    </div>
  )
}
