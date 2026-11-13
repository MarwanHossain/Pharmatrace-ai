import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildVerificationUrl,
  extractSerialFromInput,
  normalizeSerialToken,
  parseQrPayload
} from '../src/services/qrPayload.js'
import {
  buildBatchLabelSheetHtml,
  buildPackageLabelMetadata,
  buildPackageLabelSvgString,
  dataUrlToUint8Array,
  exportPackageLabelPngBlob,
  generatePackageQrPngDataUrl,
  generatePackageQrSvg
} from '../src/services/qrGenerator.js'
import {
  TRACEABILITY_EVENT_TYPES,
  getPackageTraceabilityEvents,
  hasCurrentPreDispatchVerification
} from '../src/services/traceabilityEvents.js'
import {
  DEMO_DATA_LOCK_NAME,
  DEMO_DATA_STORAGE_KEY,
  commitDemoMutation,
  createSeedEnvelope,
  loadPersistedDemoData,
  peekPersistedDemoData,
  savePersistedDemoData
} from '../src/services/demoStorage.js'
import {
  mutateAddBatch,
  mutateAddProduct,
  mutateCreateShipment,
  mutateDispatchShipment,
  mutateDispensePackage,
  mutateGenerateSerials,
  mutateRecordReceivingSession,
  mutateRecordTraceabilityEvents,
  mutateReleaseBatch,
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
  return {
    request(name, optionsOrCallback, maybeCallback) {
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback
      const lockName = String(name)
      const prev = chains.get(lockName) ?? Promise.resolve()
      const run = prev.then(async () => {
        await Promise.resolve()
        return callback({ name: lockName, mode: 'exclusive' })
      })
      chains.set(lockName, run.catch(() => {}))
      return run
    }
  }
}

function withMockLocks(fn) {
  const prevDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', {
    value: { locks: createMockWebLocks() },
    configurable: true,
    writable: true
  })
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prevDescriptor) {
        Object.defineProperty(globalThis, 'navigator', prevDescriptor)
      } else {
        delete globalThis.navigator
      }
    })
}

const ADMIN_ACTOR = { userId: 'u1', role: 'admin', orgId: null }
const MFG_ACTOR = { userId: 'u2', role: 'manufacturer', orgId: 'm1' }
const DIST_ACTOR = { userId: 'u3', role: 'distributor', orgId: 'd1' }
const WHOL_ACTOR = { userId: 'u4', role: 'wholesaler', orgId: 'w1' }
const PHARM_ACTOR = { userId: 'u5', role: 'pharmacy', orgId: 'p1' }

test('qrPayload builds canonical URLs and normalizes plain, relative, full, hash, and encoded inputs', () => {
  const url = buildVerificationUrl('demo-pcm-2601-00031', 'https://verify.pharmatrace.example')
  assert.equal(url, 'https://verify.pharmatrace.example/verify?serial=DEMO-PCM-2601-00031')

  const relUrl = buildVerificationUrl('demo-pcm-2601-00031', '')
  assert.equal(relUrl, '/verify?serial=DEMO-PCM-2601-00031')

  assert.throws(() => buildVerificationUrl('bad serial with spaces', ''), TypeError)
  assert.equal(normalizeSerialToken('  pcm-99.a_1  '), 'PCM-99.A_1')

  assert.deepEqual(parseQrPayload('demo-pcm-2601-00031'), {
    ok: true,
    serial: 'DEMO-PCM-2601-00031',
    sourceType: 'plain_serial'
  })

  assert.deepEqual(
    parseQrPayload('https://verify.pharmatrace.example/verify?serial=demo-pcm-2601-00031', {
      allowedOrigins: ['https://verify.pharmatrace.example']
    }),
    {
      ok: true,
      serial: 'DEMO-PCM-2601-00031',
      sourceType: 'verification_url'
    }
  )

  assert.deepEqual(parseQrPayload('/verify?serial=DEMO-PCM-2601-00031'), {
    ok: true,
    serial: 'DEMO-PCM-2601-00031',
    sourceType: 'relative_verification_url'
  })

  assert.deepEqual(parseQrPayload('#/verify?serial=DEMO-PCM-2601-00031'), {
    ok: true,
    serial: 'DEMO-PCM-2601-00031',
    sourceType: 'hash_verification_url'
  })

  assert.deepEqual(
    parseQrPayload('https://verify.pharmatrace.example/#/verify/results/demo-pcm-2601-00031', {
      allowedOrigins: ['https://verify.pharmatrace.example']
    }),
    {
      ok: true,
      serial: 'DEMO-PCM-2601-00031',
      sourceType: 'hash_results_url'
    }
  )

  assert.deepEqual(parseQrPayload('/verify/results/%44%45%4D%4F-PCM-2601-00031'), {
    ok: true,
    serial: 'DEMO-PCM-2601-00031',
    sourceType: 'results_url'
  })

  assert.equal(
    extractSerialFromInput('https://verify.pharmatrace.example/verify?serial=UNKNOWN-UNIT-9999', {
      allowedOrigins: ['https://verify.pharmatrace.example']
    }),
    'UNKNOWN-UNIT-9999'
  )

  // Rejections
  const rejects = [
    '',
    '   ',
    'invalid serial with spaces',
    '/report?serial=DEMO-PCM-2601-00031',
    'https://verify.pharmatrace.example/admin/users?serial=DEMO-1',
    'https://verify.pharmatrace.example/verify',
    'https://verify.pharmatrace.example/verify?serial=ONE&serial=TWO',
    '/verify/results/%E0%A4%A',
    '//evil.example/verify?serial=DEMO-PCM-2601-00031',
    'javascript:alert(1)'
  ]
  for (const input of rejects) {
    const res = parseQrPayload(input, { allowedOrigins: ['https://verify.pharmatrace.example'] })
    assert.equal(res.ok, false, `Expected rejection for "${input}"`)
  }

  const wrongHost = parseQrPayload('https://untrusted.example/verify?serial=DEMO-PCM-2601-00031', {
    allowedOrigins: ['https://verify.pharmatrace.example']
  })
  assert.equal(wrongHost.ok, false)
})

test('qrGenerator creates scannable SVG, valid PNG bytes, XSS-safe unit label SVG, and paginated A4 HTML sheet', async () => {
  const origin = 'https://verify.pharmatrace.example'
  const serial = 'PT-QR-TEST-0001'

  const { verificationUrl, svg } = await generatePackageQrSvg(serial, { origin, width: 220 })
  assert.equal(verificationUrl, 'https://verify.pharmatrace.example/verify?serial=PT-QR-TEST-0001')
  assert.ok(svg.includes('<svg') && svg.includes('</svg>'))
  assert.ok(svg.includes('#ffffff') || svg.includes('#FFFFFF'))
  assert.ok(svg.includes('#000000'))

  const { dataUrl } = await generatePackageQrPngDataUrl(serial, { origin, width: 320 })
  assert.ok(dataUrl.startsWith('data:image/png;base64,'))
  const bytes = dataUrlToUint8Array(dataUrl)
  assert.deepEqual([...bytes.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  assert.ok(bytes.length > 200)

  const nodeBlobRes = await exportPackageLabelPngBlob({ serial, verificationUrl }, { origin })
  assert.equal(nodeBlobRes.blob.type, 'image/png')
  assert.ok(nodeBlobRes.blob.size > 200)

  // Minimal package with missing batch/product never fabricates placeholders
  const minimalMeta = buildPackageLabelMetadata({ pkg: { serial }, batch: null, product: null, manufacturerName: '' })
  assert.equal(minimalMeta.productName, '')
  assert.equal(minimalMeta.batchNo, '')
  assert.equal(minimalMeta.exp, '')

  // XSS / XML escaping check
  const dirtyLabelSvg = await buildPackageLabelSvgString(
    {
      serial,
      verificationUrl,
      productName: '<script>alert("xss")</script> & Med',
      strength: '500mg',
      dosageForm: 'Tablet',
      packSize: '10s',
      batchNo: 'B<1>',
      mfd: '2026-01-01',
      exp: '2028-01-01',
      manufacturerName: 'Meridian & "Bio"'
    },
    { origin }
  )
  assert.equal(dirtyLabelSvg.includes('<script>'), false)
  assert.ok(dirtyLabelSvg.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; Med'))
  assert.ok(dirtyLabelSvg.includes(serial))

  const htmlSheet = await buildBatchLabelSheetHtml(
    [
      { serial: 'PT-QR-TEST-0001', productName: 'Paracetamol', strength: '500mg', batchNo: 'PCM-1' },
      { serial: 'PT-QR-TEST-0002', productName: 'Paracetamol', strength: '500mg', batchNo: 'PCM-1' }
    ],
    { origin, title: 'Batch PCM-1' }
  )
  assert.ok(htmlSheet.includes('@media print'))
  assert.ok(htmlSheet.includes('@page { size: A4 portrait; margin: 10mm; }'))
  assert.ok(htmlSheet.includes('.no-print'))
  assert.ok(htmlSheet.includes('PT-QR-TEST-0001'))
  assert.ok(htmlSheet.includes('PT-QR-TEST-0002'))
  assert.equal((htmlSheet.match(/class="pt-label-card"/g) ?? []).length, 2)
})

test('complete end-to-end 11-step supply-chain journey with identical QR identity and persistent traceabilityEvents', async () => {
  await withMockLocks(async () => {
    const storage = createMemoryStorage()
    loadPersistedDemoData(storage)
    const origin = 'https://verify.pharmatrace.example'

    // 1. Manufacturer registers product, creates batch, releases QA, and generates serials
    const prodRes = await commitDemoMutation(storage, data =>
      mutateAddProduct(
        data,
        {
          name: 'Paracetamol',
          strength: '500 mg',
          form: 'Tablet',
          gtin: '08901234560012',
          packSize: '20 tablets'
        },
        MFG_ACTOR
      )
    )
    assert.equal(prodRes.result.ok, true)
    const productId = prodRes.result.id

    const batchRes = await commitDemoMutation(storage, data =>
      mutateAddBatch(
        data,
        {
          productId,
          no: 'E2E-PCM-2611',
          mfd: '2026-05-01',
          exp: '2028-05-01',
          quantity: 10
        },
        MFG_ACTOR
      )
    )
    assert.equal(batchRes.result.ok, true)
    const batchId = batchRes.result.batch.id

    const releaseRes = await commitDemoMutation(storage, data =>
      mutateReleaseBatch(data, batchId, MFG_ACTOR)
    )
    assert.equal(releaseRes.result.ok, true)

    const genRes = await commitDemoMutation(storage, data =>
      mutateGenerateSerials(data, { batchId, quantity: 3 }, MFG_ACTOR)
    )
    assert.equal(genRes.result.ok, true)
    const targetSerial = genRes.result.added[0].serial
    const qrUrl = buildVerificationUrl(targetSerial, origin)

    // Ensure no QR image blobs or data URIs were stored in localStorage
    const rawJson = storage.getItem(DEMO_DATA_STORAGE_KEY)
    assert.equal(rawJson.includes('data:image/'), false)

    // 2. Manufacturer shipment creation + mandatory pre-dispatch QR gate
    const shp1Create = await commitDemoMutation(storage, data =>
      mutateCreateShipment(data, { from: 'm1', to: 'd1', packageSerials: [targetSerial] }, MFG_ACTOR)
    )
    assert.equal(shp1Create.result.ok, true)
    const shp1Ref = shp1Create.result.ref

    const blockedDispatch = await commitDemoMutation(storage, data =>
      mutateDispatchShipment(data, shp1Ref, MFG_ACTOR, { requireQrVerification: true })
    )
    assert.equal(blockedDispatch.result.ok, false)
    assert.match(blockedDispatch.result.error, /Pre-dispatch QR verification is required/i)

    // Pre-dispatch fail observation does NOT unlock dispatch
    await commitDemoMutation(storage, data =>
      mutateRecordTraceabilityEvents(
        data,
        {
          eventType: TRACEABILITY_EVENT_TYPES.MANUFACTURER_QR_VERIFICATION_FAILED,
          serial: qrUrl,
          shipmentId: shp1Ref,
          checkpoint: 'manufacturer_pre_dispatch',
          category: 'observation',
          outcome: 'failed',
          failureReason: 'Wrong unit scanned'
        },
        MFG_ACTOR
      )
    )
    const stillBlocked = await commitDemoMutation(storage, data =>
      mutateDispatchShipment(data, shp1Ref, MFG_ACTOR, { requireQrVerification: true })
    )
    assert.equal(stillBlocked.result.ok, false)

    // Caller cannot forge a transaction event through mutateRecordTraceabilityEvents
    const forgedTx = await commitDemoMutation(storage, data =>
      mutateRecordTraceabilityEvents(
        data,
        {
          eventType: TRACEABILITY_EVENT_TYPES.MANUFACTURER_DISPATCHED,
          serial: targetSerial,
          category: 'transaction',
          outcome: 'success'
        },
        MFG_ACTOR
      )
    )
    assert.equal(forgedTx.result.ok, false)

    // Record successful MANUFACTURER_QR_VERIFIED -> dispatch succeeds
    await commitDemoMutation(storage, data =>
      mutateRecordTraceabilityEvents(
        data,
        {
          eventType: TRACEABILITY_EVENT_TYPES.MANUFACTURER_QR_VERIFIED,
          serial: extractSerialFromInput(qrUrl, { allowedOrigins: [origin] }),
          shipmentId: shp1Ref,
          checkpoint: 'manufacturer_pre_dispatch',
          category: 'observation',
          outcome: 'success'
        },
        MFG_ACTOR
      )
    )
    const mfgDisp = await commitDemoMutation(storage, data =>
      mutateDispatchShipment(data, shp1Ref, MFG_ACTOR, { requireQrVerification: true })
    )
    assert.equal(mfgDisp.result.ok, true)

    // 3. Distributor receives: scan -> verified (custody still m1) -> Save session -> DISTRIBUTOR_RECEIVED (custody d1)
    await commitDemoMutation(storage, data =>
      mutateRecordTraceabilityEvents(
        data,
        [
          {
            eventType: TRACEABILITY_EVENT_TYPES.DISTRIBUTOR_RECEIVING_SCANNED,
            serial: extractSerialFromInput(qrUrl, { allowedOrigins: [origin] }),
            shipmentId: shp1Ref,
            checkpoint: 'distributor_receiving',
            category: 'observation',
            outcome: 'success'
          },
          {
            eventType: TRACEABILITY_EVENT_TYPES.DISTRIBUTOR_RECEIVING_VERIFIED,
            serial: extractSerialFromInput(qrUrl, { allowedOrigins: [origin] }),
            shipmentId: shp1Ref,
            checkpoint: 'distributor_receiving',
            category: 'observation',
            outcome: 'success'
          }
        ],
        DIST_ACTOR
      )
    )
    let snap = peekPersistedDemoData(storage).data
    assert.equal(snap.packages.find(p => p.serial === targetSerial).custodian, 'm1')

    const distRecv = await commitDemoMutation(storage, data =>
      mutateRecordReceivingSession(
        data,
        shp1Ref,
        { sessionDispositions: { [targetSerial]: { status: 'accepted', scanned: true } } },
        DIST_ACTOR
      )
    )
    assert.equal(distRecv.result.ok, true)
    snap = peekPersistedDemoData(storage).data
    assert.equal(snap.packages.find(p => p.serial === targetSerial).custodian, 'd1')

    // 4. Distributor -> Wholesaler
    const shp2Create = await commitDemoMutation(storage, data =>
      mutateCreateShipment(data, { from: 'd1', to: 'w1', packageSerials: [targetSerial] }, DIST_ACTOR)
    )
    assert.equal(shp2Create.result.ok, true)
    const shp2Ref = shp2Create.result.ref

    const distBlocked = await commitDemoMutation(storage, data =>
      mutateDispatchShipment(data, shp2Ref, DIST_ACTOR, { requireQrVerification: true })
    )
    assert.equal(distBlocked.result.ok, false)

    await commitDemoMutation(storage, data =>
      mutateRecordTraceabilityEvents(
        data,
        [
          {
            eventType: TRACEABILITY_EVENT_TYPES.DISTRIBUTOR_PRE_DISPATCH_SCANNED,
            serial: targetSerial,
            shipmentId: shp2Ref,
            checkpoint: 'distributor_pre_dispatch',
            category: 'observation',
            outcome: 'success'
          },
          {
            eventType: TRACEABILITY_EVENT_TYPES.DISTRIBUTOR_PRE_DISPATCH_VERIFIED,
            serial: targetSerial,
            shipmentId: shp2Ref,
            checkpoint: 'distributor_pre_dispatch',
            category: 'observation',
            outcome: 'success'
          }
        ],
        DIST_ACTOR
      )
    )
    const distDisp = await commitDemoMutation(storage, data =>
      mutateDispatchShipment(data, shp2Ref, DIST_ACTOR, { requireQrVerification: true })
    )
    assert.equal(distDisp.result.ok, true)

    // 5. Wholesaler receives
    await commitDemoMutation(storage, data =>
      mutateRecordTraceabilityEvents(
        data,
        [
          {
            eventType: TRACEABILITY_EVENT_TYPES.WHOLESALER_RECEIVING_SCANNED,
            serial: targetSerial,
            shipmentId: shp2Ref,
            checkpoint: 'wholesaler_receiving',
            category: 'observation',
            outcome: 'success'
          },
          {
            eventType: TRACEABILITY_EVENT_TYPES.WHOLESALER_RECEIVING_VERIFIED,
            serial: targetSerial,
            shipmentId: shp2Ref,
            checkpoint: 'wholesaler_receiving',
            category: 'observation',
            outcome: 'success'
          }
        ],
        WHOL_ACTOR
      )
    )
    const wholRecv = await commitDemoMutation(storage, data =>
      mutateRecordReceivingSession(
        data,
        shp2Ref,
        { sessionDispositions: { [targetSerial]: { status: 'accepted', scanned: true } } },
        WHOL_ACTOR
      )
    )
    assert.equal(wholRecv.result.ok, true)

    // 6. Wholesaler -> Pharmacy
    const shp3Create = await commitDemoMutation(storage, data =>
      mutateCreateShipment(data, { from: 'w1', to: 'p1', packageSerials: [targetSerial] }, WHOL_ACTOR)
    )
    assert.equal(shp3Create.result.ok, true)
    const shp3Ref = shp3Create.result.ref

    const wholBlocked = await commitDemoMutation(storage, data =>
      mutateDispatchShipment(data, shp3Ref, WHOL_ACTOR, { requireQrVerification: true })
    )
    assert.equal(wholBlocked.result.ok, false)

    await commitDemoMutation(storage, data =>
      mutateRecordTraceabilityEvents(
        data,
        [
          {
            eventType: TRACEABILITY_EVENT_TYPES.WHOLESALER_PRE_DISPATCH_SCANNED,
            serial: targetSerial,
            shipmentId: shp3Ref,
            checkpoint: 'wholesaler_pre_dispatch',
            category: 'observation',
            outcome: 'success'
          },
          {
            eventType: TRACEABILITY_EVENT_TYPES.WHOLESALER_PRE_DISPATCH_VERIFIED,
            serial: targetSerial,
            shipmentId: shp3Ref,
            checkpoint: 'wholesaler_pre_dispatch',
            category: 'observation',
            outcome: 'success'
          }
        ],
        WHOL_ACTOR
      )
    )
    const wholDisp = await commitDemoMutation(storage, data =>
      mutateDispatchShipment(data, shp3Ref, WHOL_ACTOR, { requireQrVerification: true })
    )
    assert.equal(wholDisp.result.ok, true)

    // 7. Pharmacy receives
    await commitDemoMutation(storage, data =>
      mutateRecordTraceabilityEvents(
        data,
        [
          {
            eventType: TRACEABILITY_EVENT_TYPES.PHARMACY_RECEIVING_SCANNED,
            serial: targetSerial,
            shipmentId: shp3Ref,
            checkpoint: 'pharmacy_receiving',
            category: 'observation',
            outcome: 'success'
          },
          {
            eventType: TRACEABILITY_EVENT_TYPES.PHARMACY_RECEIVING_VERIFIED,
            serial: targetSerial,
            shipmentId: shp3Ref,
            checkpoint: 'pharmacy_receiving',
            category: 'observation',
            outcome: 'success'
          }
        ],
        PHARM_ACTOR
      )
    )
    const pharmRecv = await commitDemoMutation(storage, data =>
      mutateRecordReceivingSession(
        data,
        shp3Ref,
        { sessionDispositions: { [targetSerial]: { status: 'accepted', scanned: true } } },
        PHARM_ACTOR
      )
    )
    assert.equal(pharmRecv.result.ok, true)

    // Verify before dispense returns verified
    snap = peekPersistedDemoData(storage).data
    const inspectBeforeDispense = verifySerial(
      extractSerialFromInput(qrUrl, { allowedOrigins: [origin] }),
      snap
    )
    assert.equal(inspectBeforeDispense.state, 'verified')
    assert.equal(inspectBeforeDispense.verifyCount, 0)

    // 8. Pharmacy Verify & Dispense + duplicate dispense block
    await commitDemoMutation(storage, data =>
      mutateRecordTraceabilityEvents(
        data,
        [
          {
            eventType: TRACEABILITY_EVENT_TYPES.PHARMACY_PRE_DISPENSE_SCANNED,
            serial: targetSerial,
            shipmentId: shp3Ref,
            checkpoint: 'pharmacy_pre_dispense',
            category: 'observation',
            outcome: 'success'
          },
          {
            eventType: TRACEABILITY_EVENT_TYPES.PHARMACY_PRE_DISPENSE_VERIFIED,
            serial: targetSerial,
            shipmentId: shp3Ref,
            checkpoint: 'pharmacy_pre_dispense',
            category: 'observation',
            outcome: 'success'
          }
        ],
        PHARM_ACTOR
      )
    )

    const dispRes = await commitDemoMutation(storage, data =>
      mutateDispensePackage(data, extractSerialFromInput(qrUrl, { allowedOrigins: [origin] }), {}, PHARM_ACTOR)
    )
    assert.equal(dispRes.result.ok, true)

    const dupDispRes = await commitDemoMutation(storage, data =>
      mutateDispensePackage(data, targetSerial, {}, PHARM_ACTOR)
    )
    assert.equal(dupDispRes.result.ok, false)

    // 9. Public read-only inspection via QR URL leaves verifyCount at 0
    snap = peekPersistedDemoData(storage).data
    const readOnlyPublic = verifySerial(extractSerialFromInput(qrUrl, { allowedOrigins: [origin] }), snap)
    assert.equal(readOnlyPublic.state, 'dispensed')
    assert.equal(readOnlyPublic.verifyCount, 0)

    // 10. Explicit public verification increments verifyCount & records PUBLIC_VERIFICATION_RECORDED
    const pubVerify = await commitDemoMutation(storage, data =>
      mutateVerifyAndRecord(data, extractSerialFromInput(qrUrl, { allowedOrigins: [origin] }))
    )
    assert.equal(pubVerify.result.state, 'dispensed')
    assert.equal(pubVerify.result.verifyCount, 1)

    // 11. Assert exact chronological event log across all 5 roles
    snap = peekPersistedDemoData(storage).data
    const pkgEvents = getPackageTraceabilityEvents(snap.traceabilityEvents, targetSerial)
    assert.deepEqual(
      pkgEvents.map(e => e.eventType),
      [
        TRACEABILITY_EVENT_TYPES.MANUFACTURER_QR_VERIFICATION_FAILED,
        TRACEABILITY_EVENT_TYPES.MANUFACTURER_QR_VERIFIED,
        TRACEABILITY_EVENT_TYPES.MANUFACTURER_DISPATCHED,
        TRACEABILITY_EVENT_TYPES.DISTRIBUTOR_RECEIVING_SCANNED,
        TRACEABILITY_EVENT_TYPES.DISTRIBUTOR_RECEIVING_VERIFIED,
        TRACEABILITY_EVENT_TYPES.DISTRIBUTOR_RECEIVED,
        TRACEABILITY_EVENT_TYPES.DISTRIBUTOR_PRE_DISPATCH_SCANNED,
        TRACEABILITY_EVENT_TYPES.DISTRIBUTOR_PRE_DISPATCH_VERIFIED,
        TRACEABILITY_EVENT_TYPES.DISTRIBUTOR_DISPATCHED,
        TRACEABILITY_EVENT_TYPES.WHOLESALER_RECEIVING_SCANNED,
        TRACEABILITY_EVENT_TYPES.WHOLESALER_RECEIVING_VERIFIED,
        TRACEABILITY_EVENT_TYPES.WHOLESALER_RECEIVED,
        TRACEABILITY_EVENT_TYPES.WHOLESALER_PRE_DISPATCH_SCANNED,
        TRACEABILITY_EVENT_TYPES.WHOLESALER_PRE_DISPATCH_VERIFIED,
        TRACEABILITY_EVENT_TYPES.WHOLESALER_DISPATCHED,
        TRACEABILITY_EVENT_TYPES.PHARMACY_RECEIVING_SCANNED,
        TRACEABILITY_EVENT_TYPES.PHARMACY_RECEIVING_VERIFIED,
        TRACEABILITY_EVENT_TYPES.PHARMACY_RECEIVED,
        TRACEABILITY_EVENT_TYPES.PHARMACY_PRE_DISPENSE_SCANNED,
        TRACEABILITY_EVENT_TYPES.PHARMACY_PRE_DISPENSE_VERIFIED,
        TRACEABILITY_EVENT_TYPES.PHARMACY_DISPENSED,
        TRACEABILITY_EVENT_TYPES.PUBLIC_VERIFICATION_RECORDED
      ]
    )

    const publicEvt = pkgEvents[pkgEvents.length - 1]
    assert.equal(publicEvt.category, 'observation')
    assert.equal(publicEvt.actorRole, 'public_customer')
    assert.equal(publicEvt.actorUserId, null)
    assert.equal(publicEvt.organizationId, null)

    const mfgDispEvt = pkgEvents.find(e => e.eventType === TRACEABILITY_EVENT_TYPES.MANUFACTURER_DISPATCHED)
    assert.equal(mfgDispEvt.category, 'transaction')
    assert.equal(mfgDispEvt.actorUserId, 'u2')
    assert.equal(mfgDispEvt.organizationId, 'm1')
    assert.equal(mfgDispEvt.shipmentId, shp1Ref)
    assert.equal(mfgDispEvt.batchId, batchId)
  })
})

test('damaged quarantine, suspended orgs, concurrent lock event writes, and dispatch boundary resets behave safely', async () => {
  await withMockLocks(async () => {
    const storage = createMemoryStorage()
    savePersistedDemoData(storage, createSeedEnvelope(1, 1))
    loadPersistedDemoData(storage)

    const gen = await commitDemoMutation(storage, data =>
      mutateGenerateSerials(data, { batchId: 'b1', quantity: 2 }, MFG_ACTOR)
    )
    assert.equal(gen.result.ok, true)
    const [serialA, serialB] = gen.result.added.map(p => p.serial)

    const shp = await commitDemoMutation(storage, data =>
      mutateCreateShipment(data, { from: 'm1', to: 'd1', packageSerials: [serialA, serialB] }, MFG_ACTOR)
    )
    const shpRef = shp.result.ref

    await commitDemoMutation(storage, data =>
      mutateRecordTraceabilityEvents(
        data,
        [serialA, serialB].map(s => ({
          eventType: TRACEABILITY_EVENT_TYPES.MANUFACTURER_QR_VERIFIED,
          serial: s,
          shipmentId: shpRef,
          checkpoint: 'manufacturer_pre_dispatch',
          category: 'observation',
          outcome: 'success'
        })),
        MFG_ACTOR
      )
    )
    await commitDemoMutation(storage, data =>
      mutateDispatchShipment(data, shpRef, MFG_ACTOR, { requireQrVerification: true })
    )

    // Partial receiving: serialA damaged, serialB left missing -> damaged moves to d1 quarantine and blocks re-dispatch
    const partRecv = await commitDemoMutation(storage, data =>
      mutateRecordReceivingSession(
        data,
        shpRef,
        {
          sessionDispositions: {
            [serialA]: { status: 'damaged', reason: 'Crushed carton', scanned: true },
            [serialB]: { status: 'missing', reason: 'Short shipped', scanned: false }
          },
          unmatchedScans: ['UNKNOWN-SCAN-88']
        },
        DIST_ACTOR
      )
    )
    assert.equal(partRecv.result.ok, true)
    assert.equal(partRecv.result.shipment.status, 'partially_received')

    let snap = peekPersistedDemoData(storage).data
    const damagedEvents = getPackageTraceabilityEvents(snap.traceabilityEvents, serialA)
    const recvDamaged = damagedEvents.find(e => e.eventType === TRACEABILITY_EVENT_TYPES.DISTRIBUTOR_RECEIVED)
    assert.equal(recvDamaged.outcome, 'quarantined')
    assert.equal(recvDamaged.failureReason, 'Crushed carton')

    // After DISTRIBUTOR_RECEIVED boundary, distributor pre-dispatch check is initially false
    assert.equal(
      hasCurrentPreDispatchVerification(snap.traceabilityEvents, {
        serial: serialA,
        orgId: 'd1',
        role: 'distributor'
      }).verified,
      false
    )

    // Quarantined serialA cannot create downstream shipment
    const blockedDownstream = await commitDemoMutation(storage, data =>
      mutateCreateShipment(data, { from: 'd1', to: 'w1', packageSerials: [serialA] }, DIST_ACTOR)
    )
    assert.equal(blockedDownstream.result.ok, false)

    // Suspend d1 and confirm further mutations fail
    await commitDemoMutation(storage, data =>
      mutateUpdateOrganization(data, 'd1', { status: 'suspended' }, ADMIN_ACTOR)
    )
    const suspendedScan = await commitDemoMutation(storage, data =>
      mutateRecordTraceabilityEvents(
        data,
        {
          eventType: TRACEABILITY_EVENT_TYPES.DISTRIBUTOR_RECEIVING_SCANNED,
          serial: serialB,
          shipmentId: shpRef,
          checkpoint: 'distributor_receiving',
          category: 'observation',
          outcome: 'success'
        },
        DIST_ACTOR
      )
    )
    assert.equal(suspendedScan.result.ok, false)

    // Concurrent traceability event writes never lose events or collide evt- ids
    await commitDemoMutation(storage, data =>
      mutateUpdateOrganization(data, 'd1', { status: 'active' }, ADMIN_ACTOR)
    )
    const initialCount = peekPersistedDemoData(storage).data.traceabilityEvents.length
    await Promise.all(
      Array.from({ length: 12 }, (_, idx) =>
        commitDemoMutation(storage, data =>
          mutateRecordTraceabilityEvents(
            data,
            {
              eventType: TRACEABILITY_EVENT_TYPES.DISTRIBUTOR_RECEIVING_SCANNED,
              serial: `CONC-${idx + 1}`,
              shipmentId: shpRef,
              checkpoint: 'distributor_receiving',
              category: 'observation',
              outcome: 'unmatched'
            },
            DIST_ACTOR
          )
        )
      )
    )
    snap = peekPersistedDemoData(storage).data
    assert.equal(snap.traceabilityEvents.length, initialCount + 12)
    assert.equal(new Set(snap.traceabilityEvents.map(e => e.id)).size, snap.traceabilityEvents.length)
    assert.equal(DEMO_DATA_LOCK_NAME.length > 0, true)
  })
})
