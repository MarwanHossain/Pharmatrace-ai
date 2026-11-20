// PharmaTrace AI — Manufacturer Package Serialization
// Connected to live authenticated MariaDB backend APIs (Milestone M7.2)

import { useEffect, useState, useMemo, useCallback } from 'react'
import { CheckSquare, Copy, Printer, QrCode, Search, Square, RefreshCw, AlertCircle } from 'lucide-react'
import { PageHeader, Button, DataTable, StatusBadge, Drawer, Timeline, Toast } from '../../../components/ui'
import PackageLabelCard from '../../../components/qr/PackageLabelCard'
import LabelSheetModal from '../../../components/qr/LabelSheetModal'
import { getBatches, serializeBatch } from '../../../services/manufacturerBatchApi'
import { getPackages, getPackage } from '../../../services/manufacturerPackageApi'

export default function Serialization() {
  const [batches, setBatches] = useState([])
  const [packages, setPackages] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')

  const [q, setQ] = useState('')
  const [bf, setBf] = useState('')
  const [selSerial, setSelSerial] = useState(null)
  const [selPackageDetail, setSelPackageDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [selectedForPrint, setSelectedForPrint] = useState([])
  const [labelModalConfig, setLabelModalConfig] = useState({ open: false, serials: [], title: '' })
  const [recentSerials, setRecentSerials] = useState([])
  const [toast, setToast] = useState('')
  const [batchId, setBatchId] = useState('')
  const [qty, setQty] = useState(10)
  const [generating, setGenerating] = useState(false)
  const [err, setErr] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setFetchError('')
    try {
      const [batchRes, pkgRes] = await Promise.all([
        getBatches({ limit: 100 }),
        getPackages({ limit: 200 })
      ])
      const batchList = batchRes.batches || []
      const pkgList = pkgRes.packages || []
      setBatches(batchList)
      setPackages(pkgList)
      if (!batchId && batchList.length > 0) {
        const released = batchList.find(b => b.release_status === 'Released')
        setBatchId(released ? released.id : batchList[0].id)
      }
    } catch (e) {
      setFetchError(e.message || 'Failed to load serialization data from server.')
    } finally {
      setLoading(false)
    }
  }, [batchId])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (batches.length === 0) {
      if (batchId !== '') setBatchId('')
      return
    }
    if (!batchId || !batches.some(x => x.id === batchId)) {
      const released = batches.find(b => b.release_status === 'Released')
      setBatchId(released ? released.id : batches[0].id)
    }
  }, [batches, batchId])

  const selectedBatch = useMemo(
    () => batches.find(x => x.id === batchId) ?? null,
    [batches, batchId]
  )

  const batchById = useMemo(
    () => new Map(batches.map(x => [x.id, x])),
    [batches]
  )

  const pkgBySerial = useMemo(
    () => new Map(packages.map(p => [p.serial, p])),
    [packages]
  )

  const doneCount = useMemo(
    () => (selectedBatch ? packages.filter(p => p.batch_id === selectedBatch.id).length : 0),
    [packages, selectedBatch]
  )

  const rows = useMemo(() => {
    const search = q.trim().toUpperCase()
    return packages.filter(p => {
      const matchBatch = !bf || p.batch_id === bf
      const matchSearch = !search || p.serial.includes(search)
      return matchBatch && matchSearch
    })
  }, [packages, q, bf])

  const selectedSet = useMemo(() => new Set(selectedForPrint), [selectedForPrint])

  useEffect(() => {
    if (!selSerial) {
      setSelPackageDetail(null)
      return
    }
    let cancelled = false
    setLoadingDetail(true)
    getPackage(selSerial)
      .then(res => {
        if (!cancelled) setSelPackageDetail(res)
      })
      .catch(() => {
        if (!cancelled) {
          const fallback = pkgBySerial.get(selSerial)
          setSelPackageDetail(fallback || null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false)
      })
    return () => {
      cancelled = true
    }
  }, [selSerial, pkgBySerial])

  function toLabelMeta(pkg) {
    if (!pkg) return null
    return {
      serial: pkg.serial,
      batchNo: pkg.batch_no || pkg.batchNo,
      productName: pkg.product_name || pkg.productName,
      strength: pkg.strength,
      dosageForm: pkg.dosage_form || pkg.dosageForm,
      packSize: pkg.pack_size || pkg.packSize,
      gtin: pkg.gtin,
      mfd: pkg.mfd,
      exp: pkg.exp,
      manufacturerName: pkg.manufacturer_name || pkg.manufacturerName,
      verificationUrl: pkg.verificationUrl || `http://localhost:5173/verify?serial=${encodeURIComponent(pkg.serial)}`
    }
  }

  const sel = selPackageDetail || pkgBySerial.get(selSerial) || null
  const selLabelMeta = useMemo(() => (sel ? toLabelMeta(sel) : null), [sel])

  const modalLabels = useMemo(
    () =>
      labelModalConfig.serials
        .map(s => pkgBySerial.get(s))
        .filter(Boolean)
        .map(toLabelMeta),
    [labelModalConfig.serials, pkgBySerial]
  )

  async function generate() {
    if (generating || !selectedBatch) return
    if (selectedBatch.release_status !== 'Released') {
      setErr(`Batch ${selectedBatch.batch_no || selectedBatch.no} is "${selectedBatch.release_status}". Serialization is strictly blocked until QA release.`)
      return
    }

    const quantity = Number(qty)
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setErr('Serialization quantity must be a positive whole number greater than zero.')
      return
    }

    setGenerating(true)
    setErr('')
    try {
      const res = await serializeBatch(selectedBatch.id, { quantity })
      const addedList = res.packages || []
      const addedSerials = addedList.map(p => p.serial)
      setRecentSerials(addedSerials)
      setSelectedForPrint(addedSerials)
      setToast(`${addedSerials.length} package serials successfully generated and persisted in MariaDB.`)
      await loadData()
    } catch (e) {
      setErr(e.message || 'Could not generate serial identifiers.')
    } finally {
      setGenerating(false)
    }
  }

  function toggleRowSelection(serial) {
    setSelectedForPrint(prev =>
      prev.includes(serial) ? prev.filter(s => s !== serial) : [...prev, serial]
    )
  }

  function openSingleLabelModal(serial) {
    setLabelModalConfig({
      open: true,
      serials: [serial],
      title: `Package Label · ${serial}`
    })
  }

  function openBatchLabelModal(serials, title) {
    if (!serials || serials.length === 0) return
    setLabelModalConfig({
      open: true,
      serials,
      title
    })
  }

  async function copyUrl(url) {
    try {
      await navigator.clipboard?.writeText(url)
      setToast(`Copied verification URL: ${url}`)
    } catch {
      setToast(url)
    }
  }

  if (loading && batches.length === 0 && packages.length === 0) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-3">
        <RefreshCw className="animate-spin text-clinical" size={32} />
        <p className="text-sm font-semibold text-navy">Loading package serialization registry from MariaDB...</p>
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="Package Serialization"
        description="Generate GS1 DataMatrix identifiers and printable QR verification labels for QA-released production batches."
        actions={
          <div className="flex flex-wrap gap-2">
            {selectedForPrint.length > 0 && (
              <Button
                variant="primary"
                onClick={() =>
                  openBatchLabelModal(selectedForPrint, 'Selected Package Labels')
                }
              >
                <Printer size={15} /> Print / Export Selected ({selectedForPrint.length})
              </Button>
            )}
            {rows.length > 0 && (
              <Button
                variant="secondary"
                onClick={() =>
                  openBatchLabelModal(
                    rows.map(r => r.serial),
                    bf ? `Batch ${batchById.get(bf)?.batch_no ?? ''} Labels` : 'Filtered Package Labels'
                  )
                }
              >
                <QrCode size={15} /> Batch Label Sheet ({rows.length})
              </Button>
            )}
          </div>
        }
      />

      {fetchError && (
        <div className="mb-4 flex items-center justify-between rounded-md border border-quarantine-line bg-quarantine-soft p-3 text-xs text-quarantine">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} />
            <span>{fetchError}</span>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="flex items-center gap-1 font-semibold underline hover:no-underline"
          >
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      {/* Serialization Generator Card */}
      <div className="mb-6 grid gap-3 rounded-lg border border-line bg-white p-4 md:grid-cols-4 md:items-end">
        <label className="text-sm font-semibold">
          Production Batch
          <select
            value={batchId}
            onChange={e => {
              setBatchId(e.target.value)
              setErr('')
            }}
            disabled={batches.length === 0}
            className="mt-1 w-full rounded-md border border-line p-2 font-normal"
          >
            {batches.length === 0 ? (
              <option value="">No batches created yet</option>
            ) : (
              batches.map(x => (
                <option key={x.id} value={x.id}>
                  {x.batch_no || x.no} · {x.product_name} ({x.release_status})
                </option>
              ))
            )}
          </select>
        </label>

        <label className="text-sm font-semibold">
          Package Quantity
          <input
            type="number"
            min="1"
            value={qty}
            onChange={e => setQty(e.target.value)}
            className="mt-1 w-full rounded-md border border-line p-2 font-normal"
          />
        </label>

        <div className="flex h-[42px] items-center text-sm text-muted">
          {doneCount} / {selectedBatch?.quantity ?? 0} serialized
        </div>

        <div>
          <Button
            variant="success"
            onClick={generate}
            disabled={!selectedBatch || selectedBatch.release_status !== 'Released' || generating}
            className="w-full"
          >
            {generating ? 'Serializing...' : 'Generate serials'}
          </Button>
        </div>

        {selectedBatch && selectedBatch.release_status !== 'Released' && !err && (
          <p className="text-xs font-medium text-amber-ink md:col-span-4">
            Batch {selectedBatch.batch_no || selectedBatch.no} has release status "{selectedBatch.release_status}". Serialization is strictly blocked until QA release sign-off.
          </p>
        )}

        {err && (
          <p role="alert" className="text-sm text-quarantine md:col-span-4">
            {err}
          </p>
        )}
      </div>

      {recentSerials.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-clinical-soft px-4 py-3 text-sm text-emerald-900">
          <div>
            <strong>{recentSerials.length} package label(s) generated.</strong> GS1 DataMatrix and QR verification codes are ready for production labeling.
          </div>
          <Button
            variant="success"
            className="px-3 py-1.5 text-xs"
            onClick={() => openBatchLabelModal(recentSerials, 'Newly Generated Package Labels')}
          >
            <Printer size={14} /> Preview & Print Latest ({recentSerials.length})
          </Button>
        </div>
      )}

      {/* Filter and Selection Controls */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-3 text-muted" />
            <input
              aria-label="Search serial"
              placeholder="Search serial number"
              value={q}
              onChange={e => setQ(e.target.value)}
              className="rounded-md border border-line py-2 pl-8 pr-3 text-sm"
            />
          </div>
          <select
            aria-label="Filter by batch"
            value={bf}
            onChange={e => setBf(e.target.value)}
            className="rounded-md border border-line p-2 text-sm"
          >
            <option value="">All batches ({packages.length})</option>
            {batches.map(x => (
              <option key={x.id} value={x.id}>
                {x.batch_no || x.no}
              </option>
            ))}
          </select>
        </div>

        {rows.length > 0 && (
          <div className="flex items-center gap-3 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setSelectedForPrint(rows.map(r => r.serial))}
              className="inline-flex items-center gap-1 text-clinical hover:underline"
            >
              <CheckSquare size={14} aria-hidden="true" /> Select all filtered ({rows.length})
            </button>
            {selectedForPrint.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedForPrint([])}
                className="inline-flex items-center gap-1 text-muted hover:text-navy"
              >
                <Square size={14} aria-hidden="true" /> Clear ({selectedForPrint.length})
              </button>
            )}
          </div>
        )}
      </div>

      {/* Package Serial Records Table */}
      <DataTable
        rows={rows}
        onRowClick={r => setSelSerial(r.serial)}
        empty="No package serial numbers generated yet. Select a QA-released batch and click 'Generate serials'."
        columns={[
          {
            key: 'select',
            label: 'Select',
            render: r => (
              <input
                type="checkbox"
                checked={selectedSet.has(r.serial)}
                aria-label={`Select ${r.serial} for batch printing`}
                onClick={e => e.stopPropagation()}
                onChange={() => toggleRowSelection(r.serial)}
                className="h-4 w-4 rounded border-line accent-clinical"
              />
            )
          },
          {
            key: 'serial',
            label: 'Serial Identifier',
            render: r => (
              <span className="id-text whitespace-nowrap font-semibold text-navy">
                {r.serial}
              </span>
            )
          },
          {
            key: 'batch',
            label: 'Batch',
            render: r => (
              <span className="id-text whitespace-nowrap">
                {r.batch_no || batchById.get(r.batch_id)?.batch_no || '—'}
              </span>
            )
          },
          {
            key: 'product',
            label: 'Product',
            render: r => (
              <span className="whitespace-nowrap">
                {r.product_name || batchById.get(r.batch_id)?.product_name || '—'}
              </span>
            )
          },
          {
            key: 'status',
            label: 'Status',
            render: r => <StatusBadge status={r.status} />
          },
          {
            key: 'custody',
            label: 'Custodian',
            render: r => (
              <span className="text-xs text-muted">
                {r.custodian_name || r.manufacturer_name || 'Manufacturer'}
              </span>
            )
          },
          {
            key: 'qr',
            label: 'Codes & Label',
            render: r => (
              <Button
                type="button"
                variant="secondary"
                className="px-2.5 py-1 text-xs"
                onClick={e => {
                  e.stopPropagation()
                  openSingleLabelModal(r.serial)
                }}
              >
                <QrCode size={13} aria-hidden="true" /> Codes / Label
              </Button>
            )
          }
        ]}
      />

      {/* Package Detail Drawer */}
      <Drawer
        open={!!selSerial}
        onClose={() => setSelSerial(null)}
        title={selSerial ? `Package ${selSerial}` : 'Package details'}
      >
        {loadingDetail && !sel && (
          <div className="flex justify-center p-8">
            <RefreshCw className="animate-spin text-clinical" size={24} />
          </div>
        )}

        {sel && selLabelMeta && (
          <div className="space-y-5">
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                Package Label Preview (GS1 DataMatrix + QR)
              </h3>
              <PackageLabelCard metadata={selLabelMeta} qrSize={88} compact />
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="success"
                  className="px-2.5 py-1.5 text-xs"
                  onClick={() => openSingleLabelModal(sel.serial)}
                >
                  <Printer size={13} aria-hidden="true" /> Export / Print Label
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="px-2.5 py-1.5 text-xs"
                  onClick={() => copyUrl(selLabelMeta.verificationUrl)}
                >
                  <Copy size={13} aria-hidden="true" /> Copy Verification URL
                </Button>
              </div>
            </div>

            <dl className="space-y-2 border-t border-line pt-4 text-sm">
              {[
                ['Serial identifier', sel.serial],
                ['Product', `${sel.product_name || '—'} ${sel.strength || ''}`.trim()],
                ['Generic name', sel.generic_name || '—'],
                ['Form & pack', `${sel.dosage_form || '—'} · ${sel.pack_size || '—'}`],
                ['GTIN-14', sel.gtin || '—'],
                ['Batch number', sel.batch_no || '—'],
                ['Manufactured date', sel.mfd || '—'],
                ['Expiry date', sel.exp || '—'],
                ['Manufacturer', sel.manufacturer_name || '—'],
                ['Current custodian', sel.custodian_name || sel.manufacturer_name || '—'],
                ['Allocation', sel.allocation_type || 'COMMERCIAL'],
                ['Verification checks', `${sel.verify_count ?? 0} time(s)`]
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className="id-text text-right font-semibold">{v}</dd>
                </div>
              ))}
              <div className="flex justify-between">
                <dt className="text-muted">Status</dt>
                <StatusBadge status={sel.status} />
              </div>
            </dl>

            {sel.history && sel.history.length > 0 && (
              <div className="border-t border-line pt-4">
                <h3 className="mb-2 text-sm font-bold text-navy">
                  Traceability Events ({sel.history.length})
                </h3>
                <ul className="space-y-1.5 text-xs">
                  {sel.history.map(evt => (
                    <li key={evt.id} className="rounded border border-line bg-surface p-2">
                      <div className="flex justify-between gap-2 font-semibold text-navy">
                        <span className="id-text">{evt.eventType || evt.event_type}</span>
                        <span className="text-[10px] text-muted">
                          {evt.createdAt ? String(evt.createdAt).slice(0, 19).replace('T', ' ') : ''}
                        </span>
                      </div>
                      <div className="mt-1 text-muted">
                        Actor: <strong className="text-ink">{evt.actorOrgId || evt.actor_org_id || 'System'}</strong>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Drawer>

      <LabelSheetModal
        open={labelModalConfig.open}
        labels={modalLabels}
        title={labelModalConfig.title || 'Package Labels'}
        onClose={() => setLabelModalConfig({ open: false, serials: [], title: '' })}
      />

      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </>
  )
}
