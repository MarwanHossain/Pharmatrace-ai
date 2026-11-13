import { useMemo, useState } from 'react'
import { Plus, CheckCircle2, Package, Layers } from 'lucide-react'
import {
  PageHeader,
  MetricCard,
  DataTable,
  StatusBadge,
  Button,
  Drawer,
  Toast,
  Modal,
  Progress
} from '../../../components/ui'
import { useDemoData } from '../../../contexts/DemoData'
import { useDemoSession } from '../../../contexts/DemoSession'
import { getCurrentDateIso } from '../../../services/supplyChain'

const FORMS = ['Tablet', 'Capsule', 'Syrup', 'Injection']

const EMPTY_PRODUCT = {
  name: '',
  strength: '',
  form: 'Tablet',
  packSize: '',
  gtin: ''
}

const createEmptyBatch = () => ({
  productId: '',
  no: '',
  mfd: getCurrentDateIso(),
  exp: '',
  quantity: '50'
})

export default function ProductsBatches() {
  const {
    products,
    batches,
    packages,
    orgName,
    productOf,
    addProduct,
    updateProduct,
    addBatch,
    releaseBatch
  } = useDemoData()
  const { orgId } = useDemoSession()

  const orgProducts = useMemo(
    () => products.filter(p => (p.orgId ?? 'm1') === orgId),
    [products, orgId]
  )
  const activeOrgProducts = useMemo(
    () => orgProducts.filter(p => (p.status ?? 'active') === 'active'),
    [orgProducts]
  )
  const orgBatches = useMemo(
    () => batches.filter(b => (b.orgId ?? productOf(b.productId)?.orgId ?? 'm1') === orgId),
    [batches, productOf, orgId]
  )

  const today = getCurrentDateIso()
  const [tab, setTab] = useState('all')
  const [selProductId, setSelProductId] = useState(null)
  const [selBatchId, setSelBatchId] = useState(null)
  const [productModal, setProductModal] = useState(false)
  const [batchModal, setBatchModal] = useState(false)
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT)
  const [batchForm, setBatchForm] = useState(() => createEmptyBatch())
  const [productErr, setProductErr] = useState('')
  const [batchErr, setBatchErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  const serializedCountByBatch = useMemo(() => {
    const map = {}
    for (const p of packages) {
      map[p.batchId] = (map[p.batchId] ?? 0) + 1
    }
    return map
  }, [packages])

  const selectedProduct = useMemo(
    () => orgProducts.find(p => p.id === selProductId) ?? null,
    [orgProducts, selProductId]
  )

  const selectedBatch = useMemo(
    () => orgBatches.find(b => b.id === selBatchId) ?? null,
    [orgBatches, selBatchId]
  )

  const productBatches = useMemo(
    () => (selectedProduct ? orgBatches.filter(b => b.productId === selectedProduct.id) : []),
    [orgBatches, selectedProduct]
  )

  const batchPackages = useMemo(
    () => (selectedBatch ? packages.filter(p => p.batchId === selectedBatch.id) : []),
    [packages, selectedBatch]
  )

  const pendingQaCount = orgBatches.filter(b => b.release !== 'Released').length
  const releasedCount = orgBatches.filter(b => b.release === 'Released').length

  function openProductModal() {
    setProductForm(EMPTY_PRODUCT)
    setProductErr('')
    setProductModal(true)
  }

  function openBatchModal() {
    setBatchForm({
      ...createEmptyBatch(),
      productId: activeOrgProducts[0]?.id ?? ''
    })
    setBatchErr('')
    setBatchModal(true)
  }

  async function handleRegisterProduct(e) {
    e.preventDefault()
    if (saving) return
    const name = productForm.name.trim()
    const strength = productForm.strength.trim()
    const packSize = productForm.packSize.trim()
    const gtin = productForm.gtin.trim().toUpperCase()

    if (!name || !strength || !packSize || !gtin) {
      setProductErr('All product fields are required.')
      return
    }
    if (products.some(p => p.gtin.toUpperCase() === gtin)) {
      setProductErr('A product with this GTIN already exists.')
      return
    }

    setSaving(true)
    try {
      const res = await addProduct({
        name,
        strength,
        form: productForm.form,
        packSize,
        gtin
      })
      if (!res || res.ok === false) {
        setProductErr(res?.error || 'Could not register product.')
        return
      }
      setProductModal(false)
      setToast(`Registered product ${name} (${strength}).`)
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateBatch(e) {
    e.preventDefault()
    if (saving) return
    const no = batchForm.no.trim().toUpperCase()
    const quantity = Number(batchForm.quantity)

    if (!batchForm.productId || !no || !batchForm.mfd || !batchForm.exp) {
      setBatchErr('Please fill in product, batch number, manufactured date and expiry date.')
      return
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setBatchErr('Quantity must be a positive whole number.')
      return
    }
    if (batchForm.exp <= batchForm.mfd) {
      setBatchErr('Expiry date must be after the manufactured date.')
      return
    }
    if (batches.some(b => b.no.toUpperCase() === no)) {
      setBatchErr('A batch with this number already exists.')
      return
    }

    setSaving(true)
    try {
      const res = await addBatch({
        productId: batchForm.productId,
        no,
        mfd: batchForm.mfd,
        exp: batchForm.exp,
        quantity
      })
      if (!res || res.ok === false) {
        setBatchErr(res?.error || 'Could not create batch.')
        return
      }
      setBatchModal(false)
      setToast(`Created batch ${no} (Pending QA).`)
    } finally {
      setSaving(false)
    }
  }

  async function handleReleaseBatch(batch, e) {
    e?.stopPropagation()
    if (saving) return
    setSaving(true)
    try {
      const res = await releaseBatch(batch.id)
      if (!res || res.ok === false) {
        setToast(res?.error || 'Could not release batch.')
        return
      }
      setToast(`Batch ${batch.no} released for serialization.`)
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleProductStatus(product) {
    if (saving) return
    const nextStatus = product.status === 'active' ? 'inactive' : 'active'
    setSaving(true)
    try {
      const res = await updateProduct(product.id, { status: nextStatus })
      if (!res || res.ok === false) {
        setToast(res?.error || 'Could not update product status.')
        return
      }
      setToast(`Product ${product.name} marked ${nextStatus}.`)
    } finally {
      setSaving(false)
    }
  }

  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'products', label: `Products (${orgProducts.length})` },
    { id: 'batches', label: `Batches (${orgBatches.length})` }
  ]

  return (
    <>
      <PageHeader
        title="Products & Batches"
        description="Register pharmaceutical products, create production batches, and manage QA release before serialization."
        actions={
          <>
            <Button variant="secondary" onClick={openBatchModal} disabled={activeOrgProducts.length === 0}>
              <Layers size={15} /> Create batch
            </Button>
            <Button onClick={openProductModal}>
              <Plus size={15} /> Register product
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Products" value={orgProducts.length} hint={`${activeOrgProducts.length} active`} />
        <MetricCard label="Total batches" value={orgBatches.length} />
        <MetricCard label="Released" value={releasedCount} />
        <MetricCard label="Pending QA" value={pendingQaCount} />
      </div>

      <div className="mb-5 flex flex-wrap gap-2 border-b border-line pb-3">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
              tab === t.id
                ? 'bg-navy text-white'
                : 'border border-line bg-white text-muted hover:bg-surface hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {(tab === 'all' || tab === 'products') && (
        <section className="mb-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold text-navy">
                <Package size={16} aria-hidden /> Registered products
              </h2>
              <p className="text-xs text-muted">Click a product row to view its details and associated batches.</p>
            </div>
            <Button variant="secondary" onClick={openProductModal}>
              <Plus size={14} /> Register product
            </Button>
          </div>

          <DataTable
            rows={orgProducts}
            onRowClick={r => setSelProductId(r.id)}
            empty="No products registered yet."
            columns={[
              { key: 'name', label: 'Product', render: r => <span className="font-semibold text-navy">{r.name}</span> },
              { key: 'strength', label: 'Strength' },
              { key: 'form', label: 'Form' },
              { key: 'packSize', label: 'Pack size' },
              { key: 'gtin', label: 'GTIN', render: r => <span className="id-text whitespace-nowrap">{r.gtin}</span> },
              { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> }
            ]}
          />
        </section>
      )}

      {tab === 'all' && <hr className="my-8 border-line" />}

      {(tab === 'all' || tab === 'batches') && (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold text-navy">
                <Layers size={16} aria-hidden /> Production batches
              </h2>
              <p className="text-xs text-muted">Pending QA batches must be released before serial identifiers can be generated.</p>
            </div>
            <Button variant="secondary" onClick={openBatchModal} disabled={activeOrgProducts.length === 0}>
              <Plus size={14} /> Create batch
            </Button>
          </div>

          <DataTable
            rows={orgBatches}
            onRowClick={r => setSelBatchId(r.id)}
            empty="No batches created yet."
            columns={[
              { key: 'no', label: 'Batch no', render: r => <span className="id-text whitespace-nowrap font-semibold text-navy">{r.no}</span> },
              {
                key: 'productId',
                label: 'Product',
                render: r => {
                  const prod = productOf(r.productId)
                  return prod ? `${prod.name} ${prod.strength}` : '—'
                }
              },
              { key: 'mfd', label: 'MFD', render: r => <span className="id-text whitespace-nowrap">{r.mfd}</span> },
              {
                key: 'exp',
                label: 'EXP',
                render: r => (
                  <span className={`id-text whitespace-nowrap ${r.exp < today ? 'font-semibold text-quarantine' : ''}`}>
                    {r.exp}
                  </span>
                )
              },
              { key: 'quantity', label: 'Quantity', render: r => <span className="id-text">{r.quantity}</span> },
              {
                key: 'serialized',
                label: 'Serialized',
                render: r => (
                  <span className="id-text">
                    {serializedCountByBatch[r.id] ?? 0} / {r.quantity}
                  </span>
                )
              },
              { key: 'release', label: 'Release status', render: r => <StatusBadge status={r.release} /> },
              {
                key: 'actions',
                label: 'Actions',
                render: r =>
                  r.release !== 'Released' ? (
                    <Button
                      variant="success"
                      className="px-2.5 py-1 text-xs"
                      onClick={e => handleReleaseBatch(r, e)}
                    >
                      <CheckCircle2 size={13} /> Release
                    </Button>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )
              }
            ]}
          />
        </section>
      )}

      {/* Register Product Modal */}
      <Modal
        open={productModal}
        title="Register product"
        onClose={() => setProductModal(false)}
        actions={
          <>
            <Button variant="secondary" type="button" onClick={() => setProductModal(false)}>
              Cancel
            </Button>
            <Button type="submit" form="register-product-form" disabled={saving}>
              {saving ? 'Saving...' : 'Register product'}
            </Button>
          </>
        }
      >
        <form id="register-product-form" onSubmit={handleRegisterProduct} className="space-y-3">
          <label className="block text-sm font-semibold">
            Product name
            <input
              value={productForm.name}
              onChange={e => setProductForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Metformin"
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold">
              Strength
              <input
                value={productForm.strength}
                onChange={e => setProductForm(f => ({ ...f, strength: e.target.value }))}
                placeholder="e.g. 500 mg"
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="block text-sm font-semibold">
              Dosage form
              <select
                value={productForm.form}
                onChange={e => setProductForm(f => ({ ...f, form: e.target.value }))}
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
              >
                {FORMS.map(form => (
                  <option key={form} value={form}>
                    {form}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold">
              Pack size
              <input
                value={productForm.packSize}
                onChange={e => setProductForm(f => ({ ...f, packSize: e.target.value }))}
                placeholder="e.g. 10 x 10"
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="block text-sm font-semibold">
              GTIN
              <input
                value={productForm.gtin}
                onChange={e => setProductForm(f => ({ ...f, gtin: e.target.value }))}
                placeholder="DEMO-GTIN-0003"
                className="id-text mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
              />
            </label>
          </div>
          {productErr && (
            <p role="alert" className="text-sm text-quarantine">
              {productErr}
            </p>
          )}
        </form>
      </Modal>

      {/* Create Batch Modal */}
      <Modal
        open={batchModal}
        title="Create production batch"
        onClose={() => setBatchModal(false)}
        actions={
          <>
            <Button variant="secondary" type="button" onClick={() => setBatchModal(false)}>
              Cancel
            </Button>
            <Button type="submit" form="create-batch-form" disabled={saving}>
              {saving ? 'Creating...' : 'Create batch'}
            </Button>
          </>
        }
      >
        <form id="create-batch-form" onSubmit={handleCreateBatch} className="space-y-3">
          <label className="block text-sm font-semibold">
            Product
            <select
              value={batchForm.productId}
              onChange={e => setBatchForm(f => ({ ...f, productId: e.target.value }))}
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
            >
              {activeOrgProducts.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.strength} ({p.form})
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold">
              Batch number
              <input
                value={batchForm.no}
                onChange={e => setBatchForm(f => ({ ...f, no: e.target.value }))}
                placeholder="e.g. PCM-2611"
                className="id-text mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="block text-sm font-semibold">
              Batch quantity
              <input
                type="number"
                min="1"
                value={batchForm.quantity}
                onChange={e => setBatchForm(f => ({ ...f, quantity: e.target.value }))}
                className="id-text mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold">
              Manufactured date
              <input
                type="date"
                value={batchForm.mfd}
                onChange={e => setBatchForm(f => ({ ...f, mfd: e.target.value }))}
                className="id-text mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="block text-sm font-semibold">
              Expiry date
              <input
                type="date"
                value={batchForm.exp}
                onChange={e => setBatchForm(f => ({ ...f, exp: e.target.value }))}
                className="id-text mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
              />
            </label>
          </div>
          {batchErr && (
            <p role="alert" className="text-sm text-quarantine">
              {batchErr}
            </p>
          )}
        </form>
      </Modal>

      {/* Product Detail Drawer */}
      <Drawer
        open={!!selectedProduct}
        onClose={() => setSelProductId(null)}
        title={selectedProduct ? `${selectedProduct.name} ${selectedProduct.strength}` : 'Product details'}
      >
        {selectedProduct && (
          <>
            <dl className="mb-5 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Product name</dt>
                <dd className="font-semibold">{selectedProduct.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Strength</dt>
                <dd className="font-semibold">{selectedProduct.strength}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Form</dt>
                <dd className="font-semibold">{selectedProduct.form}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Pack size</dt>
                <dd className="font-semibold">{selectedProduct.packSize}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">GTIN</dt>
                <dd className="id-text font-semibold">{selectedProduct.gtin}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted">Status</dt>
                <StatusBadge status={selectedProduct.status} />
              </div>
            </dl>

            <div className="mb-6 flex justify-end">
              <Button
                variant="secondary"
                className="text-xs"
                onClick={() => handleToggleProductStatus(selectedProduct)}
              >
                {selectedProduct.status === 'active' ? 'Mark inactive' : 'Mark active'}
              </Button>
            </div>

            <h3 className="mb-3 text-sm font-bold text-navy">
              Batches ({productBatches.length})
            </h3>
            {productBatches.length === 0 ? (
              <p className="rounded-md border border-dashed border-line p-4 text-center text-xs text-muted">
                No batches recorded for this product yet.
              </p>
            ) : (
              <div className="space-y-3">
                {productBatches.map(b => (
                  <div key={b.id} className="rounded-md border border-line bg-surface p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="id-text text-sm font-semibold text-navy">{b.no}</span>
                      <StatusBadge status={b.release} />
                    </div>
                    <div className="mb-2 flex justify-between text-xs text-muted">
                      <span>MFD {b.mfd}</span>
                      <span>EXP {b.exp}</span>
                    </div>
                    <Progress value={serializedCountByBatch[b.id] ?? 0} max={b.quantity} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Drawer>

      {/* Batch Detail Drawer */}
      <Drawer
        open={!!selectedBatch}
        onClose={() => setSelBatchId(null)}
        title={selectedBatch ? `Batch ${selectedBatch.no}` : 'Batch details'}
      >
        {selectedBatch && (
          <>
            <dl className="mb-5 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Batch no</dt>
                <dd className="id-text font-semibold">{selectedBatch.no}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Product</dt>
                <dd className="font-semibold">
                  {productOf(selectedBatch.productId)?.name} {productOf(selectedBatch.productId)?.strength}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">GTIN</dt>
                <dd className="id-text font-semibold">{productOf(selectedBatch.productId)?.gtin ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Manufactured</dt>
                <dd className="id-text font-semibold">{selectedBatch.mfd}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Expires</dt>
                <dd
                  className={`id-text font-semibold ${
                    selectedBatch.exp < today ? 'text-quarantine' : ''
                  }`}
                >
                  {selectedBatch.exp}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Planned quantity</dt>
                <dd className="id-text font-semibold">{selectedBatch.quantity}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted">Release status</dt>
                <StatusBadge status={selectedBatch.release} />
              </div>
            </dl>

            <div className="mb-5 rounded-md border border-line bg-surface p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Serialization progress
              </div>
              <Progress value={batchPackages.length} max={selectedBatch.quantity} />
            </div>

            {selectedBatch.release !== 'Released' && (
              <div className="mb-6">
                <Button
                  variant="success"
                  className="w-full"
                  onClick={() => handleReleaseBatch(selectedBatch)}
                >
                  <CheckCircle2 size={15} /> Release batch for serialization
                </Button>
              </div>
            )}

            <h3 className="mb-2 text-sm font-bold text-navy">
              Serialized packages ({batchPackages.length})
            </h3>
            {batchPackages.length === 0 ? (
              <p className="rounded-md border border-dashed border-line p-4 text-center text-xs text-muted">
                No packages serialized for this batch yet.
              </p>
            ) : (
              <div className="max-h-64 divide-y divide-line overflow-y-auto rounded-md border border-line">
                {batchPackages.map(pkg => (
                  <div key={pkg.serial} className="flex items-center justify-between px-3 py-2 text-xs">
                    <div>
                      <div className="id-text font-semibold text-navy">{pkg.serial}</div>
                      <div className="text-muted">{orgName(pkg.custodian)}</div>
                    </div>
                    <StatusBadge status={pkg.status} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Drawer>

      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </>
  )
}
