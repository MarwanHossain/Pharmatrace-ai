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

  const [tab, setTab] = useState('all')
  const [drawerRef, setDrawerRef] = useState(null)
  const [receivingRef, setReceivingRef] = useState(null)
  const [toast, setToast] = useState('')

  const incomingShipments = useMemo(
    () => shipments.filter(s => s.to === orgId),
    [shipments, orgId]
  )

  const counts = useMemo(
    () => ({
      all: incomingShipments.length,
      in_transit: incomingShipments.filter(s => OPEN_STATUSES.has(s.status)).length,
      accepted: incomingShipments.filter(s => DONE_STATUSES.has(s.status)).length
    }),
    [incomingShipments]
  )

  const filteredShipments = useMemo(() => {
    if (tab === 'in_transit') return incomingShipments.filter(s => OPEN_STATUSES.has(s.status))
    if (tab === 'accepted') return incomingShipments.filter(s => DONE_STATUSES.has(s.status))
    return incomingShipments
  }, [incomingShipments, tab])

  const drawerShipment = useMemo(
    () => incomingShipments.find(s => s.ref === drawerRef) ?? null,
    [incomingShipments, drawerRef]
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
        description={`Inspect and reconcile incoming medicine deliveries from distributors into ${currentOrgName} custody.`}
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
              className={`rounded-md border px-3 py-1.5 text-sm font-semibold transition ${
                active
                  ? 'border-navy bg-navy text-white'
                  : 'border-line bg-white text-ink hover:bg-surface'
              }`}
            >
              {t.label} ({counts[t.id]})
            </button>
          )
        })}
      </div>

      <DataTable
        rows={filteredShipments}
        onRowClick={r => setDrawerRef(r.ref)}
        empty={
          tab === 'in_transit'
            ? 'No incoming shipments are currently awaiting acceptance.'
            : 'No incoming shipments match this filter.'
        }
        columns={[
          {
            key: 'ref',
            label: 'Reference',
            render: r => <span className="id-text whitespace-nowrap font-semibold">{r.ref}</span>
          },
          { key: 'from', label: 'From', render: r => orgName(r.from) },
          { key: 'count', label: 'Packages', render: r => r.packageSerials?.length ?? r.count ?? 0 },
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
                <span className="text-xs text-muted">View details</span>
              )
          }
        ]}
      />

      <Drawer
        open={!!drawerShipment}
        onClose={() => setDrawerRef(null)}
        title={drawerShipment ? `Shipment ${drawerShipment.ref}` : 'Shipment details'}
      >
        <ShipmentReceivingDrawer
          shipment={drawerShipment}
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
