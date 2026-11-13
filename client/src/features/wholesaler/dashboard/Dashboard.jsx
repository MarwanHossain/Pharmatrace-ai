import { useMemo } from 'react'
import { PageHeader, MetricCard, DataTable, StatusBadge } from '../../../components/ui'
import { useDemoData } from '../../../contexts/DemoData'
import { useDemoSession } from '../../../contexts/DemoSession'
import { RECEIVABLE_SHIPMENT_STATUSES } from '../../../services/supplyChain'

export default function Dashboard() {
  const { packages, shipments, orgName } = useDemoData()
  const { orgId, organization } = useDemoSession()
  const currentOrgName = organization?.name ?? orgName(orgId)

  const incomingShipments = useMemo(
    () => shipments.filter(s => s.to === orgId),
    [shipments, orgId]
  )
  const outgoingShipments = useMemo(
    () => shipments.filter(s => s.from === orgId),
    [shipments, orgId]
  )

  const incomingAwaiting = incomingShipments.filter(s => RECEIVABLE_SHIPMENT_STATUSES.has(s.status)).length
  const onHandInventory = packages.filter(
    p => p.custodian === orgId && p.status === 'accepted'
  ).length
  const inTransitOutgoing = outgoingShipments.filter(s => s.status === 'in_transit').length

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Operational overview of incoming distributor deliveries, on-hand wholesale inventory, and outgoing pharmacy shipments for ${currentOrgName}.`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Incoming awaiting"
          value={incomingAwaiting}
          hint={`${incomingShipments.length} total incoming`}
        />
        <MetricCard
          label="On-hand inventory"
          value={onHandInventory}
          hint="Accepted packages in custody"
        />
        <MetricCard
          label="Outgoing shipments"
          value={outgoingShipments.length}
          hint="Dispatches to pharmacies"
        />
        <MetricCard
          label="In-transit outgoing"
          value={inTransitOutgoing}
          hint="Awaiting pharmacy acceptance"
        />
      </div>

      {onHandInventory === 0 && (
        <div className="mb-6 rounded-lg border border-amber-line bg-amber-soft px-4 py-3 text-xs text-amber-ink">
          On-hand wholesale inventory at {currentOrgName} is currently empty. When a distributor dispatches a shipment to {currentOrgName}, receive it under <strong>Incoming Shipments</strong> to add packages to stock.
        </div>
      )}

      <div className="space-y-6">
        <section>
          <h2 className="mb-2 text-sm font-bold text-navy">Recent incoming shipments</h2>
          <DataTable
            columns={[
              {
                key: 'ref',
                label: 'Reference',
                render: r => <span className="id-text whitespace-nowrap font-semibold">{r.ref}</span>
              },
              { key: 'from', label: 'Origin', render: r => orgName(r.from) },
              { key: 'count', label: 'Packages' },
              {
                key: 'dispatched',
                label: 'Dispatched',
                render: r => <span className="id-text whitespace-nowrap">{r.dispatched ?? '—'}</span>
              },
              { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
              { key: 'receiving', label: 'Receiving' }
            ]}
            rows={incomingShipments}
            pageSize={5}
            empty="No incoming shipments from distributors yet."
          />
        </section>

        <section>
          <h2 className="mb-2 text-sm font-bold text-navy">Recent outgoing shipments</h2>
          <DataTable
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
              { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
              { key: 'receiving', label: 'Receiving' }
            ]}
            rows={outgoingShipments}
            pageSize={5}
            empty="No outgoing shipments to pharmacies yet."
          />
        </section>
      </div>
    </>
  )
}
