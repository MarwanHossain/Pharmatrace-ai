// PharmaTrace AI — Manufacturer Products & Batches API Integration Test Suite
// Conforms to Phase 6 Milestone M7.1 Specification
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
const ORG_A_ID = `org-mfg-a-${RUN_ID}`
const ORG_B_ID = `org-mfg-b-${RUN_ID}`
const USER_A_ID = `usr-mfg-a-${RUN_ID}`
const USER_B_ID = `usr-mfg-b-${RUN_ID}`
const USER_A_EMAIL = `mfg_a_${RUN_ID}@test.pharmatrace.org`
const USER_B_EMAIL = `mfg_b_${RUN_ID}@test.pharmatrace.org`
const TEST_PASSWORD = 'TestPassword123!#'

const CANONICAL_ROLES = ['admin', 'investigator', 'manufacturer', 'distributor', 'wholesaler', 'pharmacy']
const roleTokens = {}

let prodA1Id
let prodA2Id

describe('PharmaTrace AI — M7.1 Manufacturer Products & Batches Test Suite', () => {
  before(async () => {
    // 1. Seed two test manufacturer organizations and users
    const migConn = await createMigrationConnection()
    try {
      const passwordHash = await hashPassword(TEST_PASSWORD)

      // Manufacturer Org A
      await migConn.query(
        `INSERT INTO organizations (id, name, type, license_number, address, contact_name, contact_email, contact_phone, status)
         VALUES (?, ?, 'manufacturer', ?, 'Industrial Area A', 'Manager A', ?, '01711111111', 'active')`,
        [ORG_A_ID, `PharmaCorp Lab ${RUN_ID}`, `LIC-MFG-A-${RUN_ID}`, USER_A_EMAIL]
      )

      // Manufacturer Org B
      await migConn.query(
        `INSERT INTO organizations (id, name, type, license_number, address, contact_name, contact_email, contact_phone, status)
         VALUES (?, ?, 'manufacturer', ?, 'Industrial Area B', 'Manager B', ?, '01722222222', 'active')`,
        [ORG_B_ID, `Apex Therapeutics ${RUN_ID}`, `LIC-MFG-B-${RUN_ID}`, USER_B_EMAIL]
      )

      // User A (Org A)
      await migConn.query(
        `INSERT INTO users (id, org_id, name, email, password_hash, role, token_version, status, failed_login_attempts)
         VALUES (?, ?, 'Mfg User A', ?, ?, 'manufacturer', 1, 'active', 0)`,
        [USER_A_ID, ORG_A_ID, USER_A_EMAIL, passwordHash]
      )

      // User B (Org B)
      await migConn.query(
        `INSERT INTO users (id, org_id, name, email, password_hash, role, token_version, status, failed_login_attempts)
         VALUES (?, ?, 'Mfg User B', ?, ?, 'manufacturer', 1, 'active', 0)`,
        [USER_B_ID, ORG_B_ID, USER_B_EMAIL, passwordHash]
      )

      // Seed tokens for all 6 canonical roles
      for (const role of CANONICAL_ROLES) {
        const uId = `usr-test-${role}-${RUN_ID}`
        const uEmail = `test_${role}_${RUN_ID}@pharmatrace.org`
        const orgId = role === 'admin' || role === 'investigator' ? null : ORG_A_ID

        if (role !== 'manufacturer') {
          await migConn.query(
            `INSERT INTO users (id, org_id, name, email, password_hash, role, token_version, status, failed_login_attempts)
             VALUES (?, ?, ?, ?, ?, ?, 1, 'active', 0)`,
            [uId, orgId, `Test ${role}`, uEmail, passwordHash, role]
          )
        }

        roleTokens[role] = signAccessToken({
          id: role === 'manufacturer' ? USER_A_ID : uId,
          email: role === 'manufacturer' ? USER_A_EMAIL : uEmail,
          role,
          orgId,
          tokenVersion: 1
        })
      }
    } finally {
      await migConn.end()
    }

    // 2. Start HTTP server
    server = http.createServer(app)
    await new Promise(resolve => server.listen(0, resolve))
    const port = server.address().port
    baseUrl = `http://127.0.0.1:${port}`
  })

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve))
    }

    // Teardown test fixtures
    const migConn = await createMigrationConnection()
    try {
      await migConn.query('DELETE FROM batches WHERE manufacturer_id IN (?, ?)', [ORG_A_ID, ORG_B_ID])
      await migConn.query('DELETE FROM products WHERE manufacturer_id IN (?, ?)', [ORG_A_ID, ORG_B_ID])
      await migConn.query('DELETE FROM users WHERE email LIKE ?', [`%${RUN_ID}%`])
      await migConn.query('DELETE FROM organizations WHERE id IN (?, ?)', [ORG_A_ID, ORG_B_ID])
    } finally {
      await migConn.end()
    }
    await closeDatabasePool()
  })

  // =========================================================================
  // 1. Authentication & Multi-Role Authorization Controls
  // =========================================================================

  describe('1. Authentication & Multi-Role RBAC Authorization', () => {
    test('Manufacturer authenticates via /api/v1/auth/login and receives session', async () => {
      const res = await request('POST', '/api/v1/auth/login', {
        body: { email: USER_A_EMAIL, password: TEST_PASSWORD }
      })

      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.equal(res.body.user?.role, 'manufacturer')
      assert.equal(res.body.user?.orgId, ORG_A_ID)
      assert.ok(res.body.user?.orgName?.includes('PharmaCorp Lab'))

      // Cookie check
      const cookie = res.headers['set-cookie']
      assert.ok(cookie)
      assert.ok(cookie[0].includes('pt_access_token'))
    })

    test('Unauthenticated request to manufacturer endpoints is rejected (401)', async () => {
      const res = await request('GET', '/api/v1/manufacturer/products')
      assert.equal(res.status, 401)
      assert.equal(res.body.error?.code, 'AUTH_TOKEN_MISSING')
    })

    test('Non-manufacturer roles are forbidden from manufacturer endpoints (403)', async () => {
      const nonMfgRoles = ['admin', 'investigator', 'distributor', 'wholesaler', 'pharmacy']
      for (const role of nonMfgRoles) {
        const res = await request('GET', '/api/v1/manufacturer/products', {
          headers: { Cookie: `pt_access_token=${roleTokens[role]}` }
        })
        assert.equal(res.status, 403, `Role "${role}" should be forbidden`)
        assert.equal(res.body.error?.code, 'FORBIDDEN_ROLE')
      }
    })

    test('Manufacturer role is successfully authorized (200)', async () => {
      const res = await request('GET', '/api/v1/manufacturer/products', {
        headers: { Cookie: `pt_access_token=${roleTokens.manufacturer}` }
      })
      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.ok(Array.isArray(res.body.data))
    })
  })

  // =========================================================================
  // 2. Product Registration & Validation
  // =========================================================================

  describe('2. Product Registration & Validation', () => {
    test('Rejects registration with missing mandatory fields (400)', async () => {
      const invalidPayloads = [
        {},
        { name: 'Napa' },
        { name: 'Napa', generic_name: 'Paracetamol' },
        { name: 'Napa', generic_name: 'Paracetamol', strength: '500 mg' },
        { name: 'Napa', generic_name: 'Paracetamol', strength: '500 mg', dosage_form: 'Tablet' }
      ]

      for (const payload of invalidPayloads) {
        const res = await request('POST', '/api/v1/manufacturer/products', {
          headers: { Cookie: `pt_access_token=${roleTokens.manufacturer}` },
          body: payload
        })
        assert.equal(res.status, 400)
        assert.equal(res.body.success, false)
      }
    })

    test('Successfully registers product with mandatory fields and null GTIN (201)', async () => {
      const res = await request('POST', '/api/v1/manufacturer/products', {
        headers: { Cookie: `pt_access_token=${roleTokens.manufacturer}` },
        body: {
          name: 'Napa Extra',
          generic_name: 'Paracetamol + Caffeine',
          strength: '500 mg + 65 mg',
          dosage_form: 'Tablet',
          pack_size: '10 x 10'
        }
      })

      assert.equal(res.status, 201)
      assert.equal(res.body.success, true)
      assert.ok(res.body.data?.id)
      assert.equal(res.body.data.name, 'Napa Extra')
      assert.equal(res.body.data.generic_name, 'Paracetamol + Caffeine')
      assert.equal(res.body.data.gtin, null)
      assert.equal(res.body.data.status, 'active')
      assert.equal(res.body.data.manufacturer_id, ORG_A_ID)

      prodA1Id = res.body.data.id
    })

    test('Successfully registers product with valid GTIN-13 (preserving leading zeros) (201)', async () => {
      const res = await request('POST', '/api/v1/manufacturer/products', {
        headers: { Cookie: `pt_access_token=${roleTokens.manufacturer}` },
        body: {
          name: 'Ciprocin',
          generic_name: 'Ciprofloxacin',
          strength: '500 mg',
          dosage_form: 'Tablet',
          pack_size: '2 x 10',
          gtin: TEST_VALID_GTIN
        }
      })

      assert.equal(res.status, 201)
      assert.equal(res.body.data.gtin, TEST_VALID_GTIN)
      prodA2Id = res.body.data.id
    })

    test('Rejects invalid GTIN check digit (400)', async () => {
      const res = await request('POST', '/api/v1/manufacturer/products', {
        headers: { Cookie: `pt_access_token=${roleTokens.manufacturer}` },
        body: {
          name: 'Amoxil',
          generic_name: 'Amoxicillin',
          strength: '250 mg',
          dosage_form: 'Capsule',
          pack_size: '10 x 10',
          gtin: '6291041500214' // Last digit should be 3
        }
      })

      assert.equal(res.status, 400)
      assert.equal(res.body.error?.code, 'INVALID_GTIN')
      assert.match(res.body.error.message, /Invalid GS1 check digit/i)
    })

    test('Rejects duplicate GTIN (409)', async () => {
      const res = await request('POST', '/api/v1/manufacturer/products', {
        headers: { Cookie: `pt_access_token=${roleTokens.manufacturer}` },
        body: {
          name: 'Ciprocin Copy',
          generic_name: 'Ciprofloxacin',
          strength: '500 mg',
          dosage_form: 'Tablet',
          pack_size: '2 x 10',
          gtin: TEST_VALID_GTIN // Same as Ciprocin
        }
      })

      assert.equal(res.status, 409)
      assert.equal(res.body.error?.code, 'DUPLICATE_GTIN')
    })

    test('Rejects duplicate product name and strength under same manufacturer (409)', async () => {
      const res = await request('POST', '/api/v1/manufacturer/products', {
        headers: { Cookie: `pt_access_token=${roleTokens.manufacturer}` },
        body: {
          name: 'Napa Extra',
          generic_name: 'Paracetamol + Caffeine',
          strength: '500 mg + 65 mg',
          dosage_form: 'Tablet',
          pack_size: '5 x 10'
        }
      })

      assert.equal(res.status, 409)
      assert.equal(res.body.error?.code, 'DUPLICATE_PRODUCT')
    })
  })

  // =========================================================================
  // 3. Multi-Tenant Isolation & Forged ID Immunity
  // =========================================================================

  describe('3. Multi-Tenant Isolation & IDOR Immunity', () => {
    test('Client-forged manufacturer_id in request body is strictly ignored', async () => {
      // Manufacturer A attempts to create a product attributed to Manufacturer B
      const res = await request('POST', '/api/v1/manufacturer/products', {
        headers: { Cookie: `pt_access_token=${roleTokens.manufacturer}` },
        body: {
          manufacturer_id: ORG_B_ID, // Forged client input
          name: 'Secured Drug',
          generic_name: 'Safe Compound',
          strength: '100 mg',
          dosage_form: 'Capsule',
          pack_size: '1 x 10'
        }
      })

      assert.equal(res.status, 201)
      // Must belong to ORG_A_ID from authenticated session token, NOT the forged body
      assert.equal(res.body.data.manufacturer_id, ORG_A_ID)
    })

    test('Manufacturer B cannot read Manufacturer A products via list or ID (Tenant Denial)', async () => {
      const tokenB = signAccessToken({
        id: USER_B_ID,
        email: USER_B_EMAIL,
        role: 'manufacturer',
        orgId: ORG_B_ID,
        tokenVersion: 1
      })

      // List query
      const listRes = await request('GET', '/api/v1/manufacturer/products', {
        headers: { Cookie: `pt_access_token=${tokenB}` }
      })
      assert.equal(listRes.status, 200)
      assert.equal(listRes.body.data.length, 0, 'Manufacturer B should see zero products initially')

      // Direct ID lookup on Manufacturer A product
      const detailRes = await request('GET', `/api/v1/manufacturer/products/${prodA1Id}`, {
        headers: { Cookie: `pt_access_token=${tokenB}` }
      })
      assert.equal(detailRes.status, 404)
      assert.equal(detailRes.body.error?.code, 'PRODUCT_NOT_FOUND')
    })

    test('Manufacturer B cannot update or mutate Manufacturer A product (404/403)', async () => {
      const tokenB = signAccessToken({
        id: USER_B_ID,
        email: USER_B_EMAIL,
        role: 'manufacturer',
        orgId: ORG_B_ID,
        tokenVersion: 1
      })

      // Update attempt
      const putRes = await request('PUT', `/api/v1/manufacturer/products/${prodA1Id}`, {
        headers: { Cookie: `pt_access_token=${tokenB}` },
        body: { name: 'Hacked Product' }
      })
      assert.equal(putRes.status, 404)

      // Status mutation attempt
      const patchRes = await request('PATCH', `/api/v1/manufacturer/products/${prodA1Id}/status`, {
        headers: { Cookie: `pt_access_token=${tokenB}` },
        body: { status: 'discontinued' }
      })
      assert.equal(patchRes.status, 404)
    })
  })

  // =========================================================================
  // 4. Product Discontinuation & Status Lifecycle
  // =========================================================================

  describe('4. Product Discontinuation Lifecycle', () => {
    test('Manufacturer discontinues a product (status -> discontinued)', async () => {
      const res = await request('PATCH', `/api/v1/manufacturer/products/${prodA2Id}/status`, {
        headers: { Cookie: `pt_access_token=${roleTokens.manufacturer}` },
        body: { status: 'discontinued' }
      })

      assert.equal(res.status, 200)
      assert.equal(res.body.data.status, 'discontinued')
    })

    test('Rejects unrecognized status values (400 INVALID_STATUS)', async () => {
      const invalidStatuses = ['inactive', 'deleted', 'archived', '']
      for (const st of invalidStatuses) {
        const res = await request('PATCH', `/api/v1/manufacturer/products/${prodA2Id}/status`, {
          headers: { Cookie: `pt_access_token=${roleTokens.manufacturer}` },
          body: { status: st }
        })
        assert.equal(res.status, 400)
        assert.equal(res.body.error?.code, 'INVALID_STATUS')
      }
    })

    test('Manufacturer can reactivate a discontinued product (status -> active)', async () => {
      const res = await request('PATCH', `/api/v1/manufacturer/products/${prodA2Id}/status`, {
        headers: { Cookie: `pt_access_token=${roleTokens.manufacturer}` },
        body: { status: 'active' }
      })

      assert.equal(res.status, 200)
      assert.equal(res.body.data.status, 'active')
    })
  })

  // =========================================================================
  // 5. Production Batch Creation & Business Rules
  // =========================================================================

  describe('5. Production Batch Creation & Validation', () => {
    test('Rejects batch creation for non-existent product or cross-tenant product (404)', async () => {
      const res = await request('POST', '/api/v1/manufacturer/batches', {
        headers: { Cookie: `pt_access_token=${roleTokens.manufacturer}` },
        body: {
          productId: 'prod-non-existent-999',
          batchNo: 'BATCH-001',
          mfd: '2026-11-01',
          exp: '2028-11-01',
          quantity: 1000
        }
      })

      assert.equal(res.status, 404)
      assert.equal(res.body.error?.code, 'PRODUCT_NOT_FOUND')
    })

    test('Rejects batch creation for discontinued product (400 PRODUCT_DISCONTINUED)', async () => {
      // Discontinue prodA1Id first
      await request('PATCH', `/api/v1/manufacturer/products/${prodA1Id}/status`, {
        headers: { Cookie: `pt_access_token=${roleTokens.manufacturer}` },
        body: { status: 'discontinued' }
      })

      const res = await request('POST', '/api/v1/manufacturer/batches', {
        headers: { Cookie: `pt_access_token=${roleTokens.manufacturer}` },
        body: {
          productId: prodA1Id,
          batchNo: 'BATCH-DISC-01',
          mfd: '2026-11-01',
          exp: '2028-11-01',
          quantity: 500
        }
      })

      assert.equal(res.status, 400)
      assert.equal(res.body.error?.code, 'PRODUCT_DISCONTINUED')

      // Re-enable prodA1Id for subsequent tests
      await request('PATCH', `/api/v1/manufacturer/products/${prodA1Id}/status`, {
        headers: { Cookie: `pt_access_token=${roleTokens.manufacturer}` },
        body: { status: 'active' }
      })
    })

    test('Rejects future manufacturing date (400 FUTURE_MANUFACTURE_DATE)', async () => {
      const res = await request('POST', '/api/v1/manufacturer/batches', {
        headers: { Cookie: `pt_access_token=${roleTokens.manufacturer}` },
        body: {
          productId: prodA1Id,
          batchNo: 'BATCH-FUT-01',
          mfd: '2030-01-01',
          exp: '2032-01-01',
          quantity: 500
        }
      })

      assert.equal(res.status, 400)
      assert.equal(res.body.error?.code, 'FUTURE_MANUFACTURE_DATE')
    })

    test('Rejects expiry date before or equal to manufacture date (400 INVALID_EXPIRY_DATE)', async () => {
      const invalidDates = [
        { mfd: '2026-11-01', exp: '2026-11-01' }, // Equal
        { mfd: '2026-11-01', exp: '2026-10-01' }  // Before
      ]

      for (const d of invalidDates) {
        const res = await request('POST', '/api/v1/manufacturer/batches', {
          headers: { Cookie: `pt_access_token=${roleTokens.manufacturer}` },
          body: {
            productId: prodA1Id,
            batchNo: 'BATCH-EXP-01',
            mfd: d.mfd,
            exp: d.exp,
            quantity: 500
          }
        })
        assert.equal(res.status, 400)
        assert.equal(res.body.error?.code, 'INVALID_EXPIRY_DATE')
      }
    })

    test('Rejects non-positive or float batch quantity (400 INVALID_QUANTITY)', async () => {
      const invalidQtys = [0, -10, 15.5, 'abc', null]

      for (const qty of invalidQtys) {
        const res = await request('POST', '/api/v1/manufacturer/batches', {
          headers: { Cookie: `pt_access_token=${roleTokens.manufacturer}` },
          body: {
            productId: prodA1Id,
            batchNo: 'BATCH-QTY-01',
            mfd: '2026-11-01',
            exp: '2028-11-01',
            quantity: qty
          }
        })
        assert.equal(res.status, 400)
        assert.equal(res.body.error?.code, 'INVALID_QUANTITY')
      }
    })

    test('Successfully creates batch strictly in "Pending QA" status (201)', async () => {
      // Client explicitly passes release_status: 'Released' to verify server ignores it
      const res = await request('POST', '/api/v1/manufacturer/batches', {
        headers: { Cookie: `pt_access_token=${roleTokens.manufacturer}` },
        body: {
          productId: prodA1Id,
          batchNo: 'NX-2026-001',
          mfd: '2026-11-10',
          exp: '2028-11-10',
          quantity: 1000,
          release_status: 'Released' // Should be overridden by server
        }
      })

      assert.equal(res.status, 201)
      assert.equal(res.body.success, true)
      assert.ok(res.body.data?.id)
      assert.equal(res.body.data.batch_no, 'NX-2026-001')
      assert.equal(res.body.data.release_status, 'Pending QA', 'Server MUST enforce Pending QA on creation')
      assert.equal(res.body.data.quantity, 1000)
      assert.equal(res.body.data.product_name, 'Napa Extra')
      assert.equal(res.body.data.serialized_count, 0)
    })

    test('Rejects duplicate batch number under same manufacturer (409 DUPLICATE_BATCH_NO)', async () => {
      const res = await request('POST', '/api/v1/manufacturer/batches', {
        headers: { Cookie: `pt_access_token=${roleTokens.manufacturer}` },
        body: {
          productId: prodA1Id,
          batchNo: 'NX-2026-001', // Duplicate
          mfd: '2026-11-10',
          exp: '2028-11-10',
          quantity: 200
        }
      })

      assert.equal(res.status, 409)
      assert.equal(res.body.error?.code, 'DUPLICATE_BATCH_NO')
    })

    test('Lists batches with serialized counts and product details', async () => {
      const res = await request('GET', '/api/v1/manufacturer/batches', {
        headers: { Cookie: `pt_access_token=${roleTokens.manufacturer}` }
      })

      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.ok(Array.isArray(res.body.data))
      assert.ok(res.body.data.length >= 1)

      const batch = res.body.data.find(b => b.batch_no === 'NX-2026-001')
      assert.ok(batch)
      assert.equal(batch.product_name, 'Napa Extra')
      assert.equal(batch.release_status, 'Pending QA')
      assert.equal(batch.serialized_count, 0)
    })
  })
})
