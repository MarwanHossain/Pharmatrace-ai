// PharmaTrace AI — Organization Registration Queue
// Searchable, filterable, sortable, server-paginated regulatory application review queue

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import {
  Search,
  Filter,
  RefreshCw,
  FileText,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  ArrowUpDown
} from 'lucide-react'
import { PageHeader, Button } from '../../../components/ui'
import {
  listRegistrations,
  REGISTRATION_STATUSES,
  ALLOWED_CATEGORIES
} from '../../../services/adminRegistrationApi'

const STATUS_TONES = {
  SUBMITTED: 'bg-blue-50 text-blue-800 border-blue-200',
  UNDER_REVIEW: 'bg-amber-soft text-amber-ink border-amber-line',
  INFORMATION_REQUESTED: 'bg-amber-soft text-amber-ink border-amber-line',
  APPROVED: 'bg-clinical-soft text-emerald-800 border-emerald-300',
  REJECTED: 'bg-quarantine-soft text-quarantine border-quarantine-line'
}

export default function RegistrationQueue() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  // Filter & pagination state initialized from URL search params
  const [page, setPage] = useState(() => Math.max(1, parseInt(searchParams.get('page'), 10) || 1))
  const [limit, setLimit] = useState(15)
  const [status, setStatus] = useState(() => searchParams.get('status') || '')
  const [category, setCategory] = useState(() => searchParams.get('category') || '')
  const [search, setSearch] = useState(() => searchParams.get('search') || '')
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  const [sortBy, setSortBy] = useState(() => searchParams.get('sortBy') || 'created_at')
  const [sortOrder, setSortOrder] = useState(() => searchParams.get('sortOrder') || 'DESC')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState({ items: [], pagination: { page: 1, limit: 15, totalItems: 0, totalPages: 1 } })

  // Request counter to avoid race conditions
  const activeRequestId = useRef(0)
  const debounceTimerRef = useRef(null)

  // Debounce search input by 300ms
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

  // Sync state to URL search parameters
  useEffect(() => {
    const params = new URLSearchParams()
    if (page > 1) params.set('page', String(page))
    if (status) params.set('status', status)
    if (category) params.set('category', category)
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (sortBy !== 'created_at') params.set('sortBy', sortBy)
    if (sortOrder !== 'DESC') params.set('sortOrder', sortOrder)
    setSearchParams(params, { replace: true })
  }, [page, status, category, debouncedSearch, sortBy, sortOrder, setSearchParams])

  const fetchQueue = useCallback(async () => {
    const currentId = ++activeRequestId.current
    setLoading(true)
    setError('')

    try {
      const res = await listRegistrations({
        page,
        limit,
        status: status || undefined,
        category: category || undefined,
        search: debouncedSearch || undefined,
        sortBy,
        sortOrder
      })

      if (currentId === activeRequestId.current) {
        setData(res)
      }
    } catch (err) {
      if (currentId === activeRequestId.current) {
        setError(err.message || 'Failed to load registration applications.')
      }
    } finally {
      if (currentId === activeRequestId.current) {
        setLoading(false)
      }
    }
  }, [page, limit, status, category, debouncedSearch, sortBy, sortOrder])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  function handleResetFilters() {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    // Cancel in-flight queries by advancing request id
    activeRequestId.current += 1

    setStatus('')
    setCategory('')
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

  const hasActiveFilters = Boolean(
    status ||
    category ||
    search ||
    debouncedSearch ||
    sortBy !== 'created_at' ||
    sortOrder !== 'DESC' ||
    page > 1
  )

  const { items, pagination } = data

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organization Registration Queue"
        description="Review, verify, and provision licensed pharmaceutical supply chain entities submitting for track-and-trace registry authorization."
        actions={
          <Button variant="outline" onClick={fetchQueue} disabled={loading} className="gap-1.5 text-xs">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh Queue
          </Button>
        }
      />

      {/* Filter & Search Bar */}
      <div className="rounded-lg border border-line bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          {/* Search Input */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-muted" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search reference, org, license, email..."
              className="w-full rounded border border-line bg-white pl-8 pr-3 py-1.5 text-xs text-ink placeholder-muted focus:border-navy focus:outline-none"
            />
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
              <option value="">All Statuses</option>
              {REGISTRATION_STATUSES.map(st => (
                <option key={st} value={st}>
                  {st.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={category}
              onChange={e => {
                setCategory(e.target.value)
                setPage(1)
              }}
              className="w-full rounded border border-line bg-white px-2.5 py-1.5 text-xs text-ink capitalize focus:border-navy focus:outline-none"
            >
              <option value="">All Categories</option>
              {ALLOWED_CATEGORIES.map(cat => (
                <option key={cat} value={cat} className="capitalize">
                  {cat}
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
              <option value="created_at">Date Submitted</option>
              <option value="updated_at">Last Updated</option>
              <option value="org_name">Organization Name</option>
              <option value="reference_number">Reference Number</option>
              <option value="status">Status</option>
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
            <span className="font-bold">Error loading applications:</span> {error}
          </div>
          <Button variant="outline" onClick={fetchQueue} className="text-xs">
            Retry
          </Button>
        </div>
      )}

      {/* Applications Table */}
      <div className="overflow-hidden rounded-lg border border-line bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-line bg-surface font-semibold uppercase tracking-wider text-muted">
              <tr>
                <th
                  className="cursor-pointer px-4 py-3 hover:text-navy"
                  onClick={() => toggleSort('reference_number')}
                >
                  <div className="flex items-center gap-1">
                    <span>Reference</span>
                    <ArrowUpDown size={11} />
                  </div>
                </th>
                <th
                  className="cursor-pointer px-4 py-3 hover:text-navy"
                  onClick={() => toggleSort('org_name')}
                >
                  <div className="flex items-center gap-1">
                    <span>Organization</span>
                    <ArrowUpDown size={11} />
                  </div>
                </th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">License Number</th>
                <th className="px-4 py-3">Contact Person</th>
                <th
                  className="cursor-pointer px-4 py-3 hover:text-navy"
                  onClick={() => toggleSort('created_at')}
                >
                  <div className="flex items-center gap-1">
                    <span>Submitted</span>
                    <ArrowUpDown size={11} />
                  </div>
                </th>
                <th
                  className="cursor-pointer px-4 py-3 hover:text-navy"
                  onClick={() => toggleSort('status')}
                >
                  <div className="flex items-center gap-1">
                    <span>Status</span>
                    <ArrowUpDown size={11} />
                  </div>
                </th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted">
                    <RefreshCw size={18} className="mx-auto mb-2 animate-spin text-navy" />
                    Fetching registration applications...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-muted">
                    <FileText size={28} className="mx-auto mb-2 text-slate-300" />
                    <div className="font-semibold text-navy">No applications found</div>
                    <p className="mt-1 text-xs">
                      {hasActiveFilters
                        ? 'Try adjusting your search or clearing your active filters.'
                        : 'No organization registration submissions exist in the registry.'}
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
                items.map(r => (
                  <tr
                    key={r.id}
                    onClick={() => navigate(`/admin/registrations/${r.id}`)}
                    className="cursor-pointer transition hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-mono font-bold text-navy">
                      {r.referenceNumber}
                    </td>
                    <td className="px-4 py-3 font-semibold text-ink">
                      <div>{r.orgName}</div>
                      {r.pharmacyClassification === 'GOVERNMENT' && (
                        <span className="text-[10px] text-blue-700">DGHS Gov Facility</span>
                      )}
                    </td>
                    <td className="px-4 py-3 capitalize text-muted">{r.category}</td>
                    <td className="px-4 py-3 font-mono text-muted">{r.licenseNumber}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{r.contactName}</div>
                      <div className="text-[11px] text-muted">{r.contactEmail}</div>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-bold ${
                          STATUS_TONES[r.status] || 'border-slate-200 bg-slate-100 text-slate-700'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/admin/registrations/${r.id}`}
                        onClick={e => e.stopPropagation()}
                        className="rounded border border-line bg-white px-2.5 py-1 text-xs font-semibold text-navy transition hover:bg-slate-100"
                      >
                        Open Dossier
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Server Pagination Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-4 py-3 text-xs text-muted">
          <div>
            Showing <strong>{items.length > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0}</strong> to{' '}
            <strong>{Math.min(pagination.totalItems, pagination.page * pagination.limit)}</strong> of{' '}
            <strong>{pagination.totalItems}</strong> applications
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1 || loading}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded border border-line bg-white px-2.5 py-1 font-semibold text-ink disabled:opacity-40"
            >
              <ChevronLeft size={13} />
              Previous
            </button>
            <span className="px-2">
              Page {pagination.page} of {pagination.totalPages || 1}
            </span>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => setPage(p => p + 1)}
              className="inline-flex items-center gap-1 rounded border border-line bg-white px-2.5 py-1 font-semibold text-ink disabled:opacity-40"
            >
              Next
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
