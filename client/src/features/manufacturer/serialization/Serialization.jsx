import { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import { PageHeader, Button, DataTable, StatusBadge, Drawer, Timeline, Toast } from '../../../components/ui'
import { useDemoData } from '../../../contexts/DemoData'

export default function Serialization() {
  const { batches, packages, productOf, orgName, generateSerials } = useDemoData()
  const [q, setQ] = useState('')
  const [bf, setBf] = useState('')
  const [sel, setSel] = useState(null)
  const [toast, setToast] = useState('')
  const [batchId, setBatchId] = useState('b1')
  const [qty, setQty] = useState(5)
  const [err, setErr] = useState('')

  const b = batches.find(x => x.id === batchId)
  const done = packages.filter(p => p.batchId === batchId).length
  const rows = useMemo(
    () => packages.filter(p => (!bf || p.batchId === bf) && p.serial.includes(q.trim().toUpperCase())),
    [packages, q, bf]
  )

  function generate() {
    const res = generateSerials({ batchId, quantity: qty })
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setErr('')
    setToast(`${res.added.length} demo serials generated (in-memory only, not GS1-valid).`)
  }

  const bi = sel && batches.find(x => x.id === sel.batchId)

  return (
    <>
      <PageHeader
        title="Package Serialization"
        description="Generate demonstration serial identifiers per batch. Identifiers are illustrative and not production GS1 codes."
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
            className="mt-1 w-full rounded-md border border-line p-2 font-normal"
          >
            {batches.map(x => (
              <option key={x.id} value={x.id}>
                {x.no} · {productOf(x.productId).name} ({x.release})
              </option>
            ))}
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
          {done} / {b.quantity} serialized
        </div>
        <div>
          <Button variant="success" onClick={generate} className="w-full">
            Generate serials
          </Button>
        </div>
        {b.release !== 'Released' && !err && (
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

      <div className="mb-3 flex flex-wrap gap-2">
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
          {batches.map(x => (
            <option key={x.id} value={x.id}>
              {x.no}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        rows={rows}
        onRowClick={setSel}
        columns={[
          { key: 'serial', label: 'Serial', render: r => <span className="id-text whitespace-nowrap font-semibold">{r.serial}</span> },
          { key: 'batch', label: 'Batch', render: r => <span className="id-text whitespace-nowrap">{batches.find(x => x.id === r.batchId).no}</span> },
          { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
          { key: 'c', label: 'Custody', render: r => orgName(r.custodian) }
        ]}
      />

      <Drawer open={!!sel} onClose={() => setSel(null)} title="Package details">
        {sel && (
          <>
            <dl className="mb-5 space-y-2 text-sm">
              {[
                ['Serial', sel.serial],
                ['Product', `${productOf(bi.productId).name} ${productOf(bi.productId).strength}`],
                ['Batch', bi.no],
                ['Manufactured', bi.mfd],
                ['Expires', bi.exp],
                ['Custody', orgName(sel.custodian)]
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <dt className="text-muted">{k}</dt>
                  <dd className="id-text font-semibold">{v}</dd>
                </div>
              ))}
              <div className="flex justify-between">
                <dt className="text-muted">Status</dt>
                <StatusBadge status={sel.status} />
              </div>
            </dl>
            <h3 className="mb-3 text-sm font-bold text-navy">Custody history</h3>
            <Timeline items={sel.history.map(([t, o, d]) => ({ title: t, meta: `${orgName(o)} · ${d}` }))} />
          </>
        )}
      </Drawer>
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </>
  )
}
