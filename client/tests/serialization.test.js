import test from 'node:test'
import assert from 'node:assert/strict'
import { batches, packages } from '../src/data/fixtures/index.js'
import { generateBatchSerials } from '../src/services/serialization.js'

const b1 = batches.find(b => b.id === 'b1')
const b3 = batches.find(b => b.id === 'b3')

test('rejects serialization for Pending QA batches', () => {
  const res = generateBatchSerials({
    batch: b3,
    quantity: 5,
    packages,
    date: '2026-11-12'
  })
  assert.equal(res.ok, false)
  assert.match(res.error, /Pending QA/i)
})

test('enforces batch quantity limits', () => {
  const b1Count = packages.filter(p => p.batchId === 'b1').length
  const remaining = b1.quantity - b1Count
  assert.ok(remaining > 0)

  const over = generateBatchSerials({
    batch: b1,
    quantity: remaining + 1,
    packages,
    date: '2026-11-12'
  })
  assert.equal(over.ok, false)
  assert.match(over.error, new RegExp(`Only ${remaining} packages remain`))

  const exact = generateBatchSerials({
    batch: b1,
    quantity: remaining,
    packages,
    date: '2026-11-12'
  })
  assert.equal(exact.ok, true)
  assert.equal(exact.added.length, remaining)

  const fullPackages = [...exact.added, ...packages]
  const whenFull = generateBatchSerials({
    batch: b1,
    quantity: 1,
    packages: fullPackages,
    date: '2026-11-12'
  })
  assert.equal(whenFull.ok, false)
  assert.match(whenFull.error, /maximum quantity/i)
})

test('validates requested generation quantities', () => {
  for (const invalidQty of [0, -3, 1.5, '', '  ', 'abc', null, undefined, false, NaN]) {
    const res = generateBatchSerials({
      batch: b1,
      quantity: invalidQty,
      packages,
      date: '2026-11-12'
    })
    assert.equal(res.ok, false, `Expected failure for quantity=${String(invalidQty)}`)
  }
})

test('generates serials from existing identifiers rather than package count and prevents duplicates', () => {
  const customBatch = {
    id: 'bx',
    no: 'TST-2601',
    productId: 'pr1',
    mfd: '2026-01-10',
    exp: '2028-01-09',
    quantity: 10,
    release: 'Released'
  }
  const existing = [
    { serial: 'DEMO-TST-2601-00001', batchId: 'bx', status: 'available', custodian: 'm1', history: [], verifyCount: 0 },
    { serial: 'DEMO-TST-2601-00005', batchId: 'bx', status: 'available', custodian: 'm1', history: [], verifyCount: 0 }
  ]

  // Count is 2, but max existing identifier is 00005 -> next should be 00006, 00007 (never 00003 or duplicate 00005)
  const res = generateBatchSerials({
    batch: customBatch,
    quantity: 2,
    packages: existing,
    date: '2026-11-12'
  })
  assert.equal(res.ok, true)
  assert.deepEqual(
    res.added.map(p => p.serial),
    ['DEMO-TST-2601-00006', 'DEMO-TST-2601-00007']
  )

  // If max identifier reaches batch quantity with gaps remaining, fills unused slots without duplicates or exceeding quantity
  const gapExisting = [
    { serial: 'DEMO-TST-2601-00001', batchId: 'bx', status: 'available', custodian: 'm1', history: [], verifyCount: 0 },
    { serial: 'DEMO-TST-2601-00010', batchId: 'bx', status: 'available', custodian: 'm1', history: [], verifyCount: 0 }
  ]
  const gapRes = generateBatchSerials({
    batch: customBatch,
    quantity: 2,
    packages: gapExisting,
    date: '2026-11-12'
  })
  assert.equal(gapRes.ok, true)
  assert.deepEqual(
    gapRes.added.map(p => p.serial),
    ['DEMO-TST-2601-00002', 'DEMO-TST-2601-00003']
  )
})
