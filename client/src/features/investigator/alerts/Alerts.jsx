// PharmaTrace AI — Regulatory Alerts & Detection Leads
// Milestone M8 Implementation — Connected to Live MariaDB Backend
import { useEffect, useMemo, useState, useCallback } from 'react'
import { AlertTriangle, ShieldAlert, RefreshCw, Cpu } from 'lucide-react'
import {
  PageHeader,
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

const REPORT_TYPE_LABELS = {
  GOVERNMENT_MEDICINE_DIVERSION: 'Government medicine diversion',
  COUNTERFEIT_SUSPECTED: 'Suspected counterfeit product',
  EXPIRED_PRODUCT: 'Expired product for sale',
  PACKAGING_DEFECT: 'Packaging / seal defect',
  OTHER: 'General field report'
}

const formatLabel = (map, val) => map[val] ?? String(val ?? '').replace(/_/g, ' ')

export default function Alerts() {
  const [alerts, setAlerts] = useState([])
  const [reports, setReports] = useState([])
  const [totalAlerts, setTotalAlerts] = useState(0)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')

  // Filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [selectedAlert, setSelectedAlert] = useState(null)
  const [selectedReport, setSelectedReport] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [actionErr, setActionErr] = useState('')
  const [toast, setToast] = useState('')

  const loadAlerts = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await investigatorApi.getAlerts({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        severity: severityFilter !== 'all' ? severityFilter : undefined,
        limit: 100
      })
      setAlerts(res.alerts || [])
      setTotalAlerts(res.total || 0)
      setReports(res.reports || [])
    } catch (err) {
      setError(err.message || 'Failed to load regulatory alerts from backend.')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, severityFilter])

  useEffect(() => {
    loadAlerts()
  }, [loadAlerts])

  async function handleEvaluateRules() {
    if (scanning) return
    setScanning(true)
    try {
      const res = await investigatorApi.runAlertScan()
      const newCount = res.newAlertsGenerated || 0
      setToast(`Detection engine evaluated 5 statutory rules. ${newCount} new alert(s) generated.`)
      loadAlerts()
    } catch (err) {
      setError(err.message || 'Anomaly scan execution failed.')
    } finally {
      setScanning(false)
    }
  }

  async function handleOpenInvestigationFromAlert(alert) {
    if (submitting) return
    setSubmitting(true)
    setActionErr('')
    try {
      const created = await investigatorApi.createCase({
        alertId: alert.id,
        title: `${formatLabel(ALERT_TYPE_LABELS, alert.alert_type)} — ${alert.package_serial || alert.id}`,
        findings: `Opened from advisory alert ${alert.id}: ${alert.summary}`,
        priority: alert.severity === 'CRITICAL' ? 'critical' : alert.severity === 'HIGH' ? 'high' : 'medium'
      })
      setToast(`Investigation case ${created.case_number} opened for alert ${alert.id}.`)
      setSelectedAlert(null)
      loadAlerts()
    } catch (err) {
      setActionErr(err.message || 'Could not open investigation case.')
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
      loadAlerts()
    } catch (err) {
      setActionErr(err.message || 'Could not update alert status.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleOpenInvestigationFromReport(report) {
    if (submitting) return
    setSubmitting(true)
    setActionErr('')
    const serialLabel = report.package_serial?.trim() || 'Unspecified package'
    try {
      const created = await investigatorApi.createCase({
        title: `Public report ${report.report_number} — ${serialLabel}`,
        findings: `Consumer report (${formatLabel(REPORT_TYPE_LABELS, report.report_type)}): ${report.description}`,
        priority: report.report_type === 'GOVERNMENT_MEDICINE_DIVERSION' ? 'critical' : 'medium',
        evidence: [
          {
            evidenceType: 'reported_allegation',
            description: `Field report ${report.report_number} filed for ${report.reported_store_name} (${report.city_district}): ${report.description}`,
            sourceRef: report.report_number
          }
        ]
      })
      setToast(`Investigation case ${created.case_number} opened from report ${report.report_number}.`)
      setSelectedReport(null)
    } catch (err) {
      setActionErr(err.message || 'Could not open investigation from public report.')
    } finally {
      setSubmitting(false)
    }
  }

  const statusTabs = [
    { key: 'all', label: `All Alerts (${totalAlerts})` },
    { key: 'OPEN', label: 'Open' },
    { key: 'INVESTIGATING', label: 'Investigating' },
    { key: 'RESOLVED', label: 'Resolved' }
  ]

  return (
    <>
      <PageHeader
        title="Supply-Chain Alerts &amp; Regulatory Signals"
        description="Persistent evidence-based regulatory alerts evaluated against actual MariaDB custody events and detection rules."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={handleEvaluateRules}
              disabled={scanning}
            >
              <Cpu size={14} className={scanning ? 'animate-spin' : ''} aria-hidden="true" />
              {scanning ? 'Evaluating Rules...' : 'Run Anomaly Scan'}
            </Button>
            <Button
              variant="secondary"
              onClick={loadAlerts}
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
              Refresh
            </Button>
          </div>
        }
      />

      {error && (
        <div role="alert" className="mb-5 rounded-lg border border-quarantine-line bg-quarantine-soft p-3 text-sm font-semibold text-quarantine">
          {error}
        </div>
      )}

      <div
        role="note"
        className="mb-5 flex items-start gap-3 rounded-lg border border-amber-line bg-amber-soft px-4 py-3 text-sm text-amber-ink"
      >
        <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <span className="font-semibold">Statutory Advisory Lead:</span>{' '}
          All automated alerts represent deterministic rule-based indicators derived from verified supply chain logs.
          Signals require human investigator verification before enforcement or administrative action.
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter alerts by status">
          {statusTabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={statusFilter === tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`rounded-md border px-3 py-1.5 text-sm font-semibold transition ${
                statusFilter === tab.key
                  ? 'border-navy bg-navy text-white'
                  : 'border-line bg-white text-ink hover:bg-surface'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium text-muted">Severity</span>
          <select
            aria-label="Filter by severity"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="rounded-md border border-line bg-white px-3 py-1.5 text-sm"
          >
            <option value="all">All severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </label>
      </div>

      <DataTable
        rows={alerts}
        empty={loading ? 'Querying regulatory alerts...' : 'No alerts match the selected filters.'}
        onRowClick={(row) => setSelectedAlert(row)}
        columns={[
          {
            key: 'id',
            label: 'ID',
            render: (r) => <span className="id-text font-semibold">{r.id}</span>
          },
          {
            key: 'alert_type',
            label: 'Rule Type',
            render: (r) => formatLabel(ALERT_TYPE_LABELS, r.alert_type)
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
            label: 'Detected At',
            render: (r) => (
              <span className="id-text whitespace-nowrap text-xs">
                {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
              </span>
            )
          }
        ]}
      />

      <section className="mt-8">
        <div className="mb-2">
          <h2 className="text-base font-bold text-navy">Public Field Reports ({reports.length})</h2>
          <p className="text-xs text-muted">
            Incoming consumer and healthcare facility reports submitted via public verification. Treat as unverified leads until corroborated.
          </p>
        </div>
        <DataTable
          rows={reports}
          empty="No public field reports submitted."
          onRowClick={(row) => setSelectedReport(row)}
          columns={[
            {
              key: 'report_number',
              label: 'Report No',
              render: (r) => <span className="id-text font-semibold">{r.report_number}</span>
            },
            {
              key: 'package_serial',
              label: 'Serial',
              render: (r) => <span className="id-text whitespace-nowrap">{r.package_serial || '—'}</span>
            },
            {
              key: 'report_type',
              label: 'Report Category',
              render: (r) => formatLabel(REPORT_TYPE_LABELS, r.report_type)
            },
            {
              key: 'reported_store_name',
              label: 'Reported Store / Location',
              render: (r) => `${r.reported_store_name} (${r.city_district})`
            },
            {
              key: 'status',
              label: 'Status',
              render: (r) => <StatusBadge status={r.status} />
            },
            {
              key: 'created_at',
              label: 'Filed',
              render: (r) => (
                <span className="id-text whitespace-nowrap text-xs">
                  {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                </span>
              )
            }
          ]}
        />
      </section>

      {/* Alert Drawer */}
      <Drawer
        open={!!selectedAlert}
        onClose={() => setSelectedAlert(null)}
        title={selectedAlert ? `Regulatory Alert ${selectedAlert.id}` : 'Alert Details'}
      >
        {selectedAlert && (
          <div className="space-y-5">
            <div className="flex items-start gap-2 rounded-md border border-amber-line bg-amber-soft p-3 text-xs text-amber-ink">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                <strong>Advisory Lead — Human Review Required.</strong> Verify supply-chain manifests and custody history before initiating enforcement.
              </span>
            </div>

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Alert ID</dt>
                <dd className="id-text font-semibold">{selectedAlert.id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Rule Type</dt>
                <dd className="font-semibold">{formatLabel(ALERT_TYPE_LABELS, selectedAlert.alert_type)}</dd>
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
                <dt className="text-muted">Detected At</dt>
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

            {selectedAlert.linked_cases && selectedAlert.linked_cases.length > 0 && (
              <div className="rounded-md border border-line bg-surface p-3 text-sm">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Linked Cases</h3>
                <ul className="space-y-1.5">
                  {selectedAlert.linked_cases.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        <span className="id-text font-semibold">{c.case_number || c.id}</span> · {c.title}
                      </span>
                      <StatusBadge status={c.status} />
                    </li>
                  ))}
                </ul>
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
                onClick={() => handleOpenInvestigationFromAlert(selectedAlert)}
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

      {/* Public Report Drawer */}
      <Drawer
        open={!!selectedReport}
        onClose={() => setSelectedReport(null)}
        title={selectedReport ? `Public Report ${selectedReport.report_number}` : 'Public Report'}
      >
        {selectedReport && (
          <div className="space-y-5">
            <div className="flex items-start gap-2 rounded-md border border-amber-line bg-amber-soft p-3 text-xs text-amber-ink">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                <strong>Unverified Consumer Submission.</strong> Public reports reflect field claims until corroborated through physical inspection.
              </span>
            </div>

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Report No</dt>
                <dd className="id-text font-semibold">{selectedReport.report_number}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Category</dt>
                <dd className="font-semibold">{formatLabel(REPORT_TYPE_LABELS, selectedReport.report_type)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Target Serial</dt>
                <dd className="id-text font-semibold">{selectedReport.package_serial || 'None provided'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Store Name</dt>
                <dd className="font-medium">{selectedReport.reported_store_name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Store Address</dt>
                <dd className="text-right text-xs">{selectedReport.reported_store_address}, {selectedReport.city_district}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Status</dt>
                <dd><StatusBadge status={selectedReport.status} /></dd>
              </div>
            </dl>

            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Allegation Description</h3>
              <p className="rounded-md border border-line bg-surface p-3 text-sm">{selectedReport.description}</p>
            </div>

            {actionErr && (
              <p role="alert" className="rounded-md border border-quarantine-line bg-quarantine-soft p-2.5 text-xs font-semibold text-quarantine">
                {actionErr}
              </p>
            )}

            <div className="border-t border-line pt-4">
              <Button
                variant="primary"
                disabled={submitting}
                onClick={() => handleOpenInvestigationFromReport(selectedReport)}
              >
                Open Investigation from Report
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </>
  )
}
