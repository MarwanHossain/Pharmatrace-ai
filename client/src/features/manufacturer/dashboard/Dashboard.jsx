import { useMemo } from 'react'
import { PageHeader, MetricCard, DataTable, StatusBadge, Progress } from '../../../components/ui'
import { useDemoData } from '../../../contexts/DemoData'
import { useDemoSession } from '../../../contexts/DemoSession'

export default function Dashboard() {
  const { products, batches, packages, shipments, orgName, productOf } = useDemoData()
  const { orgId, organization } = useDemoSession()

  const orgProducts = useMemo(
    () => products.filter(p => (p.orgId ?? 'm1') === orgId),
    [products, orgId]
  )
  const orgBatches = useMemo(
    () => batches.filter(b => (b.orgId ?? productOf(b.productId)?.orgId ?? 'm1') === orgId),
    [batches, productOf, orgId]
  )
  const orgBatchIds = useMemo(() => new Set(orgBatches.map(b => b.id)), [orgBatches])
  const orgPackages = useMemo(
    () => packages.filter(p => orgBatchIds.has(p.batchId) || p.manufacturerOrgId === orgId),
    [packages, orgBatchIds, orgId]
  )
  const outgoingShipments = useMemo(
    () => shipments.filter(s => s.from === orgId),
    [shipments, orgId]
  )

  const sz = id => orgPackages.filter(p => p.batchId === id).length

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Operational overview of products, batches, serialization and shipments for ${organization?.name ?? orgName(orgId)}.`}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard label="Products" value={orgProducts.length} />
        <MetricCard label="Batches" value={orgBatches.length} />
        <MetricCard label="Serialized packages" value={orgPackages.length} />
        <MetricCard label="Outgoing shipments" value={outgoingShipments.length} />
        <MetricCard
          label="Pending acceptance"
          value={outgoingShipments.filter(s => s.status === 'in_transit').length}
          className="col-span-2 lg:col-span-1"
        />
      </div>
      <h2 className="mb-2 text-sm font-bold text-navy">Serialization progress by batch</h2>
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {orgBatches.map(b => (
          <div key={b.id} className="rounded-lg border border-line bg-white p-4">
            <div className="id-text text-sm font-semibold">{b.no}</div>
            <div className="mb-2 text-xs text-muted">
              {productOf(b.productId)?.name ?? '—'} · exp {b.exp}
            </div>
            <Progress value={sz(b.id)} max={b.quantity} />
          </div>
        ))}
      </div>
      <h2 className="mb-2 text-sm font-bold text-navy">Recent shipments</h2>
      <DataTable
        columns={[
          { key: 'ref', label: 'Reference', render: r => <span className="id-text whitespace-nowrap font-semibold">{r.ref}</span> },
          { key: 'to', label: 'Destination', render: r => orgName(r.to) },
          { key: 'count', label: 'Packages' },
          { key: 'created', label: 'Created' },
          { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
          { key: 'receiving', label: 'Receiving' }
        ]}
        rows={outgoingShipments}
      />
    </>
  )
}
