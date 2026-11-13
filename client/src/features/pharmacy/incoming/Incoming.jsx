import { useMemo, useState } from 'react'
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

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'in_transit', label: 'Awaiting' },
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
  const { orgId, organization } = useDemoSession()
  const currentOrgName = organization?.name ?? orgName(orgId)

  const [filter, setFilter] = useState('all')
  const [selectedRef, setSelectedRef] = useState(null)
  const [receivingRef, setReceivingRef] = useState(null)
  const [toast, setToast] = useState('')

  const pharmacyShipments = useMemo(
    () => shipments.filter(s => s.to === orgId),
    [shipments, orgId]
  )

  const filteredShipments = useMemo(() => {
    if (filter === 'all') return pharmacyShipments
    if (filter === 'in_transit') return pharmacyShipments.filter(s => OPEN_STATUSES.has(s.status))
    return pharmacyShipments.filter(s => DONE_STATUSES.has(s.status))
  }, [pharmacyShipments, filter])

  const activeShipment = useMemo(
    () => pharmacyShipments.find(s => s.ref === selectedRef) ?? null,
    [pharmacyShipments, selectedRef]
  )

  const receivingShipment = useMemo(
    () => pharmacyShipments.find(s => s.ref === receivingRef) ?? null,
    [pharmacyShipments, receivingRef]
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
        description={`Review deliveries consigned to ${currentOrgName}, verify scanned serials against manifests, and reconcile partial or damaged deliveries.`}
      />

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter incoming shipments">
        {FILTERS.map(tab => {
          const count =
            tab.id === 'all'
              ? pharmacyShipments.length
              : tab.id === 'in_transit'
                ? pharmacyShipments.filter(s => OPEN_STATUSES.has(s.status)).length
                : pharmacyShipments.filter(s => DONE_STATUSES.has(s.status)).length
          const active = filter === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-semibold transition ${
                active
                  ? 'border-navy bg-navy text-white'
                  : 'border-line bg-white text-ink hover:bg-surface'
              }`}
            >
              {tab.label}
              <span
                className={`id-text rounded px-1.5 py-0.5 text-xs ${
                  active ? 'bg-white/20 text-white' : 'bg-surface text-muted'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <DataTable
        columns={[
          {
            key: 'ref',
            label: 'Reference',
            render: r => <span className="id-text whitespace-nowrap font-semibold">{r.ref}</span>
          },
          { key: 'from', label: 'Origin', render: r => orgName(r.from) },
          {
            key: 'count',
            label: 'Packages',
            render: r => r.count ?? r.packageSerials?.length ?? 0
          },
          { key: 'created', label: 'Created' },
          { key: 'dispatched', label: 'Dispatched', render: r => r.dispatched ?? '—' },
          { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
          {
            key: 'receiving',
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
        onRowClick={row => setSelectedRef(row.ref)}
        empty="No incoming shipments match this filter."
      />

      <Drawer
        open={Boolean(activeShipment)}
        title={activeShipment ? `Shipment ${activeShipment.ref}` : 'Shipment manifest'}
        onClose={() => setSelectedRef(null)}
      >
        <ShipmentReceivingDrawer
          shipment={activeShipment}
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
        open={Boolean(receivingShipment)}
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
