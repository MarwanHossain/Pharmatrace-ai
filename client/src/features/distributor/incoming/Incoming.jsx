import { useState, useMemo } from 'react'
import { PackageCheck } from 'lucide-react'
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
import { useDemoData } from '../../../contexts/DemoData'
import { useDemoSession } from '../../../contexts/DemoSession'

const OPEN_STATUSES = new Set(['in_transit', 'partially_received', 'reconciliation_required'])
const DONE_STATUSES = new Set(['accepted', 'reconciled', 'closed'])

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'awaiting', label: 'Awaiting' },
  { id: 'accepted', label: 'Accepted' }
]

export default function Incoming() {
  const {
    shipments,
    packages,
    batches,
    orgName,
    productOf,
    recordReceivingSession,
    closeShipmentReconciliation,
    recordRejectedHandover
  } = useDemoData()
  const { orgId } = useDemoSession()

  const [tab, setTab] = useState('all')
  const [selectedRef, setSelectedRef] = useState(null)
  const [receivingRef, setReceivingRef] = useState(null)
  const [toast, setToast] = useState('')

  const incomingShipments = useMemo(
    () => shipments.filter(s => s.to === orgId),
    [shipments, orgId]
  )

  const filteredShipments = useMemo(() => {
    if (tab === 'awaiting') return incomingShipments.filter(s => OPEN_STATUSES.has(s.status))
    if (tab === 'accepted') return incomingShipments.filter(s => DONE_STATUSES.has(s.status))
    return incomingShipments
  }, [incomingShipments, tab])

  const tabCounts = useMemo(
    () => ({
      all: incomingShipments.length,
      awaiting: incomingShipments.filter(s => OPEN_STATUSES.has(s.status)).length,
      accepted: incomingShipments.filter(s => DONE_STATUSES.has(s.status)).length
    }),
    [incomingShipments]
  )

  const selectedShipment = useMemo(
    () => incomingShipments.find(s => s.ref === selectedRef) ?? null,
    [incomingShipments, selectedRef]
  )

  const receivingShipment = useMemo(
    () => incomingShipments.find(s => s.ref === receivingRef) ?? null,
    [incomingShipments, receivingRef]
  )

  async function handleSaveSession({ shipmentRef, sessionDispositions, unmatchedScans }) {
    const res = await recordReceivingSession(shipmentRef, { sessionDispositions, unmatchedScans })
    if (!res?.ok) return res
    setReceivingRef(null)
    setToast(`Session ${res.sessionRecord.id} saved for ${shipmentRef}: ${res.shipment.receiving}.`)
    return res
  }

  async function handleCloseReconciliation(ref, note) {
    const res = await closeShipmentReconciliation(ref, note)
    if (res?.ok) {
      setToast(`Shipment ${ref} reconciliation closed (${res.nextShipment.status}).`)
    }
    return res
  }

  async function handleRecordRejectedHandover(ref, serial, note) {
    const res = await recordRejectedHandover(ref, serial, note)
    if (res?.ok) {
      setToast(`Recorded physical return handover for ${serial}.`)
    }
    return res
  }

  return (
    <>
      <PageHeader
        title="Incoming Shipments"
        description="Inspect incoming deliveries from manufacturers, scan packages against shipment manifests, and reconcile partial or damaged receipts."
      />

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
        onRowClick={r => setSelectedRef(r.ref)}
        columns={[
          {
            key: 'ref',
            label: 'Reference',
            render: r => <span className="id-text whitespace-nowrap font-semibold">{r.ref}</span>
          },
          { key: 'from', label: 'From', render: r => orgName(r.from) },
          {
            key: 'count',
            label: 'Count',
            render: r => r.packageSerials?.length ?? r.count ?? 0
          },
          { key: 'dispatched', label: 'Dispatched', render: r => r.dispatched ?? '—' },
          { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
          {
            key: 'actions',
            label: 'Action',
            render: r =>
              r.status === 'in_transit' || r.status === 'partially_received' ? (
                <Button
                  variant="success"
                  className="px-2.5 py-1 text-xs"
                  onClick={e => {
                    e.stopPropagation()
                    setReceivingRef(r.ref)
                  }}
                >
                  <PackageCheck size={14} aria-hidden="true" />
                  {r.status === 'partially_received' ? 'Continue Receiving' : 'Receive Shipment'}
                </Button>
              ) : (
                <span className="text-xs text-muted">{r.receiving}</span>
              )
          }
        ]}
        rows={filteredShipments}
      />

      <Drawer
        open={!!selectedShipment}
        onClose={() => setSelectedRef(null)}
        title={selectedShipment ? `Shipment ${selectedShipment.ref}` : 'Shipment details'}
      >
        <ShipmentReceivingDrawer
          shipment={selectedShipment}
          packages={packages}
          batches={batches}
          orgName={orgName}
          productOf={productOf}
          onOpenReceive={s => setReceivingRef(s.ref)}
          onCloseReconciliation={handleCloseReconciliation}
          onRecordRejectedHandover={handleRecordRejectedHandover}
        />
      </Drawer>

      <ReceivingModal
        open={!!receivingShipment}
        shipment={receivingShipment}
        packages={packages}
        batches={batches}
        orgName={orgName}
        productOf={productOf}
        onClose={() => setReceivingRef(null)}
        onSaveSession={handleSaveSession}
      />

      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </>
  )
}
