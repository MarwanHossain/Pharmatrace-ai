import { useMemo, useState } from 'react'
import { AlertTriangle, Search, ShieldAlert } from 'lucide-react'
import {
  PageHeader,
  DataTable,
  StatusBadge,
  Drawer,
  Timeline
} from '../../../components/ui'
import { useDemoData } from '../../../contexts/DemoData'
import { useDemoSession } from '../../../contexts/DemoSession'
import { verifySerial } from '../../../services/verification'
import { getCurrentDateIso } from '../../../services/supplyChain'

const NEAR_EXPIRY_DAYS = 90

const daysBetween = (from, to) =>
  Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000)

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'ready', label: 'Ready to dispense' },
  { id: 'dispensed', label: 'Dispensed' },
  { id: 'alerts', label: 'Alerts' }
]

export default function Inventory() {
  const { organizations, packages, batches, shipments, orgName, productOf } = useDemoData()
  const { orgId, organization } = useDemoSession()
  const currentOrgName = organization?.name ?? orgName(orgId)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [selectedSerial, setSelectedSerial] = useState(null)
  const today = getCurrentDateIso()

  const inventoryRows = useMemo(() => {
    return packages
      .filter(p => p.custodian === orgId)
      .map(pkg => {
        const batch = batches.find(b => b.id === pkg.batchId) ?? null
        const product = batch ? productOf(batch.productId) : null
        const verification = verifySerial(pkg.serial, { packages, batches, shipments, organizations, today })
        const isExpired = Boolean(batch && batch.exp < today)
        const daysToExp = batch ? daysBetween(today, batch.exp) : null
        const isNearExpiry = Boolean(batch && !isExpired && daysToExp !== null && daysToExp <= NEAR_EXPIRY_DAYS)
        const isIncomplete = verification.supplyChainStatus === 'incomplete'
        const isQuarantined = pkg.status === 'quarantined'
        const isDiscrepancy = pkg.status === 'discrepancy' || pkg.status === 'rejected' || pkg.status === 'missing'
        const hasRepeatedScans = verification.unusualActivity
        const hasAlert = isExpired || isNearExpiry || isIncomplete || isQuarantined || isDiscrepancy

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
          hasAlert
        }
      })
  }, [packages, batches, shipments, organizations, orgId, productOf, today])

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return inventoryRows.filter(row => {
      if (filter === 'ready' && row.status !== 'accepted') return false
      if (filter === 'dispensed' && row.status !== 'dispensed') return false
      if (filter === 'alerts' && !row.hasAlert) return false

      if (!q) return true
      const serialMatch = row.serial.toLowerCase().includes(q)
      const batchMatch = row.batch?.no?.toLowerCase().includes(q)
      const productMatch = row.product?.name?.toLowerCase().includes(q)
      return serialMatch || batchMatch || productMatch
    })
  }, [inventoryRows, filter, query])

  const selectedPkg = useMemo(
    () => inventoryRows.find(r => r.serial === selectedSerial) ?? null,
    [inventoryRows, selectedSerial]
  )

  return (
    <>
      <PageHeader
        title="Medicine Inventory"
        description={`Serialized packages held by ${currentOrgName}, with expiry monitoring and chain-of-custody verification.`}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-sm">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by serial, medicine or batch..."
            aria-label="Search inventory by serial, medicine or batch"
            className="id-text w-full rounded-md border border-line bg-white py-2 pl-9 pr-3 text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter inventory">
          {FILTERS.map(tab => {
            const count =
              tab.id === 'all'
                ? inventoryRows.length
                : tab.id === 'ready'
                  ? inventoryRows.filter(r => r.status === 'accepted').length
                  : tab.id === 'dispensed'
                    ? inventoryRows.filter(r => r.status === 'dispensed').length
                    : inventoryRows.filter(r => r.hasAlert).length
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
      </div>

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
            render: r => (
              <div className="flex flex-wrap items-center gap-2">
                <span className="id-text">{r.batch?.exp ?? '—'}</span>
                {r.isExpired && (
                  <span className="inline-flex items-center rounded border border-quarantine-line bg-quarantine-soft px-2 py-0.5 text-xs font-semibold text-quarantine">
                    Expired
                  </span>
                )}
                {r.isNearExpiry && (
                  <span className="inline-flex items-center rounded border border-amber-line bg-amber-soft px-2 py-0.5 text-xs font-semibold text-amber-ink">
                    {r.daysToExp}d left
                  </span>
                )}
              </div>
            )
          },
          {
            key: 'traceability',
            label: 'Traceability',
            render: r => (
              <StatusBadge status={r.isIncomplete ? 'incomplete' : 'verified'} />
            )
          },
          {
            key: 'status',
            label: 'Status',
            render: r => <StatusBadge status={r.status} />
          }
        ]}
        rows={filteredRows}
        onRowClick={row => setSelectedSerial(row.serial)}
        empty="No packages in pharmacy inventory match your search."
      />

      <Drawer
        open={Boolean(selectedPkg)}
        title={selectedPkg ? selectedPkg.serial : 'Package details'}
        onClose={() => setSelectedSerial(null)}
      >
        {selectedPkg && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={selectedPkg.status} />
              <StatusBadge status={selectedPkg.isIncomplete ? 'incomplete' : 'verified'} />
              {selectedPkg.hasRepeatedScans && <StatusBadge status="unusual" />}
            </div>

            {selectedPkg.isExpired && (
              <div className="flex items-start gap-2 rounded-md border border-quarantine-line bg-quarantine-soft p-3 text-xs text-quarantine">
                <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <div className="font-semibold">Expired package</div>
                  <div>
                    Batch {selectedPkg.batch?.no} expired on {selectedPkg.batch?.exp}. Quarantine and do not dispense.
                  </div>
                </div>
              </div>
            )}

            {selectedPkg.isNearExpiry && (
              <div className="flex items-start gap-2 rounded-md border border-amber-line bg-amber-soft p-3 text-xs text-amber-ink">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <div className="font-semibold">Expiring soon ({selectedPkg.daysToExp} days)</div>
                  <div>
                    This batch expires on {selectedPkg.batch?.exp} (within 90 days of {today}).
                  </div>
                </div>
              </div>
            )}

            {selectedPkg.isIncomplete && (
              <div className="flex items-start gap-2 rounded-md border border-amber-line bg-amber-soft p-3 text-xs text-amber-ink">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <div className="font-semibold">Incomplete traceability</div>
                  <div>
                    Chain of custody is missing required dispatch or intermediate transfer events. Hold from dispensing until investigated.
                  </div>
                </div>
              </div>
            )}

            <dl className="grid grid-cols-2 gap-y-2 rounded-lg border border-line bg-surface p-3 text-sm">
              <dt className="text-muted">Medicine</dt>
              <dd className="font-semibold text-navy">
                {selectedPkg.product
                  ? `${selectedPkg.product.name} ${selectedPkg.product.strength}`
                  : 'Unknown medicine'}
              </dd>
              <dt className="text-muted">Dosage / Pack</dt>
              <dd>
                {selectedPkg.product
                  ? `${selectedPkg.product.form} · ${selectedPkg.product.packSize}`
                  : '—'}
              </dd>
              <dt className="text-muted">Batch</dt>
              <dd className="id-text font-semibold">{selectedPkg.batch?.no ?? '—'}</dd>
              <dt className="text-muted">Manufactured</dt>
              <dd className="id-text">{selectedPkg.batch?.mfd ?? '—'}</dd>
              <dt className="text-muted">Expiry</dt>
              <dd className="id-text font-semibold">{selectedPkg.batch?.exp ?? '—'}</dd>
              <dt className="text-muted">Shipment Ref</dt>
              <dd className="id-text">{selectedPkg.shipmentRef ?? '—'}</dd>
              <dt className="text-muted">Public checks</dt>
              <dd className="id-text">{selectedPkg.verifyCount ?? 0}</dd>
            </dl>

            <div>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
                Custody History
              </h3>
              <Timeline
                items={(selectedPkg.history ?? []).map(([evt, orgId, date]) => ({
                  title: evt,
                  meta: `${orgName(orgId)} · ${date}`
                }))}
              />
            </div>
          </div>
        )}
      </Drawer>
    </>
  )
}
