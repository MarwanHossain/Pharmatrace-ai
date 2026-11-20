// PharmaTrace AI — Platform Administration Dashboard
// 100% Live MariaDB-backed administrative cockpit aggregating registration metrics, organizations, user accounts, and chronological audit telemetry

import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ShieldAlert,
  Building2,
  RefreshCw,
  ClipboardCheck,
  Clock,
  FileQuestion,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Users as UsersIcon,
  ShieldCheck,
  History,
  Lock,
  ArrowRight,
  ExternalLink,
  Activity
} from 'lucide-react'
import { PageHeader, MetricCard, StatusBadge, Button } from '../../../components/ui'
import { getDashboardSummary, getDashboardActivity } from '../../../services/adminDashboardApi'

const STATUS_ICONS = {
  SUBMITTED: Clock,
  UNDER_REVIEW: RefreshCw,
  INFORMATION_REQUESTED: FileQuestion,
  APPROVED: CheckCircle2,
  REJECTED: XCircle
}

export default function Dashboard() {
  const navigate = useNavigate()

  // Live Summary State
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)

  // Live Activity State
  const [activityLoading, setActivityLoading] = useState(true)
  const [activityError, setActivityError] = useState('')
  const [activityDays, setActivityDays] = useState('')
  const [activityItems, setActivityItems] = useState([])

  const fetchSummary = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getDashboardSummary()
      setSummary(res)
    } catch (err) {
      setError(err.message || 'Failed to fetch administrative dashboard summary.')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchActivity = useCallback(async () => {
    setActivityLoading(true)
    setActivityError('')
    try {
      const res = await getDashboardActivity({
        limit: 15,
        days: activityDays ? parseInt(activityDays, 10) : undefined
      })
      setActivityItems(res.items || [])
    } catch (err) {
      setActivityError(err.message || 'Failed to fetch recent audit activity.')
    } finally {
      setActivityLoading(false)
    }
  }, [activityDays])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  useEffect(() => {
    fetchActivity()
  }, [fetchActivity])

  const reg = summary?.registrations || {}
  const orgs = summary?.organizations || {}
  const users = summary?.users || {}
  const breakdown = summary?.organizationBreakdown || []

  return (
    <div className="space-y-8">
      <PageHeader
        title="Platform Administration Dashboard"
        description="System-wide regulatory overview of organization registrations, provisioned supply chain entities, platform users, and audit events."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={loading || activityLoading}
              onClick={() => {
                fetchSummary()
                fetchActivity()
              }}
              className="gap-1.5 text-xs"
            >
              <RefreshCw size={13} className={loading || activityLoading ? 'animate-spin' : ''} />
              Refresh Dashboard
            </Button>
            <Link
              to="/admin/registrations"
              className="inline-flex items-center gap-1.5 rounded-md bg-navy px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
            >
              <ClipboardCheck size={14} />
              Registration Queue
            </Link>
          </div>
        }
      />

      {/* Global Error Banner if initial fetch fails */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-quarantine-line bg-quarantine-soft p-4 text-xs font-medium text-quarantine"
        >
          <AlertTriangle size={16} className="shrink-0" />
          <div className="flex-1">
            <span className="font-bold">Error loading live dashboard telemetry:</span> {error}
          </div>
          <Button variant="outline" onClick={fetchSummary} className="text-xs">
            Retry
          </Button>
        </div>
      )}

      {/* SECTION 1: LIVE REGULATORY REGISTRATION METRICS */}
      <div className="rounded-lg border border-navy/20 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={18} className="text-navy" />
            <h2 className="text-sm font-bold text-navy">
              Organization Registration Queue Status
            </h2>
            <span className="rounded bg-clinical-soft border border-emerald-300 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
              Live MariaDB Database
            </span>
          </div>
          <Link
            to="/admin/registrations"
            className="inline-flex items-center gap-1 text-xs font-semibold text-clinical hover:underline"
          >
            <span>Review Applications</span>
            <ArrowRight size={12} />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {/* Total Applications */}
          <div
            onClick={() => navigate('/admin/registrations')}
            className="cursor-pointer rounded-lg border border-line bg-surface p-3.5 transition hover:border-slate-400"
          >
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Total Submissions</div>
            <div className="mt-1 text-2xl font-black text-navy">{loading ? '…' : reg.total ?? 0}</div>
            <div className="mt-1 text-[11px] text-muted">All registered entities</div>
          </div>

          {/* Submitted */}
          <div
            onClick={() => navigate('/admin/registrations?status=SUBMITTED')}
            className="cursor-pointer rounded-lg border border-blue-200 bg-blue-50/60 p-3.5 transition hover:border-blue-400"
          >
            <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-blue-900">
              <Clock size={12} />
              <span>Submitted</span>
            </div>
            <div className="mt-1 text-2xl font-black text-blue-900">{loading ? '…' : reg.submitted ?? 0}</div>
            <div className="mt-1 text-[11px] font-semibold text-blue-700">Awaiting initial triage</div>
          </div>

          {/* Under Review */}
          <div
            onClick={() => navigate('/admin/registrations?status=UNDER_REVIEW')}
            className="cursor-pointer rounded-lg border border-amber-line bg-amber-soft/60 p-3.5 transition hover:border-amber-400"
          >
            <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-amber-ink">
              <RefreshCw size={12} />
              <span>Under Review</span>
            </div>
            <div className="mt-1 text-2xl font-black text-amber-ink">{loading ? '…' : reg.underReview ?? 0}</div>
            <div className="mt-1 text-[11px] text-muted">Assigned for evaluation</div>
          </div>

          {/* Information Requested */}
          <div
            onClick={() => navigate('/admin/registrations?status=INFORMATION_REQUESTED')}
            className="cursor-pointer rounded-lg border border-amber-line bg-amber-soft/40 p-3.5 transition hover:border-amber-400"
          >
            <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-amber-ink">
              <FileQuestion size={12} />
              <span>Info Requested</span>
            </div>
            <div className="mt-1 text-2xl font-black text-amber-ink">{loading ? '…' : reg.infoRequested ?? 0}</div>
            <div className="mt-1 text-[11px] text-muted">Awaiting applicant response</div>
          </div>

          {/* Approved */}
          <div
            onClick={() => navigate('/admin/registrations?status=APPROVED')}
            className="cursor-pointer rounded-lg border border-emerald-300 bg-clinical-soft/70 p-3.5 transition hover:border-emerald-500"
          >
            <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-emerald-900">
              <CheckCircle2 size={12} />
              <span>Approved</span>
            </div>
            <div className="mt-1 text-2xl font-black text-emerald-900">{loading ? '…' : reg.approved ?? 0}</div>
            <div className="mt-1 text-[11px] font-semibold text-emerald-800">Provisioned in MariaDB</div>
          </div>

          {/* Rejected */}
          <div
            onClick={() => navigate('/admin/registrations?status=REJECTED')}
            className="cursor-pointer rounded-lg border border-quarantine-line bg-quarantine-soft/70 p-3.5 transition hover:border-quarantine"
          >
            <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-quarantine">
              <XCircle size={12} />
              <span>Rejected</span>
            </div>
            <div className="mt-1 text-2xl font-black text-quarantine">{loading ? '…' : reg.rejected ?? 0}</div>
            <div className="mt-1 text-[11px] text-muted">Formally declined</div>
          </div>
        </div>
      </div>

      {/* SECTION 2: LIVE ORGANIZATIONS & SUPPLY CHAIN NETWORK */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-navy flex items-center gap-2">
              <Building2 size={16} />
              Supply Chain Organizations Registry
            </h2>
            <p className="text-xs text-muted">
              Live supply chain entity records and category distributions in MariaDB
            </p>
          </div>
          <Link
            to="/admin/organizations"
            className="inline-flex items-center gap-1 text-xs font-semibold text-clinical hover:underline"
          >
            <span>Manage Organizations</span>
            <ArrowRight size={12} />
          </Link>
        </div>

        {/* Global Summary Cards */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard
            label="Total Organizations"
            value={loading ? '…' : orgs.total ?? 0}
            hint="Provisioned entities"
          />
          <MetricCard
            label="Active Entities"
            value={loading ? '…' : orgs.active ?? 0}
            hint="Full operational access"
            className="border-emerald-200"
          />
          <MetricCard
            label="Suspended"
            value={loading ? '…' : orgs.suspended ?? 0}
            hint="Tokens & access revoked"
            className="border-amber-line"
          />
          <MetricCard
            label="Decommissioned"
            value={loading ? '…' : orgs.decommissioned ?? 0}
            hint="Permanently retired"
          />
        </div>

        {/* Category Breakdown */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {breakdown.map(cat => (
            <div
              key={cat.type}
              onClick={() => navigate(`/admin/organizations?type=${cat.type.toLowerCase()}`)}
              className="cursor-pointer rounded-lg border border-line bg-white p-4 transition hover:border-slate-400 hover:shadow-xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-navy capitalize">
                  {cat.type}
                </span>
                <Building2 size={15} className="text-muted" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black text-navy">{cat.orgCount}</span>
                <span className="text-xs font-semibold text-emerald-800">
                  {cat.activeCount} active
                </span>
              </div>
              <div className="mt-2 border-t border-line pt-2 text-[11px] text-muted flex items-center justify-between">
                <span>Linked Users</span>
                <span className="font-mono font-bold text-slate-800">{cat.userCount}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 3: USER ACCOUNTS & GOVERNANCE */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-navy flex items-center gap-2">
              <UsersIcon size={16} />
              User Accounts &amp; Access Governance
            </h2>
            <p className="text-xs text-muted">
              Database-backed platform credentials, security token versions, and lockout telemetry
            </p>
          </div>
          <Link
            to="/admin/users"
            className="inline-flex items-center gap-1 text-xs font-semibold text-clinical hover:underline"
          >
            <span>Manage Users</span>
            <ArrowRight size={12} />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <MetricCard
            label="Total Accounts"
            value={loading ? '…' : users.total ?? 0}
            hint="Database credentials"
          />
          <MetricCard
            label="Active Users"
            value={loading ? '…' : users.active ?? 0}
            hint="Permitted authentication"
            className="border-emerald-200"
          />
          <MetricCard
            label="Pending Activation"
            value={loading ? '…' : users.pendingActivation ?? 0}
            hint="Awaiting initial invite"
            className="border-blue-200"
          />
          <MetricCard
            label="Locked Out"
            value={loading ? '…' : users.locked ?? 0}
            hint="Exceeded failed logins"
            className="border-quarantine-line"
          />
          <MetricCard
            label="Inactive"
            value={loading ? '…' : users.inactive ?? 0}
            hint="Revoked login sessions"
          />
        </div>
      </div>

      {/* SECTION 4: RECENT REGULATORY AUDIT ACTIVITY */}
      <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <History size={16} className="text-navy" />
            <h2 className="text-sm font-bold text-navy">
              Recent Regulatory &amp; Application Audit Stream
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted font-medium">Filter:</label>
            <select
              value={activityDays}
              onChange={e => setActivityDays(e.target.value)}
              className="rounded border border-line bg-white px-2 py-1 text-xs text-ink focus:border-navy focus:outline-none"
            >
              <option value="">All Time</option>
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
            </select>
          </div>
        </div>

        {activityLoading ? (
          <div className="py-8 text-center text-muted">
            <RefreshCw size={18} className="mx-auto mb-2 animate-spin text-navy" />
            <span className="text-xs">Fetching chronological audit entries...</span>
          </div>
        ) : activityError ? (
          <div className="rounded border border-quarantine-line bg-quarantine-soft p-3 text-xs text-quarantine">
            {activityError}
          </div>
        ) : activityItems.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted">
            No audit activities recorded {activityDays ? `in the last ${activityDays} days` : 'in the audit log'}.
          </div>
        ) : (
          <div className="space-y-3">
            {activityItems.map(item => (
              <div
                key={item.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded border border-line p-3 hover:bg-slate-50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-navy">
                      {item.referenceNumber || 'REG-SYS'}
                    </span>
                    <span className="font-semibold text-ink text-xs truncate">
                      {item.orgName || 'Organization Registration'}
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-mono text-slate-700 uppercase">
                      {item.actionType}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    <span className="text-muted">Actor:</span> <strong className="text-ink">{item.actorName || item.actorRole}</strong>
                    {item.fromStatus && item.toStatus && (
                      <span className="ml-2 font-mono text-[11px] text-slate-500">
                        [{item.fromStatus} → {item.toStatus}]
                      </span>
                    )}
                    {item.comment && (
                      <span className="ml-2 text-slate-700 italic">
                        "{item.comment}"
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] text-muted">
                    {item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}
                  </span>
                  {item.registrationId && (
                    <Link
                      to={`/admin/registrations/${item.registrationId}`}
                      className="inline-flex items-center gap-1 rounded border border-line bg-white px-2 py-1 text-xs font-semibold text-navy hover:bg-slate-100 transition shadow-xs"
                    >
                      <span>Dossier</span>
                      <ExternalLink size={11} />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
