import { useState, useMemo } from 'react'
import { Plus, Send, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react'
import {
  PageHeader,
  DataTable,
  StatusBadge,
  Button,
  Drawer,
  Modal,
  Toast,
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

export default function Outgoing() {
  const {
    organizations,
    shipments,
    packages,
    batches,
    traceabilityEvents,
    orgName,
    productOf,
    createShipment,
    dispatchShipment,
    recordTraceabilityEvents
  } = useDemoData()
  const { orgId } = useDemoSession()

  const [selectedRef, setSelectedRef] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [dispatchTargetRef, setDispatchTargetRef] = useState(null)
  const [destination, setDestination] = useState('')
  const [selectedSerials, setSelectedSerials] = useState([])
  const [scanFeedback, setScanFeedback] = useState(null)
  const [formErr, setFormErr] = useState('')
  const [dispatchErr, setDispatchErr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState('')

  const destinationOptions = useMemo(
    () => organizations.filter(o => o.type === 'Wholesaler' && (o.status ?? 'active') === 'active'),
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

  const packageBySerial = useMemo(() => {
    const map = new Map()
    for (const p of packages) map.set(p.serial, p)
    return map
  }, [packages])

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

  const selectedShipment = useMemo(
    () => outgoingShipments.find(s => s.ref === selectedRef) ?? null,
    [outgoingShipments, selectedRef]
  )

  const dispatchTarget = useMemo(
    () => outgoingShipments.find(s => s.ref === dispatchTargetRef) ?? null,
    [outgoingShipments, dispatchTargetRef]
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
            role: 'distributor'
          }).verified
      )
    )
  }, [dispatchTarget, traceabilityEvents, orgId])

  function getPackageInfo(serial) {
    const pkg = packageBySerial.get(serial)
    const batch = pkg ? batchById.get(pkg.batchId) : null
    const product = batch ? productOf(batch.productId) : null
    return { pkg, batch, product }
  }

  function openCreateModal() {
    setDestination(destinationOptions[0]?.id ?? '')
    setSelectedSerials([])
    setScanFeedback(null)
    setFormErr('')
    setCreateOpen(true)
  }

  function closeCreateModal() {
    setCreateOpen(false)
    setSelectedSerials([])
    setScanFeedback(null)
    setFormErr('')
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

  async function handleScanPackage(rawSerial) {
    const serial = extractSerialFromInput(rawSerial)
    if (!serial) return
    setFormErr('')

    const existing = packageBySerial.get(serial) ?? null
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
        : { eligible: false, reasons: [`Serial ${serial} was not found.`] }

    const passed = Boolean(existing && check.eligible)
    const failureText = check.reasons.join(' ')
    const timestamp = new Date().toISOString()

    await recordTraceabilityEvents([
      {
        eventType: TRACEABILITY_EVENT_TYPES.DISTRIBUTOR_PRE_DISPATCH_SCANNED,
        serial,
        packageId: serial,
        batchId: existing?.batchId ?? null,
        timestamp,
        checkpoint: 'distributor_pre_dispatch',
        category: 'observation',
        outcome: existing ? 'success' : 'failed',
        failureReason: existing ? null : failureText
      },
      {
        eventType: TRACEABILITY_EVENT_TYPES.DISTRIBUTOR_PRE_DISPATCH_VERIFIED,
        serial,
        packageId: serial,
        batchId: existing?.batchId ?? null,
        timestamp,
        checkpoint: 'distributor_pre_dispatch',
        category: 'observation',
        outcome: passed ? 'success' : existing ? 'blocked' : 'failed',
        failureReason: passed ? null : failureText
      }
    ])

    if (passed) {
      if (selectedSerials.includes(serial)) {
        setScanFeedback({
          type: 'info',
          message: `${serial} is already selected for this shipment.`
        })
      } else {
        setSelectedSerials(prev => [...prev, serial])
        setScanFeedback({
          type: 'ok',
          message: `Verified custody & added ${serial} to outgoing shipment.`
        })
      }
      return
    }

    setScanFeedback({
      type: 'error',
      message: existing ? `Blocked ${serial}: ${failureText}` : failureText
    })
  }

  async function handleCreateShipment() {
    if (!destination || selectedSerials.length === 0 || submitting) return
    setSubmitting(true)
    setFormErr('')
    try {
      const res = await createShipment({
        from: orgId,
        to: destination,
        packageSerials: selectedSerials
      })
      if (!res?.ok) {
        setFormErr(res?.error || 'Could not create shipment.')
        return
      }
      closeCreateModal()
      setToast(
        `Shipment ${res.shipment.ref} created with ${res.shipment.packageSerials.length} package(s) to ${orgName(destination)}.`
      )
    } finally {
      setSubmitting(false)
    }
  }

  function openDispatchModal(ref) {
    setDispatchErr('')
    setDispatchTargetRef(ref)
  }

  async function confirmDispatch() {
    if (!dispatchTarget || submitting) return
    setSubmitting(true)
    setDispatchErr('')
    try {
      const res = await dispatchShipment(dispatchTarget.ref, { requireQrVerification: true })
      if (!res?.ok) {
        setDispatchErr(res?.error || 'Could not dispatch shipment.')
        return
      }
      const ref = dispatchTarget.ref
      setDispatchTargetRef(null)
      setToast(`Shipment ${ref} dispatched and now in transit.`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Outgoing Shipments"
        description="Build shipments from available distributor inventory and dispatch orders to downstream wholesalers."
        actions={
          <Button variant="success" onClick={openCreateModal}>
            <Plus size={16} /> Create Shipment
          </Button>
        }
      />

      <DataTable
        empty="No outgoing shipments found."
        onRowClick={r => setSelectedRef(r.ref)}
        columns={[
          {
            key: 'ref',
            label: 'Reference',
            render: r => <span className="id-text whitespace-nowrap font-semibold">{r.ref}</span>
          },
          { key: 'to', label: 'Destination', render: r => orgName(r.to) },
          {
            key: 'count',
            label: 'Count',
            render: r => r.packageSerials?.length ?? r.count ?? 0
          },
          { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
          { key: 'created', label: 'Created' },
          {
            key: 'actions',
            label: 'Action',
            render: r =>
              r.status === 'pending' ? (
                <Button
                  variant="primary"
                  className="px-2.5 py-1 text-xs"
                  onClick={e => {
                    e.stopPropagation()
                    openDispatchModal(r.ref)
                  }}
                >
                  <Send size={13} /> Dispatch
                </Button>
              ) : (
                <span className="text-xs text-muted">{r.receiving}</span>
              )
          }
        ]}
        rows={outgoingShipments}
      />

      <Drawer
        open={!!selectedShipment}
        onClose={() => setSelectedRef(null)}
        title={selectedShipment ? `Shipment ${selectedShipment.ref}` : 'Shipment details'}
      >
        {selectedShipment && (
          <>
            <dl className="mb-5 space-y-2 text-sm">
              {[
                ['Reference', selectedShipment.ref],
                ['Origin', orgName(selectedShipment.from)],
                ['Destination', orgName(selectedShipment.to)],
                ['Packages', selectedShipment.packageSerials?.length ?? selectedShipment.count ?? 0],
                ['Created', selectedShipment.created],
                ['Dispatched', selectedShipment.dispatched ?? '—'],
                ['Receiving', selectedShipment.receiving]
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-muted">{k}</dt>
                  <dd className="id-text text-right font-semibold">{v}</dd>
                </div>
              ))}
              <div className="flex justify-between">
                <dt className="text-muted">Status</dt>
                <StatusBadge status={selectedShipment.status} />
              </div>
            </dl>

            {selectedShipment.status === 'pending' && (
              <div className="mb-5">
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => openDispatchModal(selectedShipment.ref)}
                >
                  <Send size={15} /> Dispatch Shipment
                </Button>
              </div>
            )}

            <h3 className="mb-2 text-sm font-bold text-navy">
              Packages ({selectedShipment.packageSerials?.length ?? 0})
            </h3>
            {selectedShipment.packageSerials?.length ? (
              <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                {selectedShipment.packageSerials.map(serial => {
                  const { pkg, batch, product } = getPackageInfo(serial)
                  return (
                    <li
                      key={serial}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                    >
                      <div>
                        <div className="id-text font-semibold text-navy">{serial}</div>
                        <div className="text-muted">
                          {product ? `${product.name} ${product.strength}` : 'Package'}
                          {batch ? ` · ${batch.no}` : ''}
                        </div>
                      </div>
                      {pkg && <StatusBadge status={pkg.status} />}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState title="No packages" text="This shipment has no packages assigned." />
            )}
          </>
        )}
      </Drawer>

      <Modal
        open={createOpen}
        onClose={closeCreateModal}
        title="Create Outgoing Shipment"
        actions={
          <>
            <Button variant="secondary" onClick={closeCreateModal}>
              Cancel
            </Button>
            <Button
              variant="success"
              disabled={!destination || selectedSerials.length === 0 || eligibleItems.length === 0 || submitting}
              onClick={handleCreateShipment}
            >
              {submitting ? 'Creating...' : `Confirm Shipment (${selectedSerials.length})`}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block text-sm font-semibold text-navy">
            Destination Wholesaler
            {destinationOptions.length === 0 ? (
              <p role="alert" className="mt-1 rounded-md border border-quarantine-line bg-quarantine-soft p-2.5 text-xs font-medium text-quarantine">
                No active wholesaler organizations are available. Reactivate or add an active wholesaler first.
              </p>
            ) : (
              <select
                value={destination}
                onChange={e => setDestination(e.target.value)}
                className="mt-1 w-full rounded-md border border-line bg-white p-2 text-sm font-normal text-ink"
              >
                {destinationOptions.map(org => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            )}
          </label>

          <div>
            <div className="mb-1.5 text-sm font-semibold text-navy">
              Scan Package Serials
            </div>
            <QrScanner
              onScan={handleScanPackage}
              placeholder="Scan or enter serial to add (e.g. DEMO-PCM-2601-00031)"
              label="Scan package for outgoing shipment"
            />
            {scanFeedback && (
              <div
                role="status"
                className={`mt-2 flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium ${
                  scanFeedback.type === 'error'
                    ? 'border-quarantine-line bg-quarantine-soft text-quarantine'
                    : 'border-emerald-200 bg-clinical-soft text-emerald-800'
                }`}
              >
                {scanFeedback.type === 'error' ? (
                  <AlertTriangle size={14} className="shrink-0" />
                ) : (
                  <CheckCircle2 size={14} className="shrink-0" />
                )}
                <span>{scanFeedback.message}</span>
              </div>
            )}
          </div>

          <OutgoingEligibilityList
            eligibleItems={eligibleItems}
            ineligibleItems={ineligibleItems}
            selectedSerials={selectedSerials}
            onToggle={toggleSerial}
            onSelectAllEligible={() => setSelectedSerials(eligibleItems.map(i => i.pkg.serial))}
            onClearSelected={() => setSelectedSerials([])}
            emptyEligibleText="No eligible distributor packages are available for dispatch."
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
        onClose={() => setDispatchTargetRef(null)}
        title={dispatchTarget ? `Dispatch ${dispatchTarget.ref}` : 'Dispatch Shipment'}
        actions={
          <>
            <Button variant="secondary" onClick={() => setDispatchTargetRef(null)}>
              Cancel
            </Button>
            <Button
              variant="success"
              disabled={!dispatchValidation?.eligible || !dispatchQrVerified || submitting}
              onClick={confirmDispatch}
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
              role="distributor"
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

      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </>
  )
}
