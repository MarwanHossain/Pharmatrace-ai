// PharmaTrace AI — Regulatory Traceability Search
// Milestone M8 Implementation — Connected to Live MariaDB Backend
import { useState } from 'react'
import { QrCode, Search as SearchIcon, ShieldAlert, X, AlertTriangle, Clock } from 'lucide-react'
import {
  PageHeader,
  DataTable,
  StatusBadge,
  Button,
  Drawer,
  Timeline,
  EmptyState
} from '../../../components/ui'
import QrScanner from '../../../components/scanner/QrScanner'
import { extractSerialFromInput } from '../../../services/qrPayload'
import * as investigatorApi from '../../../services/investigatorApi'

export default function Search() {
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState({ packages: [], batches: [], shipments: [] })
  const [error, setError] = useState('')

  // Selected package detail state
  const [selectedPkgDetails, setSelectedPkgDetails] = useState(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [detailsError, setDetailsError] = useState('')

  async function executeSearch(searchTerm) {
    const term = (searchTerm || '').trim()
    if (!term) {
      setSearchResults({ packages: [], batches: [], shipments: [] })
      return
    }
    setSearching(true)
    setError('')
    try {
      const results = await investigatorApi.searchTraceability(term)
      setSearchResults(results)
    } catch (err) {
      setError(err.message || 'Traceability search failed.')
    } finally {
      setSearching(false)
    }
  }

  async function handleOpenPackageDetails(serial) {
    setLoadingDetails(true)
    setDetailsError('')
    try {
      const details = await investigatorApi.getPackageDetails(serial)
      setSelectedPkgDetails(details)
    } catch (err) {
      setDetailsError(err.message || 'Failed to retrieve package custody history.')
    } finally {
      setLoadingDetails(false)
    }
  }

  function handleScan(scanned) {
    const normalized = extractSerialFromInput(scanned) || String(scanned ?? '').trim().toUpperCase()
    if (!normalized) return
    setInput(normalized)
    setQuery(normalized)
    setShowScanner(false)
    executeSearch(normalized)
    handleOpenPackageDetails(normalized)
  }

  function handleSubmit(e) {
    e.preventDefault()
    setQuery(input)
    executeSearch(input)
  }

  function clearSearch() {
    setInput('')
    setQuery('')
    setSearchResults({ packages: [], batches: [], shipments: [] })
  }

  const { packages = [], batches = [], shipments = [] } = searchResults
  const hasResults = packages.length > 0 || batches.length > 0 || shipments.length > 0

  return (
    <>
      <PageHeader
        title="Regulatory Traceability Search"
        description="Query the live MariaDB pharmaceutical registry by package serial, QR verification URL, batch number, or shipment reference."
        actions={
          <Button
            variant="secondary"
            onClick={() => setShowScanner((prev) => !prev)}
            aria-expanded={showScanner}
          >
            <QrCode size={16} aria-hidden="true" />
            {showScanner ? 'Hide QR Scanner' : 'QR Scanner'}
          </Button>
        }
      />

      <div className="mb-6 space-y-3 rounded-lg border border-line bg-white p-4">
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="traceability-search-input">
            Serial number, batch number, or shipment reference
          </label>
          <div className="relative min-w-[240px] flex-1">
            <SearchIcon size={15} className="absolute left-3 top-3 text-muted" aria-hidden="true" />
            <input
              id="traceability-search-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter package serial, QR URL, batch number, or shipment reference..."
              className="id-text w-full rounded-md border border-line py-2 pl-9 pr-8 text-sm"
            />
            {input && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={clearSearch}
                className="absolute right-2.5 top-2.5 text-muted hover:text-ink"
              >
                <X size={15} />
              </button>
            )}
          </div>
          <Button type="submit" variant="primary" disabled={searching}>
            {searching ? 'Searching...' : 'Search'}
          </Button>
        </form>

        {showScanner && (
          <div className="pt-2">
            <QrScanner
              onScan={handleScan}
              placeholder="Scan or enter package serial"
              label="Scan package serial"
            />
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="mb-6 rounded-lg border border-quarantine-line bg-quarantine-soft p-4 text-sm font-semibold text-quarantine">
          {error}
        </div>
      )}

      {!query ? (
        <EmptyState
          title="Enter a traceability query"
          text="Search by full or partial serial number, QR verification URL, batch number, or shipment reference."
        />
      ) : !hasResults && !searching ? (
        <EmptyState
          title="No matching records found"
          text={`No packages, batches, or shipments matched the query "${query}".`}
        />
      ) : (
        <div className="space-y-6">
          {/* Packages */}
          {packages.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-bold text-navy">
                Matching Packages ({packages.length})
              </h2>
              <DataTable
                rows={packages}
                onRowClick={(row) => handleOpenPackageDetails(row.serial)}
                columns={[
                  {
                    key: 'serial',
                    label: 'Serial',
                    render: (r) => (
                      <span className="id-text whitespace-nowrap font-semibold text-clinical hover:underline">
                        {r.serial}
                      </span>
                    )
                  },
                  {
                    key: 'product',
                    label: 'Product / Strength',
                    render: (r) => `${r.product_name || '—'} ${r.strength || ''}`
                  },
                  {
                    key: 'batch_no',
                    label: 'Batch No',
                    render: (r) => <span className="id-text font-medium">{r.batch_no || '—'}</span>
                  },
                  {
                    key: 'custodian_name',
                    label: 'Physical Custodian',
                    render: (r) => r.custodian_name || '—'
                  },
                  {
                    key: 'verify_count',
                    label: 'Verify Scans',
                    render: (r) => <span className="id-text font-semibold">{r.verify_count ?? 0}</span>
                  },
                  {
                    key: 'status',
                    label: 'Status',
                    render: (r) => <StatusBadge status={r.status} />
                  },
                  {
                    key: 'alerts',
                    label: 'Active Leads',
                    render: (r) => (
                      r.active_alerts_count > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-quarantine">
                          <AlertTriangle size={12} /> {r.active_alerts_count} alert(s)
                        </span>
                      ) : (
                        <span className="text-xs text-muted">Clear</span>
                      )
                    )
                  }
                ]}
              />
            </section>
          )}

          {/* Batches */}
          {batches.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-bold text-navy">
                Matching Batches ({batches.length})
              </h2>
              <DataTable
                rows={batches}
                columns={[
                  {
                    key: 'batch_no',
                    label: 'Batch No',
                    render: (r) => <span className="id-text font-semibold">{r.batch_no}</span>
                  },
                  {
                    key: 'product',
                    label: 'Product',
                    render: (r) => `${r.product_name} ${r.strength || ''}`
                  },
                  {
                    key: 'manufacturer',
                    label: 'Manufacturer',
                    render: (r) => r.manufacturer_name
                  },
                  {
                    key: 'mfd',
                    label: 'Mfg Date',
                    render: (r) => <span className="id-text whitespace-nowrap">{r.mfd}</span>
                  },
                  {
                    key: 'exp',
                    label: 'Expiry',
                    render: (r) => <span className="id-text whitespace-nowrap">{r.exp}</span>
                  },
                  {
                    key: 'quantity',
                    label: 'Quantity',
                    render: (r) => <span className="id-text">{r.quantity}</span>
                  },
                  {
                    key: 'release_status',
                    label: 'QA Release',
                    render: (r) => <StatusBadge status={r.release_status} />
                  }
                ]}
              />
            </section>
          )}

          {/* Shipments */}
          {shipments.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-bold text-navy">
                Matching Shipments ({shipments.length})
              </h2>
              <DataTable
                rows={shipments}
                columns={[
                  {
                    key: 'ref',
                    label: 'Shipment Ref',
                    render: (r) => <span className="id-text font-semibold">{r.ref}</span>
                  },
                  {
                    key: 'origin',
                    label: 'Origin Organization',
                    render: (r) => r.origin_name
                  },
                  {
                    key: 'destination',
                    label: 'Destination Organization',
                    render: (r) => r.destination_name
                  },
                  {
                    key: 'count',
                    label: 'Package Count',
                    render: (r) => <span className="id-text">{r.count}</span>
                  },
                  {
                    key: 'status',
                    label: 'Status',
                    render: (r) => <StatusBadge status={r.status} />
                  },
                  {
                    key: 'dispatched_at',
                    label: 'Dispatched At',
                    render: (r) => (
                      <span className="id-text whitespace-nowrap text-xs">
                        {r.dispatched_at ? new Date(r.dispatched_at).toLocaleString() : '—'}
                      </span>
                    )
                  }
                ]}
              />
            </section>
          )}
        </div>
      )}

      {/* Package Custody Detail Drawer */}
      <Drawer
        open={!!selectedPkgDetails}
        onClose={() => setSelectedPkgDetails(null)}
        title={selectedPkgDetails ? `Package ${selectedPkgDetails.package.serial}` : 'Package Custody Record'}
      >
        {selectedPkgDetails && (
          <div className="space-y-5">
            {selectedPkgDetails.alerts?.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-quarantine-line bg-quarantine-soft p-3 text-xs text-quarantine">
                <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <strong>Active Regulatory Leads Recorded:</strong>{' '}
                  {selectedPkgDetails.alerts.length} alert(s) linked to this package serial. Review custody anomalies before release.
                </div>
              </div>
            )}

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Package Identifiers</h3>
              <dl className="space-y-1.5 rounded-md border border-line p-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Serial Number</dt>
                  <dd className="id-text font-bold text-navy">{selectedPkgDetails.package.serial}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">GTIN-14</dt>
                  <dd className="id-text">{selectedPkgDetails.product.gtin || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Allocation Tier</dt>
                  <dd className="id-text font-semibold uppercase">{selectedPkgDetails.package.allocationType}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Public Verification Scans</dt>
                  <dd className="id-text font-bold">{selectedPkgDetails.package.verifyCount ?? 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Current Custody Status</dt>
                  <dd><StatusBadge status={selectedPkgDetails.package.status} /></dd>
                </div>
              </dl>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Pharmaceutical Product &amp; Batch</h3>
              <dl className="space-y-1.5 rounded-md border border-line p-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Brand Name</dt>
                  <dd className="font-semibold text-navy">{selectedPkgDetails.product.name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Generic / Strength</dt>
                  <dd>{selectedPkgDetails.product.genericName} ({selectedPkgDetails.product.strength})</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Batch Number</dt>
                  <dd className="id-text font-semibold">{selectedPkgDetails.batch.batchNo}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Manufacture / Expiry</dt>
                  <dd className="id-text">{selectedPkgDetails.batch.mfd} / {selectedPkgDetails.batch.exp}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">QA Release</dt>
                  <dd><StatusBadge status={selectedPkgDetails.batch.releaseStatus} /></dd>
                </div>
              </dl>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Supply Chain Stakeholders</h3>
              <dl className="space-y-1.5 rounded-md border border-line p-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Manufacturer</dt>
                  <dd className="font-medium">{selectedPkgDetails.manufacturer.name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Mfg License</dt>
                  <dd className="id-text text-xs">{selectedPkgDetails.manufacturer.license}</dd>
                </div>
                {selectedPkgDetails.custodian && (
                  <>
                    <div className="flex justify-between">
                      <dt className="text-muted">Current Physical Custodian</dt>
                      <dd className="font-medium text-navy">{selectedPkgDetails.custodian.name} ({selectedPkgDetails.custodian.type})</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted">Facility Address</dt>
                      <dd className="text-right text-xs text-muted">{selectedPkgDetails.custodian.address}</dd>
                    </div>
                  </>
                )}
              </dl>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy flex items-center gap-1.5">
                <Clock size={14} /> Chronological Custody Chain ({selectedPkgDetails.timeline?.length ?? 0} events)
              </h3>
              {selectedPkgDetails.timeline?.length > 0 ? (
                <div className="space-y-3 border-l-2 border-line pl-4">
                  {selectedPkgDetails.timeline.map((evt, idx) => (
                    <div key={idx} className="relative text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-navy">{evt.eventType}</span>
                        <span className="id-text text-xs text-muted">{new Date(evt.timestamp).toLocaleString()}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-ink">
                        {evt.actorName && <span>Custodian: <strong>{evt.actorName}</strong></span>}
                        {evt.targetName && <span> &rarr; Delivered to: <strong>{evt.targetName}</strong></span>}
                        {evt.shipmentRef && <span className="ml-2 id-text font-semibold text-clinical">({evt.shipmentRef})</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted">No custody transitions recorded.</p>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </>
  )
}
