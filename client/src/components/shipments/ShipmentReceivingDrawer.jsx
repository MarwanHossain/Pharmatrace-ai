import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Lock, PackageCheck, ShieldAlert } from 'lucide-react'
import { Button, EmptyState, StatusBadge } from '../ui'
import {
  RECEIVABLE_SHIPMENT_STATUSES,
  initializeShipmentReconciliation,
  summarizeDispositions
} from '../../services/supplyChain'

export default function ShipmentReceivingDrawer({
  shipment,
  packages,
  batches,
  orgName,
  productOf,
  onOpenReceive,
  onCloseReconciliation,
  onRecordRejectedHandover
}) {
  const [closureNote, setClosureNote] = useState('')
  const [closureErr, setClosureErr] = useState('')
  const [handoverSerial, setHandoverSerial] = useState(null)
  const [handoverNote, setHandoverNote] = useState('')
  const [handoverErr, setHandoverErr] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!shipment) return null

  const manifest = shipment.packageSerials ?? []
  const dispositions = initializeShipmentReconciliation(shipment, packages)
  const summary = summarizeDispositions(manifest, dispositions)
  const sessions = shipment.receivingSessions ?? []
  const unmatchedScans = shipment.unmatchedScans ?? []

  const canReceiveMore =
    shipment.status === 'in_transit' || shipment.status === 'partially_received'
  const needsReconciliationClosure =
    RECEIVABLE_SHIPMENT_STATUSES.has(shipment.status) &&
    shipment.status !== 'in_transit' &&
    summary.unresolved === 0 &&
    (summary.damaged > 0 || summary.rejected > 0)

  function getMeta(serial) {
    const pkg = packages.find(p => p.serial === serial) ?? null
    const batch = pkg ? batches.find(b => b.id === pkg.batchId) ?? null : null
    const product = batch ? productOf(batch.productId) : null
    return { pkg, batch, product }
  }

  async function handleCloseReconciliation() {
    if (submitting) return
    setClosureErr('')
    setSubmitting(true)
    try {
      const res = await onCloseReconciliation?.(shipment.ref, closureNote)
      if (res && !res.ok) {
        setClosureErr(res.error || 'Unable to close shipment reconciliation.')
      } else {
        setClosureNote('')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function submitHandover(serial) {
    if (submitting) return
    setHandoverErr('')
    setSubmitting(true)
    try {
      const res = await onRecordRejectedHandover?.(shipment.ref, serial, handoverNote)
      if (res && !res.ok) {
        setHandoverErr(res.error || 'Unable to record handover.')
      } else {
        setHandoverSerial(null)
        setHandoverNote('')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      <dl className="space-y-2 text-sm">
        {[
          ['Reference', shipment.ref],
          ['Origin', orgName(shipment.from)],
          ['Destination', orgName(shipment.to)],
          ['Packages', manifest.length || shipment.count || 0],
          ['Created', shipment.created],
          ['Dispatched', shipment.dispatched ?? '—'],
          ['Receiving', shipment.receiving]
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-muted">{k}</dt>
            <dd className="id-text text-right font-semibold">{v}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted">Status</dt>
          <StatusBadge status={shipment.status} />
        </div>
      </dl>

      {canReceiveMore && (
        <Button variant="success" className="w-full" onClick={() => onOpenReceive(shipment)}>
          <PackageCheck size={16} aria-hidden="true" />
          {shipment.status === 'partially_received'
            ? `Continue Receiving (${summary.unresolved} unresolved)`
            : 'Receive Shipment'}
        </Button>
      )}

      <div className="rounded-lg border border-line bg-surface p-3 text-xs">
        <div className="mb-2 font-bold uppercase tracking-wide text-muted">
          Reconciliation Breakdown
        </div>
        <div className="grid grid-cols-2 gap-1.5 font-semibold">
          <div className="text-emerald-800">Accepted: {summary.accepted}</div>
          <div className="text-quarantine">Damaged / Quarantined: {summary.damaged}</div>
          <div className="text-amber-ink">Missing: {summary.missing}</div>
          <div className="text-quarantine">Rejected: {summary.rejected}</div>
          <div className="text-navy">Outstanding: {summary.outstanding}</div>
          <div className="text-muted">Sessions: {sessions.length}</div>
        </div>
        {summary.unresolved > 0 && shipment.status !== 'in_transit' && (
          <div className="mt-2 flex items-start gap-1.5 rounded border border-amber-line bg-amber-soft p-2 text-amber-ink">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              Shipment remains open: {summary.unresolved} package(s) still unresolved and must be reconciled before closure.
            </span>
          </div>
        )}
      </div>

      {needsReconciliationClosure && onCloseReconciliation && (
        <div className="space-y-2 rounded-lg border border-line bg-white p-3 text-xs">
          <div className="font-bold text-navy">Finalize Reconciliation & Close Shipment</div>
          <p className="text-muted">
            All manifest packages are accounted for ({summary.damaged} quarantined, {summary.rejected} rejected). Record a closure note to mark reconciliation complete.
          </p>
          <input
            type="text"
            value={closureNote}
            onChange={e => setClosureNote(e.target.value)}
            placeholder="Reconciliation closure note (e.g. Damaged packs quarantined; rejected unit returned)"
            aria-label="Reconciliation closure note"
            className="w-full rounded border border-line px-2.5 py-1.5 text-xs"
          />
          {closureErr && (
            <p role="alert" className="font-semibold text-quarantine">
              {closureErr}
            </p>
          )}
          <Button variant="primary" className="w-full text-xs" disabled={submitting} onClick={handleCloseReconciliation}>
            <CheckCircle2 size={14} aria-hidden="true" /> {submitting ? 'Closing...' : 'Close Shipment Reconciliation'}
          </Button>
        </div>
      )}

      {shipment.reconciliationNote && (
        <div className="rounded-md border border-line bg-surface p-2.5 text-xs">
          <span className="font-semibold text-navy">Closure note:</span> {shipment.reconciliationNote}
        </div>
      )}

      {unmatchedScans.length > 0 && (
        <div className="rounded-lg border border-amber-line bg-amber-soft p-3 text-xs text-amber-ink">
          <div className="mb-1.5 flex items-center gap-1.5 font-bold">
            <AlertTriangle size={14} aria-hidden="true" /> Persisted Unmatched Scans ({unmatchedScans.length})
          </div>
          <ul className="space-y-1">
            {unmatchedScans.map((u, idx) => (
              <li key={`${u.serial}-${idx}`} className="id-text">
                {u.serial} · {u.sessionId} · {u.date} ({u.knownInRegistry ? 'Known serial not on manifest' : 'Unknown serial'})
              </li>
            ))}
          </ul>
        </div>
      )}

      {sessions.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
            Receiving Sessions ({sessions.length})
          </h3>
          <ul className="space-y-1.5 text-xs">
            {sessions.map(ses => (
              <li key={ses.id} className="rounded border border-line bg-surface px-3 py-2">
                <div className="flex justify-between font-semibold text-navy">
                  <span className="id-text">{ses.id}</span>
                  <span className="id-text text-muted">{ses.date}</span>
                </div>
                <div className="mt-0.5 text-muted">
                  Actions: {ses.actions.length} · Unmatched: {ses.unmatchedSerials.length} · Total accepted after session:{' '}
                  {ses.summaryAfterSession.accepted}/{ses.summaryAfterSession.total}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-bold text-navy">Package Manifest ({manifest.length})</h3>
        {manifest.length === 0 ? (
          <EmptyState title="No packages" text="This shipment contains no package serials." />
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-white">
            {manifest.map(serial => {
              const { pkg, batch, product } = getMeta(serial)
              const disp = dispositions[serial]
              return (
                <li key={serial} className="space-y-1.5 px-3 py-2.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="id-text font-semibold text-navy">{serial}</span>
                        {disp?.sessionId && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-muted">
                            <Lock size={9} aria-hidden="true" /> {disp.sessionId}
                          </span>
                        )}
                      </div>
                      <div className="text-muted">
                        {product ? `${product.name} ${product.strength}` : 'Unknown product'}
                        {batch ? ` · Batch ${batch.no} · Exp ${batch.exp}` : ''}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={disp?.status ?? 'outstanding'} />
                      {pkg && pkg.status !== disp?.status && (
                        <span className="text-[10px] text-muted">Pkg: {pkg.status}</span>
                      )}
                    </div>
                  </div>

                  {disp?.reason && (
                    <div className="rounded bg-surface px-2 py-1 text-[11px] text-ink">
                      <strong>Reason:</strong> {disp.reason}
                      {disp.notes ? ` · ${disp.notes}` : ''}
                    </div>
                  )}

                  {disp?.status === 'rejected' && !disp.handoverRecorded && onRecordRejectedHandover && (
                    <div>
                      {handoverSerial === serial ? (
                        <div className="mt-1 space-y-1.5 rounded border border-line bg-surface p-2">
                          <input
                            type="text"
                            value={handoverNote}
                            onChange={e => setHandoverNote(e.target.value)}
                            placeholder="Return handover receipt / courier ref"
                            className="w-full rounded border border-line bg-white px-2 py-1 text-xs"
                          />
                          {handoverErr && <p className="text-[11px] font-semibold text-quarantine">{handoverErr}</p>}
                          <div className="flex gap-1.5">
                            <Button
                              variant="primary"
                              className="px-2 py-1 text-[11px]"
                              disabled={submitting}
                              onClick={() => submitHandover(serial)}
                            >
                              {submitting ? 'Saving...' : 'Save return handover'}
                            </Button>
                            <Button
                              variant="secondary"
                              className="px-2 py-1 text-[11px]"
                              onClick={() => {
                                setHandoverSerial(null)
                                setHandoverErr('')
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setHandoverSerial(serial)
                            setHandoverNote('')
                            setHandoverErr('')
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-clinical hover:underline"
                        >
                          <ShieldAlert size={11} aria-hidden="true" /> Record physical return / handover
                        </button>
                      )}
                    </div>
                  )}

                  {disp?.handoverRecorded && (
                    <div className="text-[11px] font-medium text-clinical">
                      Return handover logged ({disp.handoverDate}): {disp.handoverNote}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
