import test from 'node:test'
import assert from 'node:assert/strict'
import { batches, packages, shipments } from '../src/data/fixtures/index.js'
import { parseSerialIndex } from '../src/services/serialization.js'

test('all fixture package serials are unique', () => {
  const serials = packages.map(p => p.serial)
  assert.equal(new Set(serials).size, serials.length)
})

test('all package counts and serial indices fit within batch quantities', () => {
  for (const batch of batches) {
    const batchPkgs = packages.filter(p => p.batchId === batch.id)
    assert.ok(
      batchPkgs.length <= batch.quantity,
      `Batch ${batch.no} has ${batchPkgs.length} packages > quantity ${batch.quantity}`
    )
    for (const pkg of batchPkgs) {
      const idx = parseSerialIndex(pkg.serial, batch.no)
      assert.ok(idx !== null, `Invalid serial format ${pkg.serial}`)
      assert.ok(
        idx <= batch.quantity,
        `Serial ${pkg.serial} index ${idx} exceeds batch ${batch.no} quantity ${batch.quantity}`
      )
    }
  }
})

test('all shipments reference valid packages matching their counts and statuses', () => {
  const pkgBySerial = new Map(packages.map(p => [p.serial, p]))

  for (const shp of shipments) {
    assert.equal(
      shp.packageSerials.length,
      shp.count,
      `Shipment ${shp.ref} count ${shp.count} does not match packageSerials length ${shp.packageSerials.length}`
    )
    for (const serial of shp.packageSerials) {
      const pkg = pkgBySerial.get(serial)
      assert.ok(pkg, `Shipment ${shp.ref} references missing package ${serial}`)

      if (shp.status === 'pending') {
        assert.equal(pkg.status, 'available')
        assert.equal(pkg.custodian, 'm1')
        assert.equal(pkg.shipmentRef, shp.ref)
      } else if (shp.status === 'in_transit') {
        assert.equal(pkg.status, 'in_transit')
        assert.equal(pkg.shipmentRef, shp.ref)
      } else if (shp.status === 'accepted') {
        assert.ok(
          pkg.history.some(([evt, org]) => evt === 'Custody accepted' && org === shp.to),
          `Package ${serial} missing Custody accepted at ${shp.to} for ${shp.ref}`
        )
      }
    }
  }
})
