import { useState, useMemo } from 'react'
import { Search, ShieldAlert } from 'lucide-react'
import { PageHeader, DataTable, StatusBadge, Drawer, Timeline } from '../../../components/ui'
import { useDemoData } from '../../../contexts/DemoData'
import { useDemoSession } from '../../../contexts/DemoSession'
import { getCurrentDateIso } from '../../../services/supplyChain'

export default function Inventory() {
  const { packages, batches, orgName, productOf } = useDemoData()
  const { orgId, organization } = useDemoSession()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedSerial, setSelectedSerial] = useState(null)

  const today = getCurrentDateIso()

  const batchById = useMemo(() => {
    const map = new Map()
    for (const b of batches) map.set(b.id, b)
    return map
  }, [batches])

  const inventoryPackages = useMemo(() => {
    const normalized = query.trim().toUpperCase()
    return packages.filter(
      p =>
        p.custodian === orgId &&
        (p.status === 'accepted' || p.status === 'quarantined' || p.status === 'discrepancy') &&
        (!statusFilter || p.status === statusFilter) &&
        (!normalized || p.serial.toUpperCase().includes(normalized))
    )
  }, [packages, orgId, query, statusFilter])

  const selectedPackage = useMemo(
    () => inventoryPackages.find(p => p.serial === selectedSerial) ?? null,
    [inventoryPackages, selectedSerial]
  )

  const selectedBatch = selectedPackage ? batchById.get(selectedPackage.batchId) : null
  const selectedProduct = selectedBatch ? productOf(selectedBatch.productId) : null

  return (
    <>
      <PageHeader
        title="Inventory"
        description={`Accepted and quarantined medicine packages currently held in custody at ${organization?.name ?? orgName(orgId)}.`}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-3 text-muted" />
          <input
            aria-label="Search serial"
            placeholder="Search serial"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-64 rounded-md border border-line bg-white py-2 pl-8 pr-3 text-sm"
          />
        </div>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="rounded-md border border-line bg-white px-3 py-2 text-sm"
        >
          <option value="">All custody stock</option>
          <option value="accepted">Accepted (available)</option>
          <option value="quarantined">Quarantined (excluded)</option>
        </select>
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="text-xs font-semibold text-muted hover:text-navy"
          >
            Clear
          </button>
        )}
      </div>

      <DataTable
        empty="No packages in custody match your search."
        onRowClick={r => setSelectedSerial(r.serial)}
        columns={[
          {
            key: 'serial',
            label: 'Serial',
            render: r => <span className="id-text whitespace-nowrap font-semibold">{r.serial}</span>
          },
          {
            key: 'batch',
            label: 'Batch',
            render: r => {
              const b = batchById.get(r.batchId)
              return <span className="id-text whitespace-nowrap">{b?.no ?? '—'}</span>
            }
          },
          {
            key: 'product',
            label: 'Product',
            render: r => {
              const b = batchById.get(r.batchId)
              const pr = b ? productOf(b.productId) : null
              return pr ? `${pr.name} ${pr.strength}` : '—'
            }
          },
          {
            key: 'expiry',
            label: 'Expiry',
            render: r => {
              const b = batchById.get(r.batchId)
              const expired = Boolean(b?.exp && b.exp < today)
              return (
                <div className="flex items-center gap-1.5">
                  <span className="id-text whitespace-nowrap">{b?.exp ?? '—'}</span>
                  {expired && <StatusBadge status="expired" />}
                </div>
              )
            }
          },
          {
            key: 'status',
            label: 'Status',
            render: r => <StatusBadge status={r.status} />
          }
        ]}
        rows={inventoryPackages}
      />

      <Drawer
        open={!!selectedPackage}
        onClose={() => setSelectedSerial(null)}
        title="Package details"
      >
        {selectedPackage && (
          <>
            {selectedPackage.status === 'quarantined' && (
              <div className="mb-4 flex items-start gap-2 rounded-md border border-quarantine-line bg-quarantine-soft p-3 text-xs text-quarantine">
                <ShieldAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <div className="font-bold">Quarantined — excluded from dispatchable stock</div>
                  {selectedPackage.quarantineReason && (
                    <div>Reason: {selectedPackage.quarantineReason}</div>
                  )}
                </div>
              </div>
            )}
            <dl className="mb-5 space-y-2 text-sm">
              {[
                ['Serial', selectedPackage.serial],
                [
                  'Product',
                  selectedProduct
                    ? `${selectedProduct.name} ${selectedProduct.strength}`
                    : '—'
                ],
                ['Pack size', selectedProduct?.packSize ?? '—'],
                ['Batch', selectedBatch?.no ?? '—'],
                ['Manufactured', selectedBatch?.mfd ?? '—'],
                ['Expires', selectedBatch?.exp ?? '—'],
                ['Custody', orgName(selectedPackage.custodian)],
                ['Shipment', selectedPackage.shipmentRef ?? '—']
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-muted">{k}</dt>
                  <dd className="id-text text-right font-semibold">{v}</dd>
                </div>
              ))}
              <div className="flex justify-between">
                <dt className="text-muted">Status</dt>
                <StatusBadge status={selectedPackage.status} />
              </div>
            </dl>
            <h3 className="mb-3 text-sm font-bold text-navy">Custody history</h3>
            <Timeline
              items={(selectedPackage.history ?? []).map(([title, orgId, date]) => ({
                title,
                meta: `${orgName(orgId)} · ${date}`
              }))}
            />
          </>
        )}
      </Drawer>
    </>
  )
}
