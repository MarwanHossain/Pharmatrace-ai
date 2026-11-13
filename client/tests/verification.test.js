import test from 'node:test'
import assert from 'node:assert/strict'
import { batches, packages, shipments, TODAY } from '../src/data/fixtures/index.js'
import { verifySerial } from '../src/services/verification.js'

const ctx = { packages, batches, shipments, today: TODAY }

test('manufacturer-held unshipped package is not presented as consumer-verified', () => {
  const res = verifySerial('DEMO-PCM-2601-00023', ctx)
  assert.equal(res.found, true)
  assert.equal(res.state, 'unshipped')
  assert.notEqual(res.state, 'verified')
  assert.equal(res.authenticityStatus, 'verified')
  assert.equal(res.supplyChainStatus, 'unshipped')
  assert.equal(res.dispensingStatus, 'not_dispensed')
})

test('valid shipped/accepted package returns verified with distinct statuses', () => {
  const accepted = verifySerial('demo-pcm-2601-00031', ctx)
  assert.equal(accepted.found, true)
  assert.equal(accepted.state, 'verified')
  assert.equal(accepted.authenticityStatus, 'verified')
  assert.equal(accepted.supplyChainStatus, 'accepted')
  assert.equal(accepted.dispensingStatus, 'not_dispensed')
  assert.equal(accepted.unusualActivity, false)

  const inTransit = verifySerial('DEMO-PCM-2601-00001', ctx)
  assert.equal(inTransit.state, 'verified')
  assert.equal(inTransit.supplyChainStatus, 'in_transit')
})

test('expired package is identified correctly', () => {
  const res = verifySerial('DEMO-AMX-2603-00001', ctx)
  assert.equal(res.found, true)
  assert.equal(res.state, 'expired')
  assert.equal(res.authenticityStatus, 'verified')
  assert.equal(res.expiryStatus, 'expired')
})

test('dispensed package is identified correctly', () => {
  const res = verifySerial('DEMO-PCM-2601-00047', ctx)
  assert.equal(res.found, true)
  assert.equal(res.state, 'dispensed')
  assert.equal(res.authenticityStatus, 'verified')
  assert.equal(res.supplyChainStatus, 'accepted')
  assert.equal(res.dispensingStatus, 'dispensed')
})

test('invalid serial remains invalid', () => {
  for (const input of ['DEMO-UNKNOWN-99999', '', '   ']) {
    const res = verifySerial(input, ctx)
    assert.equal(res.found, false)
    assert.equal(res.state, 'invalid')
    assert.equal(res.authenticityStatus, 'invalid')
    assert.equal(res.supplyChainStatus, null)
    assert.equal(res.dispensingStatus, null)
  }
})

test('repeated verification flags unusual activity without marking package counterfeit or invalid', () => {
  const res = verifySerial('DEMO-PCM-2601-00046', ctx)
  assert.equal(res.found, true)
  assert.equal(res.unusualActivity, true)
  assert.equal(res.verifyCount, 3)
  assert.equal(res.state, 'verified')
  assert.equal(res.authenticityStatus, 'verified')
  assert.equal(res.supplyChainStatus, 'accepted')
  assert.equal(res.dispensingStatus, 'not_dispensed')
})

test('incomplete traceability is represented accurately', () => {
  const res = verifySerial('DEMO-PCM-2601-00048', ctx)
  assert.equal(res.found, true)
  assert.equal(res.state, 'incomplete')
  assert.equal(res.authenticityStatus, 'verified')
  assert.equal(res.supplyChainStatus, 'incomplete')
  assert.equal(res.dispensingStatus, 'not_dispensed')
})

test('accepted package from partially_received shipment verifies with complete traceability', () => {
  const partialShipments = shipments.map(s =>
    s.ref === 'SHP-0001' ? { ...s, status: 'partially_received', receiving: `Accepted ${TODAY}` } : s
  )
  const partialPackages = packages.map(p => {
    if (p.serial === 'DEMO-PCM-2601-00001') {
      return {
        ...p,
        custodian: 'd1',
        status: 'accepted',
        history: [...p.history, ['Custody accepted', 'd1', TODAY]]
      }
    }
    if (p.serial === 'DEMO-PCM-2601-00010') {
      return {
        ...p,
        status: 'discrepancy',
        history: [...p.history, ['Package rejected on receiving', 'd1', TODAY]]
      }
    }
    return p
  })
  const partialCtx = { packages: partialPackages, batches, shipments: partialShipments, today: TODAY }

  const acceptedRes = verifySerial('DEMO-PCM-2601-00001', partialCtx)
  assert.equal(acceptedRes.found, true)
  assert.equal(acceptedRes.state, 'verified')
  assert.equal(acceptedRes.authenticityStatus, 'verified')
  assert.equal(acceptedRes.supplyChainStatus, 'accepted')

  const rejectedRes = verifySerial('DEMO-PCM-2601-00010', partialCtx)
  assert.equal(rejectedRes.found, true)
  assert.equal(rejectedRes.state, 'incomplete')
  assert.equal(rejectedRes.supplyChainStatus, 'incomplete')
})

test('quarantined package reports quarantined verification state accurately', () => {
  const quarantinedPackages = packages.map(p =>
    p.serial === 'DEMO-PCM-2601-00031' ? { ...p, status: 'quarantined' } : p
  )
  const res = verifySerial('DEMO-PCM-2601-00031', {
    packages: quarantinedPackages,
    batches,
    shipments,
    today: TODAY
  })
  assert.equal(res.found, true)
  assert.equal(res.state, 'quarantined')
  assert.equal(res.authenticityStatus, 'verified')
  assert.equal(res.supplyChainStatus, 'quarantined')
})
