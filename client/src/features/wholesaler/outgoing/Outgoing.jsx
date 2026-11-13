import { useState, useMemo } from 'react'
import { Plus, Send, CheckCircle2, AlertTriangle, XCircle, ShieldAlert } from 'lucide-react'
import {
  PageHeader,
  DataTable,
  StatusBadge,
  Button,
  Drawer,
  Toast,
  Modal,
  EmptyState
} from '../../../components/ui'
import QrScanner from '../../../components/scanner/QrScanner'
import OutgoingEligibilityList from '../../../components/shipments/OutgoingEligibilityList'
import PreDispatchQrCheckpoint from '../../../components/shipments/PreDispatchQrCheckpoint'
import { useDemoData } from '../../../contexts/DemoData'
import { useDemoSession } from '../../../contexts/DemoSession'
import { extractSerialFromInput } from '../../../services/qrPayload'
import {
  TRACEABILITY_EVENT_TYPES,
  hasCurrentPreDispatchVerification
} from '../../../services/traceabilityEvents'
import {
  getCurrentDateIso,
  validatePackageForDispatch,
  validateShipmentForDispatch
} from '../../../services/supplyChain'

const FEEDBACK_STYLES = {
  success: 'border-emerald-200 bg-clinical-soft text-emerald-800',
  warning: 'border-amber-line bg-amber-soft text-amber-ink',
  error: 'border-quarantine-line bg-quarantine-soft text-quarantine'
}

export default function Outgoing() {
  const {
    organizations,
    batches,
    packages,
    shipments,
    traceabilityEvents,
    orgName,
    productOf,
    createShipment,
    dispatchShipment,
    recordTraceabilityEvents
  } = useDemoData()
  const { orgId, organization } = useDemoSession()
  const currentOrgName = organization?.name ?? orgName(orgId)

  const pharmacies = useMemo(
    () => organizations.filter(o => o.type === 'Pharmacy' && (o.status ?? 'active') === 'active'),
    [organizations]
  )

  const outgoingShipments = useMemo(
    () => shipments.filter(s => s.from === orgId),
    [shipments, orgId]
  )

  const batchById = useMemo(() => {
    const map = new Map()
    for (const b of batches) map.set(b.id, b)
    return map
  }, [batches])

  const { eligibleItems, ineligibleItems, checkBySerial } = useMemo(() => {
    const today = getCurrentDateIso()
    const eligible = []
    const ineligible = []
    const bySerial = new Map()

    for (const pkg of packages) {
      if (pkg.custodian !== orgId) continue
      const batch = batchById.get(pkg.batchId) ?? null
      const product = batch ? productOf(batch.productId) : null
      const check = validatePackageForDispatch({
        pkg,
        batch,
        fromOrgId: orgId,
        organizations,
        shipments,
        today
      })
      const entry = { pkg, batch, product, ...check }
      bySerial.set(pkg.serial, entry)
      if (check.eligible) eligible.push(entry)
      else ineligible.push(entry)
    }

    return { eligibleItems: eligible, ineligibleItems: ineligible, checkBySerial: bySerial }
  }, [packages, batchById, productOf, shipments, organizations, orgId])

  const [createOpen, setCreateOpen] = useState(false)
  const [destinationId, setDestinationId] = useState('')
  const [selectedSerials, setSelectedSerials] = useState([])
  const [scanFeedback, setScanFeedback] = useState(null)
  const [formErr, setFormErr] = useState('')
  const [dispatchErr, setDispatchErr] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [drawerRef, setDrawerRef] = useState(null)
  const [dispatchRef, setDispatchRef] = useState(null)
  const [toast, setToast] = useState('')

  const drawerShipment = useMemo(
    () => outgoingShipments.find(s => s.ref === drawerRef) ?? null,
    [outgoingShipments, drawerRef]
  )

  const dispatchTarget = useMemo(
    () => outgoingShipments.find(s => s.ref === dispatchRef) ?? null,
    [outgoingShipments, dispatchRef]
  )

  const dispatchValidation = useMemo(() => {
    if (!dispatchTarget) return null
    return validateShipmentForDispatch({
      shipment: dispatchTarget,
      packages,
      batches,
      organizations,
      shipments,
      today: getCurrentDateIso()
    })
  }, [dispatchTarget, packages, batches, organizations, shipments])

  const dispatchQrVerified = useMemo(() => {
    if (!dispatchTarget) return false
    const serials = dispatchTarget.packageSerials ?? []
    return (
      serials.length > 0 &&
      serials.every(
        s =>
          hasCurrentPreDispatchVerification(traceabilityEvents, {
            serial: s,
            orgId,
            role: 'wholesaler'
          }).verified
      )
    )
  }, [dispatchTarget, traceabilityEvents, orgId])

  function openCreateModal() {
    setDestinationId(pharmacies[0]?.id ?? '')
    setSelectedSerials([])
    setScanFeedback(null)
    setFormErr('')
    setCreateOpen(true)
  }

  function toggleSerial(serial) {
    setFormErr('')
    const entry = checkBySerial.get(serial)
    if (!entry?.eligible) {
      setFormErr(entry ? `${serial}: ${entry.reasons.join(' ')}` : `${serial} is not eligible.`)
      return
    }
    setSelectedSerials(prev =>
      prev.includes(serial) ? prev.filter(s => s !== serial) : [...prev, serial]
    )
  }

  async function handleScanAdd(rawSerial) {
    const serial = extractSerialFromInput(rawSerial) || String(rawSerial ?? '').trim().toUpperCase()
    if (!serial) return
    setFormErr('')

    const existing = packages.find(p => p.serial === serial) ?? null
    const batch = existing ? batchById.get(existing.batchId) ?? null : null
    const entry = checkBySerial.get(serial)
    const check = entry
      ? { eligible: entry.eligible, reasons: entry.reasons }
      : existing
        ? validatePackageForDispatch({
            pkg: existing,
            batch,
            fromOrgId: orgId,
            organizations,
            shipments,
            today: getCurrentDateIso()
          })
        : { eligible: false, reasons: [`Unknown serial ${serial} — not found in registry.`] }

    const passed = Boolean(existing && check.eligible)
    const failureText = check.reasons.join(' ')
    const timestamp = new Date().toISOString()

    await recordTraceabilityEvents([
      {
        eventType: TRACEABILITY_EVENT_TYPES.WHOLESALER_PRE_DISPATCH_SCANNED,
        serial,
        packageId: serial,
        batchId: existing?.batchId ?? null,
        timestamp,
        checkpoint: 'wholesaler_pre_dispatch',
        category: 'observation',
        outcome: existing ? 'success' : 'failed',
        failureReason: existing ? null : failureText
      },
      {
        eventType: TRACEABILITY_EVENT_TYPES.WHOLESALER_PRE_DISPATCH_VERIFIED,
        serial,
        packageId: serial,
        batchId: existing?.batchId ?? null,
        timestamp,
        checkpoint: 'wholesaler_pre_dispatch',
        category: 'observation',
        outcome: passed ? 'success' : existing ? 'blocked' : 'failed',
        failureReason: passed ? null : failureText
      }
    ])

    if (passed) {
      if (selectedSerials.includes(serial)) {
        setScanFeedback({
          type: 'warning',
          text: `${serial} is already selected for this shipment.`
        })
      } else {
        setSelectedSerials(prev => [...prev, serial])
        setScanFeedback({
          type: 'success',
          text: `Verified custody & added ${serial} to outgoing shipment.`
        })
      }
      return
    }

    setScanFeedback({
      type: 'error',
      text: existing ? `Blocked ${serial}: ${failureText}` : failureText
    })
  }

  async function handleCreateConfirm() {
    if (!destinationId || selectedSerials.length === 0 || submitting) return
    setSubmitting(true)
    setFormErr('')
    try {
      const res = await createShipment({
        from: orgId,
        to: destinationId,
        packageSerials: selectedSerials
      })
      if (!res?.ok) {
        setFormErr(res?.error || 'Could not create shipment.')
        return
      }
      setCreateOpen(false)
      setSelectedSerials([])
      setToast(
        `Shipment ${res.shipment.ref} created for ${orgName(destinationId)} (${selectedSerials.length} package${
          selectedSerials.length === 1 ? '' : 's'
        }).`
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDispatchConfirm() {
    if (!dispatchTarget || submitting) return
    const ref = dispatchTarget.ref
    setSubmitting(true)
    setDispatchErr('')
    try {
      const res = await dispatchShipment(ref, { requireQrVerification: true })
      if (!res?.ok) {
        setDispatchErr(res?.error || 'Could not dispatch shipment.')
        return
      }
      setDispatchRef(null)
      setToast(`Shipment ${ref} dispatched and is now in transit.`)
    } finally {
      setSubmitting(false)
    }
  }

  function describePackage(serial) {
    const pkg = packages.find(p => p.serial === serial)
    const batch = pkg ? batchById.get(pkg.batchId) : null
    const product = batch ? productOf(batch.productId) : null
    return { pkg, batch, product }
  }

  return (
    <>
      <PageHeader
        title="Outgoing Shipments"
        description={`Create and dispatch medicine shipments from ${currentOrgName} to registered pharmacies.`}
        actions={
          <Button variant="primary" onClick={openCreateModal}>
            <Plus size={16} /> Create Shipment
          </Button>
        }
      />

      <DataTable
        rows={outgoingShipments}
        onRowClick={r => setDrawerRef(r.ref)}
        empty="No outgoing shipments created yet."
        columns={[
          {
            key: 'ref',
            label: 'Reference',
            render: r => <span className="id-text whitespace-nowrap font-semibold">{r.ref}</span>
          },
          { key: 'to', label: 'Destination', render: r => orgName(r.to) },
          { key: 'count', label: 'Packages' },
          {
            key: 'created',
            label: 'Created',
            render: r => <span className="id-text whitespace-nowrap">{r.created}</span>
          },
          {
            key: 'dispatched',
            label: 'Dispatched',
            render: r => <span className="id-text whitespace-nowrap">{r.dispatched ?? '—'}</span>
          },
          { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
          { key: 'receiving', label: 'Receiving' },
          {
            key: 'action',
            label: 'Action',
            render: r =>
              r.status === 'pending' ? (
                <Button
                  variant="success"
                  className="px-2.5 py-1 text-xs"
                  onClick={e => {
                    e.stopPropagation()
                    setDispatchErr('')
                    setDispatchRef(r.ref)
                  }}
                >
                  <Send size={13} /> Dispatch
                </Button>
              ) : (
                <span className="text-xs text-muted">View manifest</span>
              )
          }
        ]}
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Outgoing Shipment"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!destinationId || selectedSerials.length === 0 || eligibleItems.length === 0 || submitting}
              onClick={handleCreateConfirm}
            >
              {submitting ? 'Creating...' : `Create Shipment (${selectedSerials.length})`}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block text-sm font-semibold text-navy">
            Destination pharmacy
            {pharmacies.length === 0 ? (
              <p role="alert" className="mt-1 rounded-md border border-quarantine-line bg-quarantine-soft p-2.5 text-xs font-medium text-quarantine">
                No active pharmacy organizations are available. Reactivate or add an active pharmacy first.
              </p>
            ) : (
              <select
                value={destinationId}
                onChange={e => setDestinationId(e.target.value)}
                className="mt-1 w-full rounded-md border border-line bg-white p-2 font-normal text-ink"
              >
                {pharmacies.map(ph => (
                  <option key={ph.id} value={ph.id}>
                    {ph.name}
                  </option>
                ))}
              </select>
            )}
          </label>

          <div>
            <div className="mb-1.5 text-sm font-semibold text-navy">Scan to add package</div>
            <QrScanner
              onScan={handleScanAdd}
              placeholder="Scan or enter package serial from wholesale stock"
            />
          </div>

          {scanFeedback && (
            <div
              role="status"
              className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs font-medium ${
                FEEDBACK_STYLES[scanFeedback.type]
              }`}
            >
              {scanFeedback.type === 'success' && <CheckCircle2 size={15} className="mt-0.5 shrink-0" />}
              {scanFeedback.type === 'warning' && <AlertTriangle size={15} className="mt-0.5 shrink-0" />}
              {scanFeedback.type === 'error' && <XCircle size={15} className="mt-0.5 shrink-0" />}
              <span>{scanFeedback.text}</span>
            </div>
          )}

          <OutgoingEligibilityList
            eligibleItems={eligibleItems}
            ineligibleItems={ineligibleItems}
            selectedSerials={selectedSerials}
            onToggle={toggleSerial}
            onSelectAllEligible={() => setSelectedSerials(eligibleItems.map(i => i.pkg.serial))}
            onClearSelected={() => setSelectedSerials([])}
            emptyEligibleText={`${currentOrgName} has no eligible accepted packages to ship. Receive an incoming shipment from a distributor first.`}
          />

          {formErr && (
            <p role="alert" className="text-sm text-quarantine">
              {formErr}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={!!dispatchTarget}
        onClose={() => setDispatchRef(null)}
        title={dispatchTarget ? `Dispatch ${dispatchTarget.ref}` : 'Dispatch Shipment'}
        actions={
          <>
            <Button variant="secondary" onClick={() => setDispatchRef(null)}>
              Cancel
            </Button>
            <Button
              variant="success"
              disabled={!dispatchValidation?.eligible || !dispatchQrVerified || submitting}
              onClick={handleDispatchConfirm}
            >
              <Send size={14} /> {submitting ? 'Dispatching...' : 'Confirm Dispatch'}
            </Button>
          </>
        }
      >
        {dispatchTarget && (
          <div className="space-y-3 text-sm">
            <p className="text-ink">
              Dispatch shipment <strong className="id-text">{dispatchTarget.ref}</strong> to{' '}
              <strong>{orgName(dispatchTarget.to)}</strong>?
            </p>
            <div className="rounded-md border border-line bg-surface p-3 text-xs text-muted">
              <div>
                Packages included:{' '}
                <strong className="id-text text-navy">{dispatchTarget.count}</strong>
              </div>
              <div className="mt-1">
                All included packages will transition to <strong>In transit</strong> and record a dispatch custody event.
              </div>
            </div>

            <PreDispatchQrCheckpoint
              shipment={dispatchTarget}
              role="wholesaler"
              orgId={orgId}
              packages={packages}
              batches={batches}
              organizations={organizations}
              shipments={shipments}
              traceabilityEvents={traceabilityEvents}
              productOf={productOf}
              onRecordEvents={recordTraceabilityEvents}
            />

            {dispatchValidation && !dispatchValidation.eligible && (
              <div role="alert" className="rounded-md border border-quarantine-line bg-quarantine-soft p-3 text-xs text-quarantine">
                <div className="mb-1 flex items-center gap-1.5 font-bold">
                  <ShieldAlert size={14} aria-hidden="true" /> Dispatch blocked by eligibility rules
                </div>
                <ul className="list-disc space-y-1 pl-4">
                  {dispatchValidation.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {dispatchErr && (
              <p role="alert" className="text-xs font-semibold text-quarantine">
                {dispatchErr}
              </p>
            )}
          </div>
        )}
      </Modal>

      <Drawer
        open={!!drawerShipment}
        onClose={() => setDrawerRef(null)}
        title={drawerShipment ? `Shipment ${drawerShipment.ref}` : 'Shipment details'}
      >
        {drawerShipment && (
          <>
            <dl className="mb-5 space-y-2 text-sm">
              {[
                ['Reference', drawerShipment.ref],
                ['Origin', orgName(drawerShipment.from)],
                ['Destination', orgName(drawerShipment.to)],
                ['Created', drawerShipment.created],
                ['Dispatched', drawerShipment.dispatched ?? '—'],
                ['Receiving', drawerShipment.receiving]
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-muted">{k}</dt>
                  <dd className="id-text text-right font-semibold">{v}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Status</dt>
                <dd>
                  <StatusBadge status={drawerShipment.status} />
                </dd>
              </div>
            </dl>

            {drawerShipment.status === 'pending' && (
              <div className="mb-5">
                <Button
                  variant="success"
                  className="w-full"
                  onClick={() => {
                    setDispatchErr('')
                    setDispatchRef(drawerShipment.ref)
                  }}
                >
                  <Send size={15} /> Dispatch Shipment
                </Button>
              </div>
            )}

            <h3 className="mb-2 text-sm font-bold text-navy">
              Package manifest ({drawerShipment.packageSerials?.length ?? 0})
            </h3>
            {drawerShipment.packageSerials?.length ? (
              <ul className="divide-y divide-line rounded-md border border-line">
                {drawerShipment.packageSerials.map(serial => {
                  const { pkg, batch, product } = describePackage(serial)
                  return (
                    <li key={serial} className="flex items-center justify-between gap-2 p-3 text-sm">
                      <div className="min-w-0">
                        <div className="id-text truncate font-semibold text-navy">{serial}</div>
                        <div className="text-xs text-muted">
                          {product ? `${product.name} ${product.strength}` : 'Product unavailable'}
                          {batch ? ` · Batch ${batch.no} · Exp ${batch.exp}` : ''}
                        </div>
                      </div>
                      <StatusBadge status={pkg?.status ?? 'pending'} />
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState title="No packages" text="This shipment has no assigned packages." />
            )}
          </>
        )}
      </Drawer>

      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </>
  )
}
