import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, ScanLine } from 'lucide-react'
import { PageHeader, MetricCard, DataTable, StatusBadge, Button, EmptyState } from '../../../components/ui'
import { useDemoData } from '../../../contexts/DemoData'
import { useDemoSession } from '../../../contexts/DemoSession'
import { getCurrentDateIso, RECEIVABLE_SHIPMENT_STATUSES } from '../../../services/supplyChain'
import { verifySerial } from '../../../services/verification'

const NEAR_EXPIRY_DAYS = 90

const daysBetween = (from, to) =>
  Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000)

export default function Dashboard() {
  const { organizations, batches, packages, shipments, orgName, productOf } = useDemoData()
  const { orgId, organization } = useDemoSession()
  const currentOrgName = organization?.name ?? orgName(orgId)
  const today = getCurrentDateIso()

  const incomingShipments = useMemo(
    () => shipments.filter(s => s.to === orgId),
    [shipments, orgId]
  )
  const awaitingShipments = useMemo(
    () => incomingShipments.filter(s => RECEIVABLE_SHIPMENT_STATUSES.has(s.status)),
    [incomingShipments]
  )

  const pharmacyPackages = useMemo(
    () => packages.filter(p => p.custodian === orgId),
    [packages, orgId]
  )
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
      const batch = batches.find(b => b.id === pkg.batchId) ?? null
      const product = batch ? productOf(batch.productId) : null
      const verification = verifySerial(pkg.serial, { packages, batches, shipments, organizations, today })
      const isExpired = Boolean(batch && batch.exp < today)
      const daysToExp = batch ? daysBetween(today, batch.exp) : null
      const isNearExpiry = Boolean(batch && !isExpired && daysToExp !== null && daysToExp <= NEAR_EXPIRY_DAYS)
      const isIncomplete = verification.supplyChainStatus === 'incomplete'
      const isDiscrepancy = ['discrepancy', 'quarantined', 'rejected'].includes(pkg.status)
      const hasRepeatedScans = verification.unusualActivity

      return {
        ...pkg,
        batch,
        product,
        verification,
        isExpired,
        daysToExp,
        isNearExpiry,
        isIncomplete,
        isDiscrepancy,
        hasRepeatedScans,
        hasAlert: isExpired || isNearExpiry || isIncomplete || isDiscrepancy
      }
    })
  }, [pharmacyPackages, batches, packages, shipments, productOf, today])

  const alertPackages = useMemo(
    () => annotatedPackages.filter(item => item.hasAlert),
    [annotatedPackages]
  )

  const expiredOrIncompleteCount = useMemo(
    () => annotatedPackages.filter(item => item.isExpired || item.isIncomplete).length,
    [annotatedPackages]
  )

  const repeatedScanCount = useMemo(
    () => annotatedPackages.filter(item => item.hasRepeatedScans).length,
    [annotatedPackages]
  )

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Operational overview for ${currentOrgName} — incoming deliveries, verified stock, dispensing and safety alerts.`}
        actions={
          <Link to="/pharmacy/verify-dispense">
            <Button variant="success">
              <ScanLine size={15} aria-hidden="true" />
              Verify & Dispense
            </Button>
          </Link>
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
          value={expiredOrIncompleteCount}
          hint={`${alertPackages.filter(x => x.isExpired).length} expired · ${alertPackages.filter(x => x.isIncomplete).length} incomplete`}
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
              label: 'Reference',
              render: r => <span className="id-text whitespace-nowrap font-semibold">{r.ref}</span>
            },
            { key: 'from', label: 'Origin', render: r => orgName(r.from) },
            { key: 'count', label: 'Packages', render: r => r.count ?? r.packageSerials?.length ?? 0 },
            { key: 'dispatched', label: 'Dispatched', render: r => r.dispatched ?? '—' },
            { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
            { key: 'receiving', label: 'Receiving' }
          ]}
          rows={incomingShipments}
          pageSize={5}
          empty={`No incoming shipments found for ${currentOrgName}.`}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-navy">
            <AlertTriangle size={15} className="text-amber-ink" aria-hidden="true" />
            Stock requiring attention
          </h2>
          <Link
            to="/pharmacy/inventory"
            className="inline-flex items-center gap-1 text-xs font-semibold text-clinical hover:underline"
          >
            View full inventory <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </div>

        {alertPackages.length === 0 ? (
          <EmptyState
            title="No immediate stock alerts"
            text="All packages currently in pharmacy custody have complete traceability and valid expiry dates."
          />
        ) : (
          <DataTable
            columns={[
              {
                key: 'serial',
                label: 'Serial',
                render: r => <span className="id-text whitespace-nowrap font-semibold">{r.serial}</span>
              },
              {
                key: 'medicine',
                label: 'Medicine',
                render: r => (r.product ? `${r.product.name} ${r.product.strength}` : 'Unknown medicine')
              },
              {
                key: 'batch',
                label: 'Batch',
                render: r => <span className="id-text">{r.batch?.no ?? '—'}</span>
              },
              {
                key: 'expiry',
                label: 'Expiry',
                render: r => <span className="id-text">{r.batch?.exp ?? '—'}</span>
              },
              {
                key: 'issue',
                label: 'Alert',
                render: r => (
                  <div className="flex flex-wrap gap-1">
                    {r.isExpired && <StatusBadge status="expired" />}
                    {r.isNearExpiry && (
                      <span className="inline-flex items-center rounded border border-amber-line bg-amber-soft px-2 py-0.5 text-xs font-semibold text-amber-ink">
                        Expiring in {r.daysToExp}d
                      </span>
                    )}
                    {r.isIncomplete && <StatusBadge status="incomplete" />}
                    {r.isDiscrepancy && <StatusBadge status="discrepancy" />}
                  </div>
                )
              },
              {
                key: 'status',
                label: 'Package Status',
                render: r => <StatusBadge status={r.status} />
              }
            ]}
            rows={alertPackages}
            pageSize={5}
          />
        )}
      </div>
    </>
  )
}
