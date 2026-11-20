// PharmaTrace AI — Pharmacy Incoming Shipments Management
// Connected to live authenticated MariaDB backend APIs (Milestone M7.3)

import { useState, useMemo, useEffect, useCallback } from 'react'
import { PackageCheck, RefreshCw, AlertCircle } from 'lucide-react'
import {
  PageHeader,
  DataTable,
  StatusBadge,
  Button,
  Drawer,
  Toast
} from '../../../components/ui'
import ReceivingModal from '../../../components/shipments/ReceivingModal'
import ShipmentReceivingDrawer from '../../../components/shipments/ShipmentReceivingDrawer'
import {
  getIncomingShipments,
  getShipment,
  receiveShipment,
  closeReconciliation,
  recordRejectedHandover
} from '../../../services/shipmentApi'

const OPEN_STATUSES = new Set(['in_transit', 'partially_received', 'reconciliation_required'])
const DONE_STATUSES = new Set(['accepted', 'reconciled', 'closed'])

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'awaiting', label: 'Awaiting' },
  { id: 'accepted', label: 'Accepted' }
]

export default function Incoming() {
  const [shipments, setShipments] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')

  const [tab, setTab] = useState('all')
  const [selectedRef, setSelectedRef] = useState(null)
  const [selectedDetail, setSelectedDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const [receivingRef, setReceivingRef] = useState(null)
  const [receivingDetail, setReceivingDetail] = useState(null)
  const [loadingReceiving, setLoadingReceiving] = useState(false)

  const [toast, setToast] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setFetchError('')
    try {
      const res = await getIncomingShipments({ limit: 100 })
      setShipments(res.shipments || [])
    } catch (e) {
      setFetchError(e.message || 'Failed to load incoming shipments.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredShipments = useMemo(() => {
    if (tab === 'awaiting') return shipments.filter(s => OPEN_STATUSES.has(s.status))
    if (tab === 'accepted') return shipments.filter(s => DONE_STATUSES.has(s.status))
    return shipments
  }, [shipments, tab])

  const tabCounts = useMemo(
    () => ({
      all: shipments.length,
      awaiting: shipments.filter(s => OPEN_STATUSES.has(s.status)).length,
      accepted: shipments.filter(s => DONE_STATUSES.has(s.status)).length
    }),
    [shipments]
  )

  const formatShipmentData = useCallback((detail) => {
    if (!detail) return null
    const packageDispositions = {}
    for (const p of detail.packages || []) {
      if (p.disposition_status && p.disposition_status !== 'outstanding') {
        packageDispositions[p.serial] = {
          serial: p.serial,
          status: p.disposition_status,
          reason: p.disposition_reason || '',
          notes: p.disposition_reason || '',
          scanned: Boolean(p.scanned_at_receiving)
        }
      }
    }
    return {
      ...detail,
      packageSerials: detail.packageSerials || (detail.packages || []).map(p => p.serial),
      packageDispositions,
      packagesList: (detail.packages || []).map(p => ({
        serial: p.serial,
        batchId: p.batch_id || p.batch_no,
        status: p.package_status || 'in_transit'
      })),
      batchesList: (detail.packages || []).map(p => ({
        id: p.batch_id || p.batch_no,
        no: p.batch_no,
        exp: p.exp,
        productId: p.batch_id || p.batch_no
      })),
      productOf: (id) => {
        const found = (detail.packages || []).find(p => (p.batch_id || p.batch_no) === id)
        return {
          name: found?.product_name || found?.generic_name || 'Medicine',
          strength: found?.strength || ''
        }
      },
      orgName: (id) => {
        if (id === detail.from_org_id) return detail.from_org_name || id
        if (id === detail.to_org_id) return detail.to_org_name || id
        return id
      }
    }
  }, [])

  async function handleRowClick(row) {
    setSelectedRef(row.ref)
    setLoadingDetail(true)
    setSelectedDetail(null)
    try {
      const detail = await getShipment(row.ref)
      setSelectedDetail(formatShipmentData(detail))
    } catch (err) {
      setToast(`Failed to load details for ${row.ref}: ${err.message}`)
    } finally {
      setLoadingDetail(false)
    }
  }

  async function handleStartReceive(ref) {
    setReceivingRef(ref)
    setLoadingReceiving(true)
    setReceivingDetail(null)
    try {
      const detail = await getShipment(ref)
      setReceivingDetail(formatShipmentData(detail))
    } catch (err) {
      setToast(`Failed to load shipment for receiving: ${err.message}`)
      setReceivingRef(null)
    } finally {
      setLoadingReceiving(false)
    }
  }

  async function handleSaveSession({ shipmentRef, sessionDispositions, unmatchedScans }) {
    try {
      const res = await receiveShipment(shipmentRef, {
        sessionDispositions,
        unmatchedScans
      })
      setReceivingRef(null)
      setSelectedRef(null)
      setToast(`Receiving recorded for ${shipmentRef}: ${res.status}.`)
      await loadData()
      return { ok: true, shipment: res }
    } catch (err) {
      return { ok: false, error: err.message || 'Receiving session failed.' }
    }
  }

  async function handleCloseReconciliation(ref, note) {
    try {
      const res = await closeReconciliation(ref, { note })
      setToast(`Shipment ${ref} reconciliation closed (${res.status}).`)
      setSelectedRef(null)
      await loadData()
      return { ok: true, nextShipment: res }
    } catch (err) {
      return { ok: false, error: err.message || 'Closure failed.' }
    }
  }

  async function handleRecordRejectedHandover(ref, serial, note) {
    try {
      const res = await recordRejectedHandover(ref, { packageSerial: serial, note })
      setToast(`Recorded physical return handover for ${serial}.`)
      setSelectedRef(null)
      await loadData()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message || 'Handover failed.' }
    }
  }

  return (
    <>
      <PageHeader
        title="Incoming Shipments"
        description="Receive verified medicine shipments from wholesale depots, conduct itemized intake scans, and reconcile batches."
        actions={
          <Button variant="secondary" onClick={loadData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
        }
      />

      {fetchError && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-quarantine-line bg-quarantine-soft p-3 text-sm text-quarantine">
          <AlertCircle size={16} />
          <span>{fetchError}</span>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filter incoming shipments">
        {TABS.map(t => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-semibold transition ${
                active
                  ? 'border-navy bg-navy text-white'
                  : 'border-line bg-white text-ink hover:bg-surface'
              }`}
            >
              <span>{t.label}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-xs ${
                  active ? 'bg-white/20 text-white' : 'bg-surface text-muted'
                }`}
              >
                {tabCounts[t.id]}
              </span>
            </button>
          )
        })}
      </div>

      <DataTable
        empty="No incoming shipments match this filter."
        onRowClick={handleRowClick}
        columns={[
          {
            key: 'ref',
            label: 'Reference',
            render: r => <span className="id-text whitespace-nowrap font-semibold">{r.ref}</span>
          },
          { key: 'from_org_name', label: 'From', render: r => r.from_org_name || r.from_org_id },
          {
            key: 'count',
            label: 'Count',
            render: r => r.package_count || r.count || 0
          },
          {
            key: 'dispatched_at',
            label: 'Dispatched',
            render: r => (r.dispatched_at ? new Date(r.dispatched_at).toLocaleDateString() : '—')
          },
          { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
          {
            key: 'actions',
            label: 'Action',
            render: r =>
              r.status === 'in_transit' || r.status === 'partially_received' || r.status === 'reconciliation_required' ? (
                <Button
                  variant="success"
                  className="px-2.5 py-1 text-xs"
                  onClick={e => {
                    e.stopPropagation()
                    handleStartReceive(r.ref)
                  }}
                >
                  <PackageCheck size={14} aria-hidden="true" />
                  {r.status === 'partially_received' || r.status === 'reconciliation_required' ? 'Continue Receiving' : 'Receive Shipment'}
                </Button>
              ) : (
                <span className="text-xs text-muted font-medium">
                  {r.status === 'accepted' ? 'Accepted' : (r.status === 'closed' ? 'Closed' : r.status)}
                </span>
              )
          }
        ]}
        rows={filteredShipments}
      />

      {/* Shipment Details Drawer */}
      <Drawer
        open={!!selectedRef}
        onClose={() => {
          setSelectedRef(null)
          setSelectedDetail(null)
        }}
        title={selectedRef ? `Shipment ${selectedRef}` : 'Shipment details'}
      >
        {loadingDetail && (
          <div className="py-8 text-center text-sm text-muted">
            <RefreshCw size={18} className="mx-auto mb-2 animate-spin text-navy" />
            Loading shipment details...
          </div>
        )}

        {selectedDetail && (
          <ShipmentReceivingDrawer
            shipment={selectedDetail}
            packages={selectedDetail.packagesList}
            batches={selectedDetail.batchesList}
            orgName={selectedDetail.orgName}
            productOf={selectedDetail.productOf}
            onOpenReceive={s => handleStartReceive(s.ref)}
            onCloseReconciliation={handleCloseReconciliation}
            onRecordRejectedHandover={handleRecordRejectedHandover}
          />
        )}
      </Drawer>

      {/* Receiving Modal */}
      {receivingDetail && (
        <ReceivingModal
          open={!!receivingRef}
          shipment={receivingDetail}
          packages={receivingDetail.packagesList}
          batches={receivingDetail.batchesList}
          orgName={receivingDetail.orgName}
          productOf={receivingDetail.productOf}
          onClose={() => {
            setReceivingRef(null)
            setReceivingDetail(null)
          }}
          onSaveSession={handleSaveSession}
        />
      )}

      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </>
  )
}
