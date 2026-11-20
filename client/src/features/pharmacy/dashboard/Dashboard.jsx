// PharmaTrace AI — Pharmacy Operational Dashboard
// Connected to live authenticated MariaDB backend APIs (Milestone M9)

import { useMemo, useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, ScanLine, RefreshCw } from 'lucide-react'
import { PageHeader, MetricCard, DataTable, StatusBadge, Button, EmptyState } from '../../../components/ui'
import { useDemoData } from '../../../contexts/DemoData'
import { useDemoSession } from '../../../contexts/DemoSession'
import { useAuth } from '../../../contexts/AuthContext'
import { getCurrentDateIso, RECEIVABLE_SHIPMENT_STATUSES } from '../../../services/supplyChain'
import { getIncomingShipments, getCustodyInventory } from '../../../services/shipmentApi'

const NEAR_EXPIRY_DAYS = 90

const daysBetween = (from, to) =>
  Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000)

export default function Dashboard() {
  const { packages: demoPackages, shipments: demoShipments, orgName } = useDemoData()
  const { orgId, organization } = useDemoSession()
  const { currentUser, isAuthenticated } = useAuth()
  const today = getCurrentDateIso()

  const [liveIncoming, setLiveIncoming] = useState([])
  const [liveInventory, setLiveInventory] = useState([])
  const [loading, setLoading] = useState(isAuthenticated)

  const loadLiveData = useCallback(async () => {
    if (!isAuthenticated) return
    setLoading(true)
    try {
      const [inRes, invRes] = await Promise.all([
        getIncomingShipments({ limit: 10 }),
        getCustodyInventory({ limit: 100 })
      ])
      setLiveIncoming(inRes.shipments || [])
      setLiveInventory(invRes.inventory || [])
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

  const incomingShipments = isAuthenticated ? liveIncoming : (demoShipments.filter(s => s.to === orgId))
  const awaitingShipments = useMemo(
    () => incomingShipments.filter(s => RECEIVABLE_SHIPMENT_STATUSES.has(s.status) || s.status === 'in_transit' || s.status === 'partially_received'),
    [incomingShipments]
  )

  const pharmacyPackages = isAuthenticated ? liveInventory : (demoPackages.filter(p => p.custodian === orgId))
  const readyInStock = useMemo(
    () => pharmacyPackages.filter(p => p.status === 'accepted'),
    [pharmacyPackages]
  )
  const dispensedPackages = useMemo(
    () => pharmacyPackages.filter(p => p.status === 'dispensed'),
    [pharmacyPackages]
  )

  const annotatedPackages = useMemo(() => {
    return pharmacyPackages.map(pkg => {
      const isExpired = Boolean(pkg.exp && pkg.exp < today)
      const daysToExp = pkg.exp ? daysBetween(today, pkg.exp) : null
      const isNearExpiry = Boolean(pkg.exp && !isExpired && daysToExp !== null && daysToExp <= NEAR_EXPIRY_DAYS)
      const isDiscrepancy = ['discrepancy', 'quarantined', 'rejected'].includes(pkg.status)
      const hasRepeatedScans = (pkg.verify_count ?? pkg.verifyCount ?? 0) >= 3

      return {
        ...pkg,
        isExpired,
        daysToExp,
        isNearExpiry,
        isDiscrepancy,
        hasRepeatedScans,
        hasAlert: isExpired || isNearExpiry || isDiscrepancy
      }
    })
  }, [pharmacyPackages, today])

  const alertPackages = useMemo(
    () => annotatedPackages.filter(item => item.hasAlert),
    [annotatedPackages]
  )

  const expiredCount = useMemo(
    () => annotatedPackages.filter(item => item.isExpired).length,
    [annotatedPackages]
  )

  const repeatedScanCount = useMemo(
    () => annotatedPackages.filter(item => item.hasRepeatedScans).length,
    [annotatedPackages]
  )

  const currentOrgName = isAuthenticated
    ? (currentUser?.orgName || 'Pharmacy Partner')
    : (organization?.name ?? orgName(orgId))

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Operational overview for ${currentOrgName} — incoming deliveries, verified stock, dispensing and safety alerts.`}
        actions={
          <div className="flex items-center gap-2">
            {isAuthenticated && (
              <Button variant="secondary" onClick={loadLiveData} disabled={loading}>
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                Refresh
              </Button>
            )}
            <Link to="/pharmacy/verify-dispense">
              <Button variant="success">
                <ScanLine size={15} aria-hidden="true" />
                Verify & Dispense
              </Button>
            </Link>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard
          label="Incoming awaiting"
          value={awaitingShipments.length}
          hint={`${incomingShipments.length} total shipments to pharmacy`}
        />
        <MetricCard
          label="Ready in stock"
          value={readyInStock.length}
          hint="Accepted & held at pharmacy"
        />
        <MetricCard
          label="Dispensed"
          value={dispensedPackages.length}
          hint="Recorded at counter"
        />
        <MetricCard
          label="Traceability / Expiry alerts"
          value={alertPackages.length}
          hint={`${expiredCount} expired · ${alertPackages.filter(x => x.isDiscrepancy).length} quarantined/rejected`}
        />
        <MetricCard
          label="Repeated scan flags"
          value={repeatedScanCount}
          hint="Packages with 3+ public checks"
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-navy">Recent incoming shipments</h2>
          <Link
            to="/pharmacy/incoming"
            className="inline-flex items-center gap-1 text-xs font-semibold text-clinical hover:underline"
          >
            Manage incoming <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </div>
        <DataTable
          columns={[
            {
              key: 'ref',
              label: 'Shipment',
              render: r => <span className="id-text whitespace-nowrap font-semibold">{r.ref}</span>
            },
            { key: 'from', label: 'From', render: r => r.fromName || r.from_org_name || orgName(r.from) },
            {
              key: 'packages',
              label: 'Packs',
              render: r => r.packageCount ?? r.packageSerials?.length ?? r.count ?? 0
            },
            {
              key: 'status',
              label: 'Status',
              render: r => <StatusBadge status={r.status} />
            },
            {
              key: 'dispatched',
              label: 'Dispatched',
              render: r => <span className="id-text whitespace-nowrap">{r.dispatchedAt ? new Date(r.dispatchedAt).toLocaleString() : (r.dispatched ?? '—')}</span>
            }
          ]}
          rows={incomingShipments}
          empty="No incoming shipments for this pharmacy yet."
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-navy">Stock with safety alerts</h2>
          <Link
            to="/pharmacy/inventory"
            className="inline-flex items-center gap-1 text-xs font-semibold text-clinical hover:underline"
          >
            Full inventory <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </div>
        {alertPackages.length === 0 ? (
          <EmptyState
            title="No safety alerts"
            description="All packages currently in stock have verified chains of custody and valid expiry dates."
          />
        ) : (
          <DataTable
            columns={[
              {
                key: 'serial',
                label: 'Serial',
                render: r => <span className="id-text whitespace-nowrap font-semibold">{r.serial}</span>
              },
              { key: 'product', label: 'Medicine', render: r => r.product_name || r.product?.name || '—' },
              { key: 'batch', label: 'Batch', render: r => r.batch_no || r.batch?.no || '—' },
              {
                key: 'exp',
                label: 'Expiry',
                render: r => <span className="id-text whitespace-nowrap">{r.exp}</span>
              },
              {
                key: 'status',
                label: 'Package status',
                render: r => <StatusBadge status={r.status} />
              }
            ]}
            rows={alertPackages}
            empty="No alerts found in inventory."
          />
        )}
      </div>
    </>
  )
}
