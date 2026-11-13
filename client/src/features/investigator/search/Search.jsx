import { useMemo, useState } from 'react'
import { QrCode, Search as SearchIcon, ShieldAlert, X } from 'lucide-react'
import {
  PageHeader,
  DataTable,
  StatusBadge,
  Button,
  Drawer,
  Timeline,
  EmptyState
} from '../../../components/ui'
import QrScanner from '../../../components/scanner/QrScanner'
import { useDemoData } from '../../../contexts/DemoData'
import { extractSerialFromInput } from '../../../services/qrPayload'
import { getPackageTraceabilityEvents } from '../../../services/traceabilityEvents'

export default function Search() {
  const { packages, batches, shipments, alerts, traceabilityEvents, orgName, productOf } = useDemoData()

  const quickExamples = useMemo(() => {
    const list = []
    if (packages[0]?.serial) list.push(packages[0].serial)
    if (batches[0]?.no) list.push(batches[0].no)
    if (shipments[0]?.ref) list.push(shipments[0].ref)
    return list
  }, [packages, batches, shipments])

  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [selectedPkgSerial, setSelectedPkgSerial] = useState(null)
  const [selectedShipmentRef, setSelectedShipmentRef] = useState(null)

  const extractedQuery = /[/?#:=]/.test(query) ? extractSerialFromInput(query) : ''
  const trimmed = (extractedQuery || query).trim().toLowerCase()

  const batchMap = useMemo(() => {
    const map = new Map()
    for (const b of batches) map.set(b.id, b)
    return map
  }, [batches])

  const matchingBatches = useMemo(() => {
    if (!trimmed) return []
    return batches.filter((b) => {
      const no = b.no.toLowerCase()
      const prod = productOf(b.productId)?.name?.toLowerCase() ?? ''
      return no.includes(trimmed) || trimmed.includes(no) || prod.includes(trimmed)
    })
  }, [batches, trimmed, productOf])

  const matchingPackages = useMemo(() => {
    if (!trimmed) return []
    return packages.filter((p) => {
      const batch = batchMap.get(p.batchId)
      const serialMatch = p.serial.toLowerCase().includes(trimmed)
      const batchMatch = batch?.no.toLowerCase().includes(trimmed)
      const shipmentMatch = (p.shipmentRef ?? '').toLowerCase().includes(trimmed)
      return serialMatch || batchMatch || shipmentMatch
    })
  }, [packages, batchMap, trimmed])

  const matchingShipments = useMemo(() => {
    if (!trimmed) return []
    const matchingBatchIds = new Set(matchingBatches.map((b) => b.id))
    const pkgSerialsInMatchingBatches = new Set(
      packages.filter((p) => matchingBatchIds.has(p.batchId)).map((p) => p.serial)
    )
    return shipments.filter((s) => {
      if (s.ref.toLowerCase().includes(trimmed)) return true
      return (s.packageSerials ?? []).some(
        (ser) => ser.toLowerCase().includes(trimmed) || pkgSerialsInMatchingBatches.has(ser)
      )
    })
  }, [shipments, matchingBatches, packages, trimmed])

  const selectedPkg = selectedPkgSerial
    ? packages.find((p) => p.serial === selectedPkgSerial) ?? null
    : null
  const selectedPkgBatch = selectedPkg ? batchMap.get(selectedPkg.batchId) ?? null : null
  const selectedPkgAlerts = selectedPkg
    ? alerts.filter((a) => a.serial === selectedPkg.serial)
    : []
  const selectedPkgTraceEvents = selectedPkg
    ? getPackageTraceabilityEvents(traceabilityEvents, selectedPkg.serial)
    : []

  const selectedShipment = selectedShipmentRef
    ? shipments.find((s) => s.ref === selectedShipmentRef) ?? null
    : null

  function runSearch(value) {
    setInput(value)
    setQuery(value)
  }

  function handleSubmit(e) {
    e.preventDefault()
    setQuery(input)
  }

  function handleScan(scanned) {
    const normalized = extractSerialFromInput(scanned) || String(scanned ?? '').trim().toUpperCase()
    if (!normalized) return
    runSearch(normalized)
    setShowScanner(false)
    const exactPkg = packages.find(
      (p) => p.serial.toUpperCase() === normalized
    )
    if (exactPkg) {
      setSelectedPkgSerial(exactPkg.serial)
    }
  }

  function clearSearch() {
    setInput('')
    setQuery('')
  }

  return (
    <>
      <PageHeader
        title="Traceability Search"
        description="Search serial numbers, batch numbers, or shipment references to inspect custody history and supply-chain records."
        actions={
          <Button
            variant="secondary"
            onClick={() => setShowScanner((prev) => !prev)}
            aria-expanded={showScanner}
          >
            <QrCode size={16} aria-hidden="true" />
            {showScanner ? 'Hide QR Scanner' : 'QR Scanner'}
          </Button>
        }
      />

      <div className="mb-6 space-y-3 rounded-lg border border-line bg-white p-4">
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="traceability-search-input">
            Serial number, batch number, or shipment reference
          </label>
          <div className="relative min-w-[240px] flex-1">
            <SearchIcon size={15} className="absolute left-3 top-3 text-muted" aria-hidden="true" />
            <input
              id="traceability-search-input"
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                setQuery(e.target.value)
              }}
              placeholder="Enter package serial, batch number, or shipment reference"
              className="id-text w-full rounded-md border border-line py-2 pl-9 pr-8 text-sm"
            />
            {input && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={clearSearch}
                className="absolute right-2.5 top-2.5 text-muted hover:text-ink"
              >
                <X size={15} />
              </button>
            )}
          </div>
          <Button type="submit" variant="primary">
            Search
          </Button>
        </form>

        {quickExamples.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-muted">Quick examples:</span>
            {quickExamples.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => runSearch(ex)}
                className="id-text rounded border border-line bg-surface px-2 py-1 font-medium text-navy transition hover:border-navy hover:bg-white"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {showScanner && (
          <div className="pt-2">
            <QrScanner
              onScan={handleScan}
              placeholder="Scan or enter package serial"
              label="Scan package serial"
            />
          </div>
        )}
      </div>

      {!trimmed ? (
        <EmptyState
          title="Enter a traceability query"
          text="Search by full or partial serial number, batch number, or shipment reference, or use the QR Scanner above."
        />
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-bold text-navy">
              Matching Packages ({matchingPackages.length})
            </h2>
            <DataTable
              rows={matchingPackages}
              empty="No packages match this query."
              onRowClick={(row) => setSelectedPkgSerial(row.serial)}
              columns={[
                {
                  key: 'serial',
                  label: 'Serial',
                  render: (r) => (
                    <span className="id-text whitespace-nowrap font-semibold">{r.serial}</span>
                  )
                },
                {
                  key: 'batch',
                  label: 'Product / Batch',
                  render: (r) => {
                    const b = batchMap.get(r.batchId)
                    const p = b ? productOf(b.productId) : null
                    return (
                      <span>
                        {p?.name ?? '—'}{' '}
                        <span className="id-text text-xs text-muted">({b?.no ?? '—'})</span>
                      </span>
                    )
                  }
                },
                {
                  key: 'custodian',
                  label: 'Custodian',
                  render: (r) => orgName(r.custodian)
                },
                {
                  key: 'verifyCount',
                  label: 'Verify Count',
                  render: (r) => <span className="id-text">{r.verifyCount ?? 0}</span>
                },
                {
                  key: 'shipmentRef',
                  label: 'Shipment',
                  render: (r) => (
                    <span className="id-text text-muted">{r.shipmentRef ?? '—'}</span>
                  )
                },
                {
                  key: 'status',
                  label: 'Status',
                  render: (r) => <StatusBadge status={r.status} />
                }
              ]}
            />
          </section>

          <section>
            <h2 className="mb-2 text-sm font-bold text-navy">
              Matching Batches ({matchingBatches.length})
            </h2>
            <DataTable
              rows={matchingBatches}
              empty="No batches match this query."
              columns={[
                {
                  key: 'no',
                  label: 'Batch No',
                  render: (r) => <span className="id-text font-semibold">{r.no}</span>
                },
                {
                  key: 'product',
                  label: 'Product',
                  render: (r) => {
                    const p = productOf(r.productId)
                    return p ? `${p.name} ${p.strength}` : '—'
                  }
                },
                {
                  key: 'mfd',
                  label: 'Manufactured',
                  render: (r) => <span className="id-text whitespace-nowrap">{r.mfd}</span>
                },
                {
                  key: 'exp',
                  label: 'Expiry',
                  render: (r) => <span className="id-text whitespace-nowrap">{r.exp}</span>
                },
                {
                  key: 'quantity',
                  label: 'Batch Qty',
                  render: (r) => <span className="id-text">{r.quantity}</span>
                },
                {
                  key: 'release',
                  label: 'QA Release',
                  render: (r) => (
                    <StatusBadge status={r.release === 'Released' ? 'active' : 'pending'} />
                  )
                }
              ]}
            />
          </section>

          <section>
            <h2 className="mb-2 text-sm font-bold text-navy">
              Matching Shipments ({matchingShipments.length})
            </h2>
            <DataTable
              rows={matchingShipments}
              empty="No shipments match this query."
              onRowClick={(row) => setSelectedShipmentRef(row.ref)}
              columns={[
                {
                  key: 'ref',
                  label: 'Reference',
                  render: (r) => (
                    <span className="id-text whitespace-nowrap font-semibold">{r.ref}</span>
                  )
                },
                {
                  key: 'from',
                  label: 'Origin',
                  render: (r) => orgName(r.from)
                },
                {
                  key: 'to',
                  label: 'Destination',
                  render: (r) => orgName(r.to)
                },
                {
                  key: 'count',
                  label: 'Packages',
                  render: (r) => <span className="id-text">{r.count}</span>
                },
                {
                  key: 'dispatched',
                  label: 'Dispatched',
                  render: (r) => (
                    <span className="id-text whitespace-nowrap">{r.dispatched ?? '—'}</span>
                  )
                },
                {
                  key: 'status',
                  label: 'Status',
                  render: (r) => <StatusBadge status={r.status} />
                },
                {
                  key: 'receiving',
                  label: 'Receiving'
                }
              ]}
            />
          </section>
        </div>
      )}

      <Drawer
        open={!!selectedPkg}
        onClose={() => setSelectedPkgSerial(null)}
        title="Package Custody Details"
      >
        {selectedPkg && (
          <div className="space-y-5">
            {selectedPkgAlerts.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-line bg-amber-soft p-3 text-xs text-amber-ink">
                <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <strong>Advisory lead — requires investigator review:</strong>{' '}
                  {selectedPkgAlerts.length} open/recorded alert(s) linked to this serial (
                  {selectedPkgAlerts.map((a) => a.id).join(', ')}).
                </div>
              </div>
            )}

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Serial</dt>
                <dd className="id-text font-semibold">{selectedPkg.serial}</dd>
              </div>
              {selectedPkgBatch && (
                <>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Medicine</dt>
                    <dd className="font-semibold">
                      {productOf(selectedPkgBatch.productId)?.name}{' '}
                      {productOf(selectedPkgBatch.productId)?.strength}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Batch</dt>
                    <dd className="id-text font-semibold">{selectedPkgBatch.no}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Manufactured</dt>
                    <dd className="id-text">{selectedPkgBatch.mfd}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Expiry</dt>
                    <dd className="id-text">{selectedPkgBatch.exp}</dd>
                  </div>
                </>
              )}
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Current Custodian</dt>
                <dd>{orgName(selectedPkg.custodian)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Verify Count</dt>
                <dd className="id-text font-semibold">{selectedPkg.verifyCount ?? 0}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Shipment Ref</dt>
                <dd className="id-text">{selectedPkg.shipmentRef ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Status</dt>
                <dd>
                  <StatusBadge status={selectedPkg.status} />
                </dd>
              </div>
            </dl>

            <div className="border-t border-line pt-4">
              <h3 className="mb-3 text-sm font-bold text-navy">Custody history</h3>
              <Timeline
                items={selectedPkg.history.map(([event, orgId, date]) => ({
                  title: event,
                  meta: `${orgName(orgId)} · ${date}`
                }))}
              />
            </div>

            <div className="border-t border-line pt-4">
              <h3 className="mb-3 text-sm font-bold text-navy">
                Traceability Event Log ({selectedPkgTraceEvents.length})
              </h3>
              {selectedPkgTraceEvents.length === 0 ? (
                <p className="text-xs text-muted">No structured QR scan or transaction events recorded for this serial yet.</p>
              ) : (
                <Timeline
                  items={[...selectedPkgTraceEvents].reverse().map((evt) => ({
                    title: `${evt.eventType} (${evt.outcome})`,
                    meta: `${evt.organizationId ? orgName(evt.organizationId) : evt.actorRole || 'Public'} · ${evt.timestamp}${
                      evt.failureReason ? ` · ${evt.failureReason}` : ''
                    }`
                  }))}
                />
              )}
            </div>
          </div>
        )}
      </Drawer>

      <Drawer
        open={!!selectedShipment}
        onClose={() => setSelectedShipmentRef(null)}
        title={selectedShipment ? `Shipment ${selectedShipment.ref}` : 'Shipment Details'}
      >
        {selectedShipment && (
          <div className="space-y-5">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Reference</dt>
                <dd className="id-text font-semibold">{selectedShipment.ref}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Origin</dt>
                <dd>{orgName(selectedShipment.from)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Destination</dt>
                <dd>{orgName(selectedShipment.to)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Created</dt>
                <dd className="id-text">{selectedShipment.created}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Dispatched</dt>
                <dd className="id-text">{selectedShipment.dispatched ?? 'Not dispatched'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Status</dt>
                <dd>
                  <StatusBadge status={selectedShipment.status} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Receiving</dt>
                <dd>{selectedShipment.receiving}</dd>
              </div>
            </dl>

            <div className="border-t border-line pt-4">
              <h3 className="mb-2 text-sm font-bold text-navy">
                Package Manifest ({selectedShipment.packageSerials?.length ?? 0})
              </h3>
              {selectedShipment.packageSerials?.length ? (
                <ul className="max-h-72 space-y-1.5 overflow-y-auto rounded-md border border-line bg-surface p-2 text-xs">
                  {selectedShipment.packageSerials.map((serial) => (
                    <li key={serial}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedShipmentRef(null)
                          setSelectedPkgSerial(serial)
                        }}
                        className="id-text flex w-full items-center justify-between rounded px-2 py-1.5 text-left font-medium text-navy hover:bg-white"
                      >
                        <span>{serial}</span>
                        <span className="text-clinical">Inspect →</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">No package serials attached.</p>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </>
  )
}
