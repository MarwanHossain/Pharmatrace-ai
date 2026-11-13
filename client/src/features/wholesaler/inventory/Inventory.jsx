import { useState, useMemo } from 'react'
import { Search, ShieldAlert } from 'lucide-react'
import {
  PageHeader,
  DataTable,
  StatusBadge,
  Drawer,
  Timeline,
  EmptyState
} from '../../../components/ui'
import { useDemoData } from '../../../contexts/DemoData'
import { useDemoSession } from '../../../contexts/DemoSession'
import { getCurrentDateIso } from '../../../services/supplyChain'

export default function Inventory() {
  const { packages, batches, products, shipments, orgName, productOf } = useDemoData()
  const { orgId, organization } = useDemoSession()
  const currentOrgName = organization?.name ?? orgName(orgId)

  const [query, setQuery] = useState('')
  const [productFilter, setProductFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedSerial, setSelectedSerial] = useState(null)

  const today = getCurrentDateIso()

  const wholesalePackages = useMemo(
    () =>
      packages.filter(
        p =>
          p.custodian === orgId &&
          (p.status === 'accepted' || p.status === 'quarantined' || p.status === 'discrepancy')
      ),
    [packages, orgId]
  )

  const pendingShipmentBySerial = useMemo(() => {
    const map = new Map()
    shipments.forEach(s => {
      if (s.status === 'pending' && s.from === orgId) {
        ;(s.packageSerials ?? []).forEach(serial => map.set(serial, s.ref))
      }
    })
    return map
  }, [shipments, orgId])

  const filteredRows = useMemo(() => {
    const q = query.trim().toUpperCase()
    return wholesalePackages.filter(p => {
      if (q && !p.serial.toUpperCase().includes(q)) return false
      if (statusFilter && p.status !== statusFilter) return false
      if (productFilter) {
        const batch = batches.find(b => b.id === p.batchId)
        if (!batch || batch.productId !== productFilter) return false
      }
      return true
    })
  }, [wholesalePackages, batches, query, productFilter, statusFilter])

  const selectedPkg = useMemo(
    () => wholesalePackages.find(p => p.serial === selectedSerial) ?? null,
    [wholesalePackages, selectedSerial]
  )
  const selectedBatch = selectedPkg
    ? batches.find(b => b.id === selectedPkg.batchId)
    : null
  const selectedProduct = selectedBatch ? productOf(selectedBatch.productId) : null

  return (
    <>
      <PageHeader
        title="Inventory"
        description={`On-hand serialized packages held in custody at ${currentOrgName}, including accepted stock and any receiving discrepancies.`}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search size={14} className="absolute left-2.5 top-3 text-muted" />
          <input
            aria-label="Search by serial"
            placeholder="Search by serial (e.g. DEMO-PCM-...)"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="id-text w-full rounded-md border border-line bg-white py-2 pl-8 pr-3 text-sm"
          />
        </div>

        <select
          aria-label="Filter by product"
          value={productFilter}
          onChange={e => setProductFilter(e.target.value)}
          className="rounded-md border border-line bg-white px-3 py-2 text-sm"
        >
          <option value="">All products</option>
          {products.map(pr => (
            <option key={pr.id} value={pr.id}>
              {pr.name} {pr.strength}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="rounded-md border border-line bg-white px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="accepted">Accepted</option>
          <option value="quarantined">Quarantined</option>
          <option value="discrepancy">Discrepancy</option>
        </select>
      </div>

      {wholesalePackages.length === 0 ? (
        <EmptyState
          title={`No inventory at ${currentOrgName} yet`}
          text={`${currentOrgName} starts with 0 packages on hand. Once a distributor dispatches a shipment to ${currentOrgName} and you receive it on the Incoming Shipments page, accepted packages will appear here.`}
        />
      ) : (
        <DataTable
          rows={filteredRows}
          onRowClick={r => setSelectedSerial(r.serial)}
          empty="No inventory packages match your search or filters."
          columns={[
            {
              key: 'serial',
              label: 'Serial',
              render: r => (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="id-text whitespace-nowrap font-semibold">{r.serial}</span>
                  {pendingShipmentBySerial.has(r.serial) && (
                    <span className="rounded border border-amber-line bg-amber-soft px-1.5 py-0.5 text-[11px] font-semibold text-amber-ink">
                      Allocated ({pendingShipmentBySerial.get(r.serial)})
                    </span>
                  )}
                </div>
              )
            },
            {
              key: 'batch',
              label: 'Batch',
              render: r => (
                <span className="id-text whitespace-nowrap">
                  {batches.find(b => b.id === r.batchId)?.no ?? '—'}
                </span>
              )
            },
            {
              key: 'medicine',
              label: 'Medicine',
              render: r => {
                const batch = batches.find(b => b.id === r.batchId)
                const prod = batch ? productOf(batch.productId) : null
                return prod ? `${prod.name} ${prod.strength}` : '—'
              }
            },
            {
              key: 'expiry',
              label: 'Expiry',
              render: r => {
                const exp = batches.find(b => b.id === r.batchId)?.exp
                return (
                  <div className="flex items-center gap-1.5">
                    <span className="id-text whitespace-nowrap">{exp ?? '—'}</span>
                    {exp && exp < today && <StatusBadge status="expired" />}
                  </div>
                )
              }
            },
            { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> }
          ]}
        />
      )}

      <Drawer
        open={!!selectedPkg}
        onClose={() => setSelectedSerial(null)}
        title="Package details"
      >
        {selectedPkg && (
          <>
            {selectedPkg.status === 'quarantined' && (
              <div className="mb-4 flex items-start gap-2 rounded-md border border-quarantine-line bg-quarantine-soft p-3 text-xs text-quarantine">
                <ShieldAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <div className="font-bold">Quarantined — excluded from wholesale dispatch</div>
                  {selectedPkg.quarantineReason && <div>Reason: {selectedPkg.quarantineReason}</div>}
                </div>
              </div>
            )}
            <dl className="mb-5 space-y-2 text-sm">
              {[
                ['Serial', selectedPkg.serial],
                [
                  'Medicine',
                  selectedProduct
                    ? `${selectedProduct.name} ${selectedProduct.strength} (${selectedProduct.form})`
                    : '—'
                ],
                ['GTIN', selectedProduct?.gtin ?? '—'],
                ['Batch', selectedBatch?.no ?? '—'],
                ['Manufactured', selectedBatch?.mfd ?? '—'],
                ['Expiry', selectedBatch?.exp ?? '—'],
                ['Custodian', orgName(selectedPkg.custodian)],
                ['Shipment ref', selectedPkg.shipmentRef ?? '—'],
                ['Verification checks', String(selectedPkg.verifyCount ?? 0)]
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-muted">{k}</dt>
                  <dd className="id-text text-right font-semibold">{v}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Status</dt>
                <dd>
                  <StatusBadge status={selectedPkg.status} />
                </dd>
              </div>
            </dl>

            <h3 className="mb-3 text-sm font-bold text-navy">Custody history</h3>
            <Timeline
              items={selectedPkg.history.map(([evt, orgId, date]) => ({
                title: evt,
                meta: `${orgName(orgId)} · ${date}`
              }))}
            />
          </>
        )}
      </Drawer>
    </>
  )
}
