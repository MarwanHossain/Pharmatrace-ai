// PharmaTrace AI — Milestone M9 Final System Integration & Delivery Hardening Suite
// Validates end-to-end multi-role RBAC, cross-organization data isolation, full supply-chain journey, and security invariants.
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

// 6 Canonical Role Organizations (supply-chain roles have organizations)
const ORG_MFG_A_ID = `org-m9-mfga-${RUN_ID}`
const ORG_MFG_B_ID = `org-m9-mfgb-${RUN_ID}`
const ORG_DIST_ID = `org-m9-dist-${RUN_ID}`
const ORG_WHOL_ID = `org-m9-whol-${RUN_ID}`
const ORG_PHARM_ID = `org-m9-pharm-${RUN_ID}`

// 6 Canonical Role Users
const USER_ADMIN_ID = `usr-m9-admin-${RUN_ID}`
const USER_INV_ID = `usr-m9-inv-${RUN_ID}`
const USER_MFG_A_ID = `usr-m9-mfga-${RUN_ID}`
const USER_MFG_B_ID = `usr-m9-mfgb-${RUN_ID}`
const USER_DIST_ID = `usr-m9-dist-${RUN_ID}`
const USER_WHOL_ID = `usr-m9-whol-${RUN_ID}`
const USER_PHARM_ID = `usr-m9-pharm-${RUN_ID}`

const TEST_PASSWORD = 'ValidPassword123!#'

let tokenAdmin, tokenInv, tokenMfgA, tokenMfgB, tokenDist, tokenWhol, tokenPharm

let testProductId
let testBatchPendingId
let testBatchReleasedId
const TEST_BATCH_NO = `M9-B26-${RUN_ID.toUpperCase()}`

const SERIAL_P1 = `SN-${TEST_BATCH_NO}-00001`
const SERIAL_P2 = `SN-${TEST_BATCH_NO}-00002`
const SERIAL_P3 = `SN-${TEST_BATCH_NO}-00003` // will be damaged
const SERIAL_P4 = `SN-${TEST_BATCH_NO}-00004` // will be missing

let testShipmentRefM2D
let testShipmentRefD2W
let testShipmentRefW2P

describe('PharmaTrace AI — Milestone M9 Final System Integration & Delivery Hardening Suite', () => {
  before(async () => {
    // Assert isolated test database
    assert.equal(process.env.NODE_ENV, 'test')
    assert.equal(pool.pool.config.connectionConfig.database, 'pharmatrace_ai_test')

    const migConn = await createMigrationConnection()
    try {
      assert.equal(migConn.connection.config.database, 'pharmatrace_ai_test')
      const pwdHash = await hashPassword(TEST_PASSWORD)

      // Provision organizations (only for valid supply-chain categories in category_policies)
      await migConn.query(`
        INSERT INTO organizations (id, name, type, license_number, tax_id, address, contact_name, contact_email, contact_phone, status, data_environment)
        VALUES
          (?, 'M9 Horizon Manufacturing Ltd', 'manufacturer', ?, ?, 'Gazipur', 'Mfg Lead', ?, '01700000003', 'active', 'test'),
          (?, 'M9 Rival Manufacturing Ltd', 'manufacturer', ?, ?, 'Chittagong', 'Rival Lead', ?, '01700000004', 'active', 'test'),
          (?, 'M9 Central Logistics Partner', 'distributor', ?, ?, 'Tejgaon', 'Dist Lead', ?, '01700000005', 'active', 'test'),
          (?, 'M9 Wholesale Drug Depot', 'wholesaler', ?, ?, 'Khulna', 'Whol Lead', ?, '01700000006', 'active', 'test'),
          (?, 'M9 Community Model Pharmacy', 'pharmacy', ?, ?, 'Dhanmondi', 'Pharm Lead', ?, '01700000007', 'active', 'test')
      `, [
        ORG_MFG_A_ID, `LIC-MFGA-${RUN_ID}`, `TAX-MFGA-${RUN_ID}`, `mfga_${RUN_ID}@m9.test`,
        ORG_MFG_B_ID, `LIC-MFGB-${RUN_ID}`, `TAX-MFGB-${RUN_ID}`, `mfgb_${RUN_ID}@m9.test`,
        ORG_DIST_ID, `LIC-DIST-${RUN_ID}`, `TAX-DIST-${RUN_ID}`, `dist_${RUN_ID}@m9.test`,
        ORG_WHOL_ID, `LIC-WHOL-${RUN_ID}`, `TAX-WHOL-${RUN_ID}`, `whol_${RUN_ID}@m9.test`,
        ORG_PHARM_ID, `LIC-PHARM-${RUN_ID}`, `TAX-PHARM-${RUN_ID}`, `pharm_${RUN_ID}@m9.test`
      ])

      // Provision users for each role (admin and investigator have NULL org_id)
      await migConn.query(`
        INSERT INTO users (id, org_id, name, email, password_hash, role, status, token_version)
        VALUES
          (?, NULL, 'Admin Officer', ?, ?, 'admin', 'active', 1),
          (?, NULL, 'Field Inspector', ?, ?, 'investigator', 'active', 1),
          (?, ?, 'Mfg Plant Manager', ?, ?, 'manufacturer', 'active', 1),
          (?, ?, 'Rival Plant Manager', ?, ?, 'manufacturer', 'active', 1),
          (?, ?, 'Logistics Director', ?, ?, 'distributor', 'active', 1),
          (?, ?, 'Depot Manager', ?, ?, 'wholesaler', 'active', 1),
          (?, ?, 'Licensed Pharmacist', ?, ?, 'pharmacy', 'active', 1)
      `, [
        USER_ADMIN_ID, `admin_m9_${RUN_ID}@test.org`, pwdHash,
        USER_INV_ID, `inv_m9_${RUN_ID}@test.org`, pwdHash,
        USER_MFG_A_ID, ORG_MFG_A_ID, `mfga_m9_${RUN_ID}@test.org`, pwdHash,
        USER_MFG_B_ID, ORG_MFG_B_ID, `mfgb_m9_${RUN_ID}@test.org`, pwdHash,
        USER_DIST_ID, ORG_DIST_ID, `dist_m9_${RUN_ID}@test.org`, pwdHash,
        USER_WHOL_ID, ORG_WHOL_ID, `whol_m9_${RUN_ID}@test.org`, pwdHash,
        USER_PHARM_ID, ORG_PHARM_ID, `pharm_m9_${RUN_ID}@test.org`, pwdHash
      ])
    } finally {
      await migConn.end()
    }

    // Sign live tokens for all roles
    tokenAdmin = signAccessToken({ id: USER_ADMIN_ID, email: `admin_m9_${RUN_ID}@test.org`, role: 'admin', orgId: null, tokenVersion: 1 })
    tokenInv = signAccessToken({ id: USER_INV_ID, email: `inv_m9_${RUN_ID}@test.org`, role: 'investigator', orgId: null, tokenVersion: 1 })
    tokenMfgA = signAccessToken({ id: USER_MFG_A_ID, email: `mfga_m9_${RUN_ID}@test.org`, role: 'manufacturer', orgId: ORG_MFG_A_ID, tokenVersion: 1 })
    tokenMfgB = signAccessToken({ id: USER_MFG_B_ID, email: `mfgb_m9_${RUN_ID}@test.org`, role: 'manufacturer', orgId: ORG_MFG_B_ID, tokenVersion: 1 })
    tokenDist = signAccessToken({ id: USER_DIST_ID, email: `dist_m9_${RUN_ID}@test.org`, role: 'distributor', orgId: ORG_DIST_ID, tokenVersion: 1 })
    tokenWhol = signAccessToken({ id: USER_WHOL_ID, email: `whol_m9_${RUN_ID}@test.org`, role: 'wholesaler', orgId: ORG_WHOL_ID, tokenVersion: 1 })
    tokenPharm = signAccessToken({ id: USER_PHARM_ID, email: `pharm_m9_${RUN_ID}@test.org`, role: 'pharmacy', orgId: ORG_PHARM_ID, tokenVersion: 1 })

    await new Promise((resolve, reject) => {
      server = app.listen(0, () => {
        const port = server.address().port
        baseUrl = `http://127.0.0.1:${port}`
        resolve()
      })
      server.on('error', reject)
    })
  })

  after(async () => {
    if (server) {
      await new Promise(r => server.close(r))
    }
    const migConn = await createMigrationConnection()
    try {
      // Clean up scoped M9 mutable fixtures safely
      await migConn.query("UPDATE organizations SET status = 'inactive' WHERE id IN (?, ?, ?, ?, ?)", [
        ORG_MFG_A_ID, ORG_MFG_B_ID, ORG_DIST_ID, ORG_WHOL_ID, ORG_PHARM_ID
      ])
      await migConn.query('DELETE FROM investigation_alerts WHERE package_serial LIKE ?', [`SN-${TEST_BATCH_NO}%`])
      await migConn.query('DELETE FROM traceability_events WHERE serial LIKE ?', [`SN-${TEST_BATCH_NO}%`])
      await migConn.query('DELETE FROM shipment_packages WHERE shipment_ref LIKE ?', [`SHP-%-${RUN_ID.toUpperCase()}%`])
      await migConn.query('DELETE FROM shipments WHERE from_org_id IN (?, ?, ?, ?, ?) OR to_org_id IN (?, ?, ?, ?, ?)', [
        ORG_MFG_A_ID, ORG_MFG_B_ID, ORG_DIST_ID, ORG_WHOL_ID, ORG_PHARM_ID,
        ORG_MFG_A_ID, ORG_MFG_B_ID, ORG_DIST_ID, ORG_WHOL_ID, ORG_PHARM_ID
      ])
      await migConn.query('DELETE FROM packages WHERE serial LIKE ?', [`SN-${TEST_BATCH_NO}%`])
      await migConn.query('DELETE FROM batches WHERE batch_no LIKE ?', [`${TEST_BATCH_NO}%`])
      await migConn.query('DELETE FROM products WHERE id = ?', [testProductId || ''])
    } catch {
      // Best-effort cleanup of mutable rows; immutable trigger-protected tables are preserved
    } finally {
      await migConn.end()
      await closeDatabasePool()
    }
  })

  describe('1. Six-Role RBAC & Endpoint Authorization Enforcement', () => {
    test('Admin endpoints reject non-admin roles with 403 Forbidden', async () => {
      const endpoints = ['/api/v1/admin/dashboard/summary', '/api/v1/admin/organizations', '/api/v1/admin/users']
      const nonAdminTokens = [tokenInv, tokenMfgA, tokenDist, tokenWhol, tokenPharm]

      for (const ep of endpoints) {
        for (const tok of nonAdminTokens) {
          const res = await request('GET', ep, { headers: { Cookie: `pt_access_token=${tok}` } })
          assert.equal(res.status, 403, `Expected 403 for non-admin on ${ep}`)
        }
        // Admin succeeds
        const adminRes = await request('GET', ep, { headers: { Cookie: `pt_access_token=${tokenAdmin}` } })
        assert.equal(adminRes.status, 200, `Expected 200 for admin on ${ep}`)
      }
    })

    test('Investigator endpoints reject commercial supply-chain roles with 403 Forbidden', async () => {
      const commercialTokens = [tokenMfgA, tokenDist, tokenWhol, tokenPharm]
      for (const tok of commercialTokens) {
        const res = await request('GET', '/api/v1/investigator/dashboard', {
          headers: { Cookie: `pt_access_token=${tok}` }
        })
        assert.equal(res.status, 403, 'Commercial role must be blocked from investigator dashboard')
      }
      // Investigator succeeds
      const invRes = await request('GET', '/api/v1/investigator/dashboard', {
        headers: { Cookie: `pt_access_token=${tokenInv}` }
      })
      assert.equal(invRes.status, 200)
    })

    test('Manufacturer product & batch creation rejects non-manufacturer roles with 403', async () => {
      const nonMfgTokens = [tokenAdmin, tokenInv, tokenDist, tokenWhol, tokenPharm]
      for (const tok of nonMfgTokens) {
        const res = await request('POST', '/api/v1/manufacturer/products', {
          headers: { Cookie: `pt_access_token=${tok}` },
          body: { name: 'Illegal Drug', generic_name: 'Illegal', strength: '100mg', dosage_form: 'Tablet', pack_size: '10', gtin: TEST_VALID_GTIN }
        })
        assert.equal(res.status, 403, 'Only manufacturer may create products')
      }
    })

    test('Shipment creation rejects unauthorized downstream roles (e.g. Pharmacy)', async () => {
      const res = await request('POST', '/api/v1/shipments', {
        headers: { Cookie: `pt_access_token=${tokenPharm}` },
        body: { toOrgId: ORG_DIST_ID, packageSerials: ['SN-FAKE-1'] }
      })
      assert.equal(res.status, 403, 'Pharmacy cannot dispatch shipments')
    })
  })

  describe('2. Multi-Echelon Supply-Chain Journey (Manufacturer -> Distributor -> Wholesaler -> Pharmacy)', () => {
    test('Step 1: Manufacturer registers product and batch in Pending QA state', async () => {
      // Create product
      const prodRes = await request('POST', '/api/v1/manufacturer/products', {
        headers: { Cookie: `pt_access_token=${tokenMfgA}` },
        body: {
          name: `Cipro M9 ${RUN_ID}`,
          generic_name: 'Ciprofloxacin USP',
          strength: '500 mg',
          dosage_form: 'Tablet',
          pack_size: '10 x 10 Blister Pack',
          gtin: TEST_VALID_GTIN
        }
      })
      assert.equal(prodRes.status, 201)
      testProductId = prodRes.body.data.id

      // Create batch (defaults to Pending QA)
      const batchRes = await request('POST', '/api/v1/manufacturer/batches', {
        headers: { Cookie: `pt_access_token=${tokenMfgA}` },
        body: {
          productId: testProductId,
          batchNo: TEST_BATCH_NO,
          mfd: '2026-11-01',
          exp: '2028-11-01',
          quantity: 4
        }
      })
      assert.equal(batchRes.status, 201)
      testBatchPendingId = batchRes.body.data.id
      assert.equal(batchRes.body.data.release_status, 'Pending QA')
    })

    test('Step 2: Serialization is strictly blocked while batch is Pending QA', async () => {
      const serRes = await request('POST', '/api/v1/manufacturer/packages/serialize', {
        headers: { Cookie: `pt_access_token=${tokenMfgA}` },
        body: {
          batchId: testBatchPendingId,
          quantity: 4
        }
      })
      assert.equal(serRes.status, 400)
      assert.equal(serRes.body.error.code, 'BATCH_NOT_RELEASED')
    })

    test('Step 3: Authorized QA release transition and successful package serialization', async () => {
      // Release batch
      const relRes = await request('PATCH', `/api/v1/manufacturer/batches/${testBatchPendingId}/release-status`, {
        headers: { Cookie: `pt_access_token=${tokenMfgA}` },
        body: { status: 'Released', notes: 'M9 Integration QA Sign-off passed.' }
      })
      assert.equal(relRes.status, 200)
      assert.equal(relRes.body.data.release_status, 'Released')

      // Serialize 4 packages
      const serRes = await request('POST', '/api/v1/manufacturer/packages/serialize', {
        headers: { Cookie: `pt_access_token=${tokenMfgA}` },
        body: {
          batchId: testBatchPendingId,
          quantity: 4
        }
      })
      assert.equal(serRes.status, 201)
      assert.equal(serRes.body.data.packages.length, 4)

      // Verify batch max capacity reached when trying to serialize more
      const capRes = await request('POST', '/api/v1/manufacturer/packages/serialize', {
        headers: { Cookie: `pt_access_token=${tokenMfgA}` },
        body: {
          batchId: testBatchPendingId,
          quantity: 1
        }
      })
      assert.equal(capRes.status, 400)
      assert.equal(capRes.body.error.code, 'BATCH_MAX_CAPACITY_REACHED')

      // Verify database-level duplicate serial constraint is strictly enforced
      const migConn = await createMigrationConnection()
      try {
        await assert.rejects(
          migConn.query(
            'INSERT INTO packages (serial, batch_id, manufacturer_org_id, custodian_org_id, allocation_type, status) VALUES (?, ?, ?, ?, ?, ?)',
            [SERIAL_P1, testBatchPendingId, ORG_MFG_A_ID, ORG_MFG_A_ID, 'COMMERCIAL', 'available']
          ),
          err => err.code === 'ER_DUP_ENTRY',
          'Database must reject duplicate serial insert with ER_DUP_ENTRY'
        )
      } finally {
        await migConn.end()
      }
    })

    test('Step 4: Public verification reports unshipped package held by manufacturer', async () => {
      const verifyRes = await request('GET', `/api/v1/verify?serial=${SERIAL_P1}`)
      assert.equal(verifyRes.status, 200)
      assert.equal(verifyRes.body.data.status, 'unshipped')
      assert.equal(verifyRes.body.data.custody.currentCustodianName, 'M9 Horizon Manufacturing Ltd')
      assert.ok(verifyRes.body.data.disclaimer.includes('physical'))
    })

    test('Step 5: Manufacturer dispatches shipment to Distributor', async () => {
      const shipRes = await request('POST', '/api/v1/shipments', {
        headers: { Cookie: `pt_access_token=${tokenMfgA}` },
        body: {
          toOrgId: ORG_DIST_ID,
          packageSerials: [SERIAL_P1, SERIAL_P2, SERIAL_P3, SERIAL_P4],
          notes: 'M9 Dispatch Manufacturer -> Distributor'
        }
      })
      assert.equal(shipRes.status, 201)
      testShipmentRefM2D = shipRes.body.data.ref

      // Public verification now reflects in_transit
      const verifyRes = await request('GET', `/api/v1/verify?serial=${SERIAL_P1}`)
      assert.equal(verifyRes.status, 200)
      assert.equal(verifyRes.body.data.status, 'in_transit')
    })

    test('Step 6: Distributor receives shipment with itemized dispositions (2 accepted, 1 damaged, 1 missing)', async () => {
      const recRes = await request('POST', `/api/v1/shipments/${testShipmentRefM2D}/receive`, {
        headers: { Cookie: `pt_access_token=${tokenDist}` },
        body: {
          dispositions: [
            { serial: SERIAL_P1, status: 'accepted' },
            { serial: SERIAL_P2, status: 'accepted' },
            { serial: SERIAL_P3, status: 'damaged', reason: 'Tamper seal broken during transit.' },
            { serial: SERIAL_P4, status: 'missing', reason: 'Missing carton' }
          ]
        }
      })
      assert.equal(recRes.status, 200)
      assert.equal(recRes.body.data.status, 'reconciliation_required')

      // Check Distributor Custody Inventory
      const invRes = await request('GET', '/api/v1/shipments/inventory', {
        headers: { Cookie: `pt_access_token=${tokenDist}` }
      })
      assert.equal(invRes.status, 200)
      const serialsInDist = invRes.body.data.map(p => p.serial)
      assert.ok(serialsInDist.includes(SERIAL_P1), 'P1 accepted in dist inventory')
      assert.ok(serialsInDist.includes(SERIAL_P2), 'P2 accepted in dist inventory')
      assert.ok(serialsInDist.includes(SERIAL_P3), 'P3 quarantined in dist inventory')
      assert.equal(serialsInDist.includes(SERIAL_P4), false, 'P4 missing not transferred to dist inventory')

      // Verify damaged package P3 is quarantined
      const p3Record = invRes.body.data.find(p => p.serial === SERIAL_P3)
      assert.equal(p3Record.status, 'quarantined')
    })

    test('Step 7: Distributor cannot dispatch quarantined package; dispatches eligible P1 to Wholesaler', async () => {
      // Attempting to dispatch quarantined P3 must fail
      const badShipRes = await request('POST', '/api/v1/shipments', {
        headers: { Cookie: `pt_access_token=${tokenDist}` },
        body: {
          toOrgId: ORG_WHOL_ID,
          packageSerials: [SERIAL_P3]
        }
      })
      assert.equal(badShipRes.status, 400)
      assert.ok(badShipRes.body.error.message.includes('quarantined') || badShipRes.body.error.code.includes('ELIGIBILITY'))

      // Valid dispatch of P1 to Wholesaler
      const shipRes = await request('POST', '/api/v1/shipments', {
        headers: { Cookie: `pt_access_token=${tokenDist}` },
        body: {
          toOrgId: ORG_WHOL_ID,
          packageSerials: [SERIAL_P1],
          notes: 'M9 Dispatch Distributor -> Wholesaler'
        }
      })
      assert.equal(shipRes.status, 201)
      testShipmentRefD2W = shipRes.body.data.ref
    })

    test('Step 8: Wholesaler receives P1 and dispatches P1 to Pharmacy', async () => {
      // Wholesaler accepts shipment
      const recRes = await request('POST', `/api/v1/shipments/${testShipmentRefD2W}/receive`, {
        headers: { Cookie: `pt_access_token=${tokenWhol}` },
        body: {
          dispositions: [{ serial: SERIAL_P1, status: 'accepted' }]
        }
      })
      assert.equal(recRes.status, 200)
      assert.equal(recRes.body.data.status, 'accepted')

      // Wholesaler dispatches to Pharmacy
      const shipRes = await request('POST', '/api/v1/shipments', {
        headers: { Cookie: `pt_access_token=${tokenWhol}` },
        body: {
          toOrgId: ORG_PHARM_ID,
          packageSerials: [SERIAL_P1],
          notes: 'M9 Dispatch Wholesaler -> Pharmacy'
        }
      })
      assert.equal(shipRes.status, 201)
      testShipmentRefW2P = shipRes.body.data.ref
    })

    test('Step 9: Pharmacy receives P1 and verified full journey resolves across all 4 tiers', async () => {
      // Pharmacy accepts shipment
      const recRes = await request('POST', `/api/v1/shipments/${testShipmentRefW2P}/receive`, {
        headers: { Cookie: `pt_access_token=${tokenPharm}` },
        body: {
          dispositions: [{ serial: SERIAL_P1, status: 'accepted' }]
        }
      })
      assert.equal(recRes.status, 200)
      assert.equal(recRes.body.data.status, 'accepted')

      // Pharmacy inventory now holds P1
      const pharmInv = await request('GET', '/api/v1/shipments/inventory', {
        headers: { Cookie: `pt_access_token=${tokenPharm}` }
      })
      assert.equal(pharmInv.status, 200)
      const p1InPharm = pharmInv.body.data.find(p => p.serial === SERIAL_P1)
      assert.ok(p1InPharm, 'P1 must exist in pharmacy custody inventory')
      assert.equal(p1InPharm.status, 'accepted')

      // Public verification reflects verified status with Pharmacy as current custodian
      const verifyRes = await request('GET', `/api/v1/verify?serial=${SERIAL_P1}`)
      assert.equal(verifyRes.status, 200)
      assert.equal(verifyRes.body.data.status, 'verified')
      assert.equal(verifyRes.body.data.custody.currentCustodianName, 'M9 Community Model Pharmacy')
      assert.equal(verifyRes.body.data.manufacturer.name, 'M9 Horizon Manufacturing Ltd')
      assert.equal(verifyRes.body.data.batch.batchNo, TEST_BATCH_NO)
    })

    test('Step 10: Investigator has full regulatory visibility into package journey and alert telemetry', async () => {
      // Query package timeline
      const pkgRes = await request('GET', `/api/v1/investigator/packages/${SERIAL_P1}`, {
        headers: { Cookie: `pt_access_token=${tokenInv}` }
      })
      assert.equal(pkgRes.status, 200)
      assert.equal(pkgRes.body.data.package.serial, SERIAL_P1)
      assert.ok(pkgRes.body.data.timeline.length >= 4, 'Must contain complete chronological custody handoffs')

      // Run anomaly evaluation — detects damaged discrepancy for P3
      const scanRes = await request('POST', '/api/v1/investigator/alerts/scan', {
        headers: { Cookie: `pt_access_token=${tokenInv}` }
      })
      assert.equal(scanRes.status, 200)
      assert.ok(scanRes.body.data.evaluatedRulesCount >= 5)

      // Query alerts
      const alertsRes = await request('GET', '/api/v1/investigator/alerts', {
        headers: { Cookie: `pt_access_token=${tokenInv}` }
      })
      assert.equal(alertsRes.status, 200)
      const alertsList = alertsRes.body.data?.alerts || alertsRes.body.data || []
      const p3Alert = alertsList.find(a => a.package_serial === SERIAL_P3)
      assert.ok(p3Alert, 'Damaged package P3 must generate a regulatory alert')
      assert.equal(p3Alert.alert_type, 'SHIPMENT_QUANTITY_DISCREPANCY')
    })
  })

  describe('3. Organization-Level Data Isolation & Security Invariants', () => {
    test('Manufacturer B cannot view or dispatch packages owned by Manufacturer A', async () => {
      // Mfg B querying packages should not see Mfg A packages
      const pkgRes = await request('GET', '/api/v1/manufacturer/packages', {
        headers: { Cookie: `pt_access_token=${tokenMfgB}` }
      })
      assert.equal(pkgRes.status, 200)
      const mfgBSerials = pkgRes.body.data.map(p => p.serial)
      assert.equal(mfgBSerials.includes(SERIAL_P2), false, 'Mfg B cannot see Mfg A packages')

      // Mfg B attempting to dispatch Mfg A package P2 must be rejected with 403 PACKAGE_NOT_IN_CUSTODY
      const badShipRes = await request('POST', '/api/v1/shipments', {
        headers: { Cookie: `pt_access_token=${tokenMfgB}` },
        body: {
          toOrgId: ORG_DIST_ID,
          packageSerials: [SERIAL_P2]
        }
      })
      assert.equal(badShipRes.status, 403)
      assert.equal(badShipRes.body.error.code, 'PACKAGE_NOT_IN_CUSTODY')
    })

    test('Non-recipient organization cannot receive another organization’s shipment', async () => {
      // Wholesaler attempting to receive shipment destined for Distributor must be rejected with 403
      const hijackRes = await request('POST', `/api/v1/shipments/${testShipmentRefM2D}/receive`, {
        headers: { Cookie: `pt_access_token=${tokenWhol}` },
        body: {
          dispositions: [{ serial: SERIAL_P1, status: 'accepted' }]
        }
      })
      assert.equal(hijackRes.status, 403)
      assert.equal(hijackRes.body.error.code, 'UNAUTHORIZED_DESTINATION_RECIPIENT')
    })

    test('Password change immediately increments token_version and revokes existing sessions', async () => {
      // Change password for user
      const cpRes = await request('POST', '/api/v1/auth/change-password', {
        headers: { Cookie: `pt_access_token=${tokenMfgA}` },
        body: {
          currentPassword: TEST_PASSWORD,
          newPassword: 'NewValidPassword123!#'
        }
      })
      assert.equal(cpRes.status, 200)

      // Old tokenMfgA must be immediately rejected with 401 SESSION_REVOKED
      const meRes = await request('GET', '/api/v1/auth/me', {
        headers: { Cookie: `pt_access_token=${tokenMfgA}` }
      })
      assert.equal(meRes.status, 401)
      assert.equal(meRes.body.error.code, 'SESSION_REVOKED')
    })

    test('MariaDB database engine triggers enforce immutability on investigation evidence and audit logs', async () => {
      const migConn = await createMigrationConnection()
      try {
        // Create test case
        const caseId = `case-m9-${RUN_ID}`
        await migConn.query(`
          INSERT INTO investigation_cases (id, case_number, title, package_serial, created_by_user_id)
          VALUES (?, ?, 'M9 Case Test', NULL, ?)
        `, [caseId, `INV-M9-${RUN_ID.toUpperCase()}`, USER_INV_ID])

        // Create test evidence
        const evId = `ev-m9-${RUN_ID}`
        await migConn.query(`
          INSERT INTO investigation_evidence (id, case_id, evidence_type, description, source_ref, recorded_by_user_id)
          VALUES (?, ?, 'verified_fact', 'Valid inspection note', 'Physical Check Reference', ?)
        `, [evId, caseId, USER_INV_ID])

        // Direct UPDATE on evidence must be rejected by trigger
        await assert.rejects(
          migConn.query('UPDATE investigation_evidence SET description = ? WHERE id = ?', ['Tampered', evId]),
          err => err.sqlState === '45000',
          'Database trigger must reject UPDATE on investigation_evidence with SQLSTATE 45000'
        )

        // Direct DELETE on evidence must be rejected by trigger
        await assert.rejects(
          migConn.query('DELETE FROM investigation_evidence WHERE id = ?', [evId]),
          err => err.sqlState === '45000',
          'Database trigger must reject DELETE on investigation_evidence with SQLSTATE 45000'
        )

        // Direct DELETE on parent case must be rejected by trigger
        await assert.rejects(
          migConn.query('DELETE FROM investigation_cases WHERE id = ?', [caseId]),
          err => err.sqlState === '45000',
          'Database trigger must reject DELETE on investigation_cases with SQLSTATE 45000'
        )
      } finally {
        await migConn.end()
      }
    })
  })
})
