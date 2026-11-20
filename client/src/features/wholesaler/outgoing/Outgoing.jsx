// PharmaTrace AI — Wholesaler Outgoing Shipments Management
// Connected to live authenticated MariaDB backend APIs (Milestone M7.3)

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Plus, Send, Truck, ShieldAlert, RefreshCw, AlertCircle } from 'lucide-react'
import {
  PageHeader,
  MetricCard,
  DataTable,
  StatusBadge,
  Button,
  Drawer,
  Modal,
  Toast
} from '../../../components/ui'
import QrScanner from '../../../components/scanner/QrScanner'
import OutgoingEligibilityList from '../../../components/shipments/OutgoingEligibilityList'
import { extractSerialFromInput } from '../../../services/qrPayload'
import {
  getOutgoingShipments,
  getEligiblePackages,
  getEligibleDestinations,
  createShipment,
  getShipment
} from '../../../services/shipmentApi'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'in_transit', label: 'In transit' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'closed', label: 'Closed' }
]

export default function Outgoing() {
  const [shipments, setShipments] = useState([])
  const [eligiblePackages, setEligiblePackages] = useState([])
  const [destinations, setDestinations] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')

  const [statusFilter, setStatusFilter] = useState('all')
  const [selRef, setSelRef] = useState(null)
  const [selectedDetail, setSelectedDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [destination, setDestination] = useState('')
  const [selectedSerials, setSelectedSerials] = useState([])
  const [scanNotice, setScanNotice] = useState(null)
  const [formErr, setFormErr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setFetchError('')
    try {
      const [shipRes, pkgRes, destRes] = await Promise.all([
        getOutgoingShipments({ limit: 100 }),
        getEligiblePackages(),
        getEligibleDestinations()
      ])
      setShipments(shipRes.shipments || [])
      setEligiblePackages(pkgRes || [])
      setDestinations(destRes || [])
      if (!destination && destRes && destRes.length > 0) {
        setDestination(destRes[0].id)
      }
    } catch (e) {
      setFetchError(e.message || 'Failed to load outgoing shipments.')
    } finally {
      setLoading(false)
    }
  }, [destination])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredShipments = useMemo(() => {
    if (statusFilter === 'all') return shipments
    return shipments.filter(s => s.status === statusFilter)
  }, [shipments, statusFilter])

  const eligibleItems = useMemo(() => {
    return eligiblePackages.map(pkg => ({
      pkg: {
        serial: pkg.serial,
        status: pkg.status,
        batchId: pkg.batch_id
      },
      batch: {
        id: pkg.batch_id,
        no: pkg.batch_no,
        exp: pkg.exp,
        release_status: pkg.release_status
      },
      product: {
        name: pkg.brand_name || pkg.generic_name || 'Medicine',
        strength: pkg.strength || ''
      },
      eligible: true,
      reasons: []
    }))
  }, [eligiblePackages])

  function openCreateModal() {
    if (destinations.length > 0 && !destination) {
      setDestination(destinations[0].id)
    }
    setSelectedSerials([])
    setScanNotice(null)
    setFormErr('')
    setCreateOpen(true)
  }

  function toggleSerial(serial) {
    setFormErr('')
    setSelectedSerials(prev =>
      prev.includes(serial) ? prev.filter(s => s !== serial) : [...prev, serial]
    )
  }

  function handleScanPackage(rawSerial) {
    const normalized = extractSerialFromInput(rawSerial) || String(rawSerial || '').trim().toUpperCase()
    if (!normalized) return
    setFormErr('')

    const found = eligiblePackages.find(p => p.serial === normalized)
    if (!found) {
      setScanNotice({
        ok: false,
        text: `Serial ${normalized} is not in accepted custody inventory.`
      })
      return
    }

    if (selectedSerials.includes(normalized)) {
      setScanNotice({
        ok: true,
        text: `Package ${normalized} is already selected.`
      })
    } else {
      setSelectedSerials(prev => [...prev, normalized])
      setScanNotice({
        ok: true,
        text: `Verified & added ${normalized} (${found.brand_name || found.generic_name || 'Package'}).`
      })
    }
  }

  async function handleCreateShipment() {
    if (submitting) return
    if (!destination) {
      setFormErr('Please select an active pharmacy destination.')
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
        toOrgId: destination,
        packageSerials: selectedSerials,
        allocationScope: 'COMMERCIAL'
      })
      setCreateOpen(false)
      setSelectedSerials([])
      setToast(`Shipment ${res.ref} dispatched with ${res.packageCount} package(s).`)
      await loadData()
    } catch (err) {
      setFormErr(err.message || 'Could not dispatch shipment.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRowClick(row) {
    setSelRef(row.ref)
    setLoadingDetail(true)
    setSelectedDetail(null)
    try {
      const detail = await getShipment(row.ref)
      setSelectedDetail(detail)
    } catch (err) {
      setToast(`Failed to load details for ${row.ref}: ${err.message}`)
    } finally {
      setLoadingDetail(false)
    }
  }

  const inTransitCount = shipments.filter(s => s.status === 'in_transit').length
  const acceptedCount = shipments.filter(s => s.status === 'accepted' || s.status === 'closed').length

  return (
    <>
      <PageHeader
        title="Outgoing Shipments"
        description="Dispatch accepted pharmaceutical inventory to licensed community and hospital pharmacies."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={loadData} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
            <Button onClick={openCreateModal}>
              <Plus size={15} /> Create shipment
            </Button>
          </div>
        }
      />

      {fetchError && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-quarantine-line bg-quarantine-soft p-3 text-sm text-quarantine">
          <AlertCircle size={16} />
          <span>{fetchError}</span>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total shipments" value={shipments.length} />
        <MetricCard label="In transit" value={inTransitCount} />
        <MetricCard label="Accepted / Closed" value={acceptedCount} />
        <MetricCard label="Eligible packages" value={eligiblePackages.length} hint="Available in custody to dispatch" />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(f => {
            const count =
              f.id === 'all'
                ? shipments.length
                : shipments.filter(s => s.status === f.id).length
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
        onRowClick={handleRowClick}
        empty="No outgoing shipments match the selected status."
        columns={[
          {
            key: 'ref',
            label: 'Reference',
            render: r => <span className="id-text whitespace-nowrap font-semibold text-navy">{r.ref}</span>
          },
          { key: 'to_org_name', label: 'Destination', render: r => r.to_org_name || r.to_org_id },
          { key: 'package_count', label: 'Packages', render: r => <span className="id-text">{r.package_count || r.count || 0}</span> },
          {
            key: 'dispatched_at',
            label: 'Dispatched',
            render: r => <span className="id-text whitespace-nowrap">{r.dispatched_at ? new Date(r.dispatched_at).toLocaleDateString() : '—'}</span>
          },
          { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
          {
            key: 'receiving',
            label: 'Receiving Summary',
            render: r => {
              if (r.status === 'in_transit') return <span className="text-xs text-muted">Awaiting recipient</span>
              if (r.status === 'accepted') return <span className="text-xs text-clinical font-semibold">Accepted ({r.accepted_count ?? r.package_count})</span>
              if (r.status === 'reconciliation_required' || r.status === 'partially_received') {
                return (
                  <span className="text-xs text-quarantine font-medium">
                    {r.accepted_count || 0} acc, {r.damaged_count || 0} dmg, {r.missing_count || 0} mis
                  </span>
                )
              }
              return <span className="text-xs text-muted">{r.status}</span>
            }
          }
        ]}
      />

      {/* Create Shipment Modal */}
      <Modal
        open={createOpen}
        title="Create & dispatch shipment to pharmacy"
        onClose={() => setCreateOpen(false)}
        actions={
          <>
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreateShipment}
              disabled={!destination || selectedSerials.length === 0 || eligiblePackages.length === 0 || submitting}
            >
              {submitting ? 'Dispatching...' : `Dispatch shipment (${selectedSerials.length})`}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block text-sm font-semibold">
            Destination Pharmacy
            {destinations.length === 0 ? (
              <p role="alert" className="mt-1 rounded-md border border-quarantine-line bg-quarantine-soft p-2.5 text-xs font-medium text-quarantine">
                No active pharmacy organizations are available in the registry.
              </p>
            ) : (
              <select
                value={destination}
                onChange={e => setDestination(e.target.value)}
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
              >
                {destinations.map(org => (
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
              placeholder="Scan or enter package serial"
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
            ineligibleItems={[]}
            selectedSerials={selectedSerials}
            onToggle={toggleSerial}
            onSelectAllEligible={() => setSelectedSerials(eligibleItems.map(i => i.pkg.serial))}
            onClearSelected={() => setSelectedSerials([])}
            emptyEligibleText="No accepted packages currently in custody to dispatch."
          />

          {formErr && (
            <p role="alert" className="text-sm font-semibold text-quarantine">
              {formErr}
            </p>
          )}
        </div>
      </Modal>

      {/* Shipment Details Drawer */}
      <Drawer
        open={!!selRef}
        onClose={() => {
          setSelRef(null)
          setSelectedDetail(null)
        }}
        title={selRef ? `Shipment ${selRef}` : 'Shipment details'}
      >
        {loadingDetail && (
          <div className="py-8 text-center text-sm text-muted">
            <RefreshCw size={18} className="mx-auto mb-2 animate-spin text-navy" />
            Loading manifest details...
          </div>
        )}

        {selectedDetail && (
          <>
            <dl className="mb-5 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Reference</dt>
                <dd className="id-text font-semibold">{selectedDetail.ref}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Origin</dt>
                <dd className="font-semibold">{selectedDetail.from_org_name || selectedDetail.from_org_id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Destination</dt>
                <dd className="font-semibold">{selectedDetail.to_org_name || selectedDetail.to_org_id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Dispatched</dt>
                <dd className="id-text font-semibold">
                  {selectedDetail.dispatched_at ? new Date(selectedDetail.dispatched_at).toLocaleString() : '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Received</dt>
                <dd className="id-text font-semibold">
                  {selectedDetail.received_at ? new Date(selectedDetail.received_at).toLocaleString() : '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted">Status</dt>
                <StatusBadge status={selectedDetail.status} />
              </div>
            </dl>

            <h3 className="mb-2 text-sm font-bold text-navy">
              Manifest Packages ({selectedDetail.packages?.length ?? selectedDetail.package_count ?? 0})
            </h3>
            {(!selectedDetail.packages || selectedDetail.packages.length === 0) ? (
              <p className="rounded-md border border-dashed border-line p-4 text-center text-xs text-muted">
                No packages attached to this shipment manifest.
              </p>
            ) : (
              <div className="max-h-80 divide-y divide-line overflow-y-auto rounded-md border border-line">
                {selectedDetail.packages.map(pkg => (
                  <div key={pkg.serial} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                    <div>
                      <div className="id-text font-semibold text-navy">{pkg.serial}</div>
                      <div className="text-muted">
                        {pkg.brand_name || pkg.generic_name || 'Medicine'} · Batch {pkg.batch_no || '—'} · Exp {pkg.exp || '—'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={pkg.disposition_status || pkg.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Drawer>

      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </>
  )
}
