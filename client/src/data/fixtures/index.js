// ILLUSTRATIVE FRONTEND FIXTURES ONLY. Not real products, organizations or records. Replace with API responses later.
export const TODAY = '2026-11-12'

export const organizations = [
  { id: 'm1', name: 'Meridian Pharma Ltd (demo)', type: 'Manufacturer' },
  { id: 'd1', name: 'Corridor Distribution (demo)', type: 'Distributor' },
  { id: 'w1', name: 'Riverside Wholesale (demo)', type: 'Wholesaler' },
  { id: 'p1', name: 'Greenleaf Pharmacy (demo)', type: 'Pharmacy' }
]

export const orgName = id => organizations.find(o => o.id === id)?.name ?? '—'

export const products = [
  { id: 'pr1', name: 'Paracetamol', strength: '500 mg', form: 'Tablet', packSize: '10 x 10', gtin: 'DEMO-GTIN-0001', status: 'active' },
  { id: 'pr2', name: 'Amoxicillin', strength: '250 mg', form: 'Capsule', packSize: '10 x 8', gtin: 'DEMO-GTIN-0002', status: 'active' }
]

export const batches = [
  { id: 'b1', no: 'PCM-2601', productId: 'pr1', mfd: '2026-01-10', exp: '2028-01-09', quantity: 60, release: 'Released' },
  { id: 'b2', no: 'AMX-2603', productId: 'pr2', mfd: '2026-03-02', exp: '2026-11-01', quantity: 40, release: 'Released' },
  { id: 'b3', no: 'PCM-2609', productId: 'pr1', mfd: '2026-09-15', exp: '2028-09-14', quantity: 100, release: 'Pending QA' }
]

export const productOf = id => products.find(p => p.id === id)

export const formatSerial = (batchNo, n) => `DEMO-${batchNo}-${String(n).padStart(5, '0')}`

const mk = (b, n, status, custodian, history, verifyCount = 0, shipmentRef = null) => ({
  serial: formatSerial(b.no, n),
  batchId: b.id,
  status,
  custodian,
  history,
  verifyCount,
  shipmentRef
})

const mfg = b => ['Package serialized', 'm1', b.mfd]

const rangeSerials = (b, start, end) =>
  Array.from({ length: end - start + 1 }, (_, i) => formatSerial(b.no, start + i))

const fullChainToPharmacy = b => [
  mfg(b),
  ['Shipment dispatched (SHP-0000)', 'm1', '2026-10-13'],
  ['Custody accepted', 'd1', '2026-10-15'],
  ['Shipment dispatched (SHP-0004)', 'd1', '2026-10-25'],
  ['Custody accepted', 'w1', '2026-10-28'],
  ['Shipment dispatched (SHP-0005)', 'w1', '2026-10-31'],
  ['Custody accepted', 'p1', '2026-11-02']
]

export const packages = [
  // 00001..00010: in transit to Corridor Distribution on SHP-0001
  ...Array.from({ length: 10 }, (_, i) =>
    mk(
      batches[0],
      i + 1,
      'in_transit',
      'm1',
      [mfg(batches[0]), ['Shipment dispatched (SHP-0001)', 'm1', '2026-11-05']],
      0,
      'SHP-0001'
    )
  ),
  // 00011..00022: allocated to pending SHP-0003 (not yet dispatched; still at manufacturer)
  ...Array.from({ length: 12 }, (_, i) =>
    mk(batches[0], i + 11, 'available', 'm1', [mfg(batches[0])], 0, 'SHP-0003')
  ),
  // 00023..00030: unallocated manufacturer stock (not yet shipped)
  ...Array.from({ length: 8 }, (_, i) =>
    mk(batches[0], i + 23, 'available', 'm1', [mfg(batches[0])], 0, null)
  ),
  // 00031..00045: accepted at Corridor Distribution via SHP-0002
  ...Array.from({ length: 15 }, (_, i) =>
    mk(
      batches[0],
      i + 31,
      'accepted',
      'd1',
      [mfg(batches[0]), ['Shipment dispatched (SHP-0002)', 'm1', '2026-10-20'], ['Custody accepted', 'd1', '2026-10-22']],
      0,
      'SHP-0002'
    )
  ),
  // 00046: complete chain to pharmacy with repeated verification checks (3 prior checks)
  mk(batches[0], 46, 'accepted', 'p1', fullChainToPharmacy(batches[0]), 3, 'SHP-0005'),
  // 00047: complete chain to pharmacy and dispensed to patient
  mk(
    batches[0],
    47,
    'dispensed',
    'p1',
    [...fullChainToPharmacy(batches[0]), ['Dispensed', 'p1', '2026-11-09']],
    1,
    'SHP-0005'
  ),
  // 00048: illustrative incomplete-traceability package (missing dispatch & intermediate custody events)
  mk(
    batches[0],
    48,
    'accepted',
    'p1',
    [mfg(batches[0]), ['Custody accepted', 'p1', '2026-11-02']],
    0,
    null
  ),
  // Batch b2 (expired 2026-11-01): 20 manufacturer-held packages
  ...Array.from({ length: 20 }, (_, i) =>
    mk(batches[1], i + 1, 'available', 'm1', [mfg(batches[1])], 0, null)
  )
]

export const shipments = [
  {
    ref: 'SHP-0000',
    from: 'm1',
    to: 'd1',
    count: 2,
    packageSerials: ['DEMO-PCM-2601-00046', 'DEMO-PCM-2601-00047'],
    created: '2026-10-12',
    dispatched: '2026-10-13',
    status: 'accepted',
    receiving: 'Accepted 2026-10-15'
  },
  {
    ref: 'SHP-0001',
    from: 'm1',
    to: 'd1',
    count: 10,
    packageSerials: rangeSerials(batches[0], 1, 10),
    created: '2026-11-04',
    dispatched: '2026-11-05',
    status: 'in_transit',
    receiving: 'Awaiting acceptance'
  },
  {
    ref: 'SHP-0002',
    from: 'm1',
    to: 'd1',
    count: 15,
    packageSerials: rangeSerials(batches[0], 31, 45),
    created: '2026-10-19',
    dispatched: '2026-10-20',
    status: 'accepted',
    receiving: 'Accepted 2026-10-22'
  },
  {
    ref: 'SHP-0003',
    from: 'm1',
    to: 'd1',
    count: 12,
    packageSerials: rangeSerials(batches[0], 11, 22),
    created: '2026-11-10',
    dispatched: null,
    status: 'pending',
    receiving: 'Not dispatched'
  },
  {
    ref: 'SHP-0004',
    from: 'd1',
    to: 'w1',
    count: 2,
    packageSerials: ['DEMO-PCM-2601-00046', 'DEMO-PCM-2601-00047'],
    created: '2026-10-24',
    dispatched: '2026-10-25',
    status: 'accepted',
    receiving: 'Accepted 2026-10-28'
  },
  {
    ref: 'SHP-0005',
    from: 'w1',
    to: 'p1',
    count: 2,
    packageSerials: ['DEMO-PCM-2601-00046', 'DEMO-PCM-2601-00047'],
    created: '2026-10-30',
    dispatched: '2026-10-31',
    status: 'accepted',
    receiving: 'Accepted 2026-11-02'
  }
]
