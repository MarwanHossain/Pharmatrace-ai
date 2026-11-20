// PharmaTrace AI — Milestone M7.3 Dispatch & Custody Transfer Integration Tests
// Validates end-to-end pharmaceutical custody handoff: Manufacturer -> Distributor -> Wholesaler -> Pharmacy
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

// Test stakeholder organizations across all supply-chain tiers
const ORG_MFG_ID = `org-mfg-m73-${RUN_ID}`
const ORG_DIST_ID = `org-dist-m73-${RUN_ID}`
const ORG_WHOL_ID = `org-whol-m73-${RUN_ID}`
const ORG_PHARM_ID = `org-pharm-m73-${RUN_ID}`

const USER_MFG_ID = `usr-mfg-m73-${RUN_ID}`
const USER_DIST_ID = `usr-dist-m73-${RUN_ID}`
const USER_WHOL_ID = `usr-whol-m73-${RUN_ID}`
const USER_PHARM_ID = `usr-pharm-m73-${RUN_ID}`

const USER_MFG_EMAIL = `mfg_m73_${RUN_ID}@test.pharmatrace.org`
const USER_DIST_EMAIL = `dist_m73_${RUN_ID}@test.pharmatrace.org`
const USER_WHOL_EMAIL = `whol_m73_${RUN_ID}@test.pharmatrace.org`
const USER_PHARM_EMAIL = `pharm_m73_${RUN_ID}@test.pharmatrace.org`

const TEST_PASSWORD = 'TestPassword123!#'

let mfgToken
let distToken
let wholToken
let pharmToken

let productId
let batchId
let batchUnreleasedId
let batchExpiredId

const BATCH_NO_RELEASED = `BR73-${RUN_ID}`.toUpperCase()
const BATCH_NO_UNRELEASED = `BU73-${RUN_ID}`.toUpperCase()
const BATCH_NO_EXPIRED = `BX73-${RUN_ID}`.toUpperCase()

const SERIAL_PREFIX = `SN73-${RUN_ID.toUpperCase()}`
const serials = [
  `${SERIAL_PREFIX}-00001`,
  `${SERIAL_PREFIX}-00002`,
  `${SERIAL_PREFIX}-00003`,
  `${SERIAL_PREFIX}-00004`,
  `${SERIAL_PREFIX}-00005`
]

let createdShipmentRef = null

describe('PharmaTrace AI — M7.3 Dispatch & Custody Transfer Test Suite', () => {
  before(async () => {
    try {
      const migConn = await createMigrationConnection()
      try {
        const passwordHash = await hashPassword(TEST_PASSWORD)

      // 1. Insert 4 tier organizations
      await migConn.query(
        `INSERT INTO organizations (id, name, type, license_number, address, contact_name, contact_email, contact_phone, status)
         VALUES 
          (?, ?, 'manufacturer', ?, 'Industrial Zone A', 'Mfg Rep', ?, '01711111111', 'active'),
          (?, ?, 'distributor', ?, 'Logistics Hub B', 'Dist Rep', ?, '01722222222', 'active'),
          (?, ?, 'wholesaler', ?, 'Central Depot C', 'Whol Rep', ?, '01733333333', 'active'),
          (?, ?, 'pharmacy', ?, 'Community Care D', 'Pharm Rep', ?, '01744444444', 'active')`,
        [
          ORG_MFG_ID, `Apex Pharma ${RUN_ID}`, `LIC-MFG-${RUN_ID}`, USER_MFG_EMAIL,
          ORG_DIST_ID, `Prime Logistics ${RUN_ID}`, `LIC-DIST-${RUN_ID}`, USER_DIST_EMAIL,
          ORG_WHOL_ID, `National Wholesale ${RUN_ID}`, `LIC-WHOL-${RUN_ID}`, USER_WHOL_EMAIL,
          ORG_PHARM_ID, `Care Pharmacy ${RUN_ID}`, `LIC-PHARM-${RUN_ID}`, USER_PHARM_EMAIL
        ]
      )

      // 2. Insert users for each tier
      await migConn.query(
        `INSERT INTO users (id, org_id, name, email, password_hash, role, token_version, status, failed_login_attempts)
         VALUES 
          (?, ?, 'Mfg User', ?, ?, 'manufacturer', 1, 'active', 0),
          (?, ?, 'Dist User', ?, ?, 'distributor', 1, 'active', 0),
          (?, ?, 'Whol User', ?, ?, 'wholesaler', 1, 'active', 0),
          (?, ?, 'Pharm User', ?, ?, 'pharmacy', 1, 'active', 0)`,
        [
          USER_MFG_ID, ORG_MFG_ID, USER_MFG_EMAIL, passwordHash,
          USER_DIST_ID, ORG_DIST_ID, USER_DIST_EMAIL, passwordHash,
          USER_WHOL_ID, ORG_WHOL_ID, USER_WHOL_EMAIL, passwordHash,
          USER_PHARM_ID, ORG_PHARM_ID, USER_PHARM_EMAIL, passwordHash
        ]
      )

      // 3. Insert Product
      productId = `prod-m73-${RUN_ID}`
      await migConn.query(
        `INSERT INTO products (id, manufacturer_id, name, generic_name, dosage_form, strength, pack_size, gtin, status)
         VALUES (?, ?, 'AmoxiCare Forte', 'Amoxicillin Trihydrate', 'Capsule', '500 mg', '100 Capsules', ?, 'active')`,
        [productId, ORG_MFG_ID, TEST_VALID_GTIN]
      )

      // 4. Insert Batches: Released, Unreleased, Expired
      batchId = `batch-m73-rel-${RUN_ID}`
      batchUnreleasedId = `batch-m73-unrel-${RUN_ID}`
      batchExpiredId = `batch-m73-exp-${RUN_ID}`

      await migConn.query(
        `INSERT INTO batches (id, product_id, manufacturer_id, batch_no, mfd, exp, quantity, release_status)
         VALUES 
          (?, ?, ?, ?, '2026-01-01', '2027-12-31', 1000, 'Released'),
          (?, ?, ?, ?, '2026-01-01', '2027-12-31', 1000, 'Pending'),
          (?, ?, ?, ?, '2024-01-01', '2025-01-01', 1000, 'Released')`,
        [
          batchId, productId, ORG_MFG_ID, BATCH_NO_RELEASED,
          batchUnreleasedId, productId, ORG_MFG_ID, BATCH_NO_UNRELEASED,
          batchExpiredId, productId, ORG_MFG_ID, BATCH_NO_EXPIRED
        ]
      )

      // 5. Insert test packages
      const pkgValues = serials.map(s => [
        s,
        batchId,
        ORG_MFG_ID, // manufacturer_org_id
        ORG_MFG_ID, // initial custodian is manufacturer
        'available',
        null,
        'COMMERCIAL'
      ])

      await migConn.query(
        `INSERT INTO packages (serial, batch_id, manufacturer_org_id, custodian_org_id, status, current_shipment_ref, allocation_type)
         VALUES ?`,
        [pkgValues]
      )

      // Add one package belonging to unreleased batch
      await migConn.query(
        `INSERT INTO packages (serial, batch_id, manufacturer_org_id, custodian_org_id, status, current_shipment_ref, allocation_type)
         VALUES (?, ?, ?, ?, 'available', null, 'COMMERCIAL')`,
        [`${SERIAL_PREFIX}-UNREL`, batchUnreleasedId, ORG_MFG_ID, ORG_MFG_ID]
      )

      // Add one package belonging to expired batch
      await migConn.query(
        `INSERT INTO packages (serial, batch_id, manufacturer_org_id, custodian_org_id, status, current_shipment_ref, allocation_type)
         VALUES (?, ?, ?, ?, 'available', null, 'COMMERCIAL')`,
        [`${SERIAL_PREFIX}-EXP`, batchExpiredId, ORG_MFG_ID, ORG_MFG_ID]
      )

      // 6. Sign tokens
      mfgToken = signAccessToken({ id: USER_MFG_ID, role: 'manufacturer', orgId: ORG_MFG_ID })
      distToken = signAccessToken({ id: USER_DIST_ID, role: 'distributor', orgId: ORG_DIST_ID })
      wholToken = signAccessToken({ id: USER_WHOL_ID, role: 'wholesaler', orgId: ORG_WHOL_ID })
      pharmToken = signAccessToken({ id: USER_PHARM_ID, role: 'pharmacy', orgId: ORG_PHARM_ID })
    } finally {
      await migConn.end()
    }

    // Start HTTP test server
    await new Promise((resolve, reject) => {
      server = http.createServer(app)
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        baseUrl = `http://127.0.0.1:${addr.port}`
        resolve()
      })
      server.on('error', reject)
    })
  } catch (err) {
    console.error('BEFORE HOOK ERROR:', err)
    throw err
  }
  })

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve))
    }
    const migConn = await createMigrationConnection()
    try {
      // Clean up in reverse foreign key order
      await migConn.query(`DELETE FROM traceability_events WHERE serial LIKE ?`, [`${SERIAL_PREFIX}%`])
      await migConn.query(
        `DELETE FROM shipment_packages WHERE shipment_ref IN (SELECT ref FROM shipments WHERE from_org_id IN (?, ?, ?, ?))`,
        [ORG_MFG_ID, ORG_DIST_ID, ORG_WHOL_ID, ORG_PHARM_ID]
      )
      await migConn.query(`DELETE FROM shipments WHERE from_org_id IN (?, ?, ?, ?)`, [ORG_MFG_ID, ORG_DIST_ID, ORG_WHOL_ID, ORG_PHARM_ID])
      await migConn.query(`DELETE FROM packages WHERE serial LIKE ?`, [`${SERIAL_PREFIX}%`])
      await migConn.query(`DELETE FROM batches WHERE id IN (?, ?, ?)`, [batchId, batchUnreleasedId, batchExpiredId])
      await migConn.query(`DELETE FROM products WHERE id = ?`, [productId])
      await migConn.query(`DELETE FROM users WHERE id IN (?, ?, ?, ?)`, [USER_MFG_ID, USER_DIST_ID, USER_WHOL_ID, USER_PHARM_ID])
      await migConn.query(`DELETE FROM organizations WHERE id IN (?, ?, ?, ?)`, [ORG_MFG_ID, ORG_DIST_ID, ORG_WHOL_ID, ORG_PHARM_ID])
    } finally {
      await migConn.end()
    }
    await closeDatabasePool()
  })

  describe('1. Querying Eligible Destinations and Packages', () => {
    test('Manufacturer retrieves active distributor destinations', async () => {
      const res = await request('GET', '/api/v1/shipments/destinations', {
        headers: { Cookie: `pt_access_token=${mfgToken}` }
      })
      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.ok(Array.isArray(res.body.data))
      const target = res.body.data.find(d => d.id === ORG_DIST_ID)
      assert.ok(target, 'Distributor should be listed as eligible destination for manufacturer')
    })

    test('Manufacturer retrieves eligible packages in custody', async () => {
      const res = await request('GET', '/api/v1/shipments/eligible-packages', {
        headers: { Cookie: `pt_access_token=${mfgToken}` }
      })
      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      const eligibleSerials = res.body.data.filter(p => p.eligible).map(p => p.serial)
      const ineligibleSerials = res.body.data.filter(p => !p.eligible).map(p => p.serial)
      for (const s of serials) {
        assert.ok(eligibleSerials.includes(s), `Package ${s} should be eligible`)
      }
      assert.ok(ineligibleSerials.includes(`${SERIAL_PREFIX}-UNREL`), 'Unreleased package must be marked ineligible')
      assert.ok(ineligibleSerials.includes(`${SERIAL_PREFIX}-EXP`), 'Expired package must be marked ineligible')
    })
  })

  describe('2. Dispatch Invariants & Validation', () => {
    test('Rejects direct dispatch from Manufacturer to Pharmacy (tier violation)', async () => {
      const res = await request('POST', '/api/v1/shipments', {
        headers: { Cookie: `pt_access_token=${mfgToken}` },
        body: {
          toOrgId: ORG_PHARM_ID,
          packageSerials: [serials[0]]
        }
      })
      assert.equal(res.status, 400)
      assert.equal(res.body.success, false)
      assert.equal(res.body.error.code, 'INVALID_DESTINATION_TIER')
    })

    test('Rejects dispatch of package from unreleased batch', async () => {
      const res = await request('POST', '/api/v1/shipments', {
        headers: { Cookie: `pt_access_token=${mfgToken}` },
        body: {
          toOrgId: ORG_DIST_ID,
          packageSerials: [`${SERIAL_PREFIX}-UNREL`]
        }
      })
      assert.equal(res.status, 400)
      assert.equal(res.body.success, false)
      assert.equal(res.body.error.code, 'BATCH_NOT_RELEASED')
    })

    test('Rejects dispatch of expired package', async () => {
      const res = await request('POST', '/api/v1/shipments', {
        headers: { Cookie: `pt_access_token=${mfgToken}` },
        body: {
          toOrgId: ORG_DIST_ID,
          packageSerials: [`${SERIAL_PREFIX}-EXP`]
        }
      })
      assert.equal(res.status, 400)
      assert.equal(res.body.success, false)
      assert.equal(res.body.error.code, 'PACKAGE_EXPIRED')
    })

    test('Rejects dispatch of package not in caller custody', async () => {
      // Distributor attempts to dispatch manufacturer's package
      const res = await request('POST', '/api/v1/shipments', {
        headers: { Cookie: `pt_access_token=${distToken}` },
        body: {
          toOrgId: ORG_WHOL_ID,
          packageSerials: [serials[0]]
        }
      })
      assert.equal(res.status, 403)
      assert.equal(res.body.success, false)
      assert.equal(res.body.error.code, 'PACKAGE_NOT_IN_CUSTODY')
    })
  })

  describe('3. Manufacturer -> Distributor Dispatch', () => {
    test('Manufacturer dispatches 5 packages to Distributor', async () => {
      const res = await request('POST', '/api/v1/shipments', {
        headers: { Cookie: `pt_access_token=${mfgToken}` },
        body: {
          toOrgId: ORG_DIST_ID,
          packageSerials: serials,
          allocationScope: 'COMMERCIAL',
          notes: 'Standard distribution dispatch'
        }
      })
      assert.equal(res.status, 201)
      assert.equal(res.body.success, true)
      assert.ok(res.body.data.ref)
      assert.equal(res.body.data.packageCount, 5)
      assert.equal(res.body.data.status, 'in_transit')

      createdShipmentRef = res.body.data.ref

      // Verify MariaDB database state
      const [pkgRows] = await pool.query(
        `SELECT serial, status, current_shipment_ref FROM packages WHERE serial IN (?)`,
        [serials]
      )
      assert.equal(pkgRows.length, 5)
      for (const p of pkgRows) {
        assert.equal(p.status, 'in_transit')
        assert.equal(p.current_shipment_ref, createdShipmentRef)
      }

      // Verify traceability events
      const [events] = await pool.query(
        `SELECT serial, event_type, actor_org_id, target_org_id FROM traceability_events WHERE shipment_ref = ?`,
        [createdShipmentRef]
      )
      assert.equal(events.length, 5)
      for (const e of events) {
        assert.equal(e.event_type, 'DISPATCHED')
        assert.equal(e.actor_org_id, ORG_MFG_ID)
        assert.equal(e.target_org_id, ORG_DIST_ID)
      }
    })

    test('Prevents duplicate dispatch of in-transit packages', async () => {
      const res = await request('POST', '/api/v1/shipments', {
        headers: { Cookie: `pt_access_token=${mfgToken}` },
        body: {
          toOrgId: ORG_DIST_ID,
          packageSerials: [serials[0]]
        }
      })
      assert.equal(res.status, 400)
      assert.equal(res.body.success, false)
      assert.ok(
        res.body.error.code === 'PACKAGE_ALREADY_IN_TRANSIT' ||
        res.body.error.code === 'PACKAGE_NOT_DISPATCHABLE'
      )
    })
  })

  describe('4. Distributor Receiving & Discrepancy Reconciliation', () => {
    test('Unauthorized recipient (Wholesaler) cannot receive Distributor shipment', async () => {
      const res = await request('POST', `/api/v1/shipments/${createdShipmentRef}/receive`, {
        headers: { Cookie: `pt_access_token=${wholToken}` },
        body: {
          dispositions: [{ serial: serials[0], status: 'accepted' }]
        }
      })
      assert.equal(res.status, 403)
      assert.equal(res.body.success, false)
      assert.equal(res.body.error.code, 'UNAUTHORIZED_DESTINATION_RECIPIENT')
    })

    test('Distributor receives shipment with mixed itemized dispositions', async () => {
      // Dispositions:
      // serials[0]: accepted
      // serials[1]: accepted
      // serials[2]: damaged (quarantine)
      // serials[3]: rejected (unverified)
      // serials[4]: missing (short-shipped)
      const res = await request('POST', `/api/v1/shipments/${createdShipmentRef}/receive`, {
        headers: { Cookie: `pt_access_token=${distToken}` },
        body: {
          dispositions: [
            { serial: serials[0], status: 'accepted' },
            { serial: serials[1], status: 'accepted' },
            { serial: serials[2], status: 'damaged', reason: 'Crushed packaging carton' },
            { serial: serials[3], status: 'rejected', reason: 'Unverified physical label mismatch' },
            { serial: serials[4], status: 'missing', reason: 'Short-shipped carton on pallet' }
          ]
        }
      })
      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.equal(res.body.data.status, 'reconciliation_required')
      assert.equal(res.body.data.summary.accepted, 2)
      assert.equal(res.body.data.summary.damaged, 1)
      assert.equal(res.body.data.summary.rejected, 1)
      assert.equal(res.body.data.summary.missing, 1)

      // Verify package custody invariants in MariaDB:
      // - accepted packages transfer custody to distributor
      const [accRows] = await pool.query(
        `SELECT serial, custodian_org_id, status FROM packages WHERE serial IN (?, ?)`,
        [serials[0], serials[1]]
      )
      assert.equal(accRows.length, 2)
      for (const p of accRows) {
        assert.equal(p.custodian_org_id, ORG_DIST_ID, 'Custody should transfer to distributor')
        assert.equal(p.status, 'accepted')
      }

      // - damaged package transfers custody to distributor as quarantined
      const [dmgRows] = await pool.query(
        `SELECT serial, custodian_org_id, status FROM packages WHERE serial = ?`,
        [serials[2]]
      )
      assert.equal(dmgRows[0].custodian_org_id, ORG_DIST_ID)
      assert.equal(dmgRows[0].status, 'quarantined')

      // - rejected package remains with manufacturer
      const [rejRows] = await pool.query(
        `SELECT serial, custodian_org_id, status FROM packages WHERE serial = ?`,
        [serials[3]]
      )
      assert.equal(rejRows[0].custodian_org_id, ORG_MFG_ID, 'Custody must remain with sender')
      assert.equal(rejRows[0].status, 'rejected')

      // - missing package remains with manufacturer
      const [misRows] = await pool.query(
        `SELECT serial, custodian_org_id, status FROM packages WHERE serial = ?`,
        [serials[4]]
      )
      assert.equal(misRows[0].custodian_org_id, ORG_MFG_ID, 'Custody must remain with sender')
      assert.equal(misRows[0].status, 'missing')
    })

    test('Distributor records rejected physical return handover', async () => {
      const res = await request('POST', `/api/v1/shipments/${createdShipmentRef}/rejected-handover`, {
        headers: { Cookie: `pt_access_token=${distToken}` },
        body: {
          packageSerial: serials[3],
          reason: 'Physical handover back to manufacturer courier',
          notes: 'Signed carrier receipt #REC-991'
        }
      })
      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)

      // Verify REJECTED_HANDOVER event logged
      const [handoverEvents] = await pool.query(
        `SELECT * FROM traceability_events WHERE serial = ? AND event_type = 'REJECTED_HANDOVER'`,
        [serials[3]]
      )
      assert.ok(handoverEvents.length > 0)
    })

    test('Distributor closes reconciliation on shipment', async () => {
      const res = await request('POST', `/api/v1/shipments/${createdShipmentRef}/close-reconciliation`, {
        headers: { Cookie: `pt_access_token=${distToken}` },
        body: {
          note: 'Investigated discrepancy: credit note issued for missing package.'
        }
      })
      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.equal(res.body.data.status, 'closed')

      // Verify shipment status updated in MariaDB
      const [shipRows] = await pool.query(`SELECT status FROM shipments WHERE ref = ?`, [createdShipmentRef])
      assert.equal(shipRows[0].status, 'closed')
    })
  })

  describe('5. Downstream Transfer: Distributor -> Wholesaler -> Pharmacy', () => {
    let distShipmentRef
    let wholShipmentRef

    test('Distributor dispatches accepted package serials[0] to Wholesaler', async () => {
      const res = await request('POST', '/api/v1/shipments', {
        headers: { Cookie: `pt_access_token=${distToken}` },
        body: {
          toOrgId: ORG_WHOL_ID,
          packageSerials: [serials[0]],
          allocationScope: 'COMMERCIAL'
        }
      })
      assert.equal(res.status, 201)
      assert.equal(res.body.success, true)
      distShipmentRef = res.body.data.ref

      // Verify package is in_transit
      const [p] = await pool.query(`SELECT status, current_shipment_ref FROM packages WHERE serial = ?`, [serials[0]])
      assert.equal(p[0].status, 'in_transit')
    })

    test('Wholesaler receives shipment from Distributor with acceptance', async () => {
      const res = await request('POST', `/api/v1/shipments/${distShipmentRef}/receive`, {
        headers: { Cookie: `pt_access_token=${wholToken}` },
        body: {
          dispositions: [{ serial: serials[0], status: 'accepted' }]
        }
      })
      assert.equal(res.status, 200)
      assert.equal(res.body.data.status, 'accepted')

      // Verify custody transferred to Wholesaler
      const [p] = await pool.query(`SELECT custodian_org_id, status FROM packages WHERE serial = ?`, [serials[0]])
      assert.equal(p[0].custodian_org_id, ORG_WHOL_ID)
      assert.equal(p[0].status, 'accepted')
    })

    test('Wholesaler dispatches package serials[0] to Pharmacy', async () => {
      const res = await request('POST', '/api/v1/shipments', {
        headers: { Cookie: `pt_access_token=${wholToken}` },
        body: {
          toOrgId: ORG_PHARM_ID,
          packageSerials: [serials[0]],
          allocationScope: 'COMMERCIAL'
        }
      })
      assert.equal(res.status, 201)
      wholShipmentRef = res.body.data.ref
    })

    test('Pharmacy receives shipment from Wholesaler with acceptance', async () => {
      const res = await request('POST', `/api/v1/shipments/${wholShipmentRef}/receive`, {
        headers: { Cookie: `pt_access_token=${pharmToken}` },
        body: {
          dispositions: [{ serial: serials[0], status: 'accepted' }]
        }
      })
      assert.equal(res.status, 200)
      assert.equal(res.body.data.status, 'accepted')

      // Verify custody transferred to Pharmacy
      const [p] = await pool.query(`SELECT custodian_org_id, status FROM packages WHERE serial = ?`, [serials[0]])
      assert.equal(p[0].custodian_org_id, ORG_PHARM_ID)
      assert.equal(p[0].status, 'accepted')
    })
  })

  describe('6. Public Verification & Journey Audit Trail', () => {
    test('Public verification reflects full multi-echelon journey and masks user IDs', async () => {
      const res = await request('GET', `/api/v1/verify?serial=${serials[0]}`)
      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.equal(res.body.data.serial, serials[0])
      assert.equal(res.body.data.status, 'verified')
      assert.equal(res.body.data.disclaimer, VERIFICATION_DISCLAIMER)

      const journey = res.body.data.journey || []
      assert.ok(journey.length >= 4, `Journey should have at least 4 events, got ${journey.length}`)

      // Verify all organizations in the chain are recorded
      const orgNames = journey.map(j => j.actorOrg)
      assert.ok(orgNames.some(n => n && n.includes('Apex Pharma')), 'Manufacturer should be in journey')
      assert.ok(orgNames.some(n => n && n.includes('Prime Logistics')), 'Distributor should be in journey')
      assert.ok(orgNames.some(n => n && n.includes('National Wholesale')), 'Wholesaler should be in journey')
      assert.ok(orgNames.some(n => n && n.includes('Care Pharmacy')), 'Pharmacy should be in journey')

      // Ensure no internal user IDs leaked
      for (const event of journey) {
        assert.equal(event.actor_user_id, undefined, 'actor_user_id must be sanitized')
        assert.equal(event.actorUserId, undefined, 'actorUserId must be sanitized')
      }
    })

    test('Public verification of damaged/quarantined package serials[2] returns quarantined status', async () => {
      const res = await request('GET', `/api/v1/verify?serial=${serials[2]}`)
      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.equal(res.body.data.status, 'quarantined')
      assert.equal(res.body.data.disclaimer, VERIFICATION_DISCLAIMER)
    })
  })
})
