import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, ShieldAlert } from 'lucide-react'
import {
  PageHeader,
  MetricCard,
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

const formatAlertType = (type) => ALERT_TYPE_LABELS[type] ?? type.replace(/_/g, ' ')

export default function Dashboard() {
  const {
    alerts,
    investigations,
    reports,
    packages,
    batches,
    shipments,
    users,
    orgName,
    productOf,
    createInvestigation,
    updateAlert
  } = useDemoData()

  const [selectedAlertId, setSelectedAlertId] = useState(null)
  const [selectedInvId, setSelectedInvId] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [actionErr, setActionErr] = useState('')
  const [toast, setToast] = useState('')

  const openAlerts = alerts.filter((a) => a.status === 'open')
  const openInvestigations = investigations.filter((i) => i.status === 'open')
  const highSeverityOpen = openAlerts.filter((a) => a.severity === 'high').length
  const openReports = reports.filter((r) => r.status === 'open').length

  const selectedAlert = alerts.find((a) => a.id === selectedAlertId) ?? null
  const selectedInv = investigations.find((i) => i.id === selectedInvId) ?? null

  const userName = (id) => users.find((u) => u.id === id)?.name ?? id ?? 'Unassigned'

  const linkedPackage = selectedAlert?.serial
    ? packages.find((p) => p.serial === selectedAlert.serial)
    : null
  const linkedBatch = linkedPackage
    ? batches.find((b) => b.id === linkedPackage.batchId)
    : selectedAlert?.batchNo
      ? batches.find((b) => b.no === selectedAlert.batchNo)
      : null
  const linkedAlertForInv = selectedInv?.alertId
    ? alerts.find((a) => a.id === selectedInv.alertId)
    : null

  async function handleOpenInvestigation(alert) {
    if (submitting) return
    setSubmitting(true)
    setActionErr('')
    try {
      const inv = await createInvestigation({
        alertId: alert.id,
        title: `${formatAlertType(alert.type)} — ${alert.serial || alert.batchNo || alert.id}`,
        findings: `Opened from alert ${alert.id}: ${alert.description}`
      })
      if (!inv || inv.ok === false) {
        setActionErr(inv?.error || 'Could not create investigation case.')
        return
      }
      setToast(`Investigation ${inv.id} created for alert ${alert.id}.`)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleAlertStatus(alert) {
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
          ? `Alert ${alert.id} marked as resolved.`
          : `Alert ${alert.id} reopened.`
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Investigation Dashboard"
        description="Overview of active leads, investigation cases, and public reports. Automated alerts are an advisory lead — requires investigator review and never automated proof of counterfeiting."
        actions={
          <>
            <Link to="/investigator/search">
              <Button variant="secondary">Traceability Search</Button>
            </Link>
            <Link to="/investigator/investigations">
              <Button variant="primary">Manage Cases</Button>
            </Link>
          </>
        }
      />

      <div
        role="note"
        className="mb-6 flex items-start gap-3 rounded-lg border border-amber-line bg-amber-soft px-4 py-3 text-sm text-amber-ink"
      >
        <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <span className="font-semibold">Advisory lead — requires investigator review:</span>{' '}
          Automated supply-chain alerts highlight anomalies or custody gaps for human verification
          and do not constitute proof of counterfeiting.
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Open alerts"
          value={openAlerts.length}
          hint={`${highSeverityOpen} high severity`}
        />
        <MetricCard
          label="Open investigations"
          value={openInvestigations.length}
          hint={`${investigations.length} total cases`}
        />
        <MetricCard
          label="Public reports"
          value={reports.length}
          hint={`${openReports} awaiting review`}
        />
        <MetricCard
          label="Tracked packages"
          value={packages.length}
          hint={`${batches.length} batches · ${shipments.length} shipments`}
        />
      </div>

      <div className="space-y-6">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-navy">Open alerts &amp; advisory leads</h2>
            <Link
              to="/investigator/alerts"
              className="inline-flex items-center gap-1 text-xs font-semibold text-clinical hover:underline"
            >
              View all alerts <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
          <DataTable
            rows={openAlerts}
            empty="No open alerts requiring review."
            onRowClick={(row) => setSelectedAlertId(row.id)}
            columns={[
              {
                key: 'id',
                label: 'ID',
                render: (r) => <span className="id-text font-semibold">{r.id}</span>
              },
              {
                key: 'type',
                label: 'Lead type',
                render: (r) => formatAlertType(r.type)
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
                key: 'created',
                label: 'Created',
                render: (r) => <span className="id-text whitespace-nowrap">{r.created}</span>
              }
            ]}
          />
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-navy">Open investigations</h2>
            <Link
              to="/investigator/investigations"
              className="inline-flex items-center gap-1 text-xs font-semibold text-clinical hover:underline"
            >
              View all cases <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
          <DataTable
            rows={openInvestigations}
            empty="No open investigation cases."
            onRowClick={(row) => setSelectedInvId(row.id)}
            columns={[
              {
                key: 'id',
                label: 'Case ID',
                render: (r) => <span className="id-text font-semibold">{r.id}</span>
              },
              {
                key: 'title',
                label: 'Title',
                render: (r) => <span className="font-medium text-navy">{r.title}</span>
              },
              {
                key: 'alertId',
                label: 'Linked Alert',
                render: (r) => (
                  <span className="id-text text-muted">{r.alertId ?? 'Manual'}</span>
                )
              },
              {
                key: 'assignee',
                label: 'Assignee',
                render: (r) => userName(r.assignee)
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
      </div>

      <Drawer
        open={!!selectedAlert}
        onClose={() => setSelectedAlertId(null)}
        title={selectedAlert ? `Alert ${selectedAlert.id}` : 'Alert details'}
      >
        {selectedAlert && (
          <div className="space-y-5">
            <div className="flex items-start gap-2 rounded-md border border-amber-line bg-amber-soft p-3 text-xs text-amber-ink">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                <strong>Advisory lead — requires investigator review.</strong> Verify supply-chain
                evidence before taking regulatory or quarantine action.
              </span>
            </div>

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Type</dt>
                <dd className="font-semibold">{formatAlertType(selectedAlert.type)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Target</dt>
                <dd className="id-text font-semibold">
                  {selectedAlert.serial || selectedAlert.batchNo || 'Network'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Severity</dt>
                <dd>
                  <StatusBadge status={selectedAlert.severity} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Status</dt>
                <dd>
                  <StatusBadge status={selectedAlert.status} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Created</dt>
                <dd className="id-text">{selectedAlert.created}</dd>
              </div>
              {selectedAlert.resolvedDate && (
                <div className="flex justify-between">
                  <dt className="text-muted">Resolved</dt>
                  <dd className="id-text">{selectedAlert.resolvedDate}</dd>
                </div>
              )}
            </dl>

            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                Lead description
              </h3>
              <p className="rounded-md border border-line bg-surface p-3 text-sm">
                {selectedAlert.description}
              </p>
            </div>

            {linkedPackage && (
              <div className="rounded-md border border-line p-3 text-sm">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Linked package
                </h3>
                <dl className="space-y-1.5">
                  <div className="flex justify-between">
                    <dt className="text-muted">Serial</dt>
                    <dd className="id-text font-semibold">{linkedPackage.serial}</dd>
                  </div>
                  {linkedBatch && (
                    <div className="flex justify-between">
                      <dt className="text-muted">Product</dt>
                      <dd>
                        {productOf(linkedBatch.productId)?.name} ({linkedBatch.no})
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-muted">Custodian</dt>
                    <dd>{orgName(linkedPackage.custodian)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Package status</dt>
                    <dd>
                      <StatusBadge status={linkedPackage.status} />
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

            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button
                variant="primary"
                disabled={submitting}
                onClick={() => handleOpenInvestigation(selectedAlert)}
              >
                Open Investigation
              </Button>
              <Button
                variant="secondary"
                disabled={submitting}
                onClick={() => handleToggleAlertStatus(selectedAlert)}
              >
                {selectedAlert.status === 'open' ? 'Mark Resolved' : 'Reopen'}
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      <Drawer
        open={!!selectedInv}
        onClose={() => setSelectedInvId(null)}
        title={selectedInv ? `Case ${selectedInv.id}` : 'Investigation case'}
      >
        {selectedInv && (
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <StatusBadge status={selectedInv.status} />
                <span className="id-text text-xs text-muted">Opened {selectedInv.created}</span>
              </div>
              <h3 className="text-base font-bold text-navy">{selectedInv.title}</h3>
              <p className="mt-1 text-xs text-muted">
                Assignee: {userName(selectedInv.assignee)}
              </p>
            </div>

            {linkedAlertForInv && (
              <div className="rounded-md border border-amber-line bg-amber-soft p-3 text-xs text-amber-ink">
                <div className="font-semibold">
                  Linked alert {linkedAlertForInv.id} (Advisory lead — requires investigator review)
                </div>
                <p className="mt-1">{linkedAlertForInv.description}</p>
              </div>
            )}

            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                Findings
              </h4>
              <p className="rounded-md border border-line bg-surface p-3 text-sm">
                {selectedInv.findings || 'No findings recorded yet.'}
              </p>
            </div>

            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                Evidence ({selectedInv.evidence?.length ?? 0})
              </h4>
              {selectedInv.evidence?.length ? (
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {selectedInv.evidence.map((ev, idx) => (
                    <li key={idx}>{ev}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">No evidence items attached yet.</p>
              )}
            </div>

            <div className="border-t border-line pt-4">
              <Link to="/investigator/investigations">
                <Button variant="primary">Edit in Investigations</Button>
              </Link>
            </div>
          </div>
        )}
      </Drawer>

      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </>
  )
}
