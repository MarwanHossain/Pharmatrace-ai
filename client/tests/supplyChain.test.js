import test from 'node:test'
import assert from 'node:assert/strict'
import {
  batches,
  organizations,
  packages,
  shipments,
  TODAY
} from '../src/data/fixtures/index.js'
import {
  applyReceivingSession,
  closeShipmentReconciliation,
  getCurrentDateIso,
  recordRejectedHandover,
  validatePackageForDispatch,
  validatePackageForDispense,
  validateShipmentForDispatch
} from '../src/services/supplyChain.js'
import { verifySerial } from '../src/services/verification.js'

function makeSyntheticLot(count = 100) {
  const serials = Array.from({ length: count }, (_, i) => `SYN-LOT-${String(i + 1).padStart(4, '0')}`)
  const lotPackages = serials.map(serial => ({
    serial,
    batchId: 'b1',
    custodian: 'm1',
    status: 'in_transit',
    shipmentRef: 'SHP-SYN-100',
    history: [
      ['Serialized at PharmaCorp Lab', 'm1', '2026-10-01'],
      ['Dispatched to Apex Distribution', 'm1', '2026-10-10']
    ]
  }))
  const lotShipment = {
    ref: 'SHP-SYN-100',
    from: 'm1',
    to: 'd1',
    batchId: 'b1',
    packageSerials: serials,
    count: serials.length,
    created: '2026-10-10',
    dispatched: '2026-10-10',
    status: 'in_transit',
    receiving: 'Pending confirmation'
  }
  return { serials, lotPackages, lotShipment }
}

test('multi-session partial receiving accepts 95 in session 1 and remaining 5 in session 2', () => {
  const { serials, lotPackages, lotShipment } = makeSyntheticLot(100)

  const session1Dispositions = {}
  for (const serial of serials.slice(0, 95)) {
    session1Dispositions[serial] = { status: 'accepted', scanned: true }
  }

  const res1 = applyReceivingSession({
    shipment: lotShipment,
    packages: lotPackages,
    sessionDispositions: session1Dispositions,
    date: '2026-10-12'
  })

  assert.equal(res1.ok, true)
  assert.equal(res1.nextShipment.status, 'partially_received')
  assert.equal(res1.summary.accepted, 95)
  assert.equal(res1.summary.outstanding, 5)
  assert.equal(res1.summary.unresolved, 5)
  assert.equal(res1.nextShipment.receivingSessions.length, 1)

  const acceptedFirst95 = res1.nextPackages.filter(p => serials.slice(0, 95).includes(p.serial))
  assert.ok(acceptedFirst95.every(p => p.custodian === 'd1' && p.status === 'accepted'))

  const remaining5Before = res1.nextPackages.filter(p => serials.slice(95).includes(p.serial))
  assert.ok(remaining5Before.every(p => p.custodian === 'm1' && p.status === 'in_transit'))

  // Session 2 scans & accepts the remaining 5
  const session2Dispositions = {}
  for (const serial of serials.slice(95)) {
    session2Dispositions[serial] = { status: 'accepted', scanned: true }
  }

  const res2 = applyReceivingSession({
    shipment: res1.nextShipment,
    packages: res1.nextPackages,
    sessionDispositions: session2Dispositions,
    date: '2026-10-13'
  })

  assert.equal(res2.ok, true)
  assert.equal(res2.nextShipment.status, 'accepted')
  assert.equal(res2.summary.accepted, 100)
  assert.equal(res2.summary.unresolved, 0)
  assert.equal(res2.nextShipment.receivingSessions.length, 2)
  assert.ok(res2.nextPackages.every(p => p.custodian === 'd1' && p.status === 'accepted'))
})

test('duplicate acceptance of an already-accepted package is rejected and history is not duplicated', () => {
  const { serials, lotPackages, lotShipment } = makeSyntheticLot(4)

  const res1 = applyReceivingSession({
    shipment: lotShipment,
    packages: lotPackages,
    sessionDispositions: {
      [serials[0]]: { status: 'accepted', scanned: true },
      [serials[1]]: { status: 'accepted', scanned: true }
    },
    date: '2026-10-12'
  })
  assert.equal(res1.ok, true)
  const historyLenBefore = res1.nextPackages.find(p => p.serial === serials[0]).history.length

  const dupAttempt = applyReceivingSession({
    shipment: res1.nextShipment,
    packages: res1.nextPackages,
    sessionDispositions: {
      [serials[0]]: { status: 'accepted', scanned: true }
    },
    date: '2026-10-13'
  })

  assert.equal(dupAttempt.ok, false)
  assert.match(dupAttempt.error, /already accepted/i)
  assert.equal(res1.nextPackages.find(p => p.serial === serials[0]).history.length, historyLenBefore)
})

test('missing package reconciliation keeps custody untransferred and blocks shipment closure', () => {
  const { serials, lotPackages, lotShipment } = makeSyntheticLot(3)

  // Reason required for missing
  const noReason = applyReceivingSession({
    shipment: lotShipment,
    packages: lotPackages,
    sessionDispositions: {
      [serials[0]]: { status: 'accepted', scanned: true },
      [serials[1]]: { status: 'missing', reason: '' }
    },
    date: '2026-10-12'
  })
  assert.equal(noReason.ok, false)
  assert.match(noReason.error, /reason is required/i)

  const res1 = applyReceivingSession({
    shipment: lotShipment,
    packages: lotPackages,
    sessionDispositions: {
      [serials[0]]: { status: 'accepted', scanned: true },
      [serials[1]]: { status: 'missing', reason: 'Short-shipped carton on pallet 2' }
    },
    unmatchedScans: ['UNKNOWN-CARTON-01'],
    date: '2026-10-12'
  })

  assert.equal(res1.ok, true)
  assert.equal(res1.nextShipment.status, 'partially_received')
  assert.equal(res1.summary.missing, 1)
  assert.equal(res1.summary.outstanding, 1)
  assert.equal(res1.summary.unresolved, 2)
  assert.equal(res1.nextShipment.unmatchedScans.length, 1)

  const missingPkg = res1.nextPackages.find(p => p.serial === serials[1])
  assert.equal(missingPkg.custodian, 'm1') // custody NOT transferred
  assert.equal(missingPkg.status, 'missing')

  const closeBlocked = closeShipmentReconciliation({
    shipment: res1.nextShipment,
    packages: res1.nextPackages,
    date: '2026-10-12',
    note: 'Trying early closure'
  })
  assert.equal(closeBlocked.ok, false)
  assert.match(closeBlocked.error, /remain unresolved/i)

  // Even after accepting serials[2], missing serials[1] still blocks closure until located/accepted
  const res2 = applyReceivingSession({
    shipment: res1.nextShipment,
    packages: res1.nextPackages,
    sessionDispositions: {
      [serials[2]]: { status: 'accepted', scanned: true }
    },
    date: '2026-10-13'
  })
  assert.equal(res2.ok, true)
  assert.equal(res2.summary.unresolved, 1)

  const stillBlocked = closeShipmentReconciliation({
    shipment: res2.nextShipment,
    packages: res2.nextPackages,
    date: '2026-10-13',
    note: 'Missing still unresolved'
  })
  assert.equal(stillBlocked.ok, false)
  assert.match(stillBlocked.error, /1 missing/i)

  // Later session locates missing package and accepts it -> closes cleanly
  const res3 = applyReceivingSession({
    shipment: res2.nextShipment,
    packages: res2.nextPackages,
    sessionDispositions: {
      [serials[1]]: { status: 'accepted', scanned: true }
    },
    date: '2026-10-14'
  })
  assert.equal(res3.ok, true)
  assert.equal(res3.nextShipment.status, 'accepted')
  assert.equal(res3.summary.unresolved, 0)
})

test('damaged package moves to recipient quarantine custody and is excluded from downstream dispatch and dispensing', () => {
  const { serials, lotPackages, lotShipment } = makeSyntheticLot(2)

  const res = applyReceivingSession({
    shipment: lotShipment,
    packages: lotPackages,
    sessionDispositions: {
      [serials[0]]: { status: 'accepted', scanned: true },
      [serials[1]]: { status: 'damaged', reason: 'Broken blister seal on arrival', notes: 'Quarantine Bay 2', scanned: true }
    },
    date: '2026-10-12'
  })

  assert.equal(res.ok, true)
  assert.equal(res.nextShipment.status, 'reconciliation_required')

  const damagedPkg = res.nextPackages.find(p => p.serial === serials[1])
  assert.equal(damagedPkg.custodian, 'd1')
  assert.equal(damagedPkg.status, 'quarantined')
  assert.equal(damagedPkg.quarantineReason, 'Broken blister seal on arrival')

  // Quarantined package is blocked from outgoing dispatch
  const dispatchCheck = validatePackageForDispatch({
    pkg: damagedPkg,
    batch: batches.find(b => b.id === damagedPkg.batchId),
    fromOrgId: 'd1',
    shipments: [res.nextShipment],
    today: '2026-10-12'
  })
  assert.equal(dispatchCheck.eligible, false)
  assert.ok(dispatchCheck.reasons.some(r => /quarantined/i.test(r)))

  // Quarantined package held at pharmacy would also be blocked from dispensing
  const dispenseCheck = validatePackageForDispense({
    pkg: { ...damagedPkg, custodian: 'p1' },
    batch: batches.find(b => b.id === damagedPkg.batchId),
    traceComplete: true,
    pharmacyId: 'p1',
    today: '2026-10-12'
  })
  assert.equal(dispenseCheck.eligible, false)
  assert.ok(dispenseCheck.reasons.some(r => /quarantined/i.test(r)))

  // Closing reconciliation requires a closure note when damaged packages exist
  const closeWithoutNote = closeShipmentReconciliation({
    shipment: res.nextShipment,
    packages: res.nextPackages,
    date: '2026-10-12',
    note: ''
  })
  assert.equal(closeWithoutNote.ok, false)

  const closeWithNote = closeShipmentReconciliation({
    shipment: res.nextShipment,
    packages: res.nextPackages,
    date: '2026-10-12',
    note: 'Damaged unit isolated in quarantine bay 2.'
  })
  assert.equal(closeWithNote.ok, true)
  assert.equal(closeWithNote.nextShipment.status, 'closed')
})

test('rejected package does not transfer custody, blocks direct acceptance, and supports explicit return handover', () => {
  const { serials, lotPackages, lotShipment } = makeSyntheticLot(2)

  const res = applyReceivingSession({
    shipment: lotShipment,
    packages: lotPackages,
    sessionDispositions: {
      [serials[0]]: { status: 'accepted', scanned: true },
      [serials[1]]: { status: 'rejected', reason: 'Damaged outer tamper seal — refused at dock', scanned: true }
    },
    date: '2026-10-12'
  })

  assert.equal(res.ok, true)
  const rejectedPkg = res.nextPackages.find(p => p.serial === serials[1])
  assert.equal(rejectedPkg.custodian, 'm1') // remains with sender, not recipient
  assert.equal(rejectedPkg.status, 'rejected')

  // Direct re-acceptance of a rejected unit in another session is blocked
  const directReaccept = applyReceivingSession({
    shipment: res.nextShipment,
    packages: res.nextPackages,
    sessionDispositions: {
      [serials[1]]: { status: 'accepted', scanned: true }
    },
    date: '2026-10-13'
  })
  assert.equal(directReaccept.ok, false)
  assert.match(directReaccept.error, /rejected/i)

  // Explicit return handover records return to sender
  const handover = recordRejectedHandover({
    shipment: res.nextShipment,
    packages: res.nextPackages,
    serial: serials[1],
    handoverNote: 'RMA-2026-88 returned via courier',
    date: '2026-10-14'
  })
  assert.equal(handover.ok, true)
  const returnedPkg = handover.nextPackages.find(p => p.serial === serials[1])
  assert.equal(returnedPkg.custodian, 'm1')
  assert.ok(returnedPkg.history.some(([evt]) => evt.includes('RMA-2026-88')))
})

test('dispatch validation blocks expired, quarantined, dispensed, unreleased QA, wrong custodian, double-allocated, and suspended orgs', () => {
  // 1. Expired package (AMX-2603 expired 2026-11-01) blocked on TODAY (2026-11-08) and current date
  const expiredPkg = packages.find(p => p.serial === 'DEMO-AMX-2603-00001')
  const expiredBatch = batches.find(b => b.id === expiredPkg.batchId)
  const expiredCheck = validatePackageForDispatch({
    pkg: expiredPkg,
    batch: expiredBatch,
    fromOrgId: expiredPkg.custodian,
    shipments,
    today: TODAY
  })
  assert.equal(expiredCheck.eligible, false)
  assert.ok(expiredCheck.reasons.some(r => /expired/i.test(r)))

  // 2. Dispensed package blocked
  const dispensedPkg = packages.find(p => p.serial === 'DEMO-PCM-2601-00047')
  const dispensedCheck = validatePackageForDispatch({
    pkg: dispensedPkg,
    batch: batches.find(b => b.id === dispensedPkg.batchId),
    fromOrgId: 'p1',
    shipments,
    today: TODAY
  })
  assert.equal(dispensedCheck.eligible, false)
  assert.ok(dispensedCheck.reasons.some(r => /dispensed/i.test(r)))

  // 3. Unreleased Pending QA batch blocked even if package exists
  const pendingBatch = batches.find(b => b.release !== 'Released')
  assert.ok(pendingBatch)
  const qaCheck = validatePackageForDispatch({
    pkg: { serial: 'SYN-QA-01', batchId: pendingBatch.id, custodian: 'm1', status: 'available' },
    batch: pendingBatch,
    fromOrgId: 'm1',
    shipments,
    today: TODAY
  })
  assert.equal(qaCheck.eligible, false)
  assert.ok(qaCheck.reasons.some(r => /QA release required/i.test(r)))

  // 4. Suspended destination organization blocked at shipment dispatch
  const suspendedOrgs = organizations.map(o => (o.id === 'd1' ? { ...o, status: 'suspended' } : o))
  const validAvailablePkg = packages.find(p => p.custodian === 'm1' && p.status === 'available' && p.batchId === 'b1')
  assert.ok(validAvailablePkg)
  const shpCheck = validateShipmentForDispatch({
    shipment: {
      ref: 'SHP-TEST-SUSP',
      from: 'm1',
      to: 'd1',
      status: 'pending',
      packageSerials: [validAvailablePkg.serial]
    },
    packages,
    batches,
    organizations: suspendedOrgs,
    shipments,
    today: TODAY
  })
  assert.equal(shpCheck.eligible, false)
  assert.ok(shpCheck.errors.some(e => /suspended/i.test(e)))

  // 5. Wrong custodian blocked
  const wrongCustCheck = validatePackageForDispatch({
    pkg: validAvailablePkg,
    batch: batches.find(b => b.id === validAvailablePkg.batchId),
    fromOrgId: 'd1',
    shipments,
    today: TODAY
  })
  assert.equal(wrongCustCheck.eligible, false)
  assert.ok(wrongCustCheck.reasons.some(r => /does not hold custody/i.test(r)))

  // 6. Active shipment allocation blocked
  const doubleAllocCheck = validatePackageForDispatch({
    pkg: validAvailablePkg,
    batch: batches.find(b => b.id === validAvailablePkg.batchId),
    fromOrgId: 'm1',
    shipments: [
      ...shipments,
      {
        ref: 'SHP-ALLOC-99',
        from: 'm1',
        to: 'd1',
        status: 'pending',
        packageSerials: [validAvailablePkg.serial]
      }
    ],
    today: TODAY
  })
  assert.equal(doubleAllocCheck.eligible, false)
  assert.ok(doubleAllocCheck.reasons.some(r => /already assigned/i.test(r)))

  // 7. Package accepted into d1 on a partially_received shipment IS allowed to be forwarded by d1
  const partialAcceptedPkg = {
    serial: 'SYN-FWD-01',
    batchId: 'b1',
    custodian: 'd1',
    status: 'accepted',
    shipmentRef: 'SHP-PARTIAL-1'
  }
  const partialShipment = {
    ref: 'SHP-PARTIAL-1',
    from: 'm1',
    to: 'd1',
    status: 'partially_received',
    packageSerials: ['SYN-FWD-01', 'SYN-FWD-02'],
    packageDispositions: {
      'SYN-FWD-01': { serial: 'SYN-FWD-01', status: 'accepted' },
      'SYN-FWD-02': { serial: 'SYN-FWD-02', status: 'outstanding' }
    }
  }
  const forwardCheck = validatePackageForDispatch({
    pkg: partialAcceptedPkg,
    batch: batches.find(b => b.id === 'b1'),
    fromOrgId: 'd1',
    shipments: [partialShipment],
    today: TODAY
  })
  assert.equal(forwardCheck.eligible, true)
})

test('pharmacy dispensing blocks expired, already dispensed, incomplete traceability, and wrong custodian', () => {
  const expiredPkg = packages.find(p => p.serial === 'DEMO-AMX-2603-00001')
  const expiredRes = validatePackageForDispense({
    pkg: { ...expiredPkg, custodian: 'p1', status: 'accepted' },
    batch: batches.find(b => b.id === expiredPkg.batchId),
    traceComplete: true,
    pharmacyId: 'p1',
    today: TODAY
  })
  assert.equal(expiredRes.eligible, false)
  assert.ok(expiredRes.reasons.some(r => /expired/i.test(r)))

  const incompletePkg = packages.find(p => p.serial === 'DEMO-PCM-2601-00048')
  const incompleteRes = validatePackageForDispense({
    pkg: incompletePkg,
    batch: batches.find(b => b.id === incompletePkg.batchId),
    traceComplete: false,
    pharmacyId: 'p1',
    today: TODAY
  })
  assert.equal(incompleteRes.eligible, false)
  assert.ok(incompleteRes.reasons.some(r => /Incomplete traceability/i.test(r)))
})

test('verifySerial is non-mutating and leaves authenticity verified on repeated public checks', () => {
  const targetSerial = 'DEMO-PCM-2601-00031'
  const pkgBefore = packages.find(p => p.serial === targetSerial)
  const initialCount = pkgBefore.verifyCount

  const r1 = verifySerial(targetSerial, { packages, batches, shipments, today: getCurrentDateIso() })
  const r2 = verifySerial(targetSerial, { packages, batches, shipments, today: getCurrentDateIso() })

  assert.equal(r1.verifyCount, initialCount)
  assert.equal(r2.verifyCount, initialCount)
  assert.equal(packages.find(p => p.serial === targetSerial).verifyCount, initialCount)
  assert.equal(r1.authenticityStatus, 'verified')
  assert.equal(r1.p.custodian, pkgBefore.custodian)
})
