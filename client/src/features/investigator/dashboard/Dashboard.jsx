// PharmaTrace AI — Regulatory Investigation Dashboard
// Milestone M8 Implementation — Connected to Live MariaDB Backend
import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, ShieldAlert, RefreshCw, Filter, Search } from 'lucide-react'
import {
  PageHeader,
  MetricCard,
  DataTable,
  StatusBadge,
  Button,
  Drawer,
  Toast
} from '../../../components/ui'
import * as investigatorApi from '../../../services/investigatorApi'

const ALERT_TYPE_LABELS = {
  CLONED_QR_SUSPECT: 'Cloned QR suspect',
  DUPLICATE_SCAN_ANOMALY: 'Repeated scan anomaly',
  SHRINKAGE_SPIKE: 'Shrinkage spike',
  SHIPMENT_QUANTITY_DISCREPANCY: 'Shipment discrepancy',
  SHADOW_DIVERSION_RISK: 'Shadow diversion risk',
  BROKEN_CUSTODY_HISTORY: 'Broken custody history',
  GOVERNMENT_DIVERSION_ATTEMPT: 'Govt diversion attempt',
  GOVERNMENT_DIVERSION_INDICATOR: 'Govt diversion indicator',
  UNAUTHORIZED_DISPENSE_ATTEMPT: 'Unauthorized dispense attempt',
  UNAUTHORIZED_CUSTODY_ACTIVITY: 'Unauthorized custody activity'
}

const formatAlertType = (type) => ALERT_TYPE_LABELS[type] ?? String(type || '').replace(/_/g, ' ')

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Activity filter state
  const [activityEvents, setActivityEvents] = useState([])
  const [loadingActivity, setLoadingActivity] = useState(false)
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterOrg, setFilterOrg] = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [filterBatch, setFilterBatch] = useState('')
  const [filterSerial, setFilterSerial] = useState('')
  const [filterEventType, setFilterEventType] = useState('all')

  // Selected drawers
  const [selectedAlert, setSelectedAlert] = useState(null)
  const [selectedCase, setSelectedCase] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [actionErr, setActionErr] = useState('')
  const [toast, setToast] = useState('')

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await investigatorApi.getDashboard()
      setData(res)
    } catch (err) {
      setError(err.message || 'Failed to load investigation dashboard data.')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadActivity = useCallback(async () => {
    setLoadingActivity(true)
    try {
      const res = await investigatorApi.getActivity({
        dateFrom: filterDateFrom || undefined,
        dateTo: filterDateTo || undefined,
        orgId: filterOrg || undefined,
        productId: filterProduct || undefined,
        batchNo: filterBatch || undefined,
        serial: filterSerial || undefined,
        eventType: filterEventType !== 'all' ? filterEventType : undefined,
        limit: 15
      })
      setActivityEvents(res.events || [])
    } catch {
      // Non-blocking for activity
    } finally {
      setLoadingActivity(false)
    }
  }, [filterDateFrom, filterDateTo, filterOrg, filterProduct, filterBatch, filterSerial, filterEventType])

  useEffect(() => {
    loadDashboard()
    loadActivity()
  }, [loadDashboard, loadActivity])

  async function handleOpenInvestigation(alert) {
    if (submitting) return
    setSubmitting(true)
    setActionErr('')
    try {
      const newCase = await investigatorApi.createCase({
        alertId: alert.id,
        title: `${formatAlertType(alert.alert_type)} — ${alert.package_serial || alert.id}`,
        findings: `Opened from regulatory lead ${alert.id}: ${alert.summary}`,
        priority: alert.severity === 'CRITICAL' ? 'critical' : alert.severity === 'HIGH' ? 'high' : 'medium'
      })
      setToast(`Investigation case ${newCase.case_number} created for alert ${alert.id}.`)
      setSelectedAlert(null)
      loadDashboard()
    } catch (err) {
      setActionErr(err.message || 'Could not create investigation case.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleAlertStatus(alert) {
    if (submitting) return
    setSubmitting(true)
    setActionErr('')
    const nextStatus = alert.status === 'OPEN' ? 'RESOLVED' : 'OPEN'
    try {
      const updated = await investigatorApi.updateAlertStatus(alert.id, nextStatus)
      setToast(`Alert ${alert.id} marked as ${nextStatus}.`)
      setSelectedAlert(updated)
      loadDashboard()
    } catch (err) {
      setActionErr(err.message || 'Could not update alert status.')
    } finally {
      setSubmitting(false)
    }
  }

  const metrics = data?.metrics || {
    openAlerts: 0,
    highSeverityAlerts: 0,
    openInvestigations: 0,
    totalInvestigations: 0,
    publicReports: 0,
    pendingReports: 0,
    trackedPackages: 0,
    quarantinedPackages: 0,
    missingPackages: 0
  }

  const recentAlerts = data?.recentAlerts || []
  const recentCases = data?.recentCases || []
  const discrepantPackages = data?.discrepantPackages || []

  return (
    <>
      <PageHeader
        title="Regulatory Investigation Dashboard"
        description="Comprehensive real-time overview of active supply-chain leads, statutory anomalies, and enforcement cases."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={loadDashboard} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
              Refresh
            </Button>
            <Link to="/investigator/search">
              <Button variant="secondary">Traceability Search</Button>
            </Link>
            <Link to="/investigator/investigations">
              <Button variant="primary">Manage Cases</Button>
            </Link>
          </div>
        }
      />

      {error && (
        <div role="alert" className="mb-6 rounded-lg border border-quarantine-line bg-quarantine-soft p-4 text-sm font-semibold text-quarantine">
          {error}
        </div>
      )}

      <div
        role="note"
        className="mb-6 flex items-start gap-3 rounded-lg border border-amber-line bg-amber-soft px-4 py-3 text-sm text-amber-ink"
      >
        <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <span className="font-semibold">Advisory Lead Notice — Human Review Required:</span>{' '}
          Automated supply-chain anomaly signals highlight custody gaps and velocity variances for regulatory investigation.
          Under DGDA statutory guidelines, system alerts do not constitute automated legal proof of physical product counterfeiting.
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Open leads &amp; alerts"
          value={loading ? '—' : metrics.openAlerts}
          hint={`${metrics.highSeverityAlerts} high/critical priority`}
        />
        <MetricCard
          label="Active cases"
          value={loading ? '—' : metrics.openInvestigations}
          hint={`${metrics.totalInvestigations} total cases on file`}
        />
        <MetricCard
          label="Public reports"
          value={loading ? '—' : metrics.publicReports}
          hint={`${metrics.pendingReports} awaiting inspection`}
        />
        <MetricCard
          label="Tracked packages"
          value={loading ? '—' : metrics.trackedPackages}
          hint={`${metrics.quarantinedPackages} quarantined · ${metrics.missingPackages} missing`}
        />
      </div>

      <div className="space-y-6">
        {/* Open Alerts Section */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-navy">Priority Alerts &amp; Leads ({recentAlerts.length})</h2>
            <Link
              to="/investigator/alerts"
              className="inline-flex items-center gap-1 text-xs font-semibold text-clinical hover:underline"
            >
              View all alerts <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
          <DataTable
            rows={recentAlerts}
            empty={loading ? 'Loading active regulatory alerts...' : 'No open alerts requiring review.'}
            onRowClick={(row) => setSelectedAlert(row)}
            columns={[
              {
                key: 'id',
                label: 'Alert ID',
                render: (r) => <span className="id-text font-semibold">{r.id}</span>
              },
              {
                key: 'alert_type',
                label: 'Signal Type',
                render: (r) => formatAlertType(r.alert_type)
              },
              {
                key: 'target',
                label: 'Target Serial / Store',
                render: (r) => (
                  <span className="id-text whitespace-nowrap">
                    {r.package_serial || r.reported_store_name || 'Supply Chain'}
                  </span>
                )
              },
              {
                key: 'severity',
                label: 'Severity',
                render: (r) => <StatusBadge status={r.severity} />
              },
              {
                key: 'status',
                label: 'Status',
                render: (r) => <StatusBadge status={r.status} />
              },
              {
                key: 'created_at',
                label: 'Detected',
                render: (r) => (
                  <span className="id-text whitespace-nowrap">
                    {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                  </span>
                )
              }
            ]}
          />
        </section>

        {/* Active Investigation Cases Section */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-navy">Open Investigation Cases ({recentCases.length})</h2>
            <Link
              to="/investigator/investigations"
              className="inline-flex items-center gap-1 text-xs font-semibold text-clinical hover:underline"
            >
              View all cases <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
          <DataTable
            rows={recentCases}
            empty={loading ? 'Loading investigation cases...' : 'No open investigation cases on file.'}
            onRowClick={(row) => setSelectedCase(row)}
            columns={[
              {
                key: 'case_number',
                label: 'Case No',
                render: (r) => <span className="id-text font-semibold text-navy">{r.case_number}</span>
              },
              {
                key: 'title',
                label: 'Title',
                render: (r) => <span className="font-medium text-navy">{r.title}</span>
              },
              {
                key: 'priority',
                label: 'Priority',
                render: (r) => <StatusBadge status={r.priority} />
              },
              {
                key: 'assignee_name',
                label: 'Assignee',
                render: (r) => r.assignee_name || 'Unassigned'
              },
              {
                key: 'evidence_count',
                label: 'Evidence Items',
                render: (r) => <span className="id-text">{r.evidence_count ?? 0}</span>
              },
              {
                key: 'status',
                label: 'Status',
                render: (r) => <StatusBadge status={r.status} />
              },
              {
                key: 'created_at',
                label: 'Opened',
                render: (r) => (
                  <span className="id-text whitespace-nowrap">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                  </span>
                )
              }
            ]}
          />
        </section>

        {/* Real-time Activity Filter Feed */}
        <section className="rounded-lg border border-line bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-navy">Live Custody &amp; Traceability Feed</h2>
              <p className="text-xs text-muted">Chronological audit stream of supply chain transactions across all echelons.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="rounded border border-line px-2 py-1 text-xs"
                placeholder="From date"
                title="Date range start"
              />
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="rounded border border-line px-2 py-1 text-xs"
                placeholder="To date"
                title="Date range end"
              />
              <input
                type="text"
                value={filterOrg}
                onChange={(e) => setFilterOrg(e.target.value)}
                placeholder="Filter by organization..."
                className="rounded border border-line px-2 py-1 text-xs"
              />
              <input
                type="text"
                value={filterProduct}
                onChange={(e) => setFilterProduct(e.target.value)}
                placeholder="Filter by product..."
                className="rounded border border-line px-2 py-1 text-xs"
              />
              <input
                type="text"
                value={filterBatch}
                onChange={(e) => setFilterBatch(e.target.value)}
                placeholder="Filter by batch..."
                className="rounded border border-line px-2 py-1 text-xs"
              />
              <input
                type="text"
                value={filterSerial}
                onChange={(e) => setFilterSerial(e.target.value)}
                placeholder="Filter by serial..."
                className="id-text rounded border border-line px-2 py-1 text-xs"
              />
              <select
                value={filterEventType}
                onChange={(e) => setFilterEventType(e.target.value)}
                className="rounded border border-line px-2 py-1 text-xs"
              >
                <option value="all">All Events</option>
                <option value="SERIALIZED">SERIALIZED</option>
                <option value="QA_RELEASED">QA_RELEASED</option>
                <option value="DISPATCHED">DISPATCHED</option>
                <option value="RECEIVED">RECEIVED</option>
                <option value="QUARANTINED">QUARANTINED</option>
                <option value="DISPENSED">DISPENSED</option>
              </select>
              {(filterDateFrom || filterDateTo || filterOrg || filterProduct || filterBatch || filterSerial || filterEventType !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterDateFrom('')
                    setFilterDateTo('')
                    setFilterOrg('')
                    setFilterProduct('')
                    setFilterBatch('')
                    setFilterSerial('')
                    setFilterEventType('all')
                  }}
                  className="rounded bg-surface px-2 py-1 text-xs text-muted hover:text-ink hover:underline"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          <DataTable
            rows={activityEvents}
            empty={loadingActivity ? 'Querying traceability records...' : 'No custody events match selected filters.'}
            columns={[
              {
                key: 'serial',
                label: 'Serial',
                render: (r) => (
                  <Link to={`/investigator/search?q=${r.serial}`} className="id-text font-semibold text-clinical hover:underline">
                    {r.serial}
                  </Link>
                )
              },
              {
                key: 'event_type',
                label: 'Event Type',
                render: (r) => <StatusBadge status={r.event_type} />
              },
              {
                key: 'product_batch',
                label: 'Product / Batch',
                render: (r) => (
                  <div className="text-xs">
                    <div className="font-medium text-ink">{r.product_name || '—'}</div>
                    <div className="id-text text-muted">Batch: {r.batch_no || '—'}</div>
                  </div>
                )
              },
              {
                key: 'actor',
                label: 'Actor / Custodian',
                render: (r) => r.actor_org_name || r.actor_org_id || '—'
              },
              {
                key: 'target',
                label: 'Destination',
                render: (r) => r.target_org_name || r.target_org_id || '—'
              },
              {
                key: 'shipment',
                label: 'Shipment Ref',
                render: (r) => <span className="id-text text-muted">{r.shipment_ref || '—'}</span>
              },
              {
                key: 'created_at',
                label: 'Timestamp',
                render: (r) => (
                  <span className="id-text whitespace-nowrap text-xs">
                    {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                  </span>
                )
              }
            ]}
          />
        </section>

        {/* Quarantined & Discrepant Packages */}
        {discrepantPackages.length > 0 && (
          <section>
            <div className="mb-2">
              <h2 className="text-sm font-bold text-navy">Flagged Discrepancies &amp; Quarantined Inventory</h2>
              <p className="text-xs text-muted">Items withheld, rejected or missing during transport reconciliation.</p>
            </div>
            <DataTable
              rows={discrepantPackages}
              columns={[
                {
                  key: 'serial',
                  label: 'Serial',
                  render: (r) => <span className="id-text font-semibold">{r.serial}</span>
                },
                {
                  key: 'product_name',
                  label: 'Medicine',
                  render: (r) => `${r.product_name} (${r.batch_no})`
                },
                {
                  key: 'custodian_name',
                  label: 'Current Custodian',
                  render: (r) => r.custodian_name || '—'
                },
                {
                  key: 'status',
                  label: 'Package Status',
                  render: (r) => <StatusBadge status={r.status} />
                },
                {
                  key: 'verify_count',
                  label: 'Verifications',
                  render: (r) => <span className="id-text">{r.verify_count}</span>
                },
                {
                  key: 'shipment',
                  label: 'Shipment',
                  render: (r) => <span className="id-text text-muted">{r.current_shipment_ref || '—'}</span>
                }
              ]}
            />
          </section>
        )}
      </div>

      {/* Selected Alert Drawer */}
      <Drawer
        open={!!selectedAlert}
        onClose={() => setSelectedAlert(null)}
        title={selectedAlert ? `Alert ${selectedAlert.id}` : 'Alert Details'}
      >
        {selectedAlert && (
          <div className="space-y-5">
            <div className="flex items-start gap-2 rounded-md border border-amber-line bg-amber-soft p-3 text-xs text-amber-ink">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                <strong>Advisory Lead Notice — Human Verification Required.</strong> Confirm physical custody logs and regulatory manifests before initiating legal seizures or compliance enforcement.
              </span>
            </div>

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Signal Type</dt>
                <dd className="font-semibold">{formatAlertType(selectedAlert.alert_type)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Target Serial</dt>
                <dd className="id-text font-semibold">{selectedAlert.package_serial || 'None'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Severity</dt>
                <dd><StatusBadge status={selectedAlert.severity} /></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Status</dt>
                <dd><StatusBadge status={selectedAlert.status} /></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Suspect Organization</dt>
                <dd className="font-medium">{selectedAlert.suspect_org_name || 'Unspecified'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Detected</dt>
                <dd className="id-text">{new Date(selectedAlert.created_at).toLocaleString()}</dd>
              </div>
            </dl>

            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Summary</h3>
              <p className="rounded-md border border-line bg-surface p-3 text-sm font-medium">{selectedAlert.summary}</p>
            </div>

            {selectedAlert.details && (
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Triggering Evidence &amp; Findings</h3>
                <p className="rounded-md border border-line bg-surface p-3 text-sm text-ink">{selectedAlert.details}</p>
              </div>
            )}

            {selectedAlert.feature_attributions && (
              <div className="rounded-md border border-line bg-surface p-3 text-xs space-y-1.5">
                <h3 className="font-semibold uppercase tracking-wide text-muted">Detection Rule Specifications</h3>
                <div className="text-navy font-mono">
                  Rule: <strong>{selectedAlert.feature_attributions.rule || selectedAlert.alert_type}</strong>
                </div>
                {selectedAlert.feature_attributions.disposition_category && (
                  <div>Category: <span className="id-text">{selectedAlert.feature_attributions.disposition_category}</span></div>
                )}
                {selectedAlert.feature_attributions.note && (
                  <div className="text-muted italic">{selectedAlert.feature_attributions.note}</div>
                )}
                <div className="pt-1 text-[11px] text-muted border-t border-line">
                  Deterministic Rule Evaluation · Not ML Prediction
                </div>
              </div>
            )}

            {actionErr && (
              <p role="alert" className="rounded-md border border-quarantine-line bg-quarantine-soft p-2.5 text-xs font-semibold text-quarantine">
                {actionErr}
              </p>
            )}

            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button
                variant="primary"
                disabled={submitting}
                onClick={() => handleOpenInvestigation(selectedAlert)}
              >
                Open Investigation Case
              </Button>
              <Button
                variant="secondary"
                disabled={submitting}
                onClick={() => handleToggleAlertStatus(selectedAlert)}
              >
                {selectedAlert.status === 'OPEN' ? 'Mark Resolved' : 'Reopen Lead'}
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Selected Case Drawer */}
      <Drawer
        open={!!selectedCase}
        onClose={() => setSelectedCase(null)}
        title={selectedCase ? `Case ${selectedCase.case_number}` : 'Case Details'}
      >
        {selectedCase && (
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <StatusBadge status={selectedCase.status} />
                <StatusBadge status={selectedCase.priority} />
                <span className="id-text text-xs text-muted">
                  Opened {new Date(selectedCase.created_at).toLocaleDateString()}
                </span>
              </div>
              <h3 className="text-base font-bold text-navy">{selectedCase.title}</h3>
              <p className="mt-1 text-xs text-muted">
                Assignee: {selectedCase.assignee_name || 'Unassigned'}
              </p>
            </div>

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Target Serial</dt>
                <dd className="id-text font-semibold">{selectedCase.package_serial || '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Linked Alert</dt>
                <dd className="id-text">{selectedCase.alert_id || 'Manual'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Evidence Items Attached</dt>
                <dd className="id-text font-semibold">{selectedCase.evidence_count ?? 0}</dd>
              </div>
            </dl>

            <div className="border-t border-line pt-4">
              <Link to="/investigator/investigations">
                <Button variant="primary">Open Full Case Dossier</Button>
              </Link>
            </div>
          </div>
        )}
      </Drawer>

      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </>
  )
}
