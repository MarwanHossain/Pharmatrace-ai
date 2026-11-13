import { useMemo, useState } from 'react'
import { AlertTriangle, ShieldAlert } from 'lucide-react'
import {
  PageHeader,
  DataTable,
  StatusBadge,
  Button,
  Drawer,
  Toast
} from '../../../components/ui'
import { useDemoData } from '../../../contexts/DemoData'
import { TODAY } from '../../../data/fixtures'

const ALERT_TYPE_LABELS = {
  repeated_scan: 'Repeated scan',
  incomplete_traceability: 'Incomplete traceability',
  expired_in_stock: 'Expired in stock',
  unusual_pattern: 'Unusual pattern'
}

const REPORT_TYPE_LABELS = {
  suspicious_origin: 'Suspicious origin',
  damaged_packaging: 'Damaged packaging'
}

const formatLabel = (map, val) => map[val] ?? String(val ?? '').replace(/_/g, ' ')

export default function Alerts() {
  const {
    alerts,
    reports,
    packages,
    batches,
    investigations,
    orgName,
    productOf,
    createInvestigation,
    updateAlert
  } = useDemoData()

  const [statusFilter, setStatusFilter] = useState('all')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [selectedAlertId, setSelectedAlertId] = useState(null)
  const [selectedReportId, setSelectedReportId] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [actionErr, setActionErr] = useState('')
  const [toast, setToast] = useState('')

  const filteredAlerts = useMemo(
    () =>
      alerts.filter((a) => {
        if (statusFilter !== 'all' && a.status !== statusFilter) return false
        if (severityFilter !== 'all' && a.severity !== severityFilter) return false
        return true
      }),
    [alerts, statusFilter, severityFilter]
  )

  const sel = alerts.find((a) => a.id === selectedAlertId) ?? null
  const selReport = reports.find((r) => r.id === selectedReportId) ?? null

  const linkedPkg = sel?.serial ? packages.find((p) => p.serial === sel.serial) : null
  const linkedBatch = linkedPkg
    ? batches.find((b) => b.id === linkedPkg.batchId)
    : sel?.batchNo
      ? batches.find((b) => b.no === sel.batchNo)
      : null
  const linkedCases = sel ? investigations.filter((inv) => inv.alertId === sel.id) : []

  const reportPkg = selReport?.serial
    ? packages.find((p) => p.serial === selReport.serial)
    : null
  const reportBatch = reportPkg ? batches.find((b) => b.id === reportPkg.batchId) : null

  async function openInvestigationFromAlert(alert) {
    if (submitting) return
    setSubmitting(true)
    setActionErr('')
    try {
      const inv = await createInvestigation({
        alertId: alert.id,
        title: `${formatLabel(ALERT_TYPE_LABELS, alert.type)} — ${alert.serial || alert.batchNo || alert.id}`,
        findings: `Opened from advisory alert ${alert.id}: ${alert.description}`
      })
      if (!inv || inv.ok === false) {
        setActionErr(inv?.error || 'Could not open investigation.')
        return
      }
      setToast(`Investigation ${inv.id} opened for alert ${alert.id}.`)
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleAlertStatus(alert) {
    if (submitting) return
    setSubmitting(true)
    setActionErr('')
    const nextStatus = alert.status === 'open' ? 'resolved' : 'open'
    try {
      const res = await updateAlert(alert.id, {
        status: nextStatus,
        resolvedDate: nextStatus === 'resolved' ? TODAY : undefined
      })
      if (!res || res.ok === false) {
        setActionErr(res?.error || 'Could not update alert status.')
        return
      }
      setToast(
        nextStatus === 'resolved'
          ? `Alert ${alert.id} marked resolved.`
          : `Alert ${alert.id} reopened.`
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function openInvestigationFromReport(report) {
    if (submitting) return
    setSubmitting(true)
    setActionErr('')
    const serialLabel = report.serial?.trim() || 'Unspecified package'
    try {
      const inv = await createInvestigation({
        alertId: null,
        title: `Public report ${report.id} — ${serialLabel}`,
        findings: `Consumer report (${formatLabel(REPORT_TYPE_LABELS, report.type)}): ${report.description}`,
        evidence: [
          report.serial?.trim()
            ? `Public report ${report.id} submitted ${report.created} for ${report.serial.trim()}`
            : `Public report ${report.id} submitted ${report.created} (no serial provided)`
        ]
      })
      if (!inv || inv.ok === false) {
        setActionErr(inv?.error || 'Could not open investigation from report.')
        return
      }
      setToast(`Investigation ${inv.id} opened from public report ${report.id}.`)
    } finally {
      setSubmitting(false)
    }
  }

  const statusTabs = [
    { key: 'all', label: `All (${alerts.length})` },
    { key: 'open', label: `Open (${alerts.filter((a) => a.status === 'open').length})` },
    { key: 'resolved', label: `Resolved (${alerts.filter((a) => a.status === 'resolved').length})` }
  ]

  return (
    <>
      <PageHeader
        title="Supply-Chain Alerts & Leads"
        description="Automated anomaly signals are an advisory lead — requires investigator review and never automated proof of counterfeiting."
      />

      <div
        role="note"
        className="mb-5 flex items-start gap-3 rounded-lg border border-amber-line bg-amber-soft px-4 py-3 text-sm text-amber-ink"
      >
        <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <span className="font-semibold">Advisory lead — requires investigator review.</span>{' '}
          Repeated scans, velocity anomalies, or incomplete custody logs can occur from benign
          operational issues. Confirm findings through custody records before taking action.
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
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
      </div>

      <DataTable
        rows={filteredAlerts}
        empty="No alerts match the selected filters."
        onRowClick={(row) => setSelectedAlertId(row.id)}
        columns={[
          {
            key: 'id',
            label: 'ID',
            render: (r) => <span className="id-text font-semibold">{r.id}</span>
          },
          {
            key: 'type',
            label: 'Type',
            render: (r) => formatLabel(ALERT_TYPE_LABELS, r.type)
          },
          {
            key: 'target',
            label: 'Target',
            render: (r) => (
              <span className="id-text whitespace-nowrap">
                {r.serial || r.batchNo || 'Network'}
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
            key: 'created',
            label: 'Created',
            render: (r) => <span className="id-text whitespace-nowrap">{r.created}</span>
          }
        ]}
      />

      <section className="mt-8">
        <div className="mb-2">
          <h2 className="text-base font-bold text-navy">Public Reports ({reports.length})</h2>
          <p className="text-xs text-muted">
            Incoming consumer and field reports submitted via public verification. Treat as
            unverified leads until inspected.
          </p>
        </div>
        <DataTable
          rows={reports}
          empty="No public reports submitted."
          onRowClick={(row) => setSelectedReportId(row.id)}
          columns={[
            {
              key: 'id',
              label: 'ID',
              render: (r) => <span className="id-text font-semibold">{r.id}</span>
            },
            {
              key: 'serial',
              label: 'Serial',
              render: (r) => (
                <span className="id-text whitespace-nowrap">{r.serial || '—'}</span>
              )
            },
            {
              key: 'type',
              label: 'Report Type',
              render: (r) => formatLabel(REPORT_TYPE_LABELS, r.type)
            },
            {
              key: 'reporter',
              label: 'Reporter'
            },
            {
              key: 'status',
              label: 'Status',
              render: (r) => <StatusBadge status={r.status} />
            },
            {
              key: 'created',
              label: 'Created',
              render: (r) => <span className="id-text whitespace-nowrap">{r.created}</span>
            }
          ]}
        />
      </section>

      <Drawer
        open={!!sel}
        onClose={() => setSelectedAlertId(null)}
        title={sel ? `Alert ${sel.id}` : 'Alert details'}
      >
        {sel && (
          <div className="space-y-5">
            <div className="flex items-start gap-2 rounded-md border border-amber-line bg-amber-soft p-3 text-xs text-amber-ink">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                <strong>Advisory lead — requires investigator review.</strong> This automated signal
                is not proof of counterfeiting.
              </span>
            </div>

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Alert ID</dt>
                <dd className="id-text font-semibold">{sel.id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Type</dt>
                <dd className="font-semibold">{formatLabel(ALERT_TYPE_LABELS, sel.type)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Target</dt>
                <dd className="id-text font-semibold">
                  {sel.serial || sel.batchNo || 'Network'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Severity</dt>
                <dd>
                  <StatusBadge status={sel.severity} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Status</dt>
                <dd>
                  <StatusBadge status={sel.status} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Created</dt>
                <dd className="id-text">{sel.created}</dd>
              </div>
              {sel.resolvedDate && (
                <div className="flex justify-between">
                  <dt className="text-muted">Resolved date</dt>
                  <dd className="id-text">{sel.resolvedDate}</dd>
                </div>
              )}
            </dl>

            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                Description
              </h3>
              <p className="rounded-md border border-line bg-surface p-3 text-sm">
                {sel.description}
              </p>
            </div>

            {linkedPkg && (
              <div className="rounded-md border border-line p-3 text-sm">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Linked package
                </h3>
                <dl className="space-y-1.5">
                  <div className="flex justify-between">
                    <dt className="text-muted">Serial</dt>
                    <dd className="id-text font-semibold">{linkedPkg.serial}</dd>
                  </div>
                  {linkedBatch && (
                    <div className="flex justify-between">
                      <dt className="text-muted">Medicine</dt>
                      <dd>
                        {productOf(linkedBatch.productId)?.name}{' '}
                        {productOf(linkedBatch.productId)?.strength}
                      </dd>
                    </div>
                  )}
                  {linkedBatch && (
                    <div className="flex justify-between">
                      <dt className="text-muted">Batch</dt>
                      <dd className="id-text">{linkedBatch.no}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-muted">Custodian</dt>
                    <dd>{orgName(linkedPkg.custodian)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Verify count</dt>
                    <dd className="id-text font-semibold">{linkedPkg.verifyCount ?? 0}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Shipment</dt>
                    <dd className="id-text">{linkedPkg.shipmentRef ?? '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Package status</dt>
                    <dd>
                      <StatusBadge status={linkedPkg.status} />
                    </dd>
                  </div>
                </dl>
              </div>
            )}

            {!linkedPkg && linkedBatch && (
              <div className="rounded-md border border-line p-3 text-sm">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Linked batch
                </h3>
                <dl className="space-y-1.5">
                  <div className="flex justify-between">
                    <dt className="text-muted">Batch No</dt>
                    <dd className="id-text font-semibold">{linkedBatch.no}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Product</dt>
                    <dd>{productOf(linkedBatch.productId)?.name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Expiry</dt>
                    <dd className="id-text">{linkedBatch.exp}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Release</dt>
                    <dd>{linkedBatch.release}</dd>
                  </div>
                </dl>
              </div>
            )}

            {linkedCases.length > 0 && (
              <div className="rounded-md border border-line bg-surface p-3 text-sm">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Linked investigations
                </h3>
                <ul className="space-y-1.5">
                  {linkedCases.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        <span className="id-text font-semibold">{c.id}</span> · {c.title}
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
              <Button variant="primary" disabled={submitting} onClick={() => openInvestigationFromAlert(sel)}>
                Open Investigation
              </Button>
              <Button variant="secondary" disabled={submitting} onClick={() => toggleAlertStatus(sel)}>
                {sel.status === 'open' ? 'Mark Resolved' : 'Reopen'}
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      <Drawer
        open={!!selReport}
        onClose={() => setSelectedReportId(null)}
        title={selReport ? `Public Report ${selReport.id}` : 'Public Report'}
      >
        {selReport && (
          <div className="space-y-5">
            <div className="flex items-start gap-2 rounded-md border border-amber-line bg-amber-soft p-3 text-xs text-amber-ink">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                <strong>Advisory lead — requires investigator review.</strong> Public reports reflect
                unverified field observations until corroborated.
              </span>
            </div>

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Report ID</dt>
                <dd className="id-text font-semibold">{selReport.id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Serial</dt>
                <dd className="id-text font-semibold">{selReport.serial || '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Report type</dt>
                <dd className="font-semibold">
                  {formatLabel(REPORT_TYPE_LABELS, selReport.type)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Reporter</dt>
                <dd>{selReport.reporter}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Status</dt>
                <dd>
                  <StatusBadge status={selReport.status} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Created</dt>
                <dd className="id-text">{selReport.created}</dd>
              </div>
            </dl>

            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                Description
              </h3>
              <p className="rounded-md border border-line bg-surface p-3 text-sm">
                {selReport.description}
              </p>
            </div>

            {reportPkg && (
              <div className="rounded-md border border-line p-3 text-sm">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Registry record
                </h3>
                <dl className="space-y-1.5">
                  {reportBatch && (
                    <div className="flex justify-between">
                      <dt className="text-muted">Product</dt>
                      <dd>
                        {productOf(reportBatch.productId)?.name} ({reportBatch.no})
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-muted">Custodian</dt>
                    <dd>{orgName(reportPkg.custodian)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Status</dt>
                    <dd>
                      <StatusBadge status={reportPkg.status} />
                    </dd>
                  </div>
                </dl>
              </div>
            )}

            {actionErr && (
              <p role="alert" className="rounded-md border border-quarantine-line bg-quarantine-soft p-2.5 text-xs font-semibold text-quarantine">
                {actionErr}
              </p>
            )}

            <div className="border-t border-line pt-4">
              <Button variant="primary" disabled={submitting} onClick={() => openInvestigationFromReport(selReport)}>
                Open Investigation
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </>
  )
}
