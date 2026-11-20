// PharmaTrace AI — Distributor Custody Inventory Management
// Connected to live authenticated MariaDB backend APIs (Milestone M7.3)

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Search, RefreshCw, AlertCircle } from 'lucide-react'
import { PageHeader, DataTable, StatusBadge, Drawer, Button } from '../../../components/ui'
import { getCustodyInventory } from '../../../services/shipmentApi'

export default function Inventory() {
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedSerial, setSelectedSerial] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setFetchError('')
    try {
      const res = await getCustodyInventory({
        status: statusFilter || undefined,
        search: query || undefined,
        limit: 100
      })
      setInventory(res.inventory || [])
    } catch (e) {
      setFetchError(e.message || 'Failed to load custody inventory.')
    } finally {
      setLoading(false)
    }
  }, [query, statusFilter])

  useEffect(() => {
    loadData()
  }, [loadData])

  const selectedPackage = useMemo(
    () => inventory.find(p => p.serial === selectedSerial) ?? null,
    [inventory, selectedSerial]
  )

  return (
    <>
      <PageHeader
        title="Custody Inventory"
        description="Accepted and quarantined medicine packages currently held in physical custody."
        actions={
          <Button variant="secondary" onClick={loadData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
        }
      />

      {fetchError && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-quarantine-line bg-quarantine-soft p-3 text-sm text-quarantine">
          <AlertCircle size={16} />
          <span>{fetchError}</span>
        </div>
      )}

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
        empty="No packages in custody match your criteria."
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
            render: r => <span className="id-text whitespace-nowrap">{r.batch_no || '—'}</span>
          },
          {
            key: 'product',
            label: 'Product',
            render: r => (
              <div>
                <div className="font-semibold">{r.product_name || r.generic_name || '—'}</div>
                <div className="text-xs text-muted">{r.strength || ''}</div>
              </div>
            )
          },
          {
            key: 'exp',
            label: 'Expiry',
            render: r => <span className="id-text whitespace-nowrap">{r.exp || '—'}</span>
          },
          {
            key: 'status',
            label: 'Custody Status',
            render: r => <StatusBadge status={r.status} />
          }
        ]}
        rows={inventory}
      />

      {/* Drawer */}
      <Drawer
        open={!!selectedPackage}
        onClose={() => setSelectedSerial(null)}
        title={selectedPackage ? `Package ${selectedPackage.serial}` : 'Package details'}
      >
        {selectedPackage && (
          <div className="space-y-4 text-sm">
            <dl className="space-y-2">
              <div className="flex justify-between">
                <dt className="text-muted">Serial Number</dt>
                <dd className="id-text font-semibold">{selectedPackage.serial}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Product</dt>
                <dd className="font-semibold">{selectedPackage.product_name || selectedPackage.generic_name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Strength / Form</dt>
                <dd className="font-semibold">{selectedPackage.strength} · {selectedPackage.dosage_form}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Batch Number</dt>
                <dd className="id-text font-semibold">{selectedPackage.batch_no}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Expiry Date</dt>
                <dd className="id-text font-semibold">{selectedPackage.exp}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted">Status</dt>
                <StatusBadge status={selectedPackage.status} />
              </div>
              {selectedPackage.current_shipment_ref && (
                <div className="flex justify-between">
                  <dt className="text-muted">Shipment Reference</dt>
                  <dd className="id-text font-semibold">{selectedPackage.current_shipment_ref}</dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </Drawer>
    </>
  )
}
