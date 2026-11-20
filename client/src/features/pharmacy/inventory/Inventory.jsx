// PharmaTrace AI — Pharmacy Medicine Inventory Management
// Connected to live authenticated MariaDB backend APIs (Milestone M7.3)

import { useState, useMemo, useEffect, useCallback } from 'react'
import { AlertTriangle, Search, ShieldAlert, RefreshCw, AlertCircle } from 'lucide-react'
import {
  PageHeader,
  DataTable,
  StatusBadge,
  Drawer,
  Button
} from '../../../components/ui'
import { getCustodyInventory } from '../../../services/shipmentApi'
import { getCurrentDateIso } from '../../../services/supplyChain'

const NEAR_EXPIRY_DAYS = 90

const daysBetween = (from, to) =>
  Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000)

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'ready', label: 'Ready to dispense' },
  { id: 'quarantined', label: 'Quarantined' },
  { id: 'alerts', label: 'Alerts' }
]

export default function Inventory() {
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [selectedSerial, setSelectedSerial] = useState(null)
  const today = getCurrentDateIso()

  const loadData = useCallback(async () => {
    setLoading(true)
    setFetchError('')
    try {
      const res = await getCustodyInventory({
        search: query || undefined,
        limit: 100
      })
      setInventory(res.inventory || [])
    } catch (e) {
      setFetchError(e.message || 'Failed to load medicine inventory.')
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    loadData()
  }, [loadData])

  const inventoryRows = useMemo(() => {
    return inventory.map(pkg => {
      const isExpired = Boolean(pkg.exp && pkg.exp < today)
      const daysToExp = pkg.exp ? daysBetween(today, pkg.exp) : null
      const isNearExpiry = Boolean(pkg.exp && !isExpired && daysToExp !== null && daysToExp <= NEAR_EXPIRY_DAYS)
      const isQuarantined = pkg.status === 'quarantined'
      const hasAlert = isExpired || isNearExpiry || isQuarantined

      return {
        ...pkg,
        isExpired,
        daysToExp,
        isNearExpiry,
        hasAlert
      }
    })
  }, [inventory, today])

  const filteredRows = useMemo(() => {
    return inventoryRows.filter(row => {
      if (filter === 'ready' && row.status !== 'accepted') return false
      if (filter === 'quarantined' && row.status !== 'quarantined') return false
      if (filter === 'alerts' && !row.hasAlert) return false
      return true
    })
  }, [inventoryRows, filter])

  const selectedPkg = useMemo(
    () => inventoryRows.find(r => r.serial === selectedSerial) ?? null,
    [inventoryRows, selectedSerial]
  )

  return (
    <>
      <PageHeader
        title="Medicine Inventory"
        description="Serialized pharmaceutical packages held in physical custody, with expiry monitoring and custody verification."
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
                  : tab.id === 'quarantined'
                    ? inventoryRows.filter(r => r.status === 'quarantined').length
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
            render: r => (r.product_name ? `${r.product_name} ${r.strength || ''}` : 'Unknown medicine')
          },
          {
            key: 'batch',
            label: 'Batch',
            render: r => <span className="id-text">{r.batch_no ?? '—'}</span>
          },
          {
            key: 'expiry',
            label: 'Expiry',
            render: r => (
              <div className="flex flex-wrap items-center gap-2">
                <span className="id-text">{r.exp ?? '—'}</span>
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
            </div>

            {selectedPkg.isExpired && (
              <div className="flex items-start gap-2 rounded-md border border-quarantine-line bg-quarantine-soft p-3 text-xs text-quarantine">
                <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <div className="font-semibold">Expired package</div>
                  <div>
                    Batch {selectedPkg.batch_no} expired on {selectedPkg.exp}. Quarantine and do not dispense.
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
                    This batch expires on {selectedPkg.exp} (within 90 days of {today}).
                  </div>
                </div>
              </div>
            )}

            <dl className="grid grid-cols-2 gap-y-2 rounded-lg border border-line bg-surface p-3 text-sm">
              <dt className="text-muted">Medicine</dt>
              <dd className="font-semibold text-navy">
                {selectedPkg.product_name
                  ? `${selectedPkg.product_name} ${selectedPkg.strength || ''}`
                  : 'Unknown medicine'}
              </dd>
              <dt className="text-muted">Dosage / Form</dt>
              <dd>
                {selectedPkg.dosage_form || '—'}
              </dd>
              <dt className="text-muted">Batch</dt>
              <dd className="id-text font-semibold">{selectedPkg.batch_no ?? '—'}</dd>
              <dt className="text-muted">Manufactured</dt>
              <dd className="id-text">{selectedPkg.mfd ?? '—'}</dd>
              <dt className="text-muted">Expiry</dt>
              <dd className="id-text font-semibold">{selectedPkg.exp ?? '—'}</dd>
              <dt className="text-muted">Shipment Ref</dt>
              <dd className="id-text">{selectedPkg.current_shipment_ref ?? '—'}</dd>
            </dl>
          </div>
        )}
      </Drawer>
    </>
  )
}
