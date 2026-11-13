import { useEffect, useState, useMemo } from 'react'
import { CheckSquare, Copy, Printer, QrCode, Search, Square } from 'lucide-react'
import { PageHeader, Button, DataTable, StatusBadge, Drawer, Timeline, Toast } from '../../../components/ui'
import PackageLabelCard from '../../../components/qr/PackageLabelCard'
import LabelSheetModal from '../../../components/qr/LabelSheetModal'
import { useDemoData } from '../../../contexts/DemoData'
import { useDemoSession } from '../../../contexts/DemoSession'
import { buildPackageLabelMetadata } from '../../../services/qrGenerator'
import { getPackageTraceabilityEvents } from '../../../services/traceabilityEvents'

export default function Serialization() {
  const { batches, packages, traceabilityEvents, productOf, orgName, generateSerials } = useDemoData()
  const { orgId } = useDemoSession()

  const orgBatches = useMemo(
    () => batches.filter(b => (b.orgId ?? productOf(b.productId)?.orgId ?? 'm1') === orgId),
    [batches, productOf, orgId]
  )
  const orgBatchIds = useMemo(() => new Set(orgBatches.map(b => b.id)), [orgBatches])
  const orgPackages = useMemo(
    () => packages.filter(p => orgBatchIds.has(p.batchId) || p.manufacturerOrgId === orgId),
    [packages, orgBatchIds, orgId]
  )

  const [q, setQ] = useState('')
  const [bf, setBf] = useState('')
  const [selSerial, setSelSerial] = useState(null)
  const [selectedForPrint, setSelectedForPrint] = useState([])
  const [labelModalConfig, setLabelModalConfig] = useState({ open: false, serials: [], title: '' })
  const [recentSerials, setRecentSerials] = useState([])
  const [toast, setToast] = useState('')
  const [batchId, setBatchId] = useState(() => orgBatches[0]?.id ?? '')
  const [qty, setQty] = useState(5)
  const [generating, setGenerating] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (orgBatches.length === 0) {
      if (batchId !== '') setBatchId('')
      return
    }
    if (!batchId || !orgBatches.some(x => x.id === batchId)) {
      setBatchId(orgBatches[0].id)
    }
  }, [orgBatches, batchId])

  const b = orgBatches.find(x => x.id === batchId)
  const done = orgPackages.filter(p => p.batchId === batchId).length
  const rows = useMemo(
    () => orgPackages.filter(p => (!bf || p.batchId === bf) && p.serial.includes(q.trim().toUpperCase())),
    [orgPackages, q, bf]
  )

  const batchById = useMemo(() => new Map(orgBatches.map(x => [x.id, x])), [orgBatches])
  const orgPkgBySerial = useMemo(() => new Map(orgPackages.map(p => [p.serial, p])), [orgPackages])
  const selectedSet = useMemo(() => new Set(selectedForPrint), [selectedForPrint])

  const sel = selSerial ? orgPkgBySerial.get(selSerial) ?? null : null
  const bi = sel ? batchById.get(sel.batchId) ?? null : null

  function toLabelMeta(pkg) {
    const batch = batchById.get(pkg.batchId) ?? null
    const product = batch ? productOf(batch.productId) : null
    const mfgOrgId = pkg.manufacturerOrgId ?? batch?.orgId ?? orgId
    return buildPackageLabelMetadata({
      pkg,
      batch,
      product,
      manufacturerName: orgName(mfgOrgId)
    })
  }

  const selLabelMeta = useMemo(() => (sel ? toLabelMeta(sel) : null), [sel, batchById, productOf, orgName, orgId])
  const selEvents = useMemo(
    () => (sel ? getPackageTraceabilityEvents(traceabilityEvents, sel.serial) : []),
    [sel, traceabilityEvents]
  )

  const modalLabels = useMemo(
    () =>
      labelModalConfig.serials
        .map(s => orgPkgBySerial.get(s))
        .filter(Boolean)
        .map(toLabelMeta),
    [labelModalConfig.serials, orgPkgBySerial, batchById, productOf, orgName, orgId]
  )

  async function generate() {
    if (generating) return
    setGenerating(true)
    setErr('')
    try {
      const res = await generateSerials({ batchId, quantity: qty })
      if (!res?.ok) {
        setErr(res?.error || 'Could not generate serials.')
        return
      }
      const addedSerials = res.added.map(p => p.serial)
      setRecentSerials(addedSerials)
      setSelectedForPrint(addedSerials)
      setToast(`${res.added.length} demo serials generated with QR labels ready.`)
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

  return (
    <>
      <PageHeader
        title="Package Serialization"
        description="Generate demonstration serial identifiers and printable QR verification labels per QA-released batch."
        actions={
          <div className="flex flex-wrap gap-2">
            {selectedForPrint.length > 0 && (
              <Button
                variant="primary"
                onClick={() =>
                  openBatchLabelModal(selectedForPrint, `Selected Package Labels`)
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
                    bf ? `Batch ${batchById.get(bf)?.no ?? ''} Labels` : 'Filtered Package Labels'
                  )
                }
              >
                <QrCode size={15} /> Batch Label Sheet ({rows.length})
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-6 grid gap-3 rounded-lg border border-line bg-white p-4 md:grid-cols-4 md:items-end">
        <label className="text-sm font-semibold">
          Batch
          <select
            value={batchId}
            onChange={e => {
              setBatchId(e.target.value)
              setErr('')
            }}
            disabled={orgBatches.length === 0}
            className="mt-1 w-full rounded-md border border-line p-2 font-normal"
          >
            {orgBatches.length === 0 ? (
              <option value="">No batches created yet</option>
            ) : (
              orgBatches.map(x => (
                <option key={x.id} value={x.id}>
                  {x.no} · {productOf(x.productId)?.name ?? '—'} ({x.release})
                </option>
              ))
            )}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Quantity
          <input
            type="number"
            min="1"
            value={qty}
            onChange={e => setQty(e.target.value)}
            className="mt-1 w-full rounded-md border border-line p-2 font-normal"
          />
        </label>
        <div className="flex h-[42px] items-center text-sm text-muted">
          {done} / {b?.quantity ?? 0} serialized
        </div>
        <div>
          <Button variant="success" onClick={generate} disabled={!b || generating} className="w-full">
            {generating ? 'Generating...' : 'Generate serials'}
          </Button>
        </div>
        {b && b.release !== 'Released' && !err && (
          <p className="text-xs font-medium text-amber-ink md:col-span-4">
            Batch {b.no} has release status "{b.release}". Serialization is blocked until QA release.
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
            <strong>{recentSerials.length} package label(s) generated.</strong> QR codes encode only each package verification URL.
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

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-3 text-muted" />
            <input
              aria-label="Search serial"
              placeholder="Search serial"
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
            <option value="">All batches</option>
            {orgBatches.map(x => (
              <option key={x.id} value={x.id}>
                {x.no}
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

      <DataTable
        rows={rows}
        onRowClick={r => setSelSerial(r.serial)}
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
          { key: 'serial', label: 'Serial', render: r => <span className="id-text whitespace-nowrap font-semibold">{r.serial}</span> },
          { key: 'batch', label: 'Batch', render: r => <span className="id-text whitespace-nowrap">{batchById.get(r.batchId)?.no ?? '—'}</span> },
          { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
          { key: 'c', label: 'Custody', render: r => orgName(r.custodian) },
          {
            key: 'qr',
            label: 'QR Label',
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
                <QrCode size={13} aria-hidden="true" /> Label / QR
              </Button>
            )
          }
        ]}
      />

      <Drawer open={!!sel} onClose={() => setSelSerial(null)} title="Package details & QR label">
        {sel && selLabelMeta && (
          <div className="space-y-5">
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                Package Label Preview
              </h3>
              <PackageLabelCard metadata={selLabelMeta} qrSize={112} compact />
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
                  <Copy size={13} aria-hidden="true" /> Copy QR URL
                </Button>
              </div>
            </div>

            <dl className="space-y-2 border-t border-line pt-4 text-sm">
              {[
                ['Serial', sel.serial],
                ['Product', bi ? `${productOf(bi.productId)?.name ?? '—'} ${productOf(bi.productId)?.strength ?? ''}`.trim() : '—'],
                ['Form & pack', bi && productOf(bi.productId) ? `${productOf(bi.productId).form} · ${productOf(bi.productId).packSize}` : '—'],
                ['Batch', bi?.no ?? '—'],
                ['Manufactured', bi?.mfd ?? '—'],
                ['Expires', bi?.exp ?? '—'],
                ['Custody', orgName(sel.custodian)]
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

            <div className="border-t border-line pt-4">
              <h3 className="mb-3 text-sm font-bold text-navy">Custody history</h3>
              <Timeline items={sel.history.map(([t, o, d]) => ({ title: t, meta: `${orgName(o)} · ${d}` }))} />
            </div>

            {selEvents.length > 0 && (
              <div className="border-t border-line pt-4">
                <h3 className="mb-2 text-sm font-bold text-navy">
                  Traceability Event Log ({selEvents.length})
                </h3>
                <ul className="space-y-1.5 text-xs">
                  {selEvents.map(evt => (
                    <li key={evt.id} className="rounded border border-line bg-surface p-2">
                      <div className="flex justify-between gap-2 font-semibold text-navy">
                        <span className="id-text">{evt.eventType}</span>
                        <span className="uppercase text-muted">{evt.category}</span>
                      </div>
                      <div className="mt-0.5 text-muted">
                        Outcome: <strong className="text-ink">{evt.outcome}</strong>
                        {evt.organizationId ? ` · ${orgName(evt.organizationId)}` : ''} ·{' '}
                        <span className="id-text">{evt.timestamp}</span>
                      </div>
                      {evt.failureReason && (
                        <div className="mt-0.5 text-quarantine">{evt.failureReason}</div>
                      )}
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
