// PharmaTrace AI — Milestone M7.2 Package Serialization & Verification Integration Tests
// Validates QA release, MariaDB-backed serialization engine, GS1 DataMatrix generation, and public verification
process.env.NODE_ENV = 'test'

import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import { app } from '../src/app.js'
import { getPool, closeDatabasePool } from '../src/config/database.js'
import { createMigrationConnection } from '../src/database/migrator.js'
import { hashPassword } from '../src/utils/passwords.js'
import { signAccessToken } from '../src/utils/tokens.js'
import { calculateGtinCheckDigit } from '../src/utils/gtin.js'
import { VERIFICATION_DISCLAIMER } from '../src/services/verification.service.js'

let server
let baseUrl
const pool = getPool()

function request(method, path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl)
    const headers = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'Origin': 'http://localhost:5173',
      'X-Test-Suite': 'true',
      ...options.headers
    }

    const req = http.request(
      url,
      {
        method,
        headers
      },
      res => {
        let data = ''
        res.on('data', chunk => {
          data += chunk
        })
        res.on('end', () => {
          let body = null
          try {
            body = JSON.parse(data)
          } catch {
            body = data
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body
          })
        })
      }
    )

    req.on('error', reject)

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body))
    }
    req.end()
  })
}

const RUN_ID = Date.now().toString(36)
const testGtinPayload = '629' + Math.floor(100000000 + Math.random() * 900000000).toString()
const TEST_VALID_GTIN = `${testGtinPayload}${calculateGtinCheckDigit(testGtinPayload)}`

const ORG_MFG_ID = `org-mfg-m72-${RUN_ID}`
const ORG_OTHER_ID = `org-other-m72-${RUN_ID}`
const USER_MFG_ID = `usr-mfg-m72-${RUN_ID}`
const USER_OTHER_ID = `usr-other-m72-${RUN_ID}`
const USER_MFG_EMAIL = `mfg_m72_${RUN_ID}@test.pharmatrace.org`
const USER_OTHER_EMAIL = `other_m72_${RUN_ID}@test.pharmatrace.org`
const TEST_PASSWORD = 'TestPassword123!#'

let mfgToken
let otherToken
let generatedSerials = []

let productId
let batchPendingId
let batchReleasedId
let batchExpiredId
const BATCH_NO_PENDING = `BP-${RUN_ID}`.toUpperCase()
const BATCH_NO_RELEASED = `BR-${RUN_ID}`.toUpperCase()
const BATCH_NO_EXPIRED = `BX-${RUN_ID}`.toUpperCase()

describe('PharmaTrace AI — M7.2 Package Serialization & Verification Test Suite', () => {
  before(async () => {
    // 1. Seed manufacturer org, other org, and users in isolated test database
    const migConn = await createMigrationConnection()
    try {
      const passwordHash = await hashPassword(TEST_PASSWORD)

      // Manufacturer Org
      await migConn.query(
        `INSERT INTO organizations (id, name, type, license_number, address, contact_name, contact_email, contact_phone, status)
         VALUES (?, ?, 'manufacturer', ?, 'Industrial District 7', 'QA Director', ?, '01700000001', 'active')`,
        [ORG_MFG_ID, `Pharma M72 Labs ${RUN_ID}`, `LIC-M72-${RUN_ID}`, USER_MFG_EMAIL]
      )

      // Other Org (Distributor)
      await migConn.query(
        `INSERT INTO organizations (id, name, type, license_number, address, contact_name, contact_email, contact_phone, status)
         VALUES (?, ?, 'distributor', ?, 'Logistics Hub 7', 'Logistics Lead', ?, '01700000002', 'active')`,
        [ORG_OTHER_ID, `DistCorp M72 ${RUN_ID}`, `LIC-DIST-M72-${RUN_ID}`, USER_OTHER_EMAIL]
      )

      // Manufacturer User
      await migConn.query(
        `INSERT INTO users (id, org_id, name, email, password_hash, role, token_version, status, failed_login_attempts)
         VALUES (?, ?, 'QA Lead M72', ?, ?, 'manufacturer', 1, 'active', 0)`,
        [USER_MFG_ID, ORG_MFG_ID, USER_MFG_EMAIL, passwordHash]
      )

      // Other User
      await migConn.query(
        `INSERT INTO users (id, org_id, name, email, password_hash, role, token_version, status, failed_login_attempts)
         VALUES (?, ?, 'Dist Lead M72', ?, ?, 'distributor', 1, 'active', 0)`,
        [USER_OTHER_ID, ORG_OTHER_ID, USER_OTHER_EMAIL, passwordHash]
      )

      // Product
      productId = `prod-m72-${RUN_ID}`
      await migConn.query(
        `INSERT INTO products (id, manufacturer_id, name, generic_name, dosage_form, strength, pack_size, gtin, status)
         VALUES (?, ?, 'CardioGuard XR', 'Metoprolol Succinate', 'Tablet', '50 mg', '30 Tablets', ?, 'active')`,
        [productId, ORG_MFG_ID, TEST_VALID_GTIN]
      )

      // Batch 1: Pending QA (Capacity: 10)
      batchPendingId = `batch-pending-${RUN_ID}`
      await migConn.query(
        `INSERT INTO batches (id, product_id, manufacturer_id, batch_no, mfd, exp, quantity, release_status)
         VALUES (?, ?, ?, ?, '2026-01-10', '2028-01-10', 10, 'Pending QA')`,
        [batchPendingId, productId, ORG_MFG_ID, BATCH_NO_PENDING]
      )

      // Batch 2: Released (Capacity: 5)
      batchReleasedId = `batch-released-${RUN_ID}`
      await migConn.query(
        `INSERT INTO batches (id, product_id, manufacturer_id, batch_no, mfd, exp, quantity, release_status)
         VALUES (?, ?, ?, ?, '2026-02-15', '2028-02-15', 5, 'Released')`,
        [batchReleasedId, productId, ORG_MFG_ID, BATCH_NO_RELEASED]
      )

      // Batch 3: Expired (Capacity: 10, exp in past)
      batchExpiredId = `batch-expired-${RUN_ID}`
      await migConn.query(
        `INSERT INTO batches (id, product_id, manufacturer_id, batch_no, mfd, exp, quantity, release_status)
         VALUES (?, ?, ?, ?, '2023-01-01', '2025-01-01', 10, 'Pending QA')`,
        [batchExpiredId, productId, ORG_MFG_ID, BATCH_NO_EXPIRED]
      )

      mfgToken = signAccessToken({
        id: USER_MFG_ID,
        email: USER_MFG_EMAIL,
        role: 'manufacturer',
        orgId: ORG_MFG_ID,
        tokenVersion: 1
      })

      otherToken = signAccessToken({
        id: USER_OTHER_ID,
        email: USER_OTHER_EMAIL,
        role: 'distributor',
        orgId: ORG_OTHER_ID,
        tokenVersion: 1
      })
    } finally {
      await migConn.end()
    }

    server = http.createServer(app)
    await new Promise(resolve => server.listen(0, resolve))
    const port = server.address().port
    baseUrl = `http://127.0.0.1:${port}`
  })

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve))
    }

    // Teardown test fixtures strictly scoped to test RUN_ID
    const migConn = await createMigrationConnection()
    try {
      await migConn.query(
        `DELETE te FROM traceability_events te
         JOIN packages p ON te.serial = p.serial
         WHERE p.manufacturer_org_id = ?`,
        [ORG_MFG_ID]
      )
      await migConn.query('DELETE FROM packages WHERE manufacturer_org_id = ?', [ORG_MFG_ID])
      await migConn.query('DELETE FROM batches WHERE manufacturer_id = ?', [ORG_MFG_ID])
      await migConn.query('DELETE FROM products WHERE manufacturer_id = ?', [ORG_MFG_ID])
      await migConn.query('DELETE FROM users WHERE email LIKE ?', [`%${RUN_ID}%`])
      await migConn.query('DELETE FROM organizations WHERE id IN (?, ?)', [ORG_MFG_ID, ORG_OTHER_ID])
    } finally {
      await migConn.end()
    }
    await closeDatabasePool()
  })

  // =========================================================================
  // 1. Batch QA Release Controls & State Machine
  // =========================================================================

  describe('1. Batch QA Release Controls', () => {
    test('Rejects QA release attempt without authentication', async () => {
      const res = await request('POST', `/api/v1/manufacturer/batches/${batchPendingId}/qa-release`, {
        body: { notes: 'Attempt without token' }
      })
      assert.equal(res.status, 401)
    })

    test('Rejects QA release attempt by non-manufacturer role', async () => {
      const res = await request('POST', `/api/v1/manufacturer/batches/${batchPendingId}/qa-release`, {
        headers: { Cookie: `pt_access_token=${otherToken}` },
        body: { notes: 'Unauthorized role attempt' }
      })
      assert.equal(res.status, 403)
    })

    test('Rejects QA release for an expired batch', async () => {
      const res = await request('POST', `/api/v1/manufacturer/batches/${batchExpiredId}/qa-release`, {
        headers: { Cookie: `pt_access_token=${mfgToken}` },
        body: { notes: 'Should fail due to expired date' }
      })
      assert.equal(res.status, 400)
      assert.equal(res.body.error?.code, 'BATCH_EXPIRED')
    })

    test('Successfully executes QA release for Pending QA batch with sign-off notes', async () => {
      const res = await request('POST', `/api/v1/manufacturer/batches/${batchPendingId}/qa-release`, {
        headers: { Cookie: `pt_access_token=${mfgToken}` },
        body: { notes: 'All chemical assays passed. QC Certificate #2026-991.' }
      })
      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.equal(res.body.data.release_status, 'Released')
      assert.equal(res.body.data.batch_no, BATCH_NO_PENDING)

      // Verify MariaDB persistence
      const [rows] = await pool.query('SELECT release_status FROM batches WHERE id = ?', [batchPendingId])
      assert.equal(rows[0].release_status, 'Released')
    })

    test('PATCH /release-status allows setting Quarantined or Rejected status', async () => {
      const res = await request('PATCH', `/api/v1/manufacturer/batches/${batchPendingId}/release-status`, {
        headers: { Cookie: `pt_access_token=${mfgToken}` },
        body: { status: 'Quarantined', reason: 'Packaging seal calibration check' }
      })
      assert.equal(res.status, 200)
      assert.equal(res.body.data.release_status, 'Quarantined')

      // Put it back to Released for downstream serialization tests
      const resRestore = await request('PATCH', `/api/v1/manufacturer/batches/${batchPendingId}/release-status`, {
        headers: { Cookie: `pt_access_token=${mfgToken}` },
        body: { status: 'Released', reason: 'Packaging seal calibration verified.' }
      })
      assert.equal(resRestore.status, 200)
      assert.equal(resRestore.body.data.release_status, 'Released')
    })
  })

  // =========================================================================
  // 2. Package Serialization Engine
  // =========================================================================

  describe('2. Package Serialization Engine', () => {

    test('Rejects serialization if batch is not QA released', async () => {
      // Temporarily set batch back to Pending QA
      await pool.query('UPDATE batches SET release_status = "Pending QA" WHERE id = ?', [batchPendingId])

      const res = await request('POST', `/api/v1/manufacturer/batches/${batchPendingId}/serialize`, {
        headers: { Cookie: `pt_access_token=${mfgToken}` },
        body: { quantity: 2 }
      })
      assert.equal(res.status, 400)
      assert.equal(res.body.error?.code, 'BATCH_NOT_RELEASED')

      // Restore to Released
      await pool.query('UPDATE batches SET release_status = "Released" WHERE id = ?', [batchPendingId])
    })

    test('Rejects invalid or negative serialization quantities', async () => {
      const resZero = await request('POST', `/api/v1/manufacturer/batches/${batchPendingId}/serialize`, {
        headers: { Cookie: `pt_access_token=${mfgToken}` },
        body: { quantity: 0 }
      })
      assert.equal(resZero.status, 400)

      const resFloat = await request('POST', `/api/v1/manufacturer/batches/${batchPendingId}/serialize`, {
        headers: { Cookie: `pt_access_token=${mfgToken}` },
        body: { quantity: 3.5 }
      })
      assert.equal(resFloat.status, 400)
    })

    test('Serializes packages safely with MariaDB transaction and sequence numbering', async () => {
      const res = await request('POST', `/api/v1/manufacturer/batches/${batchPendingId}/serialize`, {
        headers: { Cookie: `pt_access_token=${mfgToken}` },
        body: { quantity: 3, allocationType: 'COMMERCIAL' }
      })

      assert.equal(res.status, 201)
      assert.equal(res.body.success, true)
      assert.equal(res.body.data.packages.length, 3)
      assert.equal(res.body.data.serializedCount, 3)
      assert.equal(res.body.data.remainingCapacity, 7) // 10 total - 3 = 7

      const packages = res.body.data.packages
      generatedSerials.push(...packages.map(p => p.serial))

      // Verify serial number formatting (5-digit padded sequence)
      assert.equal(packages[0].serial, `SN-${BATCH_NO_PENDING}-00001`)
      assert.equal(packages[1].serial, `SN-${BATCH_NO_PENDING}-00002`)
      assert.equal(packages[2].serial, `SN-${BATCH_NO_PENDING}-00003`)

      // Verify GS1 DataMatrix HRI and payload
      assert.ok(packages[0].gs1DataMatrix)
      assert.ok(packages[0].gs1DataMatrix.hri.startsWith('(01)'))
      assert.ok(packages[0].gs1DataMatrix.hri.includes(`(21)${packages[0].serial}`))
      assert.ok(packages[0].gs1DataMatrix.hri.includes(`(10)${BATCH_NO_PENDING}`))

      // Verify canonical verification URL
      assert.ok(packages[0].verificationUrl.includes(`/verify?serial=${encodeURIComponent(packages[0].serial)}`))
    })

    test('Enforces batch quantity limits and prevents over-serialization', async () => {
      // Current capacity remaining: 7. Requesting 8 should be rejected
      const resExceed = await request('POST', `/api/v1/manufacturer/batches/${batchPendingId}/serialize`, {
        headers: { Cookie: `pt_access_token=${mfgToken}` },
        body: { quantity: 8 }
      })
      assert.equal(resExceed.status, 400)
      assert.equal(resExceed.body.error?.code, 'REQUESTED_QUANTITY_EXCEEDS_REMAINING')

      // Requesting exactly 7 should succeed
      const resFit = await request('POST', `/api/v1/manufacturer/batches/${batchPendingId}/serialize`, {
        headers: { Cookie: `pt_access_token=${mfgToken}` },
        body: { quantity: 7 }
      })
      assert.equal(resFit.status, 201)
      assert.equal(resFit.body.data.serializedCount, 10)
      assert.equal(resFit.body.data.remainingCapacity, 0)
      generatedSerials.push(...resFit.body.data.packages.map(p => p.serial))

      // Further serialization requests must now be rejected because batch is full
      const resFull = await request('POST', `/api/v1/manufacturer/batches/${batchPendingId}/serialize`, {
        headers: { Cookie: `pt_access_token=${mfgToken}` },
        body: { quantity: 1 }
      })
      assert.equal(resFull.status, 400)
      assert.equal(resFull.body.error?.code, 'BATCH_MAX_CAPACITY_REACHED')
    })

    test('Persists packages and PACKAGE_SERIALIZED traceability events in MariaDB', async () => {
      const [pkgRows] = await pool.query(
        'SELECT serial, batch_id, status, verify_count FROM packages WHERE batch_id = ?',
        [batchPendingId]
      )
      assert.equal(pkgRows.length, 10)
      assert.equal(pkgRows[0].status, 'available')
      assert.equal(pkgRows[0].verify_count, 0)

      const [eventRows] = await pool.query(
        'SELECT serial, event_type, actor_org_id FROM traceability_events WHERE serial = ?',
        [generatedSerials[0]]
      )
      assert.ok(eventRows.length >= 1)
      assert.equal(eventRows[0].event_type, 'PACKAGE_SERIALIZED')
      assert.equal(eventRows[0].actor_org_id, ORG_MFG_ID)
    })
  })

  // =========================================================================
  // 3. Manufacturer Package Queries & Detail Endpoints
  // =========================================================================

  describe('3. Manufacturer Package Endpoints', () => {
    test('GET /api/v1/manufacturer/packages lists packages with tenant isolation', async () => {
      const res = await request('GET', '/api/v1/manufacturer/packages', {
        headers: { Cookie: `pt_access_token=${mfgToken}` }
      })
      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.ok(Array.isArray(res.body.data))
      assert.equal(res.body.data.length, 10)

      // Other org should see 0 packages
      const resOther = await request('GET', '/api/v1/manufacturer/packages', {
        headers: { Cookie: `pt_access_token=${otherToken}` }
      })
      // Distributor role hitting manufacturer packages endpoint returns 403
      assert.equal(resOther.status, 403)
    })

    test('GET /api/v1/manufacturer/packages/:serial returns full detail with GS1 DataMatrix SVG & QR SVG', async () => {
      const targetSerial = generatedSerials[0]
      const res = await request('GET', `/api/v1/manufacturer/packages/${targetSerial}`, {
        headers: { Cookie: `pt_access_token=${mfgToken}` }
      })

      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.equal(res.body.data.serial, targetSerial)
      assert.equal(res.body.data.product_name, 'CardioGuard XR')
      assert.equal(res.body.data.batch_no, BATCH_NO_PENDING)

      // DataMatrix and QR code SVGs generated
      assert.ok(res.body.data.gs1DataMatrix?.svg?.startsWith('<svg'))
      assert.ok(res.body.data.qrCode?.svg?.startsWith('<svg'))
      assert.ok(Array.isArray(res.body.data.history))
      assert.equal(res.body.data.history[0].eventType, 'PACKAGE_SERIALIZED')
    })
  })

  // =========================================================================
  // 4. Public Verification Engine & Disclaimer
  // =========================================================================

  describe('4. Public Verification Engine (/api/v1/verify)', () => {
    test('Non-existent serial returns 404 with invalid status and disclaimer', async () => {
      const res = await request('GET', '/api/v1/verify?serial=UNKNOWN-99999')
      assert.equal(res.status, 404)
      assert.equal(res.body.success, false)
      assert.equal(res.body.data.valid, false)
      assert.equal(res.body.data.status, 'invalid')
      assert.equal(res.body.data.disclaimer, VERIFICATION_DISCLAIMER)
    })

    test('Valid serial returns 200 with registered package, product, batch and disclaimer', async () => {
      const targetSerial = generatedSerials[0]
      const res = await request('GET', `/api/v1/verify?serial=${targetSerial}`)

      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.equal(res.body.data.valid, true)
      assert.equal(res.body.data.serial, targetSerial)
      assert.equal(res.body.data.product.name, 'CardioGuard XR')
      assert.equal(res.body.data.product.strength, '50 mg')
      assert.equal(res.body.data.batch.batchNo, BATCH_NO_PENDING)
      assert.equal(res.body.data.disclaimer, VERIFICATION_DISCLAIMER)

      // Initial read-only lookup does not increment verifyCount
      assert.equal(res.body.data.verifyCount, 0)
    })

    test('Verification with record=true increments MariaDB verify_count', async () => {
      const targetSerial = generatedSerials[0]

      const resRecord1 = await request('GET', `/api/v1/verify?serial=${targetSerial}&record=true`)
      assert.equal(resRecord1.status, 200)
      assert.equal(resRecord1.body.data.verifyCount, 1)

      const resRecord2 = await request('GET', `/api/v1/verify?serial=${targetSerial}&record=true`)
      assert.equal(resRecord2.status, 200)
      assert.equal(resRecord2.body.data.verifyCount, 2)

      // Subsequent read-only inspection retains current count
      const resReadOnly = await request('GET', `/api/v1/verify?serial=${targetSerial}`)
      assert.equal(resReadOnly.status, 200)
      assert.equal(resReadOnly.body.data.verifyCount, 2)

      // Verify directly from MariaDB
      const [rows] = await pool.query('SELECT verify_count FROM packages WHERE serial = ?', [targetSerial])
      assert.equal(rows[0].verify_count, 2)
    })
  })
})
