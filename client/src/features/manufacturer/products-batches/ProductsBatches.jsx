// PharmaTrace AI — Manufacturer Products & Batches Management
// Connected to live authenticated MariaDB backend APIs (Milestone M7.1)

import { useMemo, useState, useEffect, useCallback } from 'react'
import { Plus, CheckCircle2, Package, Layers, RefreshCw, AlertCircle } from 'lucide-react'
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
import {
  getProducts,
  createProduct,
  updateProductStatus
} from '../../../services/manufacturerProductApi'
import {
  getBatches,
  createBatch,
  releaseBatch
} from '../../../services/manufacturerBatchApi'
import { getCurrentDateIso } from '../../../services/supplyChain'

const FORMS = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Suspension', 'Ointment']

const EMPTY_PRODUCT = {
  name: '',
  generic_name: '',
  strength: '',
  dosage_form: 'Tablet',
  pack_size: '',
  gtin: ''
}

const createEmptyBatch = () => ({
  productId: '',
  batchNo: '',
  mfd: getCurrentDateIso(),
  exp: '',
  quantity: '500'
})

export default function ProductsBatches() {
  const [products, setProducts] = useState([])
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')

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

  const [qaReleaseModal, setQaReleaseModal] = useState(false)
  const [qaTargetBatch, setQaTargetBatch] = useState(null)
  const [qaNotes, setQaNotes] = useState('')
  const [qaErr, setQaErr] = useState('')
  const [releasing, setReleasing] = useState(false)

  const today = getCurrentDateIso()

  const loadData = useCallback(async () => {
    setLoading(true)
    setFetchError('')
    try {
      const [prodRes, batchRes] = await Promise.all([
        getProducts({ limit: 100 }),
        getBatches({ limit: 100 })
      ])
      setProducts(prodRes.products || [])
      setBatches(batchRes.batches || [])
    } catch (err) {
      setFetchError(err.message || 'Failed to load products and batches from server.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const activeProducts = useMemo(
    () => products.filter(p => p.status === 'active'),
    [products]
  )

  const selectedProduct = useMemo(
    () => products.find(p => p.id === selProductId) ?? null,
    [products, selProductId]
  )

  const selectedBatch = useMemo(
    () => batches.find(b => b.id === selBatchId) ?? null,
    [batches, selBatchId]
  )

  const productBatches = useMemo(
    () => (selectedProduct ? batches.filter(b => b.product_id === selectedProduct.id) : []),
    [batches, selectedProduct]
  )

  const pendingQaCount = batches.filter(b => b.release_status === 'Pending QA').length
  const releasedCount = batches.filter(b => b.release_status === 'Released').length

  function openProductModal() {
    setProductForm(EMPTY_PRODUCT)
    setProductErr('')
    setProductModal(true)
  }

  function openBatchModal() {
    setBatchForm({
      ...createEmptyBatch(),
      productId: activeProducts[0]?.id ?? ''
    })
    setBatchErr('')
    setBatchModal(true)
  }

  async function handleRegisterProduct(e) {
    e.preventDefault()
    if (saving) return

    const name = productForm.name.trim()
    const genericName = productForm.generic_name.trim()
    const strength = productForm.strength.trim()
    const packSize = productForm.pack_size.trim()
    const gtin = productForm.gtin.trim()

    if (!name || !genericName || !strength || !packSize) {
      setProductErr('Product trade name, generic name, strength, and pack size are required.')
      return
    }

    if (gtin && !/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(gtin)) {
      setProductErr('GTIN must be 8, 12, 13, or 14 digits (or leave blank if unassigned).')
      return
    }

    setSaving(true)
    setProductErr('')
    try {
      const created = await createProduct({
        name,
        generic_name: genericName,
        strength,
        dosage_form: productForm.dosage_form,
        pack_size: packSize,
        gtin: gtin || null
      })
      setProductModal(false)
      setToast(`Registered product "${created.name}" (${created.strength}).`)
      await loadData()
    } catch (err) {
      setProductErr(err.message || 'Could not register product.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateBatch(e) {
    e.preventDefault()
    if (saving) return

    const batchNo = batchForm.batchNo.trim().toUpperCase()
    const quantity = Number(batchForm.quantity)

    if (!batchForm.productId || !batchNo || !batchForm.mfd || !batchForm.exp) {
      setBatchErr('Please fill in product, batch number, manufactured date, and expiry date.')
      return
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      setBatchErr('Quantity must be a positive whole number greater than zero.')
      return
    }

    if (batchForm.exp <= batchForm.mfd) {
      setBatchErr('Expiry date must be strictly after the manufactured date.')
      return
    }

    if (batchForm.mfd > today) {
      setBatchErr('Manufacturing date cannot be in the future.')
      return
    }

    setSaving(true)
    setBatchErr('')
    try {
      const created = await createBatch({
        productId: batchForm.productId,
        batchNo,
        mfd: batchForm.mfd,
        exp: batchForm.exp,
        quantity
      })
      setBatchModal(false)
      setToast(`Created batch ${created.batch_no} (Pending QA).`)
      await loadData()
    } catch (err) {
      setBatchErr(err.message || 'Could not create batch.')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleProductStatus(product) {
    if (saving) return
    const nextStatus = product.status === 'active' ? 'discontinued' : 'active'
    setSaving(true)
    try {
      await updateProductStatus(product.id, nextStatus)
      setToast(`Product ${product.name} marked as ${nextStatus}.`)
      await loadData()
      if (selProductId === product.id) {
        setSelProductId(product.id)
      }
    } catch (err) {
      setToast(err.message || 'Could not update product status.')
    } finally {
      setSaving(false)
    }
  }

  function openQaReleaseModal(batch, e) {
    e?.stopPropagation()
    setQaTargetBatch(batch)
    setQaNotes('Assay, potency, and sterility specifications verified compliant.')
    setQaErr('')
    setQaReleaseModal(true)
  }

  async function handleConfirmRelease(e) {
    e.preventDefault()
    if (releasing || !qaTargetBatch) return

    setReleasing(true)
    setQaErr('')
    try {
      await releaseBatch(qaTargetBatch.id, { notes: qaNotes.trim() })
      setToast(`Batch ${qaTargetBatch.batch_no || qaTargetBatch.no} successfully approved for QA release.`)
      setQaReleaseModal(false)
      setQaTargetBatch(null)
      await loadData()
    } catch (err) {
      setQaErr(err.message || 'Failed to approve batch QA release.')
    } finally {
      setReleasing(false)
    }
  }

  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'products', label: `Products (${products.length})` },
    { id: 'batches', label: `Batches (${batches.length})` }
  ]

  if (loading && products.length === 0 && batches.length === 0) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-3">
        <RefreshCw className="animate-spin text-clinical" size={32} />
        <p className="text-sm font-semibold text-navy">Loading pharmaceutical registry from database...</p>
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="Products & Batches"
        description="Register pharmaceutical products, create production batches, and manage QA release before serialization."
        actions={
          <>
            <Button variant="secondary" onClick={openBatchModal} disabled={activeProducts.length === 0}>
              <Layers size={15} /> Create batch
            </Button>
            <Button onClick={openProductModal}>
              <Plus size={15} /> Register product
            </Button>
          </>
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

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Products" value={products.length} hint={`${activeProducts.length} active`} />
        <MetricCard label="Total batches" value={batches.length} />
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
              <p className="text-xs text-muted">Click a product row to view its details, generic formulation, and associated batches.</p>
            </div>
            <Button variant="secondary" onClick={openProductModal}>
              <Plus size={14} /> Register product
            </Button>
          </div>

          <DataTable
            rows={products}
            onRowClick={r => setSelProductId(r.id)}
            empty="No pharmaceutical products registered yet. Click 'Register product' to get started."
            columns={[
              {
                key: 'name',
                label: 'Product',
                render: r => (
                  <div>
                    <span className="font-semibold text-navy">{r.name}</span>
                    <div className="text-[11px] text-muted">{r.generic_name}</div>
                  </div>
                )
              },
              { key: 'strength', label: 'Strength' },
              { key: 'dosage_form', label: 'Form', render: r => r.dosage_form || r.form },
              { key: 'pack_size', label: 'Pack size', render: r => r.pack_size || r.packSize },
              {
                key: 'gtin',
                label: 'GTIN',
                render: r => <span className="id-text whitespace-nowrap">{r.gtin || '—'}</span>
              },
              {
                key: 'status',
                label: 'Status',
                render: r => (
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                      r.status === 'active'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {r.status === 'active' ? 'Active' : 'Discontinued'}
                  </span>
                )
              }
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
              <p className="text-xs text-muted">Pending QA batches require QA clearance before serial identifiers can be generated.</p>
            </div>
            <Button variant="secondary" onClick={openBatchModal} disabled={activeProducts.length === 0}>
              <Plus size={14} /> Create batch
            </Button>
          </div>

          <DataTable
            rows={batches}
            onRowClick={r => setSelBatchId(r.id)}
            empty="No production batches created yet. Click 'Create batch' to record your first batch."
            columns={[
              {
                key: 'batch_no',
                label: 'Batch no',
                render: r => (
                  <span className="id-text whitespace-nowrap font-semibold text-navy">
                    {r.batch_no || r.no}
                  </span>
                )
              },
              {
                key: 'product_name',
                label: 'Product',
                render: r => (
                  <div>
                    <span className="font-semibold text-navy">{r.product_name}</span>
                    <span className="ml-1 text-xs text-muted">{r.strength}</span>
                  </div>
                )
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
                    {r.serialized_count ?? 0} / {r.quantity}
                  </span>
                )
              },
              {
                key: 'release_status',
                label: 'Release status',
                render: r => <StatusBadge status={r.release_status || r.release} />
              },
              {
                key: 'actions',
                label: 'Actions',
                render: r =>
                  (r.release_status || r.release) !== 'Released' ? (
                    <Button
                      variant="secondary"
                      className="px-2.5 py-1 text-xs"
                      onClick={e => openQaReleaseModal(r, e)}
                    >
                      <CheckCircle2 size={13} className="text-amber-600" /> Release QA
                    </Button>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                      <CheckCircle2 size={13} /> Released
                    </span>
                  )
              }
            ]}
          />
        </section>
      )}

      {/* Register Product Modal */}
      <Modal
        open={productModal}
        title="Register pharmaceutical product"
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
            Product trade name <span className="text-quarantine">*</span>
            <input
              value={productForm.name}
              onChange={e => setProductForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Napa Extra"
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
              required
            />
          </label>

          <label className="block text-sm font-semibold">
            Generic name <span className="text-quarantine">*</span>
            <input
              value={productForm.generic_name}
              onChange={e => setProductForm(f => ({ ...f, generic_name: e.target.value }))}
              placeholder="e.g. Paracetamol + Caffeine"
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
              required
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold">
              Strength <span className="text-quarantine">*</span>
              <input
                value={productForm.strength}
                onChange={e => setProductForm(f => ({ ...f, strength: e.target.value }))}
                placeholder="e.g. 500 mg + 65 mg"
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
                required
              />
            </label>
            <label className="block text-sm font-semibold">
              Dosage form <span className="text-quarantine">*</span>
              <select
                value={productForm.dosage_form}
                onChange={e => setProductForm(f => ({ ...f, dosage_form: e.target.value }))}
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
              Pack size <span className="text-quarantine">*</span>
              <input
                value={productForm.pack_size}
                onChange={e => setProductForm(f => ({ ...f, pack_size: e.target.value }))}
                placeholder="e.g. 10 x 10"
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
                required
              />
            </label>
            <label className="block text-sm font-semibold">
              GTIN (Optional)
              <input
                value={productForm.gtin}
                onChange={e => setProductForm(f => ({ ...f, gtin: e.target.value }))}
                placeholder="e.g. 06291041500213"
                className="id-text mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
              />
              <span className="mt-0.5 block text-[10px] text-muted">8, 12, 13, or 14 digits with GS1 check digit</span>
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
            Product <span className="text-quarantine">*</span>
            <select
              value={batchForm.productId}
              onChange={e => setBatchForm(f => ({ ...f, productId: e.target.value }))}
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
            >
              {activeProducts.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.strength} ({p.dosage_form || p.form})
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold">
              Batch number <span className="text-quarantine">*</span>
              <input
                value={batchForm.batchNo}
                onChange={e => setBatchForm(f => ({ ...f, batchNo: e.target.value }))}
                placeholder="e.g. BATCH-2026-A1"
                className="id-text mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal uppercase"
                required
              />
            </label>
            <label className="block text-sm font-semibold">
              Batch quantity <span className="text-quarantine">*</span>
              <input
                type="number"
                min="1"
                value={batchForm.quantity}
                onChange={e => setBatchForm(f => ({ ...f, quantity: e.target.value }))}
                className="id-text mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
                required
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold">
              Manufactured date <span className="text-quarantine">*</span>
              <input
                type="date"
                max={today}
                value={batchForm.mfd}
                onChange={e => setBatchForm(f => ({ ...f, mfd: e.target.value }))}
                className="id-text mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
                required
              />
            </label>
            <label className="block text-sm font-semibold">
              Expiry date <span className="text-quarantine">*</span>
              <input
                type="date"
                min={batchForm.mfd || today}
                value={batchForm.exp}
                onChange={e => setBatchForm(f => ({ ...f, exp: e.target.value }))}
                className="id-text mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
                required
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
                <dt className="text-muted">Generic name</dt>
                <dd className="font-semibold text-clinical">{selectedProduct.generic_name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Strength</dt>
                <dd className="font-semibold">{selectedProduct.strength}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Form</dt>
                <dd className="font-semibold">{selectedProduct.dosage_form || selectedProduct.form}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Pack size</dt>
                <dd className="font-semibold">{selectedProduct.pack_size || selectedProduct.packSize}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">GTIN</dt>
                <dd className="id-text font-semibold">{selectedProduct.gtin || '—'}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted">Status</dt>
                <span
                  className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                    selectedProduct.status === 'active'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {selectedProduct.status === 'active' ? 'Active' : 'Discontinued'}
                </span>
              </div>
            </dl>

            <div className="mb-6 flex justify-end">
              <Button
                variant={selectedProduct.status === 'active' ? 'secondary' : 'primary'}
                className="text-xs"
                disabled={saving}
                onClick={() => handleToggleProductStatus(selectedProduct)}
              >
                {selectedProduct.status === 'active' ? 'Discontinue product' : 'Reactivate product'}
              </Button>
            </div>

            <h3 className="mb-3 text-sm font-bold text-navy">
              Batches ({productBatches.length})
            </h3>
            {productBatches.length === 0 ? (
              <p className="rounded-md border border-dashed border-line p-4 text-center text-xs text-muted">
                No production batches recorded for this product yet.
              </p>
            ) : (
              <div className="space-y-3">
                {productBatches.map(b => (
                  <div key={b.id} className="rounded-md border border-line bg-surface p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="id-text text-sm font-semibold text-navy">{b.batch_no || b.no}</span>
                      <StatusBadge status={b.release_status || b.release} />
                    </div>
                    <div className="mb-2 flex justify-between text-xs text-muted">
                      <span>MFD {b.mfd}</span>
                      <span>EXP {b.exp}</span>
                    </div>
                    <Progress value={b.serialized_count ?? 0} max={b.quantity} />
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
        title={selectedBatch ? `Batch ${selectedBatch.batch_no || selectedBatch.no}` : 'Batch details'}
      >
        {selectedBatch && (
          <>
            <dl className="mb-5 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Batch no</dt>
                <dd className="id-text font-semibold">{selectedBatch.batch_no || selectedBatch.no}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Product</dt>
                <dd className="font-semibold">
                  {selectedBatch.product_name} {selectedBatch.strength}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Generic name</dt>
                <dd className="font-semibold text-clinical">{selectedBatch.generic_name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">GTIN</dt>
                <dd className="id-text font-semibold">{selectedBatch.gtin || '—'}</dd>
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
                <StatusBadge status={selectedBatch.release_status || selectedBatch.release} />
              </div>
            </dl>

            <div className="mb-5 rounded-md border border-line bg-surface p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Serialization progress
              </div>
              <Progress value={selectedBatch.serialized_count ?? 0} max={selectedBatch.quantity} />
              <div className="mt-1 text-right text-xs text-muted">
                {selectedBatch.serialized_count ?? 0} of {selectedBatch.quantity} serialized
              </div>
            </div>

            {(selectedBatch.release_status || selectedBatch.release) !== 'Released' ? (
              <div className="mb-6 rounded-md border border-amber-line bg-amber-soft p-3 text-xs text-amber-ink">
                <div className="flex flex-col gap-2">
                  <div>
                    <p className="font-semibold">Pending QA Release</p>
                    <p className="mt-0.5">
                      Quality control inspection and regulatory sign-off required prior to package serialization.
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    className="self-start px-3 py-1.5 text-xs"
                    onClick={e => openQaReleaseModal(selectedBatch, e)}
                  >
                    <CheckCircle2 size={13} className="mr-1" /> Approve QA Release
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mb-6 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                <p className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 size={14} className="text-emerald-600" /> QA Cleared & Released
                </p>
                <p className="mt-0.5">
                  This batch has received QA sign-off and is authorized for package serialization.
                </p>
              </div>
            )}
          </>
        )}
      </Drawer>

      {/* QA Release Sign-off Modal */}
      <Modal
        open={qaReleaseModal}
        title="Approve batch QA release"
        onClose={() => {
          if (!releasing) {
            setQaReleaseModal(false)
            setQaTargetBatch(null)
          }
        }}
        actions={
          <>
            <Button
              variant="secondary"
              type="button"
              disabled={releasing}
              onClick={() => {
                setQaReleaseModal(false)
                setQaTargetBatch(null)
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="qa-release-form"
              disabled={releasing || (qaTargetBatch && qaTargetBatch.exp < today)}
            >
              {releasing ? 'Releasing...' : 'Sign-off & Release Batch'}
            </Button>
          </>
        }
      >
        {qaTargetBatch && (
          <form id="qa-release-form" onSubmit={handleConfirmRelease} className="space-y-3">
            <div className="rounded-md border border-line bg-surface p-3 text-sm">
              <div className="flex justify-between font-semibold text-navy">
                <span>Batch: {qaTargetBatch.batch_no || qaTargetBatch.no}</span>
                <StatusBadge status={qaTargetBatch.release_status || qaTargetBatch.release} />
              </div>
              <div className="mt-1 text-xs text-muted">
                Product: {qaTargetBatch.product_name} {qaTargetBatch.strength}
              </div>
              <div className="mt-1 flex justify-between text-xs text-muted">
                <span>MFD: {qaTargetBatch.mfd}</span>
                <span className={qaTargetBatch.exp < today ? 'font-semibold text-quarantine' : ''}>
                  EXP: {qaTargetBatch.exp}
                </span>
              </div>
            </div>

            {qaTargetBatch.exp < today && (
              <div className="rounded-md border border-quarantine-line bg-quarantine-soft p-3 text-xs text-quarantine">
                Cannot release an expired batch. Please quarantine or reject this batch.
              </div>
            )}

            <p className="text-xs text-muted">
              Approving QA release authorizes this batch for serialization and downstream distribution.
              Ensure all physical chemical assays, analytical certificates, and sterility testing comply with DGDA regulations.
            </p>

            <label className="block text-sm font-semibold">
              QA Sign-off Notes / Inspection Reference
              <textarea
                value={qaNotes}
                onChange={e => setQaNotes(e.target.value)}
                rows={3}
                placeholder="e.g. Analytical release Certificate #QC-2026-094 approved. Assay: 99.8%."
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-xs font-normal"
              />
            </label>

            {qaErr && (
              <p role="alert" className="text-xs text-quarantine">
                {qaErr}
              </p>
            )}
          </form>
        )}
      </Modal>

      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </>
  )
}
