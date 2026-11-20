// PharmaTrace AI — Administrative Organization Management
// Persistent MariaDB-backed organization management with lifecycle governance, linked users, and verified regulatory documents

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import {
  Search,
  Building2,
  RefreshCw,
  Users as UsersIcon,
  FileText,
  AlertTriangle,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Eye,
  Download,
  AlertCircle,
  Clock,
  Mail,
  Phone,
  MapPin,
  ExternalLink
} from 'lucide-react'
import {
  PageHeader,
  Button,
  StatusBadge,
  Drawer,
  Modal,
  Toast,
  DocumentPreviewModal
} from '../../../components/ui'
import {
  listOrganizations,
  getOrganizationDetail,
  updateOrganizationStatus,
  downloadOrganizationDocument,
  fetchOrganizationDocumentBlob
} from '../../../services/adminOrganizationApi'

const ORG_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'distributor', label: 'Distributor' },
  { value: 'wholesaler', label: 'Wholesaler' },
  { value: 'pharmacy', label: 'Pharmacy' }
]

const ORG_STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'decommissioned', label: 'Decommissioned' }
]

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

export default function Organizations() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Filter & Pagination state synced with URL search params
  const [page, setPage] = useState(() => Math.max(1, parseInt(searchParams.get('page'), 10) || 1))
  const [limit, setLimit] = useState(15)
  const [type, setType] = useState(() => searchParams.get('type') || '')
  const [status, setStatus] = useState(() => searchParams.get('status') || '')
  const [search, setSearch] = useState(() => searchParams.get('search') || '')
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  const [sortBy, setSortBy] = useState(() => searchParams.get('sortBy') || 'created_at')
  const [sortOrder, setSortOrder] = useState(() => searchParams.get('sortOrder') || 'DESC')

  // Data state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState({ items: [], pagination: { page: 1, limit: 15, total: 0, totalPages: 1 } })

  // Drawer detail state
  const [selectedId, setSelectedId] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [detailData, setDetailData] = useState(null)

  // Status mutation modal state
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [targetStatus, setTargetStatus] = useState('active')
  const [statusReason, setStatusReason] = useState('')
  const [statusSubmitting, setStatusSubmitting] = useState(false)
  const [statusError, setStatusError] = useState('')

  // Onboarding info modal
  const [onboardingInfoOpen, setOnboardingInfoOpen] = useState(false)

  // Document preview state
  const [previewDoc, setPreviewDoc] = useState(null)
  const [downloadingDocId, setDownloadingDocId] = useState(null)

  // Toast feedback
  const [toast, setToast] = useState('')

  const activeRequestId = useRef(0)
  const debounceTimerRef = useRef(null)

  // Debounce search
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [search])

  // Sync to URL
  useEffect(() => {
    const params = new URLSearchParams()
    if (page > 1) params.set('page', String(page))
    if (type) params.set('type', type)
    if (status) params.set('status', status)
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (sortBy !== 'created_at') params.set('sortBy', sortBy)
    if (sortOrder !== 'DESC') params.set('sortOrder', sortOrder)
    setSearchParams(params, { replace: true })
  }, [page, type, status, debouncedSearch, sortBy, sortOrder, setSearchParams])

  const fetchOrganizations = useCallback(async () => {
    const currentId = ++activeRequestId.current
    setLoading(true)
    setError('')

    try {
      const res = await listOrganizations({
        page,
        limit,
        type: type || undefined,
        status: status || undefined,
        search: debouncedSearch || undefined,
        sortBy,
        sortOrder
      })

      if (currentId === activeRequestId.current) {
        setData(res)
      }
    } catch (err) {
      if (currentId === activeRequestId.current) {
        setError(err.message || 'Failed to load organizations from database.')
      }
    } finally {
      if (currentId === activeRequestId.current) {
        setLoading(false)
      }
    }
  }, [page, limit, type, status, debouncedSearch, sortBy, sortOrder])

  useEffect(() => {
    fetchOrganizations()
  }, [fetchOrganizations])

  // Load detail when drawer opens
  useEffect(() => {
    if (!selectedId) {
      setDetailData(null)
      setDetailError('')
      return
    }

    let isMounted = true
    setDetailLoading(true)
    setDetailError('')

    getOrganizationDetail(selectedId)
      .then(res => {
        if (isMounted) {
          setDetailData(res)
        }
      })
      .catch(err => {
        if (isMounted) {
          setDetailError(err.message || 'Failed to load organization details.')
        }
      })
      .finally(() => {
        if (isMounted) {
          setDetailLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [selectedId])

  function handleResetFilters() {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    activeRequestId.current += 1

    setType('')
    setStatus('')
    setSearch('')
    setDebouncedSearch('')
    setPage(1)
    setSortBy('created_at')
    setSortOrder('DESC')
    setSearchParams({}, { replace: true })
  }

  function toggleSort(column) {
    if (sortBy === column) {
      setSortOrder(prev => (prev === 'ASC' ? 'DESC' : 'ASC'))
    } else {
      setSortBy(column)
      setSortOrder('ASC')
    }
    setPage(1)
  }

  function openStatusModal(org) {
    setTargetStatus(org.status || 'active')
    setStatusReason('')
    setStatusError('')
    setStatusModalOpen(true)
  }

  async function handleStatusSubmit(e) {
    e.preventDefault()
    if (!selectedId || statusSubmitting) return

    if (!statusReason.trim() || statusReason.trim().length < 5) {
      setStatusError('A regulatory reason of at least 5 characters is required for organization status modifications.')
      return
    }

    setStatusSubmitting(true)
    setStatusError('')

    try {
      await updateOrganizationStatus(selectedId, {
        status: targetStatus,
        reason: statusReason.trim()
      })

      setToast(`Organization status successfully updated to ${targetStatus}.`)
      setStatusModalOpen(false)

      // Refresh list & current detail
      fetchOrganizations()
      if (selectedId) {
        const refreshed = await getOrganizationDetail(selectedId)
        setDetailData(refreshed)
      }
    } catch (err) {
      setStatusError(err.message || 'Failed to update organization status.')
    } finally {
      setStatusSubmitting(false)
    }
  }

  async function handleDocumentDownload(doc) {
    if (!selectedId) return
    setDownloadingDocId(doc.id)
    try {
      await downloadOrganizationDocument(selectedId, doc.id, doc.originalFilename)
    } catch (err) {
      alert(`Failed to download ${doc.originalFilename}: ${err.message}`)
    } finally {
      setDownloadingDocId(null)
    }
  }

  const { items, pagination } = data
  const hasActiveFilters = Boolean(
    type ||
    status ||
    search ||
    debouncedSearch ||
    sortBy !== 'created_at' ||
    sortOrder !== 'DESC' ||
    page > 1
  )

  const selectedOrg = detailData?.organization || items.find(o => o.id === selectedId) || null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organizations Management"
        description="Persistent registry of authorized pharmaceutical supply chain entities, licensing records, linked user accounts, and statutory compliance status."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={fetchOrganizations}
              disabled={loading}
              className="gap-1.5 text-xs"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
            <Button
              variant="primary"
              onClick={() => setOnboardingInfoOpen(true)}
              className="gap-1.5 text-xs"
            >
              <ShieldCheck size={14} />
              Onboard Organization
            </Button>
          </div>
        }
      />

      {/* Filter & Search Bar */}
      <div className="rounded-lg border border-line bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-muted" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, license, email, ID..."
              className="w-full rounded border border-line bg-white pl-8 pr-3 py-1.5 text-xs text-ink placeholder-muted focus:border-navy focus:outline-none"
            />
          </div>

          {/* Type Filter */}
          <div>
            <select
              value={type}
              onChange={e => {
                setType(e.target.value)
                setPage(1)
              }}
              className="w-full rounded border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-navy focus:outline-none"
            >
              {ORG_TYPES.map(t => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={status}
              onChange={e => {
                setStatus(e.target.value)
                setPage(1)
              }}
              className="w-full rounded border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-navy focus:outline-none"
            >
              {ORG_STATUSES.map(s => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Sort & Reset */}
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={e => {
                setSortBy(e.target.value)
                setPage(1)
              }}
              className="w-full rounded border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-navy focus:outline-none"
            >
              <option value="created_at">Date Created</option>
              <option value="name">Organization Name</option>
              <option value="type">Organization Type</option>
              <option value="status">Status</option>
              <option value="license_number">License Number</option>
              <option value="updated_at">Last Updated</option>
            </select>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="shrink-0 text-xs font-semibold text-clinical hover:underline cursor-pointer"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-quarantine-line bg-quarantine-soft p-4 text-xs font-medium text-quarantine"
        >
          <AlertTriangle size={16} className="shrink-0" />
          <div className="flex-1">
            <span className="font-bold">Error loading organizations:</span> {error}
          </div>
          <Button variant="outline" onClick={fetchOrganizations} className="text-xs">
            Retry
          </Button>
        </div>
      )}

      {/* Organizations Table */}
      <div className="overflow-hidden rounded-lg border border-line bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-line bg-surface font-semibold uppercase tracking-wider text-muted">
              <tr>
                <th
                  className="cursor-pointer px-4 py-3 hover:text-navy"
                  onClick={() => toggleSort('name')}
                >
                  <div className="flex items-center gap-1">
                    <span>Organization</span>
                    <ArrowUpDown size={11} />
                  </div>
                </th>
                <th
                  className="cursor-pointer px-4 py-3 hover:text-navy"
                  onClick={() => toggleSort('type')}
                >
                  <div className="flex items-center gap-1">
                    <span>Type</span>
                    <ArrowUpDown size={11} />
                  </div>
                </th>
                <th className="px-4 py-3">License Number</th>
                <th className="px-4 py-3">Primary Contact</th>
                <th
                  className="cursor-pointer px-4 py-3 hover:text-navy"
                  onClick={() => toggleSort('status')}
                >
                  <div className="flex items-center gap-1">
                    <span>Status</span>
                    <ArrowUpDown size={11} />
                  </div>
                </th>
                <th className="px-4 py-3 text-center">Linked Users</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted">
                    <RefreshCw size={18} className="mx-auto mb-2 animate-spin text-navy" />
                    Fetching persistent organizations...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-muted">
                    <Building2 size={28} className="mx-auto mb-2 text-slate-300" />
                    <div className="font-semibold text-navy">No organizations found</div>
                    <p className="mt-1 text-xs">
                      {hasActiveFilters
                        ? 'Try adjusting your search criteria or clearing active filters.'
                        : 'No organizations have been provisioned in the database yet.'}
                    </p>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        className="mt-3 inline-flex items-center gap-1 rounded border border-line bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:bg-slate-50 transition cursor-pointer"
                      >
                        Clear Filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                items.map(org => (
                  <tr
                    key={org.id}
                    onClick={() => setSelectedId(org.id)}
                    className="cursor-pointer transition hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-ink">{org.name}</div>
                      <div className="font-mono text-[11px] text-muted">{org.id}</div>
                      {org.pharmacyClassification === 'GOVERNMENT' && (
                        <span className="text-[10px] font-medium text-blue-700">DGHS Facility: {org.dghsFacilityCode || 'N/A'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 capitalize font-medium text-slate-700">
                      {org.type}
                    </td>
                    <td className="px-4 py-3 font-mono text-muted">
                      {org.licenseNumber || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{org.contactName || '—'}</div>
                      <div className="text-[11px] text-muted">{org.contactEmail || ''}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={org.status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-mono font-bold text-slate-800">
                        <UsersIcon size={12} className="text-muted" />
                        {org.userCount || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          setSelectedId(org.id)
                        }}
                        className="rounded border border-line bg-white px-2.5 py-1 text-xs font-semibold text-navy transition hover:bg-slate-100 cursor-pointer"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Server Pagination */}
        {pagination && pagination.totalPages > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs text-muted">
            <div>
              Showing <span className="font-semibold text-ink">{items.length}</span> of{' '}
              <span className="font-semibold text-ink">{pagination.total}</span> organizations
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="inline-flex items-center gap-1 rounded border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft size={13} />
                Previous
              </button>
              <span>
                Page <strong className="text-ink">{pagination.page}</strong> of{' '}
                <strong className="text-ink">{pagination.totalPages}</strong>
              </span>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages || loading}
                className="inline-flex items-center gap-1 rounded border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                Next
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Organization Inspection Drawer */}
      <Drawer
        open={Boolean(selectedId)}
        title={selectedOrg ? selectedOrg.name : 'Organization Details'}
        onClose={() => setSelectedId(null)}
      >
        {detailLoading ? (
          <div className="py-12 text-center text-muted">
            <RefreshCw size={24} className="mx-auto mb-2 animate-spin text-navy" />
            <p className="text-xs">Loading organization records from database...</p>
          </div>
        ) : detailError ? (
          <div className="rounded border border-quarantine-line bg-quarantine-soft p-4 text-xs text-quarantine">
            <p className="font-bold">Failed to load details:</p>
            <p className="mt-1">{detailError}</p>
          </div>
        ) : selectedOrg ? (
          <div className="space-y-6">
            {/* Header / Status Controls */}
            <div className="flex items-center justify-between rounded-lg border border-line bg-surface p-4">
              <div>
                <div className="text-xs text-muted">Participation Status</div>
                <div className="mt-1">
                  <StatusBadge status={selectedOrg.status} />
                </div>
              </div>
              <Button
                variant="outline"
                className="text-xs"
                onClick={() => openStatusModal(selectedOrg)}
              >
                Modify Status
              </Button>
            </div>

            {/* Entity Record */}
            <div className="space-y-3 rounded-lg border border-line bg-white p-4 text-xs">
              <h3 className="font-bold uppercase tracking-wider text-navy flex items-center gap-1.5">
                <Building2 size={14} />
                Corporate Entity Record
              </h3>
              <div className="flex justify-between border-b border-line pb-1.5">
                <span className="text-muted">Entity ID</span>
                <span className="font-mono font-semibold text-ink">{selectedOrg.id}</span>
              </div>
              <div className="flex justify-between border-b border-line pb-1.5">
                <span className="text-muted">Supply Chain Type</span>
                <span className="font-semibold capitalize text-ink">{selectedOrg.type}</span>
              </div>
              <div className="flex justify-between border-b border-line pb-1.5">
                <span className="text-muted">Drug / Trade License</span>
                <span className="font-mono font-semibold text-ink">{selectedOrg.licenseNumber || '—'}</span>
              </div>
              {selectedOrg.taxId && (
                <div className="flex justify-between border-b border-line pb-1.5">
                  <span className="text-muted">Tax Identification (TIN)</span>
                  <span className="font-mono text-ink">{selectedOrg.taxId}</span>
                </div>
              )}
              {selectedOrg.pharmacyClassification && (
                <div className="flex justify-between border-b border-line pb-1.5">
                  <span className="text-muted">Classification</span>
                  <span className="font-semibold text-ink">
                    {selectedOrg.pharmacyClassification === 'GOVERNMENT'
                      ? 'Government Facility'
                      : 'Commercial Pharmacy'}
                  </span>
                </div>
              )}
              {selectedOrg.dghsFacilityCode && (
                <div className="flex justify-between border-b border-line pb-1.5">
                  <span className="text-muted">DGHS Health Facility Code</span>
                  <span className="font-mono font-bold text-navy">{selectedOrg.dghsFacilityCode}</span>
                </div>
              )}
              <div className="flex justify-between border-b border-line pb-1.5">
                <span className="text-muted">Physical Facility Address</span>
                <span className="max-w-[220px] text-right text-ink">{selectedOrg.address || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-line pb-1.5">
                <span className="text-muted">Primary Contact</span>
                <span className="text-right text-ink">
                  {selectedOrg.contactName || '—'}
                  {selectedOrg.contactEmail ? ` (${selectedOrg.contactEmail})` : ''}
                </span>
              </div>
              {selectedOrg.contactPhone && (
                <div className="flex justify-between border-b border-line pb-1.5">
                  <span className="text-muted">Telephone</span>
                  <span className="text-ink">{selectedOrg.contactPhone}</span>
                </div>
              )}
              <div className="flex justify-between border-b border-line pb-1.5">
                <span className="text-muted">Data Environment</span>
                <span className="font-mono uppercase text-ink">{selectedOrg.dataEnvironment || 'production'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Provisioned Timestamp</span>
                <span className="text-ink">
                  {selectedOrg.createdAt ? new Date(selectedOrg.createdAt).toLocaleString() : '—'}
                </span>
              </div>
            </div>

            {/* Approved Regulatory Documents */}
            <div className="rounded-lg border border-line bg-white p-4 text-xs">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-bold uppercase tracking-wider text-navy flex items-center gap-1.5">
                  <FileText size={14} />
                  Regulatory Verification Documents ({detailData?.documents?.length || 0})
                </h3>
                {selectedOrg.registrationId && (
                  <Link
                    to={`/admin/registrations/${selectedOrg.registrationId}`}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-clinical hover:underline"
                  >
                    <span>View Dossier</span>
                    <ExternalLink size={11} />
                  </Link>
                )}
              </div>

              {(!detailData?.documents || detailData.documents.length === 0) ? (
                <p className="text-xs text-muted italic">
                  No verified regulatory documents attached to this organization record.
                </p>
              ) : (
                <div className="space-y-2">
                  {detailData.documents.map(doc => {
                    const canPreview = ['application/pdf', 'image/jpeg', 'image/png'].includes(doc.mimeType)
                    const isDownloading = downloadingDocId === doc.id
                    return (
                      <div
                        key={doc.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded border border-line p-2.5 bg-slate-50/60"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-navy truncate" title={doc.originalFilename}>
                              {doc.originalFilename}
                            </span>
                            <span className="shrink-0 font-mono text-[10px] bg-slate-200 text-slate-700 px-1 py-0.2 rounded uppercase">
                              {doc.mimeType === 'application/pdf' ? 'PDF' : doc.mimeType?.includes('image') ? 'IMG' : 'DOC'}
                            </span>
                          </div>
                          <div className="text-[11px] text-muted">
                            {formatDocType(doc.documentType)} · {formatFileSize(doc.fileSizeBytes)}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {canPreview && (
                            <button
                              type="button"
                              onClick={() => setPreviewDoc(doc)}
                              className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-xs font-semibold text-navy border border-line hover:bg-slate-100 transition shadow-xs cursor-pointer"
                            >
                              <Eye size={12} />
                              Preview
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDocumentDownload(doc)}
                            disabled={isDownloading}
                            className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-xs font-semibold text-slate-700 border border-line hover:bg-slate-100 transition disabled:opacity-50 shadow-xs cursor-pointer"
                          >
                            <Download size={12} />
                            {isDownloading ? 'Saving...' : 'Download'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Linked Users */}
            <div className="rounded-lg border border-line bg-white p-4 text-xs">
              <h3 className="mb-3 font-bold uppercase tracking-wider text-navy flex items-center gap-1.5">
                <UsersIcon size={14} />
                Linked User Accounts ({detailData?.users?.length || 0})
              </h3>

              {(!detailData?.users || detailData.users.length === 0) ? (
                <p className="text-xs text-muted italic">
                  No active users are currently assigned to this organization.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {detailData.users.map(u => (
                    <li key={u.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-ink">{u.name}</div>
                        <div className="text-[11px] text-muted">
                          {u.email} · <span className="capitalize font-medium text-slate-700">{u.role}</span>
                        </div>
                        {u.lastLoginAt && (
                          <div className="text-[10px] text-muted">
                            Last login: {new Date(u.lastLoginAt).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                      <StatusBadge status={u.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </Drawer>

      {/* Organization Status Modification Modal */}
      <Modal
        open={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        title={`Modify Organization Status: ${selectedOrg?.name || ''}`}
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStatusModalOpen(false)}
              disabled={statusSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="org-status-form"
              variant={targetStatus === 'suspended' ? 'outline' : 'primary'}
              disabled={statusSubmitting}
              className={targetStatus === 'suspended' ? 'text-quarantine border-quarantine hover:bg-quarantine-soft' : ''}
            >
              {statusSubmitting ? 'Updating Status...' : 'Apply Status Change'}
            </Button>
          </>
        }
      >
        <form id="org-status-form" onSubmit={handleStatusSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-navy mb-1">
              Select Platform Participation Status
            </label>
            <select
              value={targetStatus}
              onChange={e => setTargetStatus(e.target.value)}
              className="w-full rounded border border-line bg-white px-3 py-2 text-xs text-ink focus:border-navy focus:outline-none"
            >
              <option value="active">Active (Full platform operational access)</option>
              <option value="suspended">Suspended (Access immediately revoked for all users)</option>
              <option value="decommissioned">Decommissioned (Permanent lifecycle termination)</option>
            </select>
          </div>

          {(targetStatus === 'suspended' || targetStatus === 'decommissioned') && (
            <div
              role="alert"
              className="rounded-md border border-quarantine-line bg-quarantine-soft p-3 text-quarantine font-medium"
            >
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle size={14} />
                <span>Security Notice: Immediate Token Revocation</span>
              </div>
              <p className="mt-1">
                Changing organization status to <strong>{targetStatus}</strong> will immediately increment user token versions and terminate all active sessions for all accounts belonging to this organization.
              </p>
            </div>
          )}

          <div>
            <label className="block font-semibold text-navy mb-1">
              Statutory / Administrative Reason <span className="text-quarantine">*</span>
            </label>
            <textarea
              rows={3}
              required
              value={statusReason}
              onChange={e => {
                setStatusReason(e.target.value)
                setStatusError('')
              }}
              placeholder="Provide reason for regulatory audit logging (minimum 5 characters)..."
              className="w-full rounded border border-line bg-white p-2 text-xs text-ink placeholder-muted focus:border-navy focus:outline-none"
            />
          </div>

          {statusError && (
            <p role="alert" className="text-xs font-semibold text-quarantine">
              {statusError}
            </p>
          )}
        </form>
      </Modal>

      {/* Onboarding Guidance Modal */}
      <Modal
        open={onboardingInfoOpen}
        onClose={() => setOnboardingInfoOpen(false)}
        title="Organization Onboarding Procedure"
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => setOnboardingInfoOpen(false)}>
              Close
            </Button>
            <Link
              to="/admin/registrations"
              onClick={() => setOnboardingInfoOpen(false)}
              className="inline-flex items-center gap-1.5 rounded-md bg-navy px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition"
            >
              <ShieldCheck size={15} />
              Open Registration Queue
            </Link>
          </>
        }
      >
        <div className="space-y-4 text-xs text-slate-700">
          <p>
            In accordance with pharmaceutical supply chain regulatory standards, new organization entities cannot be provisioned via ad-hoc forms without statutory credential verification.
          </p>
          <div className="rounded-lg border border-line bg-surface p-4 space-y-2">
            <h4 className="font-bold text-navy uppercase tracking-wider text-[11px]">
              Statutory Verification Lifecycle
            </h4>
            <ol className="list-decimal list-inside space-y-1.5 text-muted">
              <li>
                <strong className="text-ink">Application Submission:</strong> Supply chain applicant submits legal credentials, drug license, and contact details via public registration.
              </li>
              <li>
                <strong className="text-ink">Document Verification:</strong> System Administrator inspects trade licenses, tax certificates, and DGHS facility codes in the Registration Dossier.
              </li>
              <li>
                <strong className="text-ink">Provisioning & Activation:</strong> Approving the application automatically provisions the persistent organization record in MariaDB and dispatches an activation token to the primary representative.
              </li>
            </ol>
          </div>
          <p>
            To onboard a partner, either direct them to complete the public registration portal or review pending applications in the registration queue.
          </p>
        </div>
      </Modal>

      {/* Document Preview Modal */}
      <DocumentPreviewModal
        open={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        title={previewDoc?.originalFilename || 'Document Preview'}
        documentType={formatDocType(previewDoc?.documentType)}
        mimeType={previewDoc?.mimeType}
        fileSizeBytes={previewDoc?.fileSizeBytes || 0}
        onDownload={() => handleDocumentDownload(previewDoc)}
        fetchBlob={() => fetchOrganizationDocumentBlob(selectedId, previewDoc?.id)}
      />

      {/* Toast Feedback */}
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  )
}
