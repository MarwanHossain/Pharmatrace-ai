// PharmaTrace AI — Manufacturer Operational Dashboard
// Connected to live authenticated MariaDB backend APIs (Milestone M9)

import { useMemo, useState, useEffect, useCallback } from 'react'
import { PageHeader, MetricCard, DataTable, StatusBadge, Progress, Button } from '../../../components/ui'
import { useDemoData } from '../../../contexts/DemoData'
import { useDemoSession } from '../../../contexts/DemoSession'
import { useAuth } from '../../../contexts/AuthContext'
import { getProducts } from '../../../services/manufacturerProductApi'
import { getBatches } from '../../../services/manufacturerBatchApi'
import { getPackages } from '../../../services/manufacturerPackageApi'
import { getOutgoingShipments } from '../../../services/shipmentApi'
import { RefreshCw } from 'lucide-react'

export default function Dashboard() {
  const { products: demoProducts, batches: demoBatches, packages: demoPackages, shipments: demoShipments, orgName, productOf } = useDemoData()
  const { orgId, organization } = useDemoSession()
  const { currentUser, isAuthenticated } = useAuth()

  const [liveProducts, setLiveProducts] = useState([])
  const [liveBatches, setLiveBatches] = useState([])
  const [livePackages, setLivePackages] = useState([])
  const [liveShipments, setLiveShipments] = useState([])
  const [loading, setLoading] = useState(isAuthenticated)

  const loadLiveData = useCallback(async () => {
    if (!isAuthenticated) return
    setLoading(true)
    try {
      const [prodRes, batchRes, pkgRes, shipRes] = await Promise.all([
        getProducts({ limit: 100 }),
        getBatches({ limit: 100 }),
        getPackages({ limit: 100 }),
        getOutgoingShipments({ limit: 10 })
      ])
      setLiveProducts(prodRes.products || [])
      setLiveBatches(batchRes.batches || [])
      setLivePackages(pkgRes.packages || [])
      setLiveShipments(shipRes.shipments || [])
    } catch {
      // Graceful fallback to demo data if offline
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (isAuthenticated) {
      loadLiveData()
    }
  }, [isAuthenticated, loadLiveData])

  const orgProducts = isAuthenticated ? liveProducts : demoProducts.filter(p => (p.orgId ?? 'm1') === orgId)
  const orgBatches = isAuthenticated ? liveBatches : demoBatches.filter(b => (b.orgId ?? productOf(b.productId)?.orgId ?? 'm1') === orgId)
  const orgPackages = isAuthenticated ? livePackages : demoPackages.filter(p => p.manufacturerOrgId === orgId)
  const outgoingShipments = isAuthenticated ? liveShipments : demoShipments.filter(s => s.from === orgId)

  const sz = batchId => orgPackages.filter(p => p.batch_id === batchId || p.batchId === batchId).length

  const currentOrgName = isAuthenticated
    ? (currentUser?.orgName || 'Manufacturing Partner')
    : (organization?.name ?? orgName(orgId))

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Operational overview of products, batches, serialization and shipments for ${currentOrgName}.`}
        actions={
          isAuthenticated && (
            <Button variant="secondary" onClick={loadLiveData} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
          )
        }
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
            <div className="id-text text-sm font-semibold">{b.batch_no || b.no}</div>
            <div className="mb-2 text-xs text-muted">
              {b.product_name || b.productName || productOf(b.productId)?.name || '—'} · exp {b.exp}
            </div>
            <Progress value={b.serialized_count ?? sz(b.id)} max={b.quantity} />
          </div>
        ))}
      </div>
      <h2 className="mb-2 text-sm font-bold text-navy">Recent shipments</h2>
      <DataTable
        empty="No outgoing shipments found."
        columns={[
          { key: 'ref', label: 'Reference', render: r => <span className="id-text whitespace-nowrap font-semibold">{r.ref}</span> },
          { key: 'to', label: 'Destination', render: r => r.toName || r.to_org_name || orgName(r.to) },
          { key: 'count', label: 'Packages', render: r => r.packageCount ?? r.packageSerials?.length ?? r.count ?? 0 },
          { key: 'created', label: 'Created', render: r => r.createdAt ? new Date(r.createdAt).toLocaleString() : (r.created ?? '—') },
          { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
          { key: 'receiving', label: 'Receiving', render: r => r.receiving || (r.summary ? `${r.summary.accepted ?? 0} acc, ${r.summary.damaged ?? 0} dmg` : '—') }
        ]}
        rows={outgoingShipments}
      />
    </>
  )
}
