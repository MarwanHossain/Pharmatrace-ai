import { useMemo } from 'react'
import { PageHeader, MetricCard, DataTable, StatusBadge } from '../../../components/ui'
import { useDemoData } from '../../../contexts/DemoData'
import { useDemoSession } from '../../../contexts/DemoSession'
import { RECEIVABLE_SHIPMENT_STATUSES } from '../../../services/supplyChain'

export default function Dashboard() {
  const { packages, shipments, orgName } = useDemoData()
  const { orgId, organization } = useDemoSession()

  const incomingShipments = useMemo(
    () => shipments.filter(s => s.to === orgId),
    [shipments, orgId]
  )
  const outgoingShipments = useMemo(
    () => shipments.filter(s => s.from === orgId),
    [shipments, orgId]
  )
  const awaitingIncoming = useMemo(
    () => incomingShipments.filter(s => RECEIVABLE_SHIPMENT_STATUSES.has(s.status)),
    [incomingShipments]
  )
  const inventoryPackages = useMemo(
    () => packages.filter(p => p.custodian === orgId && p.status === 'accepted'),
    [packages, orgId]
  )
  const outgoingPackagesInTransit = useMemo(
    () =>
      outgoingShipments
        .filter(s => s.status === 'in_transit')
        .reduce((sum, s) => sum + (s.packageSerials?.length ?? s.count ?? 0), 0),
    [outgoingShipments]
  )

  const currentOrgName = organization?.name ?? orgName(orgId)

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Operational overview of incoming deliveries, inventory custody, and outgoing shipments for ${currentOrgName}.`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Incoming awaiting"
          value={awaitingIncoming.length}
          hint="In-transit shipments to receive"
        />
        <MetricCard
          label="Inventory"
          value={inventoryPackages.length}
          hint="Accepted packages in custody"
        />
        <MetricCard
          label="Outgoing shipments"
          value={outgoingShipments.length}
          hint="Total shipments from distributor"
        />
        <MetricCard
          label="Packages in transit"
          value={outgoingPackagesInTransit}
          hint="Outbound packages awaiting acceptance"
        />
      </div>

      <h2 className="mb-2 text-sm font-bold text-navy">Recent incoming shipments</h2>
      <div className="mb-6">
        <DataTable
          empty="No incoming shipments found."
          columns={[
            { key: 'ref', label: 'Reference', render: r => <span className="id-text whitespace-nowrap font-semibold">{r.ref}</span> },
            { key: 'from', label: 'Origin', render: r => orgName(r.from) },
            { key: 'count', label: 'Packages', render: r => r.packageSerials?.length ?? r.count ?? 0 },
            { key: 'dispatched', label: 'Dispatched', render: r => r.dispatched ?? '—' },
            { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
            { key: 'receiving', label: 'Receiving' }
          ]}
          rows={incomingShipments}
        />
      </div>

      <h2 className="mb-2 text-sm font-bold text-navy">Recent outgoing shipments</h2>
      <DataTable
        empty="No outgoing shipments found."
        columns={[
          { key: 'ref', label: 'Reference', render: r => <span className="id-text whitespace-nowrap font-semibold">{r.ref}</span> },
          { key: 'to', label: 'Destination', render: r => orgName(r.to) },
          { key: 'count', label: 'Packages', render: r => r.packageSerials?.length ?? r.count ?? 0 },
          { key: 'created', label: 'Created' },
          { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
          { key: 'receiving', label: 'Receiving' }
        ]}
        rows={outgoingShipments}
      />
    </>
  )
}
