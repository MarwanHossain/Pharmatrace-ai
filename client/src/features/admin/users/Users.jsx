// PharmaTrace AI — Administrative User Management
// Persistent MariaDB-backed user account governance, role-based inspection, account lockout remediation, and security lifecycle management

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Search,
  Users as UsersIcon,
  RefreshCw,
  AlertTriangle,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  KeyRound,
  UserCheck,
  UserX,
  Building2,
  Mail,
  Clock,
  CheckCircle2
} from 'lucide-react'
import {
  PageHeader,
  Button,
  StatusBadge,
  Drawer,
  Modal,
  Toast
} from '../../../components/ui'
import { useAuth } from '../../../contexts/AuthContext'
import {
  listUsers,
  getUserDetail,
  updateUserStatus,
  unlockUser
} from '../../../services/adminUserApi'

const USER_ROLES = [
  { value: '', label: 'All Roles' },
  { value: 'admin', label: 'System Administrator' },
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'distributor', label: 'Distributor' },
  { value: 'wholesaler', label: 'Wholesaler' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'investigator', label: 'Investigation Officer' }
]

const USER_STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'pending_activation', label: 'Pending Activation' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'locked', label: 'Locked' }
]

export default function Users() {
  const { adminUser } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  // Filter & Pagination state synced with URL search params
  const [page, setPage] = useState(() => Math.max(1, parseInt(searchParams.get('page'), 10) || 1))
  const [limit, setLimit] = useState(15)
  const [role, setRole] = useState(() => searchParams.get('role') || '')
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
  const [detailUser, setDetailUser] = useState(null)

  // Status mutation modal state
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [targetStatus, setTargetStatus] = useState('active')
  const [statusReason, setStatusReason] = useState('')
  const [statusSubmitting, setStatusSubmitting] = useState(false)
  const [statusError, setStatusError] = useState('')

  // Unlock modal state
  const [unlockModalOpen, setUnlockModalOpen] = useState(false)
  const [unlockReason, setUnlockReason] = useState('')
  const [unlockSubmitting, setUnlockSubmitting] = useState(false)
  const [unlockError, setUnlockError] = useState('')

  // Provisioning info modal
  const [provisionInfoOpen, setProvisionInfoOpen] = useState(false)

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
    if (role) params.set('role', role)
    if (status) params.set('status', status)
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (sortBy !== 'created_at') params.set('sortBy', sortBy)
    if (sortOrder !== 'DESC') params.set('sortOrder', sortOrder)
    setSearchParams(params, { replace: true })
  }, [page, role, status, debouncedSearch, sortBy, sortOrder, setSearchParams])

  const fetchUsers = useCallback(async () => {
    const currentId = ++activeRequestId.current
    setLoading(true)
    setError('')

    try {
      const res = await listUsers({
        page,
        limit,
        role: role || undefined,
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
        setError(err.message || 'Failed to load user accounts from database.')
      }
    } finally {
      if (currentId === activeRequestId.current) {
        setLoading(false)
      }
    }
  }, [page, limit, role, status, debouncedSearch, sortBy, sortOrder])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // Load detail when drawer opens
  useEffect(() => {
    if (!selectedId) {
      setDetailUser(null)
      setDetailError('')
      return
    }

    let isMounted = true
    setDetailLoading(true)
    setDetailError('')

    getUserDetail(selectedId)
      .then(res => {
        if (isMounted) {
          setDetailUser(res)
        }
      })
      .catch(err => {
        if (isMounted) {
          setDetailError(err.message || 'Failed to load user details.')
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

    setRole('')
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

  function openStatusModal(u) {
    setTargetStatus(u.status === 'active' ? 'inactive' : 'active')
    setStatusReason('')
    setStatusError('')
    setStatusModalOpen(true)
  }

  function openUnlockModal() {
    setUnlockReason('')
    setUnlockError('')
    setUnlockModalOpen(true)
  }

  async function handleStatusSubmit(e) {
    e.preventDefault()
    if (!selectedId || statusSubmitting) return

    if (isSelf && targetStatus !== 'active') {
      setStatusError('Security Policy: You cannot deactivate or lock your own active administrator account.')
      return
    }

    if (!statusReason.trim() || statusReason.trim().length < 5) {
      setStatusError('An administrative audit reason of at least 5 characters is required.')
      return
    }

    setStatusSubmitting(true)
    setStatusError('')

    try {
      await updateUserStatus(selectedId, {
        status: targetStatus,
        reason: statusReason.trim()
      })

      setToast(`User status successfully changed to ${targetStatus}.`)
      setStatusModalOpen(false)

      fetchUsers()
      if (selectedId) {
        const refreshed = await getUserDetail(selectedId)
        setDetailUser(refreshed)
      }
    } catch (err) {
      setStatusError(err.message || 'Failed to update user status.')
    } finally {
      setStatusSubmitting(false)
    }
  }

  async function handleUnlockSubmit(e) {
    e.preventDefault()
    if (!selectedId || unlockSubmitting) return

    if (!unlockReason.trim() || unlockReason.trim().length < 5) {
      setUnlockError('An administrative audit reason of at least 5 characters is required for account unlock.')
      return
    }

    setUnlockSubmitting(true)
    setUnlockError('')

    try {
      await unlockUser(selectedId, {
        reason: unlockReason.trim()
      })

      setToast(`User account ${selectedUser?.email} successfully unlocked.`)
      setUnlockModalOpen(false)

      fetchUsers()
      if (selectedId) {
        const refreshed = await getUserDetail(selectedId)
        setDetailUser(refreshed)
      }
    } catch (err) {
      setUnlockError(err.message || 'Failed to unlock user account.')
    } finally {
      setUnlockSubmitting(false)
    }
  }

  const { items = [], pagination } = data || {}
  const selectedUser = detailUser || items.find(u => u.id === selectedId) || null
  const isSelf = Boolean(
    selectedUser &&
    adminUser &&
    (selectedUser.id === adminUser.id || selectedUser.email?.toLowerCase() === adminUser.email?.toLowerCase())
  )
  const hasActiveFilters = Boolean(
    role ||
    status ||
    search ||
    debouncedSearch ||
    sortBy !== 'created_at' ||
    sortOrder !== 'DESC' ||
    page > 1
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="User & Access Management"
        description="Persistent MariaDB user accounts, role-based authorization, session token revocation, and failed-login lockout remediation."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={fetchUsers}
              disabled={loading}
              className="gap-1.5 text-xs"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
            <Button
              variant="primary"
              onClick={() => setProvisionInfoOpen(true)}
              className="gap-1.5 text-xs"
            >
              <UsersIcon size={14} />
              Provision Account
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
              placeholder="Search by name, email, organization..."
              className="w-full rounded border border-line bg-white pl-8 pr-3 py-1.5 text-xs text-ink placeholder-muted focus:border-navy focus:outline-none"
            />
          </div>

          {/* Role Filter */}
          <div>
            <select
              value={role}
              onChange={e => {
                setRole(e.target.value)
                setPage(1)
              }}
              className="w-full rounded border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-navy focus:outline-none"
            >
              {USER_ROLES.map(r => (
                <option key={r.value} value={r.value}>
                  {r.label}
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
              {USER_STATUSES.map(s => (
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
              <option value="name">User Name</option>
              <option value="email">Email Address</option>
              <option value="role">Role</option>
              <option value="status">Status</option>
              <option value="last_login_at">Last Login</option>
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
            <span className="font-bold">Error loading users:</span> {error}
          </div>
          <Button variant="outline" onClick={fetchUsers} className="text-xs">
            Retry
          </Button>
        </div>
      )}

      {/* Users Table */}
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
                    <span>User</span>
                    <ArrowUpDown size={11} />
                  </div>
                </th>
                <th
                  className="cursor-pointer px-4 py-3 hover:text-navy"
                  onClick={() => toggleSort('role')}
                >
                  <div className="flex items-center gap-1">
                    <span>Role</span>
                    <ArrowUpDown size={11} />
                  </div>
                </th>
                <th className="px-4 py-3">Assigned Organization</th>
                <th
                  className="cursor-pointer px-4 py-3 hover:text-navy"
                  onClick={() => toggleSort('status')}
                >
                  <div className="flex items-center gap-1">
                    <span>Status</span>
                    <ArrowUpDown size={11} />
                  </div>
                </th>
                <th
                  className="cursor-pointer px-4 py-3 hover:text-navy"
                  onClick={() => toggleSort('last_login_at')}
                >
                  <div className="flex items-center gap-1">
                    <span>Last Login</span>
                    <ArrowUpDown size={11} />
                  </div>
                </th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted">
                    <RefreshCw size={18} className="mx-auto mb-2 animate-spin text-navy" />
                    Fetching persistent user accounts...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-muted">
                    <UsersIcon size={28} className="mx-auto mb-2 text-slate-300" />
                    <div className="font-semibold text-navy">No user accounts found</div>
                    <p className="mt-1 text-xs">
                      {hasActiveFilters
                        ? 'Try adjusting your search criteria or clearing active filters.'
                        : 'No user accounts exist in the database.'}
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
                items.map(u => {
                  const isCurrentAdmin = adminUser && (u.id === adminUser.id || u.email?.toLowerCase() === adminUser.email?.toLowerCase())
                  return (
                    <tr
                      key={u.id}
                      onClick={() => setSelectedId(u.id)}
                      className="cursor-pointer transition hover:bg-slate-50"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink">{u.name}</span>
                          {isCurrentAdmin && (
                            <span className="rounded bg-blue-100 px-1.5 py-0.2 font-mono text-[10px] font-bold text-blue-800">
                              YOU
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted">{u.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-700">
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {u.orgName ? (
                          <div>
                            <div className="font-medium text-ink">{u.orgName}</div>
                            <div className="capitalize text-[10px] text-muted">{u.orgType}</div>
                          </div>
                        ) : (
                          <span className="text-muted italic">Platform Staff / Independent</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={u.status} />
                          {u.status === 'locked' && (
                            <Lock size={12} className="text-quarantine shrink-0" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never logged in'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation()
                            setSelectedId(u.id)
                          }}
                          className="rounded border border-line bg-white px-2.5 py-1 text-xs font-semibold text-navy transition hover:bg-slate-100 cursor-pointer"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Server Pagination */}
        {pagination && pagination.totalPages > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs text-muted">
            <div>
              Showing <span className="font-semibold text-ink">{items.length}</span> of{' '}
              <span className="font-semibold text-ink">{pagination.total}</span> accounts
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

      {/* User Inspection Drawer */}
      <Drawer
        open={Boolean(selectedId)}
        title={selectedUser ? selectedUser.name : 'User Account Details'}
        onClose={() => setSelectedId(null)}
      >
        {detailLoading ? (
          <div className="py-12 text-center text-muted">
            <RefreshCw size={24} className="mx-auto mb-2 animate-spin text-navy" />
            <p className="text-xs">Loading user profile from database...</p>
          </div>
        ) : detailError ? (
          <div className="rounded border border-quarantine-line bg-quarantine-soft p-4 text-xs text-quarantine">
            <p className="font-bold">Failed to load details:</p>
            <p className="mt-1">{detailError}</p>
          </div>
        ) : selectedUser ? (
          <div className="space-y-6">
            {/* Self Account Guard Banner */}
            {isSelf && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 font-medium">
                <div className="flex items-center gap-1.5 font-bold">
                  <ShieldCheck size={14} className="text-blue-700" />
                  <span>Current Administrator Session</span>
                </div>
                <p className="mt-1 text-[11px] text-blue-800">
                  This account represents your active administrator credential. Self-deactivation and self-lockout are restricted.
                </p>
              </div>
            )}

            {/* Account Status & Action Cockpit */}
            <div className="flex items-center justify-between rounded-lg border border-line bg-surface p-4">
              <div>
                <div className="text-xs text-muted">Account Status</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <StatusBadge status={selectedUser.status} />
                  {selectedUser.status === 'locked' && (
                    <span className="text-[11px] font-bold text-quarantine">Locked Out</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedUser.status === 'locked' && (
                  <Button
                    variant="success"
                    className="text-xs gap-1"
                    onClick={openUnlockModal}
                  >
                    <Unlock size={13} />
                    Unlock
                  </Button>
                )}
                {!isSelf && selectedUser.status !== 'pending_activation' && (
                  <Button
                    variant="outline"
                    className={`text-xs ${selectedUser.status === 'active' ? 'text-quarantine hover:bg-quarantine-soft' : ''}`}
                    onClick={() => openStatusModal(selectedUser)}
                  >
                    {selectedUser.status === 'active' ? 'Deactivate' : 'Activate'}
                  </Button>
                )}
              </div>
            </div>

            {/* User Profile Attributes */}
            <div className="space-y-3 rounded-lg border border-line bg-white p-4 text-xs">
              <h3 className="font-bold uppercase tracking-wider text-navy flex items-center gap-1.5">
                <UsersIcon size={14} />
                User Account Profile
              </h3>
              <div className="flex justify-between border-b border-line pb-1.5">
                <span className="text-muted">User ID</span>
                <span className="font-mono font-semibold text-ink">{selectedUser.id}</span>
              </div>
              <div className="flex justify-between border-b border-line pb-1.5">
                <span className="text-muted">Full Legal Name</span>
                <span className="font-semibold text-ink">{selectedUser.name}</span>
              </div>
              <div className="flex justify-between border-b border-line pb-1.5">
                <span className="text-muted">Official Email</span>
                <span className="font-medium text-ink">{selectedUser.email}</span>
              </div>
              <div className="flex justify-between border-b border-line pb-1.5">
                <span className="text-muted">Assigned Platform Role</span>
                <span className="font-bold capitalize text-navy">{selectedUser.role}</span>
              </div>
              <div className="flex justify-between border-b border-line pb-1.5">
                <span className="text-muted">Organization Affiliation</span>
                <span className="font-semibold text-ink">
                  {selectedUser.orgName || 'Platform Staff (None)'}
                </span>
              </div>
              {selectedUser.orgType && (
                <div className="flex justify-between border-b border-line pb-1.5">
                  <span className="text-muted">Organization Type</span>
                  <span className="capitalize text-ink">{selectedUser.orgType}</span>
                </div>
              )}
              <div className="flex justify-between border-b border-line pb-1.5">
                <span className="text-muted">Account Registered</span>
                <span className="text-ink">
                  {selectedUser.createdAt ? new Date(selectedUser.createdAt).toLocaleString() : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Last Successful Login</span>
                <span className="text-ink">
                  {selectedUser.lastLoginAt ? new Date(selectedUser.lastLoginAt).toLocaleString() : 'Never'}
                </span>
              </div>
            </div>

            {/* Authentication & Security Telemetry */}
            <div className="space-y-3 rounded-lg border border-line bg-white p-4 text-xs">
              <h3 className="font-bold uppercase tracking-wider text-navy flex items-center gap-1.5">
                <KeyRound size={14} />
                Authentication &amp; Session Security
              </h3>
              <div className="flex justify-between border-b border-line pb-1.5">
                <span className="text-muted">Active Token Version</span>
                <span className="font-mono font-bold text-navy">v{selectedUser.tokenVersion ?? 1}</span>
              </div>
              <div className="flex justify-between border-b border-line pb-1.5">
                <span className="text-muted">Consecutive Failed Logins</span>
                <span className={`font-mono font-bold ${selectedUser.failedLoginAttempts > 0 ? 'text-quarantine' : 'text-emerald-800'}`}>
                  {selectedUser.failedLoginAttempts ?? 0}
                </span>
              </div>
              <div className="flex justify-between border-b border-line pb-1.5">
                <span className="text-muted">Security Lockout State</span>
                <span className="font-semibold text-ink">
                  {selectedUser.lockedUntil
                    ? `Locked until ${new Date(selectedUser.lockedUntil).toLocaleTimeString()}`
                    : 'Not locked'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Password Security</span>
                <span className="text-emerald-800 font-semibold flex items-center gap-1">
                  <ShieldCheck size={13} />
                  Bcrypt Cost 12 (Per-Hash Salt)
                </span>
              </div>
            </div>

            {/* Administrative Audit Trail */}
            <div className="space-y-3 rounded-lg border border-line bg-white p-4 text-xs">
              <h3 className="font-bold uppercase tracking-wider text-navy flex items-center gap-1.5">
                <Clock size={14} />
                Administrative Audit Trail
              </h3>
              {selectedUser.auditLogs && selectedUser.auditLogs.length > 0 ? (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {selectedUser.auditLogs.map(log => {
                    const actionLabel = (log.actionType || log.action_type) === 'USER_UNLOCKED'
                      ? 'Account Unlocked'
                      : 'Status Modified'
                    const prev = log.previousStatus || log.previous_status || '—'
                    const next = log.newStatus || log.new_status || '—'
                    const dateStr = log.createdAt || log.created_at
                    const adminIdent = log.adminName || log.admin_name || log.adminEmail || log.admin_email || 'Administrator'

                    return (
                      <div key={log.id} className="rounded border border-line bg-surface p-2.5 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-navy flex items-center gap-1">
                            {(log.actionType || log.action_type) === 'USER_UNLOCKED' ? (
                              <Unlock size={11} className="text-emerald-700" />
                            ) : (
                              <UserCheck size={11} className="text-navy" />
                            )}
                            {actionLabel}
                          </span>
                          <span className="text-[10px] text-muted">
                            {dateStr ? new Date(dateStr).toLocaleString() : ''}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-700">
                          <span className="text-muted">Transition:</span> <span className="capitalize">{prev}</span> &rarr; <span className="font-semibold capitalize text-navy">{next}</span>
                        </div>
                        <div className="text-[11px] text-slate-700">
                          <span className="text-muted">Justification:</span> {log.reason}
                        </div>
                        <div className="text-[10px] text-muted">
                          Authorized by: {adminIdent}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-muted text-[11px] italic">No administrative status modifications recorded for this user.</p>
              )}
            </div>
          </div>
        ) : null}
      </Drawer>

      {/* Account Status Mutation Modal */}
      <Modal
        open={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        title={`Change User Account Status: ${selectedUser?.name || ''}`}
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
              form="user-status-form"
              variant={targetStatus === 'inactive' ? 'outline' : 'primary'}
              disabled={statusSubmitting}
              className={targetStatus === 'inactive' ? 'text-quarantine border-quarantine hover:bg-quarantine-soft' : ''}
            >
              {statusSubmitting ? 'Updating...' : `Confirm ${targetStatus === 'inactive' ? 'Deactivation' : 'Activation'}`}
            </Button>
          </>
        }
      >
        <form id="user-status-form" onSubmit={handleStatusSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-navy mb-1">
              Select Target Account Status
            </label>
            <select
              value={targetStatus}
              onChange={e => setTargetStatus(e.target.value)}
              className="w-full rounded border border-line bg-white px-3 py-2 text-xs text-ink focus:border-navy focus:outline-none"
            >
              <option value="active">Active (Permit application authentication)</option>
              <option value="inactive">Inactive (Revoke tokens and suspend login access)</option>
            </select>
          </div>

          {targetStatus === 'inactive' && (
            <div
              role="alert"
              className="rounded-md border border-quarantine-line bg-quarantine-soft p-3 text-quarantine font-medium"
            >
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle size={14} />
                <span>Security Notice: Immediate Session Revocation</span>
              </div>
              <p className="mt-1">
                Deactivating this user will increment their security token version and immediately terminate any active sessions across all devices.
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

      {/* Account Unlock Modal */}
      <Modal
        open={unlockModalOpen}
        onClose={() => setUnlockModalOpen(false)}
        title={`Remediate Account Lockout: ${selectedUser?.email || ''}`}
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setUnlockModalOpen(false)}
              disabled={unlockSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="user-unlock-form"
              variant="success"
              disabled={unlockSubmitting}
            >
              {unlockSubmitting ? 'Unlocking...' : 'Confirm Account Unlock'}
            </Button>
          </>
        }
      >
        <form id="user-unlock-form" onSubmit={handleUnlockSubmit} className="space-y-4 text-xs">
          <div className="rounded-md border border-emerald-300 bg-clinical-soft p-3 text-emerald-900 font-medium">
            <div className="flex items-center gap-1.5 font-bold">
              <CheckCircle2 size={14} className="text-emerald-700" />
              <span>Lockout Remediation Protocol</span>
            </div>
            <p className="mt-1">
              Unlocking this account will reset failed login attempts to 0, clear any active lockout timer, and restore the account status to <strong>active</strong>.
            </p>
          </div>

          <div>
            <label className="block font-semibold text-navy mb-1">
              Administrative Unlock Reason <span className="text-quarantine">*</span>
            </label>
            <textarea
              rows={3}
              required
              value={unlockReason}
              onChange={e => {
                setUnlockReason(e.target.value)
                setUnlockError('')
              }}
              placeholder="Provide reason for regulatory audit log (e.g. Identity verified by administrator)..."
              className="w-full rounded border border-line bg-white p-2 text-xs text-ink placeholder-muted focus:border-navy focus:outline-none"
            />
          </div>

          {unlockError && (
            <p role="alert" className="text-xs font-semibold text-quarantine">
              {unlockError}
            </p>
          )}
        </form>
      </Modal>

      {/* Provisioning Info Modal */}
      <Modal
        open={provisionInfoOpen}
        onClose={() => setProvisionInfoOpen(false)}
        title="User Account Provisioning Standard"
        actions={
          <Button type="button" variant="secondary" onClick={() => setProvisionInfoOpen(false)}>
            Close
          </Button>
        }
      >
        <div className="space-y-4 text-xs text-slate-700">
          <p>
            User accounts in PharmaTrace AI are bound to licensed supply chain organizations and cannot be created as unassociated free-floating accounts without statutory entity affiliation.
          </p>
          <div className="rounded-lg border border-line bg-surface p-4 space-y-2">
            <h4 className="font-bold text-navy uppercase tracking-wider text-[11px]">
              Supported Provisioning Channels
            </h4>
            <ul className="list-disc list-inside space-y-1.5 text-muted">
              <li>
                <strong className="text-ink">Organization Registration:</strong> The primary contact person for an approved registration dossier automatically receives an activation invitation.
              </li>
              <li>
                <strong className="text-ink">Organization Portal Staff Onboarding:</strong> Authorized organization administrators invite operational staff within their permitted licensing role.
              </li>
              <li>
                <strong className="text-ink">System Administrator &amp; Investigation Officers:</strong> Platform governance accounts are provisioned via secure administrative database seeding.
              </li>
            </ul>
          </div>
        </div>
      </Modal>

      {/* Toast Feedback */}
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  )
}
