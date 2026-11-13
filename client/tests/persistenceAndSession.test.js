import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEMO_DATA_LOCK_NAME,
  DEMO_DATA_SCHEMA_VERSION,
  DEMO_DATA_STORAGE_KEY,
  DEMO_SESSION_STORAGE_KEY,
  LEGACY_DEMO_DATA_STORAGE_KEY,
  WEB_LOCKS_UNAVAILABLE_ERROR,
  authenticateDefaultUserForRole,
  authenticateDemoUser,
  classifyEnvelopeRelation,
  clearPersistedSession,
  commitDemoMutation,
  createCleanDemoData,
  createSeedDemoData,
  createSeedEnvelope,
  loadPersistedDemoData,
  loadPersistedSession,
  nextSequentialId,
  nextShipmentRef,
  peekPersistedDemoData,
  resetPersistedDemoData,
  savePersistedDemoData,
  savePersistedSession,
  shouldAdoptStorageEnvelope,
  validateAndMigrateDemoData,
  validateDemoSession
} from '../src/services/demoStorage.js'

import {
  mutateAddBatch,
  mutateAddOrganization,
  mutateAddProduct,
  mutateAddUser,
  mutateCreateInvestigation,
  mutateCreateShipment,
  mutateDispatchShipment,
  mutateDispensePackage,
  mutateGenerateSerials,
  mutateRecordReceivingSession,
  mutateReleaseBatch,
  mutateSubmitReport,
  mutateUpdateAlert,
  mutateUpdateInvestigation,
  mutateUpdateOrganization,
  mutateVerifyAndRecord
} from '../src/services/demoMutations.js'

import { verifySerial } from '../src/services/verification.js'

function createMemoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial))
  return {
    get length() {
      return store.size
    },
    key(index) {
      return [...store.keys()][index] ?? null
    },
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
    clear() {
      store.clear()
    }
  }
}

function createMockWebLocks() {
  const chains = new Map()
  let activeHolders = 0
  let maxConcurrentHolders = 0
  let requestCount = 0

  return {
    request(name, optionsOrCallback, maybeCallback) {
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback
      const lockName = String(name)
      const prev = chains.get(lockName) ?? Promise.resolve()
      requestCount += 1

      const run = prev.then(async () => {
        activeHolders += 1
        if (activeHolders > maxConcurrentHolders) maxConcurrentHolders = activeHolders
        try {
          return await callback({ name: lockName, mode: 'exclusive' })
        } finally {
          activeHolders -= 1
        }
      })

      chains.set(
        lockName,
        run.catch(() => {})
      )
      return run
    },
    stats() {
      return { activeHolders, maxConcurrentHolders, requestCount }
    }
  }
}

function makeActor(user) {
  return {
    userId: user.id,
    role: user.role,
    orgId: user.orgId ?? null,
    userName: user.name
  }
}

test('1 & 15. Operational data persists across re-initialization without overwriting valid stored state', async () => {
  const storage = createMemoryStorage()
  const locks = createMockWebLocks()
  const loaded = loadPersistedDemoData(storage)
  assert.equal(loaded.status, 'initialized')
  const initialEnv = loaded.envelope
  assert.equal(initialEnv.version, DEMO_DATA_SCHEMA_VERSION)
  assert.equal(initialEnv.revision, 1)
  assert.equal(initialEnv.resetEpoch, 1)
  assert.ok(initialEnv.commitId)

  const mfgUser = initialEnv.data.users.find(u => u.id === 'u2')
  const actor = makeActor(mfgUser)

  const step1 = await commitDemoMutation(
    storage,
    data =>
      mutateAddProduct(
        data,
        { name: 'Cefixime', strength: '400mg', form: 'Capsule', gtin: '08901234000999', packSize: '10 caps' },
        actor
      ),
    { locks }
  )
  assert.equal(step1.ok, true, step1.result?.error)
  const productId = step1.result.id

  const step2 = await commitDemoMutation(
    storage,
    data =>
      mutateAddBatch(
        data,
        { productId, no: 'CFX-2601', mfd: '2026-01-10', exp: '2028-01-10', quantity: 5 },
        actor
      ),
    { locks }
  )
  assert.equal(step2.ok, true, step2.result?.error)
  const batchId = step2.result.id

  const step3 = await commitDemoMutation(storage, data => mutateReleaseBatch(data, batchId, actor), { locks })
  assert.equal(step3.ok, true, step3.result?.error)

  const step4 = await commitDemoMutation(
    storage,
    data => mutateGenerateSerials(data, { batchId, quantity: 3 }, actor),
    { locks }
  )
  assert.equal(step4.ok, true, step4.result?.error)
  assert.equal(step4.result.added.length, 3)

  // Simulate full browser reload: cold load from same storage must NOT overwrite stored data
  const reloaded = loadPersistedDemoData(storage)
  assert.equal(reloaded.status, 'loaded')
  const reloadedEnv = reloaded.envelope
  assert.equal(reloadedEnv.revision, step4.envelope.revision)
  assert.ok(reloadedEnv.data.products.some(p => p.id === productId && p.name === 'Cefixime'))
  assert.ok(reloadedEnv.data.batches.some(b => b.id === batchId && b.release === 'Released'))
  const persistedPkgs = reloadedEnv.data.packages.filter(p => p.batchId === batchId)
  assert.equal(persistedPkgs.length, 3)
  assert.ok(persistedPkgs.every(p => p.custodian === 'm1' && p.manufacturerOrgId === 'm1'))
})

test('2, 3 & 4. Authenticated session restores on refresh, and logout clears session while preserving operational data', async () => {
  const storage = createMemoryStorage()
  const locks = createMockWebLocks()
  const { envelope: env } = loadPersistedDemoData(storage)
  const adminUser = env.data.users.find(u => u.id === 'u1')

  const authRes = authenticateDemoUser(adminUser.id, env.data)
  assert.equal(authRes.ok, true)
  savePersistedSession(storage, authRes.session)

  const addedOrg = await commitDemoMutation(
    storage,
    data => mutateAddOrganization(data, { name: 'Pacific Pharma Depot', type: 'Distributor' }, makeActor(adminUser)),
    { locks }
  )
  assert.equal(addedOrg.ok, true, addedOrg.result?.error)

  // Simulate F5 refresh: both session and data restore synchronously
  const restoredRawSession = loadPersistedSession(storage)
  const { envelope: reloadedDataEnv } = loadPersistedDemoData(storage)
  const validated = validateDemoSession(restoredRawSession, reloadedDataEnv.data)
  assert.equal(validated.valid, true)
  assert.equal(validated.user.id, 'u1')
  assert.equal(validated.session.role, 'admin')
  assert.ok(reloadedDataEnv.data.organizations.some(o => o.name === 'Pacific Pharma Depot'))

  // Logout clears session ONLY, operational data stays intact
  clearPersistedSession(storage)
  assert.equal(loadPersistedSession(storage), null)
  const afterLogout = loadPersistedDemoData(storage).envelope
  assert.ok(afterLogout.data.organizations.some(o => o.name === 'Pacific Pharma Depot'))

  // Reset explicitly restores seed fixtures inside Web Lock & bumps resetEpoch
  const resetRes = await resetPersistedDemoData(storage, { locks, knownResetEpoch: afterLogout.resetEpoch })
  assert.equal(resetRes.ok, true)
  assert.equal(resetRes.envelope.revision, 1)
  assert.equal(resetRes.envelope.resetEpoch, 2)
  assert.equal(resetRes.envelope.data.organizations.some(o => o.name === 'Pacific Pharma Depot'), false)
})

test('5 & 6. Malformed/corrupt JSON resets cleanly, v0/unversioned migrates safely, unsupported future version recovers', () => {
  const corruptStorage = createMemoryStorage({
    [DEMO_DATA_STORAGE_KEY]: '{not-valid-json'
  })
  const fromCorrupt = loadPersistedDemoData(corruptStorage)
  assert.equal(fromCorrupt.status, 'recovered')
  assert.equal(fromCorrupt.envelope.version, DEMO_DATA_SCHEMA_VERSION)
  assert.equal(fromCorrupt.envelope.data.organizations.length, 4)
  assert.equal(fromCorrupt.envelope.data.users.length, 6)
  assert.equal(fromCorrupt.envelope.data.products.length, 0)
  assert.equal(fromCorrupt.envelope.data.batches.length, 0)
  assert.equal(fromCorrupt.envelope.data.packages.length, 0)
  assert.equal(fromCorrupt.envelope.data.shipments.length, 0)
  assert.equal(fromCorrupt.envelope.data.alerts.length, 0)
  assert.equal(fromCorrupt.envelope.data.investigations.length, 0)
  assert.equal(fromCorrupt.envelope.data.reports.length, 0)
  assert.equal(fromCorrupt.envelope.data.traceabilityEvents.length, 0)

  const missingCollections = validateAndMigrateDemoData({
    version: 1,
    data: { products: [] }
  })
  assert.equal(missingCollections.ok, false)
  assert.equal(missingCollections.status, 'recovered')

  const seed = createSeedDemoData()
  const legacyPayload = {
    organizations: [...seed.organizations, { id: 'o9', name: 'Legacy Factory', type: 'Manufacturer' }],
    products: [
      ...seed.products,
      { id: 'pr9', name: 'Legacy Med', strength: '10mg', form: 'Tablet', gtin: '111', packSize: '10', status: 'active' }
    ],
    batches: seed.batches,
    packages: seed.packages,
    shipments: seed.shipments,
    users: seed.users
  }
  const migrated = validateAndMigrateDemoData(legacyPayload)
  assert.equal(migrated.ok, true)
  assert.equal(migrated.status, 'migrated')
  assert.ok(migrated.envelope.data.organizations.some(o => o.id === 'o9' && o.status === 'active'))
  assert.ok(migrated.envelope.data.products.some(p => p.id === 'pr9' && p.orgId === 'm1'))
  assert.ok(Array.isArray(migrated.envelope.data.alerts))

  const futureCheck = validateAndMigrateDemoData({
    version: 999,
    data: seed
  })
  assert.equal(futureCheck.ok, false)
  assert.equal(futureCheck.status, 'recovered')
  assert.equal(futureCheck.envelope.version, DEMO_DATA_SCHEMA_VERSION)
})

test('7, 8, 9 & 10. End-to-end supply chain workflow executed purely with Admin-created orgs and users + cross-org isolation', async () => {
  const storage = createMemoryStorage()
  const locks = createMockWebLocks()
  let env = loadPersistedDemoData(storage).envelope
  const adminActor = makeActor(env.data.users.find(u => u.id === 'u1'))

  async function apply(mutator) {
    const res = await commitDemoMutation(storage, mutator, { locks })
    assert.equal(res.ok, true, res.result?.error || 'Expected mutation to succeed')
    env = res.envelope
    return res.result
  }

  const orgMfg = await apply(d => mutateAddOrganization(d, { name: 'Helios Pharma Mfg', type: 'Manufacturer' }, adminActor))
  const orgDist = await apply(d => mutateAddOrganization(d, { name: 'Atlas Cold Chain Dist', type: 'Distributor' }, adminActor))
  const orgWhol = await apply(d => mutateAddOrganization(d, { name: 'Beacon Wholesale', type: 'Wholesaler' }, adminActor))
  const orgPharm = await apply(d => mutateAddOrganization(d, { name: 'CareFirst Pharmacy', type: 'Pharmacy' }, adminActor))

  const badRoleRes = await commitDemoMutation(
    storage,
    d => mutateAddUser(d, { name: 'Wrong Org', email: 'wrong@demo', role: 'pharmacy', orgId: orgMfg.id }, adminActor),
    { locks }
  )
  assert.equal(badRoleRes.ok, false)

  const uMfg = await apply(d =>
    mutateAddUser(d, { name: 'Maya Chen', email: 'maya@helios.demo', role: 'manufacturer', orgId: orgMfg.id }, adminActor)
  )
  const uDist = await apply(d =>
    mutateAddUser(d, { name: 'Omar Ali', email: 'omar@atlas.demo', role: 'distributor', orgId: orgDist.id }, adminActor)
  )
  const uWhol = await apply(d =>
    mutateAddUser(d, { name: 'Nora Diaz', email: 'nora@beacon.demo', role: 'wholesaler', orgId: orgWhol.id }, adminActor)
  )
  const uPharm = await apply(d =>
    mutateAddUser(d, { name: 'Liam Park', email: 'liam@carefirst.demo', role: 'pharmacy', orgId: orgPharm.id }, adminActor)
  )

  const mfgActor = makeActor(uMfg)
  const distActor = makeActor(uDist)
  const wholActor = makeActor(uWhol)
  const pharmActor = makeActor(uPharm)

  const crossRelease = await commitDemoMutation(storage, d => mutateReleaseBatch(d, 'b3', mfgActor), { locks })
  assert.equal(crossRelease.ok, false)

  const prod = await apply(d =>
    mutateAddProduct(
      d,
      { name: 'Azithromycin', strength: '500mg', form: 'Tablet', gtin: '08909999000111', packSize: '6 tabs' },
      mfgActor
    )
  )
  assert.equal(prod.orgId, orgMfg.id)

  const batch = await apply(d =>
    mutateAddBatch(d, { productId: prod.id, no: 'AZM-2601', mfd: '2026-02-01', exp: '2028-06-01', quantity: 4 }, mfgActor)
  )
  assert.equal(batch.orgId, orgMfg.id)

  await apply(d => mutateReleaseBatch(d, batch.id, mfgActor))
  const gen = await apply(d => mutateGenerateSerials(d, { batchId: batch.id, quantity: 3 }, mfgActor))
  const serials = gen.added.map(p => p.serial)
  assert.equal(serials.length, 3)

  const preShipVerify = verifySerial(serials[0], {
    packages: env.data.packages,
    batches: env.data.batches,
    shipments: env.data.shipments,
    organizations: env.data.organizations,
    today: '2026-05-01'
  })
  assert.equal(preShipVerify.state, 'unshipped')
  assert.equal(preShipVerify.supplyChainStatus, 'unshipped')

  const shpMD = await apply(d =>
    mutateCreateShipment(d, { from: orgMfg.id, to: orgDist.id, packageSerials: serials }, mfgActor)
  )
  await apply(d => mutateDispatchShipment(d, shpMD.shipment.ref, mfgActor))

  const d1Actor = makeActor(env.data.users.find(u => u.id === 'u3'))
  const wrongDistReceive = await commitDemoMutation(
    storage,
    d =>
      mutateRecordReceivingSession(
        d,
        shpMD.shipment.ref,
        { sessionDispositions: { [serials[0]]: { status: 'accepted', scanned: true } }, unmatchedScans: [] },
        d1Actor
      ),
    { locks }
  )
  assert.equal(wrongDistReceive.ok, false)

  await apply(d =>
    mutateRecordReceivingSession(
      d,
      shpMD.shipment.ref,
      {
        sessionDispositions: {
          [serials[0]]: { status: 'accepted', scanned: true },
          [serials[1]]: { status: 'accepted', scanned: true }
        },
        unmatchedScans: []
      },
      distActor
    )
  )
  await apply(d =>
    mutateRecordReceivingSession(
      d,
      shpMD.shipment.ref,
      {
        sessionDispositions: {
          [serials[2]]: { status: 'accepted', scanned: true }
        },
        unmatchedScans: []
      },
      distActor
    )
  )

  const shpDW = await apply(d =>
    mutateCreateShipment(d, { from: orgDist.id, to: orgWhol.id, packageSerials: [serials[0], serials[1]] }, distActor)
  )
  await apply(d => mutateDispatchShipment(d, shpDW.shipment.ref, distActor))
  await apply(d =>
    mutateRecordReceivingSession(
      d,
      shpDW.shipment.ref,
      {
        sessionDispositions: {
          [serials[0]]: { status: 'accepted', scanned: true },
          [serials[1]]: { status: 'accepted', scanned: true }
        },
        unmatchedScans: []
      },
      wholActor
    )
  )

  const shpWP = await apply(d =>
    mutateCreateShipment(d, { from: orgWhol.id, to: orgPharm.id, packageSerials: [serials[0]] }, wholActor)
  )
  await apply(d => mutateDispatchShipment(d, shpWP.shipment.ref, wholActor))
  await apply(d =>
    mutateRecordReceivingSession(
      d,
      shpWP.shipment.ref,
      {
        sessionDispositions: {
          [serials[0]]: { status: 'accepted', scanned: true }
        },
        unmatchedScans: []
      },
      pharmActor
    )
  )

  const p1Actor = makeActor(env.data.users.find(u => u.id === 'u5'))
  const wrongPharmDispense = await commitDemoMutation(
    storage,
    d => mutateDispensePackage(d, serials[0], { pharmacyId: 'p1' }, p1Actor),
    { locks }
  )
  assert.equal(wrongPharmDispense.ok, false)

  env = loadPersistedDemoData(storage).envelope
  await apply(d => mutateDispensePackage(d, serials[0], { pharmacyId: orgPharm.id }, pharmActor))

  const publicVerify = await apply(d => mutateVerifyAndRecord(d, serials[0]))
  assert.equal(publicVerify.authenticityStatus, 'verified')
  assert.equal(publicVerify.supplyChainStatus, 'accepted')
  assert.equal(publicVerify.dispensingStatus, 'dispensed')
  assert.equal(publicVerify.state, 'dispensed')
  assert.equal(publicVerify.p.history.some(([, o]) => o === orgMfg.id), true)
  assert.equal(publicVerify.p.history.some(([, o]) => o === orgDist.id), true)
  assert.equal(publicVerify.p.history.some(([, o]) => o === orgWhol.id), true)
  assert.equal(publicVerify.p.history.some(([, o]) => o === orgPharm.id), true)
})

test('11. Suspended users and suspended organizations are blocked from login, session restoration, and mutations', async () => {
  const storage = createMemoryStorage()
  const locks = createMockWebLocks()
  savePersistedDemoData(storage, createSeedEnvelope(1, 1))
  let env = loadPersistedDemoData(storage).envelope

  const u7Auth = authenticateDemoUser('u7', env.data)
  assert.equal(u7Auth.ok, false)
  assert.match(u7Auth.error, /suspended/i)

  const fakeSession = {
    version: 1,
    userId: 'u7',
    role: 'distributor',
    orgId: 'd1',
    userName: 'Suspended User'
  }
  assert.equal(validateDemoSession(fakeSession, env.data).valid, false)

  const adminActor = makeActor(env.data.users.find(u => u.id === 'u1'))
  const u5AuthBefore = authenticateDemoUser('u5', env.data)
  assert.equal(u5AuthBefore.ok, true)

  const suspOrg = await commitDemoMutation(
    storage,
    d => mutateUpdateOrganization(d, 'p1', { status: 'suspended' }, adminActor),
    { locks }
  )
  assert.equal(suspOrg.ok, true, suspOrg.result?.error)
  env = suspOrg.envelope

  assert.equal(validateDemoSession(u5AuthBefore.session, env.data).valid, false)
  const u5LoginAfter = authenticateDemoUser('u5', env.data)
  assert.equal(u5LoginAfter.ok, false)
  assert.match(u5LoginAfter.error, /suspended/i)

  const defaultPharmAfter = authenticateDefaultUserForRole('pharmacy', env.data)
  assert.equal(defaultPharmAfter.ok, false)

  const blockedDispense = await commitDemoMutation(
    storage,
    d =>
      mutateDispensePackage(
        d,
        'DEMO-PCM-2601-00046',
        { pharmacyId: 'p1' },
        makeActor(env.data.users.find(u => u.id === 'u5'))
      ),
    { locks }
  )
  assert.equal(blockedDispense.ok, false)
})

test('13. Sequential ID generation never collides across deletions or gaps', () => {
  const itemsWithGap = [{ id: 'pr1' }, { id: 'pr7' }, { id: 'pr3' }]
  assert.equal(nextSequentialId(itemsWithGap, 'pr'), 'pr8')

  const shipmentsWithGap = [{ ref: 'SHP-2601' }, { ref: 'SHP-2614' }, { ref: 'SHP-2605' }]
  assert.equal(nextShipmentRef(shipmentsWithGap), 'SHP-2615')
})

test('14. Cross-portal reports, alerts, and investigations persist cleanly across reloads', async () => {
  const storage = createMemoryStorage()
  const locks = createMockWebLocks()
  savePersistedDemoData(storage, createSeedEnvelope(1, 1))
  const baseEnv = loadPersistedDemoData(storage).envelope
  const invActor = makeActor(baseEnv.data.users.find(u => u.id === 'u6'))

  const rptRes = await commitDemoMutation(
    storage,
    d =>
      mutateSubmitReport(d, {
        serial: 'DEMO-PCM-2601-00048',
        type: 'suspicious_packaging',
        description: 'Seal looked opened.'
      }),
    { locks }
  )
  assert.equal(rptRes.ok, true)

  const invRes = await commitDemoMutation(
    storage,
    d => mutateCreateInvestigation(d, { alertId: 'alt1', title: 'Review seal report on 00048' }, invActor),
    { locks }
  )
  assert.equal(invRes.ok, true)

  const alertRes = await commitDemoMutation(
    storage,
    d => mutateUpdateAlert(d, 'alt1', { status: 'under_review' }, invActor),
    { locks }
  )
  assert.equal(alertRes.ok, true)

  const updInvRes = await commitDemoMutation(
    storage,
    d => mutateUpdateInvestigation(d, invRes.result.id, { findings: 'Escalated for physical sample inspection.' }, invActor),
    { locks }
  )
  assert.equal(updInvRes.ok, true)

  const reloaded = loadPersistedDemoData(storage).envelope
  assert.ok(reloaded.data.reports.some(r => r.id === rptRes.result.id && r.description === 'Seal looked opened.'))
  assert.ok(reloaded.data.alerts.some(a => a.id === 'alt1' && a.status === 'under_review'))
  assert.ok(
    reloaded.data.investigations.some(
      i => i.id === invRes.result.id && i.findings === 'Escalated for physical sample inspection.'
    )
  )
})

test('16. Overlapping paired async mutations (25+ pairs = 50 distinct writes) lose zero records and never collide IDs', async () => {
  const storage = createMemoryStorage()
  const locks = createMockWebLocks()
  const seedEnv = loadPersistedDemoData(storage).envelope
  const adminActor = makeActor(seedEnv.data.users.find(u => u.id === 'u1'))

  const PAIR_COUNT = 25
  const tasks = []
  for (let i = 1; i <= PAIR_COUNT; i++) {
    // Launch Tab A and Tab B writes simultaneously for every pair, yielding asynchronously inside mutator
    tasks.push(
      Promise.all([
        commitDemoMutation(
          storage,
          async data => {
            await new Promise(resolve => setTimeout(resolve, i % 3))
            return mutateAddOrganization(data, { name: `Concurrent Org A-${i}`, type: 'Distributor' }, adminActor)
          },
          { locks }
        ),
        commitDemoMutation(
          storage,
          async data => {
            await new Promise(resolve => setTimeout(resolve, (i + 1) % 3))
            return mutateAddOrganization(data, { name: `Concurrent Org B-${i}`, type: 'Pharmacy' }, adminActor)
          },
          { locks }
        )
      ])
    )
  }

  const pairResults = await Promise.all(tasks)
  const flat = pairResults.flat()
  assert.equal(flat.length, 50)
  assert.ok(flat.every(r => r.ok && r.committed))

  // Strictly exclusive lock execution (never > 1 concurrent holder)
  assert.equal(locks.stats().maxConcurrentHolders, 1)
  assert.equal(locks.stats().requestCount, 50)

  const finalEnv = loadPersistedDemoData(storage).envelope
  assert.equal(finalEnv.revision, 1 + 50)

  // Every created organization survives with unique ID
  const ids = finalEnv.data.organizations.map(o => o.id)
  assert.equal(new Set(ids).size, finalEnv.data.organizations.length)
  assert.equal(finalEnv.data.organizations.length, seedEnv.data.organizations.length + 50)
  for (let i = 1; i <= PAIR_COUNT; i++) {
    assert.ok(finalEnv.data.organizations.some(o => o.name === `Concurrent Org A-${i}`))
    assert.ok(finalEnv.data.organizations.some(o => o.name === `Concurrent Org B-${i}`))
  }

  // Every commit generated a distinct commitId
  const commitIds = flat.map(r => r.envelope.commitId)
  assert.equal(new Set(commitIds).size, 50)
})

test('17. Overlapping shipment creations generate distinct sequential SHP-XXXX references with zero collisions', async () => {
  const storage = createMemoryStorage()
  const locks = createMockWebLocks()
  savePersistedDemoData(storage, createSeedEnvelope(1, 1))
  let env = loadPersistedDemoData(storage).envelope
  const mfgActor = makeActor(env.data.users.find(u => u.id === 'u2'))

  // Ensure a released batch has plenty of packages at m1
  const gen = await commitDemoMutation(
    storage,
    data => mutateGenerateSerials(data, { batchId: 'b1', quantity: 6 }, mfgActor),
    { locks }
  )
  assert.equal(gen.ok, true, gen.result?.error)
  const serials = gen.result.added.map(p => p.serial)

  // Three overlapping shipment creations racing against each other
  const [s1, s2, s3] = await Promise.all([
    commitDemoMutation(
      storage,
      async data => {
        await new Promise(resolve => setTimeout(resolve, 4))
        return mutateCreateShipment(data, { from: 'm1', to: 'd1', packageSerials: [serials[0], serials[1]] }, mfgActor)
      },
      { locks }
    ),
    commitDemoMutation(
      storage,
      async data => {
        await new Promise(resolve => setTimeout(resolve, 1))
        return mutateCreateShipment(data, { from: 'm1', to: 'd1', packageSerials: [serials[2], serials[3]] }, mfgActor)
      },
      { locks }
    ),
    commitDemoMutation(
      storage,
      async data => {
        await new Promise(resolve => setTimeout(resolve, 2))
        return mutateCreateShipment(data, { from: 'm1', to: 'd1', packageSerials: [serials[4], serials[5]] }, mfgActor)
      },
      { locks }
    )
  ])

  assert.ok(s1.ok && s2.ok && s3.ok)
  const refs = [s1.result.ref, s2.result.ref, s3.result.ref]
  assert.equal(new Set(refs).size, 3)

  const diskEnv = loadPersistedDemoData(storage).envelope
  assert.ok(refs.every(ref => diskEnv.data.shipments.some(s => s.ref === ref)))
})

test('18. Web Locks unavailable refuses mutations and reset without fallback or unsafe localStorage writes', async () => {
  const storage = createMemoryStorage()
  const beforeEnv = loadPersistedDemoData(storage).envelope
  const beforeRaw = storage.getItem(DEMO_DATA_STORAGE_KEY)
  savePersistedSession(storage, { version: 1, userId: 'u1', role: 'admin', orgId: null })

  let mutatorInvoked = false
  const blockedMutation = await commitDemoMutation(
    storage,
    data => {
      mutatorInvoked = true
      return mutateSubmitReport(data, { serial: null, type: 'other', description: 'Should never run' })
    },
    { locks: null }
  )
  assert.equal(blockedMutation.ok, false)
  assert.equal(blockedMutation.committed, false)
  assert.equal(blockedMutation.code, 'locks_unavailable')
  assert.equal(blockedMutation.error, WEB_LOCKS_UNAVAILABLE_ERROR)
  assert.equal(mutatorInvoked, false)
  assert.equal(storage.getItem(DEMO_DATA_STORAGE_KEY), beforeRaw)
  assert.equal(peekPersistedDemoData(storage).revision, beforeEnv.revision)

  const blockedReset = await resetPersistedDemoData(storage, { locks: null, knownResetEpoch: beforeEnv.resetEpoch })
  assert.equal(blockedReset.ok, false)
  assert.equal(blockedReset.committed, false)
  assert.equal(blockedReset.code, 'locks_unavailable')
  assert.equal(blockedReset.error, WEB_LOCKS_UNAVAILABLE_ERROR)
  assert.equal(storage.getItem(DEMO_DATA_STORAGE_KEY), beforeRaw)
  assert.ok(loadPersistedSession(storage), 'Session must remain intact if reset was refused')
})

test('19. Delayed storage event & equal-revision conflicting snapshot classification', () => {
  const current = { version: 1, resetEpoch: 2, revision: 4, commitId: 'commit-local' }

  // Older revision in same epoch -> stale
  assert.equal(
    classifyEnvelopeRelation(current, { version: 1, resetEpoch: 2, revision: 3, commitId: 'commit-old' }),
    'stale_revision'
  )
  assert.deepEqual(
    shouldAdoptStorageEnvelope(current, { version: 1, resetEpoch: 2, revision: 3, commitId: 'commit-old' }),
    { adopt: false, conflict: false, relation: 'stale_revision' }
  )

  // Higher revision from an older reset epoch -> stale_epoch (must NOT resurrect pre-reset state!)
  assert.equal(
    classifyEnvelopeRelation(current, { version: 1, resetEpoch: 1, revision: 99, commitId: 'pre-reset' }),
    'stale_epoch'
  )
  assert.deepEqual(
    shouldAdoptStorageEnvelope(current, { version: 1, resetEpoch: 1, revision: 99, commitId: 'pre-reset' }),
    { adopt: false, conflict: false, relation: 'stale_epoch' }
  )

  // Newer epoch (reset) -> adopt
  assert.deepEqual(
    shouldAdoptStorageEnvelope(current, { version: 1, resetEpoch: 3, revision: 1, commitId: 'reset-3' }),
    { adopt: true, conflict: false, relation: 'newer_epoch' }
  )

  // Newer revision in same epoch -> adopt
  assert.deepEqual(
    shouldAdoptStorageEnvelope(current, { version: 1, resetEpoch: 2, revision: 5, commitId: 'commit-next' }),
    { adopt: true, conflict: false, relation: 'newer_revision' }
  )

  // Equal epoch & equal revision with matching commitId -> identical
  assert.deepEqual(
    shouldAdoptStorageEnvelope(current, { version: 1, resetEpoch: 2, revision: 4, commitId: 'commit-local' }),
    { adopt: false, conflict: false, relation: 'identical' }
  )

  // Equal epoch & equal revision with DIFFERENT commitId -> flagged as conflict (never treated as identical!)
  assert.deepEqual(
    shouldAdoptStorageEnvelope(current, { version: 1, resetEpoch: 2, revision: 4, commitId: 'commit-foreign' }),
    { adopt: false, conflict: true, relation: 'conflict' }
  )
})

test('20. Concurrent reset during/after queued tab mutations prevents pre-reset state resurrection', async () => {
  const storage = createMemoryStorage()
  const locks = createMockWebLocks()
  const seedEnv = loadPersistedDemoData(storage).envelope
  const adminActor = makeActor(seedEnv.data.users.find(u => u.id === 'u1'))

  // Queue: (1) pre-reset mutation, (2) reset, (3) post-reset mutation simultaneously on the same lock
  const pPre = commitDemoMutation(
    storage,
    async data => {
      await new Promise(resolve => setTimeout(resolve, 5))
      return mutateAddOrganization(data, { name: 'Pre-Reset Transient Org', type: 'Distributor' }, adminActor)
    },
    { locks }
  )
  const pReset = resetPersistedDemoData(storage, { locks, knownResetEpoch: seedEnv.resetEpoch })
  const pPost = commitDemoMutation(
    storage,
    data => mutateAddOrganization(data, { name: 'Post-Reset Surviving Org', type: 'Pharmacy' }, adminActor),
    { locks }
  )

  const [rPre, rReset, rPost] = await Promise.all([pPre, pReset, pPost])
  assert.equal(rPre.ok, true)
  assert.equal(rReset.ok, true)
  assert.equal(rPost.ok, true)

  const diskEnv = loadPersistedDemoData(storage).envelope
  assert.equal(diskEnv.resetEpoch, 2)
  assert.equal(diskEnv.revision, 2)
  assert.equal(diskEnv.data.organizations.some(o => o.name === 'Pre-Reset Transient Org'), false)
  assert.equal(diskEnv.data.organizations.some(o => o.name === 'Post-Reset Surviving Org'), true)

  // Stale pre-reset envelope (epoch 1, higher/equal revision) must never be adopted over current epoch 2 disk state
  assert.equal(shouldAdoptStorageEnvelope(diskEnv, rPre.envelope).adopt, false)
  assert.equal(shouldAdoptStorageEnvelope(diskEnv, rPre.envelope).relation, 'stale_epoch')
})

test('21. Failed/non-mutating transactions leave revision, commitId, and storage untouched', async () => {
  const storage = createMemoryStorage()
  const locks = createMockWebLocks()
  const beforeEnv = loadPersistedDemoData(storage).envelope
  const beforeRaw = storage.getItem(DEMO_DATA_STORAGE_KEY)

  // Non-mutating lookup for unknown serial
  const unknownLookup = await commitDemoMutation(
    storage,
    data => mutateVerifyAndRecord(data, 'UNKNOWN-SERIAL-999'),
    { locks }
  )
  assert.equal(unknownLookup.ok, true)
  assert.equal(unknownLookup.committed, false)
  assert.equal(unknownLookup.result.found, false)
  assert.equal(storage.getItem(DEMO_DATA_STORAGE_KEY), beforeRaw)

  // Validation error inside mutator
  const adminActor = makeActor(beforeEnv.data.users.find(u => u.id === 'u1'))
  const duplicateOrg = await commitDemoMutation(
    storage,
    data => mutateAddOrganization(data, { name: beforeEnv.data.organizations[0].name, type: 'Manufacturer' }, adminActor),
    { locks }
  )
  assert.equal(duplicateOrg.ok, false)
  assert.equal(duplicateOrg.committed, false)
  assert.equal(storage.getItem(DEMO_DATA_STORAGE_KEY), beforeRaw)

  // Exception thrown inside mutator
  const thrownRes = await commitDemoMutation(
    storage,
    () => {
      throw new Error('Synthetic mutator failure')
    },
    { locks }
  )
  assert.equal(thrownRes.ok, false)
  assert.equal(thrownRes.committed, false)
  assert.match(thrownRes.error, /Synthetic mutator failure/)
  assert.equal(storage.getItem(DEMO_DATA_STORAGE_KEY), beforeRaw)
  assert.equal(DEMO_DATA_LOCK_NAME, 'pharmatrace.demo.data.lock.v1')
})

test('22. Clean starting state clears legacy dummy data, preserves orgs/roles, supports from-scratch creation, and resets reproducibly', async () => {
  const legacyEnv = createSeedEnvelope(5, 1)
  const storage = createMemoryStorage({
    [LEGACY_DEMO_DATA_STORAGE_KEY]: JSON.stringify(legacyEnv),
    [DEMO_SESSION_STORAGE_KEY]: JSON.stringify({
      version: 1,
      userId: 'u2',
      role: 'manufacturer',
      orgId: 'm1',
      userName: 'Tariq Mahmud'
    })
  })
  const locks = createMockWebLocks()

  // Fresh v2 init purges legacy v1 dummy data + stale session and writes clean starting state
  const initRes = loadPersistedDemoData(storage)
  assert.equal(initRes.status, 'initialized')
  assert.equal(storage.getItem(LEGACY_DEMO_DATA_STORAGE_KEY), null)
  assert.equal(loadPersistedSession(storage), null)

  const clean = initRes.envelope.data
  const cleanShape = createCleanDemoData()
  assert.deepEqual(clean.organizations, cleanShape.organizations)
  assert.deepEqual(clean.users, cleanShape.users)
  assert.equal(clean.organizations.length, 4)
  assert.equal(clean.users.length, 6)
  assert.equal(clean.users.some(u => u.id === 'u7'), false)
  assert.equal(clean.products.length, 0)
  assert.equal(clean.batches.length, 0)
  assert.equal(clean.packages.length, 0)
  assert.equal(clean.shipments.length, 0)
  assert.equal(clean.alerts.length, 0)
  assert.equal(clean.investigations.length, 0)
  assert.equal(clean.reports.length, 0)
  assert.equal(clean.traceabilityEvents.length, 0)

  // Every active role still authenticates cleanly from clean starting state
  for (const role of ['admin', 'manufacturer', 'distributor', 'wholesaler', 'pharmacy', 'investigator']) {
    const auth = authenticateDefaultUserForRole(role, clean)
    assert.equal(auth.ok, true, `Role ${role} should authenticate in clean starting state`)
  }

  // Manufacturer can register product -> batch -> QA release -> first package from clean state
  const mfgActor = makeActor(clean.users.find(u => u.id === 'u2'))
  const prodRes = await commitDemoMutation(
    storage,
    d =>
      mutateAddProduct(
        d,
        { name: 'Paracetamol', strength: '500 mg', form: 'Tablet', gtin: '08901234560012', packSize: '20 tablets' },
        mfgActor
      ),
    { locks }
  )
  assert.equal(prodRes.ok, true)

  const batchRes = await commitDemoMutation(
    storage,
    d =>
      mutateAddBatch(
        d,
        { productId: prodRes.result.id, no: 'PCM-2611', mfd: '2026-11-01', exp: '2028-11-01', quantity: 5 },
        mfgActor
      ),
    { locks }
  )
  assert.equal(batchRes.ok, true)

  const relRes = await commitDemoMutation(storage, d => mutateReleaseBatch(d, batchRes.result.id, mfgActor), { locks })
  assert.equal(relRes.ok, true)

  const serRes = await commitDemoMutation(
    storage,
    d => mutateGenerateSerials(d, { batchId: batchRes.result.id, quantity: 1 }, mfgActor),
    { locks }
  )
  assert.equal(serRes.ok, true)
  assert.equal(serRes.result.added[0].serial, 'DEMO-PCM-2611-00001')

  // Explicit reset clears newly created operational records + session while preserving 4 orgs and 6 active roles
  savePersistedSession(storage, authenticateDefaultUserForRole('manufacturer', clean).session)
  const resetRes = await resetPersistedDemoData(storage, {
    locks,
    knownResetEpoch: serRes.envelope.resetEpoch
  })
  assert.equal(resetRes.ok, true)
  assert.equal(resetRes.envelope.resetEpoch, 2)
  assert.equal(resetRes.envelope.revision, 1)
  assert.equal(loadPersistedSession(storage), null)
  assert.equal(resetRes.envelope.data.products.length, 0)
  assert.equal(resetRes.envelope.data.batches.length, 0)
  assert.equal(resetRes.envelope.data.packages.length, 0)
  assert.equal(resetRes.envelope.data.shipments.length, 0)
  assert.equal(resetRes.envelope.data.traceabilityEvents.length, 0)
  assert.equal(resetRes.envelope.data.organizations.length, 4)
  assert.equal(resetRes.envelope.data.users.length, 6)
})
