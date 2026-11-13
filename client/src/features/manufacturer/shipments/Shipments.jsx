import { useMemo, useState } from 'react'
import { Plus, Send, Truck, ShieldAlert } from 'lucide-react'
import {
  PageHeader,
  MetricCard,
  DataTable,
  StatusBadge,
  Button,
  Drawer,
  Toast,
  Modal
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

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'in_transit', label: 'In transit' },
  { id: 'accepted', label: 'Accepted' }
]

export default function Shipments() {
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
  const { orgId } = useDemoSession()

  const [statusFilter, setStatusFilter] = useState('all')
  const [selRef, setSelRef] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [dispatchTargetRef, setDispatchTargetRef] = useState(null)
  const [destination, setDestination] = useState('')
  const [selectedSerials, setSelectedSerials] = useState([])
  const [scanNotice, setScanNotice] = useState(null)
  const [formErr, setFormErr] = useState('')
  const [dispatchErr, setDispatchErr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState('')

  const distributorOptions = useMemo(
    () => organizations.filter(o => o.type === 'Distributor' && (o.status ?? 'active') === 'active'),
    [organizations]
  )

  const mfgShipments = useMemo(
    () => shipments.filter(s => s.from === orgId),
    [shipments, orgId]
  )

  const filteredShipments = useMemo(() => {
    if (statusFilter === 'all') return mfgShipments
    return mfgShipments.filter(s => s.status === statusFilter)
  }, [mfgShipments, statusFilter])

  const batchById = useMemo(() => {
    const map = {}
    for (const b of batches) map[b.id] = b
    return map
  }, [batches])

  const { eligibleItems, ineligibleItems, checkBySerial } = useMemo(() => {
    const today = getCurrentDateIso()
    const eligible = []
    const ineligible = []
    const bySerial = new Map()

    for (const pkg of packages) {
      if (pkg.custodian !== orgId) continue
      const batch = batchById[pkg.batchId] ?? null
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
    () => mfgShipments.find(s => s.ref === selRef) ?? null,
    [mfgShipments, selRef]
  )

  const dispatchTarget = useMemo(
    () => mfgShipments.find(s => s.ref === dispatchTargetRef) ?? null,
    [mfgShipments, dispatchTargetRef]
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
            role: 'manufacturer'
          }).verified
      )
    )
  }, [dispatchTarget, traceabilityEvents, orgId])

  const shipmentPackages = useMemo(() => {
    if (!selectedShipment) return []
    const serialSet = new Set(selectedShipment.packageSerials ?? [])
    return packages.filter(p => serialSet.has(p.serial))
  }, [selectedShipment, packages])

  function openCreateModal() {
    setDestination(distributorOptions[0]?.id ?? '')
    setSelectedSerials([])
    setScanNotice(null)
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

  async function handleScanPackage(rawSerial) {
    const normalized = extractSerialFromInput(rawSerial)
    if (!normalized) return
    setFormErr('')

    const existing = packages.find(p => p.serial === normalized) ?? null
    const batch = existing ? batchById[existing.batchId] ?? null : null
    const product = batch ? productOf(batch.productId) : null
    const entry = checkBySerial.get(normalized)

    const fullCheck = entry
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
        : { eligible: false, reasons: [`Serial ${normalized} was not found.`] }

    const passed = Boolean(existing && fullCheck.eligible)
    const failureText = fullCheck.reasons.join(' ')

    await recordTraceabilityEvents([
      {
        eventType: passed
          ? TRACEABILITY_EVENT_TYPES.MANUFACTURER_QR_VERIFIED
          : TRACEABILITY_EVENT_TYPES.MANUFACTURER_QR_VERIFICATION_FAILED,
        serial: normalized,
        packageId: normalized,
        batchId: existing?.batchId ?? null,
        checkpoint: 'manufacturer_pre_dispatch',
        category: 'observation',
        outcome: passed ? 'success' : existing ? 'blocked' : 'failed',
        failureReason: passed ? null : failureText
      }
    ])

    if (passed) {
      const desc = `${product ? `${product.name} ${product.strength}` : 'Package'}${batch ? ` · ${batch.no}` : ''}`
      if (selectedSerials.includes(normalized)) {
        setScanNotice({ ok: true, text: `QR verified: ${normalized} (${desc}) is already selected.` })
      } else {
        setSelectedSerials(prev => [...prev, normalized])
        setScanNotice({
          ok: true,
          text: `QR verified & added ${normalized} (${desc} · ${orgName(orgId)}).`
        })
      }
      return
    }

    setScanNotice({
      ok: false,
      text: existing ? `Blocked ${normalized}: ${failureText}` : failureText
    })
  }

  async function handleCreateShipment() {
    if (submitting) return
    if (!destination) {
      setFormErr('Please select an active distributor destination.')
      return
    }
    if (selectedSerials.length === 0) {
      setFormErr('Select or scan at least one eligible package.')
      return
    }

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
      setCreateOpen(false)
      setToast(`Shipment ${res.shipment.ref} created with ${selectedSerials.length} package(s).`)
    } finally {
      setSubmitting(false)
    }
  }

  function openDispatchConfirm(shipment, e) {
    e?.stopPropagation()
    setDispatchErr('')
    setDispatchTargetRef(shipment.ref)
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
      setToast(`Shipment ${dispatchTarget.ref} dispatched to ${orgName(dispatchTarget.to)}.`)
      setDispatchTargetRef(null)
    } finally {
      setSubmitting(false)
    }
  }

  const pendingCount = mfgShipments.filter(s => s.status === 'pending').length
  const inTransitCount = mfgShipments.filter(s => s.status === 'in_transit').length
  const acceptedCount = mfgShipments.filter(s => s.status === 'accepted').length

  return (
    <>
      <PageHeader
        title="Outgoing Shipments"
        description="Prepare, scan, and dispatch serialized pharmaceutical shipments to distributors."
        actions={
          <Button onClick={openCreateModal}>
            <Plus size={15} /> Create shipment
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total shipments" value={mfgShipments.length} />
        <MetricCard label="Pending dispatch" value={pendingCount} />
        <MetricCard label="In transit" value={inTransitCount} />
        <MetricCard label="Accepted" value={acceptedCount} hint={`${eligibleItems.length} packages eligible to ship`} />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(f => {
            const count =
              f.id === 'all'
                ? mfgShipments.length
                : mfgShipments.filter(s => s.status === f.id).length
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                  statusFilter === f.id
                    ? 'bg-navy text-white'
                    : 'border border-line bg-white text-muted hover:bg-surface hover:text-ink'
                }`}
              >
                {f.label} ({count})
              </button>
            )
          })}
        </div>
      </div>

      <DataTable
        rows={filteredShipments}
        onRowClick={r => setSelRef(r.ref)}
        empty="No outgoing shipments match the selected status."
        columns={[
          {
            key: 'ref',
            label: 'Reference',
            render: r => <span className="id-text whitespace-nowrap font-semibold text-navy">{r.ref}</span>
          },
          { key: 'to', label: 'Destination', render: r => orgName(r.to) },
          { key: 'count', label: 'Packages', render: r => <span className="id-text">{r.count}</span> },
          { key: 'created', label: 'Created', render: r => <span className="id-text whitespace-nowrap">{r.created}</span> },
          {
            key: 'dispatched',
            label: 'Dispatched',
            render: r => <span className="id-text whitespace-nowrap">{r.dispatched ?? '—'}</span>
          },
          { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
          { key: 'receiving', label: 'Receiving' },
          {
            key: 'actions',
            label: 'Actions',
            render: r =>
              r.status === 'pending' ? (
                <Button
                  variant="success"
                  className="px-2.5 py-1 text-xs"
                  onClick={e => openDispatchConfirm(r, e)}
                >
                  <Send size={13} /> Dispatch
                </Button>
              ) : (
                <span className="text-xs text-muted">—</span>
              )
          }
        ]}
      />

      <Modal
        open={createOpen}
        title="Create outgoing shipment"
        onClose={() => setCreateOpen(false)}
        actions={
          <>
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreateShipment}
              disabled={!destination || selectedSerials.length === 0 || eligibleItems.length === 0 || submitting}
            >
              {submitting ? 'Creating...' : `Create shipment (${selectedSerials.length})`}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block text-sm font-semibold">
            Destination
            {distributorOptions.length === 0 ? (
              <p role="alert" className="mt-1 rounded-md border border-quarantine-line bg-quarantine-soft p-2.5 text-xs font-medium text-quarantine">
                No active distributor organizations are available. Reactivate or add an active distributor first.
              </p>
            ) : (
              <select
                value={destination}
                onChange={e => setDestination(e.target.value)}
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
              >
                {distributorOptions.map(org => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            )}
          </label>

          <div>
            <div className="mb-1.5 text-sm font-semibold text-navy">
              Scan package serial
            </div>
            <QrScanner
              onScan={handleScanPackage}
              placeholder="Scan or enter package serial (e.g. DEMO-PCM-2601-00023)"
              label="Scan package serial into shipment"
            />
            {scanNotice && (
              <p
                role="status"
                className={`mt-2 text-xs font-medium ${
                  scanNotice.ok ? 'text-clinical' : 'text-quarantine'
                }`}
              >
                {scanNotice.text}
              </p>
            )}
          </div>

          <OutgoingEligibilityList
            eligibleItems={eligibleItems}
            ineligibleItems={ineligibleItems}
            selectedSerials={selectedSerials}
            onToggle={toggleSerial}
            onSelectAllEligible={() => setSelectedSerials(eligibleItems.map(i => i.pkg.serial))}
            onClearSelected={() => setSelectedSerials([])}
            emptyEligibleText="No eligible manufacturer packages are available. Generate serials for a released, unexpired batch first."
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
        title={dispatchTarget ? `Dispatch ${dispatchTarget.ref}?` : 'Dispatch shipment'}
        onClose={() => setDispatchTargetRef(null)}
        actions={
          <>
            <Button variant="secondary" type="button" onClick={() => setDispatchTargetRef(null)}>
              Cancel
            </Button>
            <Button
              variant="success"
              type="button"
              disabled={!dispatchValidation?.eligible || !dispatchQrVerified || submitting}
              onClick={confirmDispatch}
            >
              <Truck size={15} /> {submitting ? 'Dispatching...' : 'Confirm dispatch'}
            </Button>
          </>
        }
      >
        {dispatchTarget && (
          <div className="space-y-3 text-sm">
            <p className="text-muted">
              Dispatching this shipment will transition it to{' '}
              <strong className="text-ink">In transit</strong> and update custody history for all{' '}
              <strong className="text-ink">{dispatchTarget.count}</strong> package(s).
            </p>
            <dl className="space-y-1.5 rounded-md border border-line bg-surface p-3 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted">Reference</dt>
                <dd className="id-text font-semibold text-navy">{dispatchTarget.ref}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Destination</dt>
                <dd className="font-semibold">{orgName(dispatchTarget.to)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Packages</dt>
                <dd className="id-text font-semibold">{dispatchTarget.count}</dd>
              </div>
            </dl>

            <PreDispatchQrCheckpoint
              shipment={dispatchTarget}
              role="manufacturer"
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
        open={!!selectedShipment}
        onClose={() => setSelRef(null)}
        title={selectedShipment ? `Shipment ${selectedShipment.ref}` : 'Shipment details'}
      >
        {selectedShipment && (
          <>
            <dl className="mb-5 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Reference</dt>
                <dd className="id-text font-semibold">{selectedShipment.ref}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Origin</dt>
                <dd className="font-semibold">{orgName(selectedShipment.from)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Destination</dt>
                <dd className="font-semibold">{orgName(selectedShipment.to)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Created</dt>
                <dd className="id-text font-semibold">{selectedShipment.created}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Dispatched</dt>
                <dd className="id-text font-semibold">{selectedShipment.dispatched ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Receiving</dt>
                <dd className="font-semibold">{selectedShipment.receiving}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted">Status</dt>
                <StatusBadge status={selectedShipment.status} />
              </div>
            </dl>

            {selectedShipment.status === 'pending' && (
              <div className="mb-6">
                <Button
                  variant="success"
                  className="w-full"
                  onClick={() => openDispatchConfirm(selectedShipment)}
                >
                  <Send size={15} /> Dispatch shipment
                </Button>
              </div>
            )}

            <h3 className="mb-2 text-sm font-bold text-navy">
              Packages ({selectedShipment.packageSerials?.length ?? 0})
            </h3>
            {shipmentPackages.length === 0 ? (
              <p className="rounded-md border border-dashed border-line p-4 text-center text-xs text-muted">
                No packages attached to this shipment.
              </p>
            ) : (
              <div className="max-h-80 divide-y divide-line overflow-y-auto rounded-md border border-line">
                {shipmentPackages.map(pkg => {
                  const batch = batchById[pkg.batchId]
                  const prod = batch ? productOf(batch.productId) : null
                  return (
                    <div key={pkg.serial} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                      <div>
                        <div className="id-text font-semibold text-navy">{pkg.serial}</div>
                        <div className="text-muted">
                          {prod ? `${prod.name} ${prod.strength}` : '—'} · {batch?.no ?? '—'}
                        </div>
                      </div>
                      <StatusBadge status={pkg.status} />
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </Drawer>

      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </>
  )
}
