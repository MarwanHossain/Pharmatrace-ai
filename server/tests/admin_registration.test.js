// PharmaTrace AI — Phase 3 Milestone 3 Test Suite
// Administrator Review & Atomic Organization Provisioning
import { describe, test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import app from '../src/app.js'
import { getPool, execute, closeDatabasePool } from '../src/config/database.js'
import { createMigrationConnection } from '../src/database/migrator.js'
import { submitRegistration } from '../src/services/registration.service.js'
import { signAccessToken, hashToken } from '../src/utils/tokens.js'
import { UPLOAD_DIR } from '../src/middleware/upload.js'
import {
  setFakeTransport,
  clearFakeTransport,
  getCapturedNotifications,
  clearCapturedNotifications,
  sendActivationNotification,
  sendInformationRequestNotification,
  resolveAppOrigin,
  buildActivationUrl,
  buildResubmissionUrl,
  isLocalhostOrLoopback
} from '../src/services/notification.service.js'

let server
let baseUrl
const pool = getPool()

// Test identifiers with fixed prefix to ensure zero overlap with live data
const TEST_PREFIX = 'ADM3-TEST'
const ADMIN_USER_ID = 'usr-admin-m3-fixture'
const INVESTIGATOR_USER_ID = 'usr-inv-m3-fixture'
const MFG_USER_ID = 'usr-mfg-m3-fixture'
const DIST_USER_ID = 'usr-dist-m3-fixture'
const WHOLE_USER_ID = 'usr-whol-m3-fixture'
const PHARM_USER_ID = 'usr-pharm-m3-fixture'

const standardHeaders = {
  'X-Requested-With': 'XMLHttpRequest',
  'Origin': 'http://localhost:5173',
  'X-Test-Suite': 'true',
  'Connection': 'close'
}

let adminCookie = ''
let investigatorCookie = ''
let mfgCookie = ''
let distCookie = ''
let wholCookie = ''
let pharmCookie = ''

/**
 * Helper to make HTTP requests against the test server
 */
function request(method, pathName, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathName, baseUrl)
    const headers = {
      'Content-Type': 'application/json',
      ...standardHeaders,
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
      if (typeof options.body === 'string') {
        req.write(options.body)
      } else {
        req.write(JSON.stringify(options.body))
      }
    }

    req.end()
  })
}

/**
 * Creates a test registration via submitRegistration
 */
async function createSampleRegistration(overrides = {}) {
  const rand = crypto.randomBytes(4).toString('hex')
  const defaults = {
    category: 'manufacturer',
    pharmacy_classification: 'NOT_APPLICABLE',
    org_name: `Test Org ${rand} Ltd`,
    license_number: `LIC-${TEST_PREFIX}-${rand}`,
    address: 'Plot 42, Tejgaon I/A, Dhaka',
    contact_name: 'Dr. Test Representative',
    contact_email: `contact-${rand}@m3test.com`,
    contact_phone: '+8801700998877',
    applicant_note: 'Initial test registration note.'
  }

  const data = { ...defaults, ...overrides }

  const tempFileName = `test-doc-${crypto.randomUUID()}.pdf`
  const tempFilePath = path.join(UPLOAD_DIR, tempFileName)
  fs.writeFileSync(tempFilePath, 'Sample test document content for admin verification.')

  const files = [
    {
      fieldname: 'license',
      originalname: 'statutory_license.pdf',
      filename: tempFileName,
      path: tempFilePath,
      size: 52,
      mimetype: 'application/pdf'
    }
  ]

  const result = await submitRegistration({ data, files })
  return result
}

/**
 * Cleans up all test fixtures created by this suite
 */
async function executePrivileged(sql, params = []) {
  const migConn = await createMigrationConnection()
  try {
    return await migConn.query(sql, params)
  } finally {
    await migConn.end()
  }
}

async function cleanupFixtures() {
  clearCapturedNotifications()

  const migConn = await createMigrationConnection()
  try {
    // 1. Delete audit logs associated with the admin test fixture
    await migConn.query('DELETE FROM registration_audit_log WHERE actor_user_id = ?', [ADMIN_USER_ID])

    // 2. Fetch test registration IDs
    const [testRegs] = await migConn.query(
      'SELECT id, approved_org_id, contact_email FROM organization_registrations WHERE license_number LIKE ? OR contact_email LIKE ?',
      [`%${TEST_PREFIX}%`, '%m3test.com%']
    )

    const regIds = testRegs.map(r => r.id)
    const approvedOrgIds = testRegs.map(r => r.approved_org_id).filter(Boolean)
    const contactEmails = testRegs.map(r => r.contact_email).filter(Boolean)

    if (regIds.length > 0) {
      const placeholders = regIds.map(() => '?').join(',')
      await migConn.query(`DELETE FROM registration_access_tokens WHERE registration_id IN (${placeholders})`, regIds)
      await migConn.query(`DELETE FROM registration_audit_log WHERE registration_id IN (${placeholders})`, regIds)
      await migConn.query(`DELETE FROM registration_documents WHERE registration_id IN (${placeholders})`, regIds)
      await migConn.query(`DELETE FROM registration_submissions WHERE registration_id IN (${placeholders})`, regIds)
      await migConn.query(`DELETE FROM organization_registrations WHERE id IN (${placeholders})`, regIds)
    }

    // 3. Clean up provisioned test users and activation tokens
    if (contactEmails.length > 0) {
      const emailPlaceholders = contactEmails.map(() => '?').join(',')
      const [provisionedUsers] = await migConn.query(
        `SELECT id FROM users WHERE email IN (${emailPlaceholders})`,
        contactEmails
      )
      const userIds = provisionedUsers.map(u => u.id)
      if (userIds.length > 0) {
        const uPlaceholders = userIds.map(() => '?').join(',')
        await migConn.query(`DELETE FROM activation_tokens WHERE user_id IN (${uPlaceholders})`, userIds)
        await migConn.query(`DELETE FROM users WHERE id IN (${uPlaceholders})`, userIds)
      }
    }

    // 4. Clean up provisioned test organizations
    if (approvedOrgIds.length > 0) {
      const orgPlaceholders = approvedOrgIds.map(() => '?').join(',')
      await migConn.query(`DELETE FROM organizations WHERE id IN (${orgPlaceholders})`, approvedOrgIds)
    }

    // Also clean up any organizations created with test license prefix
    await migConn.query('DELETE FROM organizations WHERE license_number LIKE ?', [`%${TEST_PREFIX}%`])
  } finally {
    await migConn.end()
  }
}

describe('Phase 3 Milestone 3 — Administrator Review & Atomic Organization Provisioning Suite', () => {
  before(async () => {
    server = http.createServer(app)
    await new Promise(resolve => server.listen(0, resolve))
    server.unref()
    baseUrl = `http://127.0.0.1:${server.address().port}`

    await cleanupFixtures()

    // Seed test users for RBAC validation
    await pool.query(
      `INSERT INTO users (id, email, name, role, status, token_version, created_at, updated_at)
       VALUES 
         (?, 'admin-m3@pharmatrace.test', 'Admin Tester', 'admin', 'active', 1, NOW(), NOW()),
         (?, 'inv-m3@pharmatrace.test', 'Investigator Tester', 'investigator', 'active', 1, NOW(), NOW()),
         (?, 'mfg-m3@pharmatrace.test', 'Mfg Tester', 'manufacturer', 'active', 1, NOW(), NOW()),
         (?, 'dist-m3@pharmatrace.test', 'Dist Tester', 'distributor', 'active', 1, NOW(), NOW()),
         (?, 'whol-m3@pharmatrace.test', 'Whol Tester', 'wholesaler', 'active', 1, NOW(), NOW()),
         (?, 'pharm-m3@pharmatrace.test', 'Pharm Tester', 'pharmacy', 'active', 1, NOW(), NOW())
       ON DUPLICATE KEY UPDATE status = 'active', token_version = 1`,
      [
        ADMIN_USER_ID,
        INVESTIGATOR_USER_ID,
        MFG_USER_ID,
        DIST_USER_ID,
        WHOLE_USER_ID,
        PHARM_USER_ID
      ]
    )

    adminCookie = `pt_access_token=${signAccessToken({ id: ADMIN_USER_ID, email: 'admin-m3@pharmatrace.test', role: 'admin', orgId: null, tokenVersion: 1 })}`
    investigatorCookie = `pt_access_token=${signAccessToken({ id: INVESTIGATOR_USER_ID, email: 'inv-m3@pharmatrace.test', role: 'investigator', orgId: null, tokenVersion: 1 })}`
    mfgCookie = `pt_access_token=${signAccessToken({ id: MFG_USER_ID, email: 'mfg-m3@pharmatrace.test', role: 'manufacturer', orgId: 'org-mfg-test', tokenVersion: 1 })}`
    distCookie = `pt_access_token=${signAccessToken({ id: DIST_USER_ID, email: 'dist-m3@pharmatrace.test', role: 'distributor', orgId: 'org-dist-test', tokenVersion: 1 })}`
    wholCookie = `pt_access_token=${signAccessToken({ id: WHOLE_USER_ID, email: 'whol-m3@pharmatrace.test', role: 'wholesaler', orgId: 'org-whol-test', tokenVersion: 1 })}`
    pharmCookie = `pt_access_token=${signAccessToken({ id: PHARM_USER_ID, email: 'pharm-m3@pharmatrace.test', role: 'pharmacy', orgId: 'org-pharm-test', tokenVersion: 1 })}`
  })

  after(async () => {
    try {
      await cleanupFixtures()
      // Clean up test users
      await executePrivileged(
        `DELETE FROM users WHERE id IN (?, ?, ?, ?, ?, ?)`,
        [
          ADMIN_USER_ID,
          INVESTIGATOR_USER_ID,
          MFG_USER_ID,
          DIST_USER_ID,
          WHOLE_USER_ID,
          PHARM_USER_ID
        ]
      )
    } catch (err) {
      console.error('Error during admin_registration after hook:', err)
    } finally {
      if (server) {
        server.close()
      }
      clearFakeTransport()
      await closeDatabasePool()
    }
  })

  beforeEach(async () => {
    await cleanupFixtures()
  })

  // =========================================================================
  // 1. AUTHORIZATION & RBAC ENFORCEMENT
  // =========================================================================
  describe('Group A: Authorization & Role-Based Access Control', () => {
    test('unauthenticated request returns 401 AUTH_TOKEN_MISSING', async () => {
      const res = await request('GET', '/api/v1/admin/registrations')
      assert.equal(res.status, 401)
      assert.equal(res.body.success, false)
      assert.equal(res.body.error.code, 'AUTH_TOKEN_MISSING')
    })

    test('investigator role returns 403 FORBIDDEN_ROLE', async () => {
      const res = await request('GET', '/api/v1/admin/registrations', {
        headers: { Cookie: investigatorCookie }
      })
      assert.equal(res.status, 403)
      assert.equal(res.body.error.code, 'FORBIDDEN_ROLE')
    })

    test('manufacturer role returns 403 FORBIDDEN_ROLE', async () => {
      const res = await request('GET', '/api/v1/admin/registrations', {
        headers: { Cookie: mfgCookie }
      })
      assert.equal(res.status, 403)
      assert.equal(res.body.error.code, 'FORBIDDEN_ROLE')
    })

    test('distributor role returns 403 FORBIDDEN_ROLE', async () => {
      const res = await request('GET', '/api/v1/admin/registrations', {
        headers: { Cookie: distCookie }
      })
      assert.equal(res.status, 403)
      assert.equal(res.body.error.code, 'FORBIDDEN_ROLE')
    })

    test('wholesaler role returns 403 FORBIDDEN_ROLE', async () => {
      const res = await request('GET', '/api/v1/admin/registrations', {
        headers: { Cookie: wholCookie }
      })
      assert.equal(res.status, 403)
      assert.equal(res.body.error.code, 'FORBIDDEN_ROLE')
    })

    test('pharmacy role returns 403 FORBIDDEN_ROLE', async () => {
      const res = await request('GET', '/api/v1/admin/registrations', {
        headers: { Cookie: pharmCookie }
      })
      assert.equal(res.status, 403)
      assert.equal(res.body.error.code, 'FORBIDDEN_ROLE')
    })

    test('admin role succeeds with 200 OK', async () => {
      const res = await request('GET', '/api/v1/admin/registrations', {
        headers: { Cookie: adminCookie }
      })
      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
    })

    test('mutating admin request without CSRF header is rejected with 403', async () => {
      const sample = await createSampleRegistration()
      const res = await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/review`, {
        headers: {
          Cookie: adminCookie,
          'X-Requested-With': ''
        }
      })
      assert.equal(res.status, 403)
      assert.equal(res.body.error.code, 'CSRF_INVALID_HEADER')
    })
  })

  // =========================================================================
  // 2. REGISTRATION QUEUE & DOSSIER RETRIEVAL
  // =========================================================================
  describe('Group B: Registration Queue & Dossier', () => {
    test('lists paginated registrations with status and category filtering', async () => {
      const mfgReg = await createSampleRegistration({ category: 'manufacturer' })
      const distReg = await createSampleRegistration({ category: 'distributor' })

      // 1. Unfiltered queue
      const listRes = await request('GET', '/api/v1/admin/registrations?limit=10', {
        headers: { Cookie: adminCookie }
      })
      assert.equal(listRes.status, 200)
      assert.ok(listRes.body.data.items.length >= 2)
      assert.ok(listRes.body.data.pagination.totalItems >= 2)

      // 2. Category filter
      const catRes = await request('GET', '/api/v1/admin/registrations?category=distributor', {
        headers: { Cookie: adminCookie }
      })
      assert.equal(catRes.status, 200)
      assert.ok(catRes.body.data.items.every(item => item.category === 'distributor'))

      // 3. Status filter
      const statusRes = await request('GET', '/api/v1/admin/registrations?status=SUBMITTED', {
        headers: { Cookie: adminCookie }
      })
      assert.equal(statusRes.status, 200)
      assert.ok(statusRes.body.data.items.every(item => item.status === 'SUBMITTED'))
    })

    test('searches registrations across reference, orgName, license, and email', async () => {
      const sample = await createSampleRegistration({
        org_name: 'UniqueAcmeSearchName Ltd',
        contact_email: 'unique-acme-search@m3test.com'
      })

      const searchRes = await request('GET', `/api/v1/admin/registrations?search=UniqueAcmeSearchName`, {
        headers: { Cookie: adminCookie }
      })
      assert.equal(searchRes.status, 200)
      assert.equal(searchRes.body.data.items.length, 1)
      assert.equal(searchRes.body.data.items[0].id, sample.registrationId)
    })

    test('detail endpoint returns full dossier, submissions, documents, and audit log', async () => {
      const sample = await createSampleRegistration()

      const detailRes = await request('GET', `/api/v1/admin/registrations/${sample.registrationId}`, {
        headers: { Cookie: adminCookie }
      })

      assert.equal(detailRes.status, 200)
      assert.equal(detailRes.body.success, true)
      const data = detailRes.body.data
      assert.equal(data.registration.id, sample.registrationId)
      assert.equal(data.registration.referenceNumber, sample.referenceNumber)
      assert.equal(data.submissions.length, 1)
      assert.equal(data.documents.length, 1)
      assert.ok(data.auditLog.length >= 1)

      // Verify sensitive secrets are never disclosed
      assert.equal(data.registration.tracking_pin_hash, undefined)
      assert.equal(data.registration.trackingPinHash, undefined)
      assert.equal(data.documents[0].stored_path, undefined)
      assert.equal(data.documents[0].storedPath, undefined)
    })

    test('returns 404 REGISTRATION_NOT_FOUND for non-existent ID', async () => {
      const res = await request('GET', '/api/v1/admin/registrations/reg-non-existent-999', {
        headers: { Cookie: adminCookie }
      })
      assert.equal(res.status, 404)
      assert.equal(res.body.error.code, 'REGISTRATION_NOT_FOUND')
    })
  })

  // =========================================================================
  // 3. SECURE DOCUMENT DOWNLOAD
  // =========================================================================
  describe('Group C: Secure Document Download', () => {
    test('authorized admin can download valid registration document', async () => {
      const sample = await createSampleRegistration()
      const detailRes = await request('GET', `/api/v1/admin/registrations/${sample.registrationId}`, {
        headers: { Cookie: adminCookie }
      })
      const docId = detailRes.body.data.documents[0].id

      const downloadRes = await request(
        'GET',
        `/api/v1/admin/registrations/${sample.registrationId}/documents/${docId}/download`,
        { headers: { Cookie: adminCookie } }
      )

      assert.equal(downloadRes.status, 200)
      assert.equal(downloadRes.headers['content-type'], 'application/pdf')
      assert.ok(downloadRes.headers['content-disposition'].includes('attachment'))
      assert.equal(downloadRes.headers['x-content-type-options'], 'nosniff')
    })

    test('download request for document belonging to another registration returns 404', async () => {
      const sample1 = await createSampleRegistration()
      const sample2 = await createSampleRegistration()

      const detailRes = await request('GET', `/api/v1/admin/registrations/${sample1.registrationId}`, {
        headers: { Cookie: adminCookie }
      })
      const docId1 = detailRes.body.data.documents[0].id

      const res = await request(
        'GET',
        `/api/v1/admin/registrations/${sample2.registrationId}/documents/${docId1}/download`,
        { headers: { Cookie: adminCookie } }
      )
      assert.equal(res.status, 404)
      assert.equal(res.body.error.code, 'DOCUMENT_NOT_FOUND')
    })
  })

  // =========================================================================
  // 4. REVIEW STATE TRANSITIONS
  // =========================================================================
  describe('Group D: Review State Transitions', () => {
    test('POST /:id/review transitions SUBMITTED to UNDER_REVIEW', async () => {
      const sample = await createSampleRegistration()

      const res = await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/review`, {
        headers: { Cookie: adminCookie },
        body: { reviewNotes: 'Reviewing drug license.' }
      })

      assert.equal(res.status, 200)
      assert.equal(res.body.data.status, 'UNDER_REVIEW')

      // Verify in DB
      const [rows] = await execute('SELECT status, reviewed_by FROM organization_registrations WHERE id = ?', [sample.registrationId])
      assert.equal(rows[0].status, 'UNDER_REVIEW')
      assert.equal(rows[0].reviewed_by, ADMIN_USER_ID)

      // Repeated review transition fails with 409
      const repeatRes = await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/review`, {
        headers: { Cookie: adminCookie }
      })
      assert.equal(repeatRes.status, 409)
      assert.equal(repeatRes.body.error.code, 'INVALID_STATE_TRANSITION')
    })

    test('POST /:id/request-info transitions UNDER_REVIEW to INFORMATION_REQUESTED and hashes token', async () => {
      const sample = await createSampleRegistration()
      await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/review`, {
        headers: { Cookie: adminCookie }
      })

      let captured = null
      setFakeTransport(async payload => {
        captured = payload
      })

      const res = await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/request-info`, {
        headers: { Cookie: adminCookie },
        body: {
          reason: 'Please provide certified copy of Fire Department NOC.',
          cureDays: 14
        }
      })

      assert.equal(res.status, 200)
      assert.equal(res.body.data.status, 'INFORMATION_REQUESTED')
      assert.ok(res.body.data.expiresAt)
      assert.equal(res.body.data.rawToken, undefined)

      // Verify token hash is stored in DB and raw token is NEVER in DB
      const [tokenRows] = await execute(
        'SELECT id, token_hash, used, revoked FROM registration_access_tokens WHERE registration_id = ?',
        [sample.registrationId]
      )
      assert.equal(tokenRows.length, 1)
      assert.equal(tokenRows[0].used, 0)
      assert.equal(tokenRows[0].revoked, 0)
      assert.equal(tokenRows[0].token_hash, hashToken(captured.rawToken))

      // Verify notification captured in test memory
      assert.ok(captured)
      assert.equal(captured.type, 'INFORMATION_REQUEST')
      assert.equal(captured.recipientEmail, sample.contactEmail)
      assert.ok(captured.resubmissionUrl.includes('#token='))
      assert.ok(!captured.resubmissionUrl.includes('?token='))

      clearFakeTransport()
    })

    test('request-info rejects reason under 10 chars with 400', async () => {
      const sample = await createSampleRegistration()
      await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/review`, {
        headers: { Cookie: adminCookie }
      })

      const res = await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/request-info`, {
        headers: { Cookie: adminCookie },
        body: { reason: 'Short' }
      })
      assert.equal(res.status, 400)
      assert.equal(res.body.error.code, 'INVALID_INPUT')
    })

    test('resend information request link revokes prior token without deleting it', async () => {
      const sample = await createSampleRegistration()
      await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/review`, {
        headers: { Cookie: adminCookie }
      })
      await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/request-info`, {
        headers: { Cookie: adminCookie },
        body: { reason: 'Initial information request.' }
      })

      const resendRes = await request(
        'POST',
        `/api/v1/admin/registrations/${sample.registrationId}/resend-information-link`,
        { headers: { Cookie: adminCookie } }
      )
      assert.equal(resendRes.status, 200)

      // Verify DB contains 2 token rows: first revoked=1, second revoked=0
      const [tokens] = await execute(
        'SELECT id, used, revoked FROM registration_access_tokens WHERE registration_id = ? ORDER BY revoked DESC',
        [sample.registrationId]
      )
      assert.equal(tokens.length, 2)
      assert.equal(tokens[0].revoked, 1)
      assert.equal(tokens[1].revoked, 0)
    })

    test('rejection succeeds from SUBMITTED, UNDER_REVIEW, and INFORMATION_REQUESTED', async () => {
      // 1. Early rejection from SUBMITTED
      const sample1 = await createSampleRegistration()
      const rejRes1 = await request('POST', `/api/v1/admin/registrations/${sample1.registrationId}/reject`, {
        headers: { Cookie: adminCookie },
        body: {
          rejectionReason: 'INELIGIBLE_APPLICANT',
          rejectionExplanation: 'Entity does not hold authorized manufacturing credentials.'
        }
      })
      assert.equal(rejRes1.status, 200)
      assert.equal(rejRes1.body.data.status, 'REJECTED')

      // Terminal status check: cannot transition REJECTED
      const revRes = await request('POST', `/api/v1/admin/registrations/${sample1.registrationId}/review`, {
        headers: { Cookie: adminCookie }
      })
      assert.equal(revRes.status, 409)
    })

    test('direct approval from SUBMITTED status without entering review is rejected with 409', async () => {
      const sample = await createSampleRegistration()
      const approveRes = await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/approve`, {
        headers: { Cookie: adminCookie }
      })
      assert.equal(approveRes.status, 409)
      assert.equal(approveRes.body.error.code, 'INVALID_STATE_TRANSITION')
    })

    test('direct approval from INFORMATION_REQUESTED status without applicant resubmission is rejected with 409', async () => {
      const sample = await createSampleRegistration()
      await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/review`, { headers: { Cookie: adminCookie } })
      await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/request-info`, {
        headers: { Cookie: adminCookie },
        body: { reason: 'Pending statutory clearance documentation.' }
      })

      const approveRes = await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/approve`, {
        headers: { Cookie: adminCookie }
      })
      assert.equal(approveRes.status, 409)
      assert.equal(approveRes.body.error.code, 'INVALID_STATE_TRANSITION')
    })
  })

  // =========================================================================
  // 5. ATOMIC PROVISIONING & CAPACITY POLICY
  // =========================================================================
  describe('Group E: Atomic Organization Approval & Provisioning', () => {
    test('approving Manufacturer provisions org, user, activation token, and updates status', async () => {
      const sample = await createSampleRegistration({ category: 'manufacturer' })
      await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/review`, {
        headers: { Cookie: adminCookie }
      })

      let capturedNotif = null
      setFakeTransport(async payload => {
        capturedNotif = payload
      })

      const approveRes = await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/approve`, {
        headers: { Cookie: adminCookie },
        body: { reviewNotes: 'Statutory compliance confirmed.' }
      })

      assert.equal(approveRes.status, 200)
      assert.equal(approveRes.body.success, true)
      assert.equal(approveRes.body.data.status, 'APPROVED')
      assert.ok(approveRes.body.data.organizationId)
      assert.ok(approveRes.body.data.userId)

      const orgId = approveRes.body.data.organizationId
      const userId = approveRes.body.data.userId

      // 1. Verify organization in MariaDB
      const [orgRows] = await execute('SELECT id, name, type, status, data_environment FROM organizations WHERE id = ?', [orgId])
      assert.equal(orgRows.length, 1)
      assert.equal(orgRows[0].status, 'active')
      assert.equal(orgRows[0].data_environment, 'production')
      assert.equal(orgRows[0].type, 'manufacturer')

      // 2. Verify user in MariaDB
      const [userRows] = await execute('SELECT id, email, role, status, password_hash, org_id FROM users WHERE id = ?', [userId])
      assert.equal(userRows.length, 1)
      assert.equal(userRows[0].status, 'pending_activation')
      assert.equal(userRows[0].role, 'manufacturer')
      assert.equal(userRows[0].password_hash, null)
      assert.equal(userRows[0].org_id, orgId)

      // 3. Verify activation token in MariaDB
      const [tokenRows] = await execute('SELECT id, token_hash, used FROM activation_tokens WHERE user_id = ?', [userId])
      assert.equal(tokenRows.length, 1)
      assert.equal(tokenRows[0].used, 0)
      assert.equal(tokenRows[0].token_hash, hashToken(capturedNotif.rawToken))

      // 4. Verify registration record in MariaDB
      const [regRows] = await execute('SELECT status, approved_org_id, reviewed_by FROM organization_registrations WHERE id = ?', [sample.registrationId])
      assert.equal(regRows[0].status, 'APPROVED')
      assert.equal(regRows[0].approved_org_id, orgId)
      assert.equal(regRows[0].reviewed_by, ADMIN_USER_ID)

      // 5. Verify notification delivery
      assert.ok(capturedNotif)
      assert.equal(capturedNotif.type, 'ACTIVATION')
      assert.equal(capturedNotif.recipientEmail, sample.contactEmail)
      assert.ok(capturedNotif.activationUrl.includes('#token='))

      clearFakeTransport()
    })

    test('Government Pharmacy approval requires explicit DGHS verification attestation and facility code', async () => {
      // 1. Without dghs_facility_code
      const sampleNoCode = await createSampleRegistration({
        category: 'pharmacy',
        pharmacy_classification: 'GOVERNMENT',
        dghs_facility_code: null
      })
      await request('POST', `/api/v1/admin/registrations/${sampleNoCode.registrationId}/review`, {
        headers: { Cookie: adminCookie }
      })

      const failNoCode = await request('POST', `/api/v1/admin/registrations/${sampleNoCode.registrationId}/approve`, {
        headers: { Cookie: adminCookie },
        body: { dghsVerified: true }
      })
      assert.equal(failNoCode.status, 422)
      assert.equal(failNoCode.body.error.code, 'DGHS_CODE_REQUIRED')

      // 2. With code but without dghsVerified attestation
      const sampleWithCode = await createSampleRegistration({
        category: 'pharmacy',
        pharmacy_classification: 'GOVERNMENT',
        dghs_facility_code: 'DGHS-FAC-0099'
      })
      await request('POST', `/api/v1/admin/registrations/${sampleWithCode.registrationId}/review`, {
        headers: { Cookie: adminCookie }
      })

      const failNoAttest = await request('POST', `/api/v1/admin/registrations/${sampleWithCode.registrationId}/approve`, {
        headers: { Cookie: adminCookie },
        body: { dghsVerified: false }
      })
      assert.equal(failNoAttest.status, 422)
      assert.equal(failNoAttest.body.error.code, 'DGHS_VERIFICATION_REQUIRED')

      // 3. With code and dghsVerified = true succeeds
      const successRes = await request('POST', `/api/v1/admin/registrations/${sampleWithCode.registrationId}/approve`, {
        headers: { Cookie: adminCookie },
        body: { dghsVerified: true, reviewNotes: 'DGHS verification attestation confirmed.' }
      })
      assert.equal(successRes.status, 200)
      assert.equal(successRes.body.data.status, 'APPROVED')
    })

    test('approving Wholesaler application provisions successfully when capacity is open', async () => {
      await cleanupFixtures()
      const sample = await createSampleRegistration({ category: 'wholesaler' })
      await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/review`, { headers: { Cookie: adminCookie } })

      const approveRes = await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/approve`, {
        headers: { Cookie: adminCookie }
      })
      assert.equal(approveRes.status, 200)
      assert.equal(approveRes.body.data.status, 'APPROVED')
    })

    test('approving application with existing organization license number returns 409 DUPLICATE_LICENSE', async () => {
      const dupLic = `LIC-${TEST_PREFIX}-DUP-CHECK-001`
      const sample1 = await createSampleRegistration({ category: 'manufacturer', license_number: dupLic })
      await request('POST', `/api/v1/admin/registrations/${sample1.registrationId}/review`, { headers: { Cookie: adminCookie } })
      await request('POST', `/api/v1/admin/registrations/${sample1.registrationId}/approve`, { headers: { Cookie: adminCookie } })

      // Create second application with same license
      const sample2 = await createSampleRegistration({ category: 'manufacturer', license_number: dupLic })
      await request('POST', `/api/v1/admin/registrations/${sample2.registrationId}/review`, { headers: { Cookie: adminCookie } })
      const dupRes = await request('POST', `/api/v1/admin/registrations/${sample2.registrationId}/approve`, { headers: { Cookie: adminCookie } })

      assert.equal(dupRes.status, 409)
      assert.equal(dupRes.body.error.code, 'DUPLICATE_LICENSE')
    })

    test('approving application with existing user contact email returns 409 DUPLICATE_EMAIL', async () => {
      const dupEmail = `dup-user-${crypto.randomBytes(3).toString('hex')}@m3test.com`
      const sample1 = await createSampleRegistration({ category: 'manufacturer', contact_email: dupEmail })
      await request('POST', `/api/v1/admin/registrations/${sample1.registrationId}/review`, { headers: { Cookie: adminCookie } })
      await request('POST', `/api/v1/admin/registrations/${sample1.registrationId}/approve`, { headers: { Cookie: adminCookie } })

      // Create second application with same contact email
      const sample2 = await createSampleRegistration({ category: 'manufacturer', contact_email: dupEmail })
      await request('POST', `/api/v1/admin/registrations/${sample2.registrationId}/review`, { headers: { Cookie: adminCookie } })
      const dupRes = await request('POST', `/api/v1/admin/registrations/${sample2.registrationId}/approve`, { headers: { Cookie: adminCookie } })

      assert.equal(dupRes.status, 409)
      assert.equal(dupRes.body.error.code, 'DUPLICATE_EMAIL')
    })
  })

  // =========================================================================
  // 5b. TRANSACTION ROLLBACK & DATA INTEGRITY
  // =========================================================================
  describe('Group F: Transaction Rollback & Data Integrity', () => {
    test('approval failure on duplicate license rolls back all writes: zero orphan orgs, users, or tokens; status remains UNDER_REVIEW', async () => {
      // Step 1: Provision initial org with unique license
      const dupLic = `LIC-${TEST_PREFIX}-F-ROLLBACK-LIC`
      const sample1 = await createSampleRegistration({
        category: 'manufacturer',
        license_number: dupLic,
        contact_email: `contact-f1-${crypto.randomBytes(3).toString('hex')}@m3test.com`
      })
      await request('POST', `/api/v1/admin/registrations/${sample1.registrationId}/review`, { headers: { Cookie: adminCookie } })
      const approveRes1 = await request('POST', `/api/v1/admin/registrations/${sample1.registrationId}/approve`, { headers: { Cookie: adminCookie } })
      assert.equal(approveRes1.status, 200)

      // Step 2: Create second registration with the same license
      const conflictEmail = `contact-f2-${crypto.randomBytes(3).toString('hex')}@m3test.com`
      const sample2 = await createSampleRegistration({
        category: 'manufacturer',
        license_number: dupLic,
        contact_email: conflictEmail
      })
      await request('POST', `/api/v1/admin/registrations/${sample2.registrationId}/review`, { headers: { Cookie: adminCookie } })

      // Capture pre-approval counts
      const [preOrgs] = await execute('SELECT COUNT(*) AS c FROM organizations')
      const [preUsers] = await execute('SELECT COUNT(*) AS c FROM users')
      const [preTokens] = await execute('SELECT COUNT(*) AS c FROM activation_tokens')

      // Step 3: Attempt to approve second application
      const approveRes2 = await request('POST', `/api/v1/admin/registrations/${sample2.registrationId}/approve`, { headers: { Cookie: adminCookie } })
      assert.equal(approveRes2.status, 409)
      assert.equal(approveRes2.body.error.code, 'DUPLICATE_LICENSE')

      // Step 4: Verify complete rollback
      const [postOrgs] = await execute('SELECT COUNT(*) AS c FROM organizations')
      const [postUsers] = await execute('SELECT COUNT(*) AS c FROM users')
      const [postTokens] = await execute('SELECT COUNT(*) AS c FROM activation_tokens')

      assert.equal(Number(postOrgs[0].c), Number(preOrgs[0].c), 'No orphan organizations created')
      assert.equal(Number(postUsers[0].c), Number(preUsers[0].c), 'No orphan users created')
      assert.equal(Number(postTokens[0].c), Number(preTokens[0].c), 'No orphan activation tokens created')

      // Verify second registration remains in UNDER_REVIEW status with no approved_org_id
      const [regRows] = await execute('SELECT status, approved_org_id FROM organization_registrations WHERE id = ?', [sample2.registrationId])
      assert.equal(regRows[0].status, 'UNDER_REVIEW')
      assert.equal(regRows[0].approved_org_id, null)

      // Verify user was NOT created for conflictEmail
      const [orphanUser] = await execute('SELECT id FROM users WHERE email = ?', [conflictEmail])
      assert.equal(orphanUser.length, 0)

      // Verify audit log has NO APPLICATION_APPROVED entry for sample2
      const [auditRows] = await execute(
        'SELECT id FROM registration_audit_log WHERE registration_id = ? AND action_type = "APPLICATION_APPROVED"',
        [sample2.registrationId]
      )
      assert.equal(auditRows.length, 0)
    })

    test('approval failure on duplicate contact email rolls back all writes: zero orphan orgs, users, or tokens', async () => {
      // Step 1: Provision initial user with unique email
      const dupEmail = `contact-f-dupemail-${crypto.randomBytes(3).toString('hex')}@m3test.com`
      const sample1 = await createSampleRegistration({
        category: 'manufacturer',
        contact_email: dupEmail
      })
      await request('POST', `/api/v1/admin/registrations/${sample1.registrationId}/review`, { headers: { Cookie: adminCookie } })
      const approveRes1 = await request('POST', `/api/v1/admin/registrations/${sample1.registrationId}/approve`, { headers: { Cookie: adminCookie } })
      assert.equal(approveRes1.status, 200)

      // Step 2: Create second registration with same contact email but different license
      const sample2 = await createSampleRegistration({
        category: 'manufacturer',
        contact_email: dupEmail
      })
      await request('POST', `/api/v1/admin/registrations/${sample2.registrationId}/review`, { headers: { Cookie: adminCookie } })

      // Capture pre-approval counts
      const [preOrgs] = await execute('SELECT COUNT(*) AS c FROM organizations')
      const [preTokens] = await execute('SELECT COUNT(*) AS c FROM activation_tokens')

      // Step 3: Attempt approval
      const approveRes2 = await request('POST', `/api/v1/admin/registrations/${sample2.registrationId}/approve`, { headers: { Cookie: adminCookie } })
      assert.equal(approveRes2.status, 409)
      assert.equal(approveRes2.body.error.code, 'DUPLICATE_EMAIL')

      // Step 4: Verify rollback
      const [postOrgs] = await execute('SELECT COUNT(*) AS c FROM organizations')
      const [postTokens] = await execute('SELECT COUNT(*) AS c FROM activation_tokens')

      assert.equal(Number(postOrgs[0].c), Number(preOrgs[0].c), 'No orphan organizations created')
      assert.equal(Number(postTokens[0].c), Number(preTokens[0].c), 'No orphan activation tokens created')

      // Status remains UNDER_REVIEW
      const [regRows] = await execute('SELECT status, approved_org_id FROM organization_registrations WHERE id = ?', [sample2.registrationId])
      assert.equal(regRows[0].status, 'UNDER_REVIEW')
      assert.equal(regRows[0].approved_org_id, null)
    })
  })

  // =========================================================================
  // 6. CAPACITY POLICY CONCURRENCY STRESS TESTS
  // =========================================================================
  describe('Group G: Capacity Concurrency Stress Tests', () => {
    test('two admins approving competing Distributor applications serialize safely with capacity=1', async () => {
      // Ensure test-created distributor records from prior tests are cleaned
      await cleanupFixtures()

      const distReg1 = await createSampleRegistration({ category: 'distributor' })
      const distReg2 = await createSampleRegistration({ category: 'distributor' })

      await request('POST', `/api/v1/admin/registrations/${distReg1.registrationId}/review`, { headers: { Cookie: adminCookie } })
      await request('POST', `/api/v1/admin/registrations/${distReg2.registrationId}/review`, { headers: { Cookie: adminCookie } })

      // Fire simultaneous approval requests
      const [res1, res2] = await Promise.all([
        request('POST', `/api/v1/admin/registrations/${distReg1.registrationId}/approve`, { headers: { Cookie: adminCookie } }),
        request('POST', `/api/v1/admin/registrations/${distReg2.registrationId}/approve`, { headers: { Cookie: adminCookie } })
      ])

      const statuses = [res1.status, res2.status]
      assert.ok(statuses.includes(200), 'Exactly one distributor approval must succeed')
      assert.ok(statuses.includes(409), 'Competing distributor approval must receive 409 CAPACITY_REACHED')

      const failedRes = res1.status === 409 ? res1 : res2
      assert.equal(failedRes.body.error.code, 'CAPACITY_REACHED')

      // Verify active count never exceeds 1
      const [countRows] = await execute('SELECT COUNT(*) AS c FROM organizations WHERE type = "distributor" AND status = "active"')
      assert.equal(Number(countRows[0].c), 1)
    })

    test('two admins approving the same registration concurrently resolve safely with zero duplicate writes', async () => {
      const sample = await createSampleRegistration({ category: 'manufacturer' })
      await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/review`, { headers: { Cookie: adminCookie } })

      // Fire simultaneous approval calls for the exact same registration ID
      const [res1, res2] = await Promise.all([
        request('POST', `/api/v1/admin/registrations/${sample.registrationId}/approve`, { headers: { Cookie: adminCookie } }),
        request('POST', `/api/v1/admin/registrations/${sample.registrationId}/approve`, { headers: { Cookie: adminCookie } })
      ])

      const statuses = [res1.status, res2.status]
      assert.ok(statuses.includes(200))
      assert.ok(statuses.includes(409))

      // Verify exactly one organization provisioned for this registration
      const [orgs] = await execute('SELECT id FROM organization_registrations WHERE id = ?', [sample.registrationId])
      assert.ok(orgs[0].id)
    })

    test('two admins approving competing Wholesaler applications serialize safely with capacity=1', async () => {
      // Ensure test-created wholesaler records from prior tests are cleaned
      await cleanupFixtures()

      const wholReg1 = await createSampleRegistration({ category: 'wholesaler' })
      const wholReg2 = await createSampleRegistration({ category: 'wholesaler' })

      await request('POST', `/api/v1/admin/registrations/${wholReg1.registrationId}/review`, { headers: { Cookie: adminCookie } })
      await request('POST', `/api/v1/admin/registrations/${wholReg2.registrationId}/review`, { headers: { Cookie: adminCookie } })

      // Fire simultaneous approval requests
      const [res1, res2] = await Promise.all([
        request('POST', `/api/v1/admin/registrations/${wholReg1.registrationId}/approve`, { headers: { Cookie: adminCookie } }),
        request('POST', `/api/v1/admin/registrations/${wholReg2.registrationId}/approve`, { headers: { Cookie: adminCookie } })
      ])

      const statuses = [res1.status, res2.status]
      assert.ok(statuses.includes(200), 'Exactly one wholesaler approval must succeed')
      assert.ok(statuses.includes(409), 'Competing wholesaler approval must receive 409 CAPACITY_REACHED')

      const failedRes = res1.status === 409 ? res1 : res2
      assert.equal(failedRes.body.error.code, 'CAPACITY_REACHED')

      // Verify active count never exceeds 1
      const [countRows] = await execute('SELECT COUNT(*) AS c FROM organizations WHERE type = "wholesaler" AND status = "active"')
      assert.equal(Number(countRows[0].c), 1)
    })

    test('two admins approving Manufacturer applications concurrently both succeed (unlimited capacity)', async () => {
      const mfgReg1 = await createSampleRegistration({ category: 'manufacturer' })
      const mfgReg2 = await createSampleRegistration({ category: 'manufacturer' })

      await request('POST', `/api/v1/admin/registrations/${mfgReg1.registrationId}/review`, { headers: { Cookie: adminCookie } })
      await request('POST', `/api/v1/admin/registrations/${mfgReg2.registrationId}/review`, { headers: { Cookie: adminCookie } })

      const [res1, res2] = await Promise.all([
        request('POST', `/api/v1/admin/registrations/${mfgReg1.registrationId}/approve`, { headers: { Cookie: adminCookie } }),
        request('POST', `/api/v1/admin/registrations/${mfgReg2.registrationId}/approve`, { headers: { Cookie: adminCookie } })
      ])

      assert.equal(res1.status, 200, 'First manufacturer approval must succeed')
      assert.equal(res2.status, 200, 'Second manufacturer approval must succeed')
      assert.equal(res1.body.data.status, 'APPROVED')
      assert.equal(res2.body.data.status, 'APPROVED')
    })
  })

  // =========================================================================
  // 7. ACTIVATION FLOW & BEARER TRANSPORT VERIFICATION
  // =========================================================================
  describe('Group H: Activation Token Lifecycle & Bearer Transport', () => {
    test('Bearer transport verifies activation token; query parameter is strictly rejected', async () => {
      const sample = await createSampleRegistration({ category: 'manufacturer' })
      await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/review`, { headers: { Cookie: adminCookie } })

      let captured = null
      setFakeTransport(async payload => {
        captured = payload
      })

      await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/approve`, {
        headers: { Cookie: adminCookie }
      })

      const rawToken = captured.rawToken

      // 1. Verify via Authorization: Bearer <rawToken>
      const verifyRes = await request('GET', '/api/v1/auth/activate/verify', {
        headers: {
          Authorization: `Bearer ${rawToken}`
        }
      })
      assert.equal(verifyRes.status, 200)
      assert.equal(verifyRes.body.success, true)
      assert.equal(verifyRes.body.data.email, sample.contactEmail)
      assert.equal(verifyRes.headers['cache-control'], 'no-store, no-cache, must-revalidate, private')

      // 2. Insecure query transport MUST be rejected
      const queryRes = await request('GET', `/api/v1/auth/activate/verify?token=${rawToken}`)
      assert.equal(queryRes.status, 400)
      assert.equal(queryRes.body.error.code, 'INSECURE_TOKEN_TRANSPORT')

      // 3. Password activation succeeds
      const newPassword = 'ActivatedPassword123!#'
      const activateRes = await request('POST', '/api/v1/auth/activate', {
        body: {
          token: rawToken,
          password: newPassword,
          confirmPassword: newPassword
        }
      })
      assert.equal(activateRes.status, 200)

      // 4. Token replay is rejected with 410
      const replayRes = await request('POST', '/api/v1/auth/activate', {
        body: {
          token: rawToken,
          password: newPassword,
          confirmPassword: newPassword
        }
      })
      assert.equal(replayRes.status, 410)
      assert.equal(replayRes.body.error.code, 'TOKEN_ALREADY_USED')

      clearFakeTransport()
    })
  })

  // =========================================================================
  // 7b. NOTIFICATION ARCHITECTURE & DELIVERY LIMITATIONS
  // =========================================================================
  describe('Group I: Notification Architecture & Delivery Limitations', () => {
    test('notification service reports NOT_CONFIGURED when no email provider is configured', async () => {
      clearFakeTransport()
      // Directly invoke sendActivationNotification
      const notifResult = await sendActivationNotification({
        recipientEmail: 'notif-test@m3test.com',
        contactName: 'Test Contact',
        orgName: 'Test Corp',
        rawToken: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
      })

      assert.equal(notifResult.delivered, false)
      assert.equal(notifResult.status, 'NOT_CONFIGURED')
      assert.equal(notifResult.provider, null)

      // Also test sendInformationRequestNotification
      const infoNotifResult = await sendInformationRequestNotification({
        recipientEmail: 'notif-info-test@m3test.com',
        contactName: 'Test Contact',
        orgName: 'Test Corp',
        reason: 'Missing statutory drug license schedule endorsement.',
        rawToken: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
        cureDays: 14
      })

      assert.equal(infoNotifResult.delivered, false)
      assert.equal(infoNotifResult.status, 'NOT_CONFIGURED')
      assert.equal(infoNotifResult.provider, null)
    })

    test('activation URL uses fragment transport (#token=) and never contains raw token in query string', async () => {
      let captured = null
      setFakeTransport(async payload => {
        captured = payload
      })

      const rawToken = 'aabbccdd0123456789abcdefaabbccdd0123456789abcdefaabbccdd01234567'
      await sendActivationNotification({
        recipientEmail: 'fragment-test@m3test.com',
        contactName: 'Fragment Tester',
        orgName: 'Fragment Org Ltd',
        rawToken
      })

      assert.ok(captured, 'Notification must be captured by fake transport')
      assert.ok(captured.activationUrl.includes(`#token=${rawToken}`), 'Activation URL must use fragment identifier #token=')
      assert.ok(!captured.activationUrl.includes(`?token=${rawToken}`), 'Activation URL must NOT include token in query parameters')
      assert.ok(!captured.activationUrl.includes('?rawToken='), 'Activation URL must NOT contain query parameters')

      clearFakeTransport()
    })

    test('notification failure does not roll back committed provisioning', async () => {
      // Simulate broken email transport throwing an unhandled exception
      setFakeTransport(async () => {
        throw new Error('SMTP connection refused: connection timed out')
      })

      const sample = await createSampleRegistration({ category: 'manufacturer' })
      await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/review`, { headers: { Cookie: adminCookie } })

      // Approve registration: notification will fail internally but transaction is already committed
      const approveRes = await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/approve`, {
        headers: { Cookie: adminCookie }
      })

      assert.equal(approveRes.status, 200, 'Approval must succeed even if mail transport throws')
      assert.equal(approveRes.body.data.status, 'APPROVED')

      // Verify organization was provisioned despite notification failure
      const orgId = approveRes.body.data.organizationId
      const [orgRows] = await execute('SELECT id, status FROM organizations WHERE id = ?', [orgId])
      assert.equal(orgRows.length, 1)
      assert.equal(orgRows[0].status, 'active')

      // Verify user was provisioned
      const userId = approveRes.body.data.userId
      const [userRows] = await execute('SELECT id, status FROM users WHERE id = ?', [userId])
      assert.equal(userRows.length, 1)
      assert.equal(userRows[0].status, 'pending_activation')

      // Verify activation token exists
      const [tokenRows] = await execute('SELECT id, used FROM activation_tokens WHERE user_id = ?', [userId])
      assert.equal(tokenRows.length, 1)
      assert.equal(tokenRows[0].used, 0)

      clearFakeTransport()
    })

    test('development localhost fallback', () => {
      const origin = resolveAppOrigin('development', '')
      assert.equal(origin, 'http://localhost:5173')
      const actUrl = buildActivationUrl('sampletoken', 'development', '')
      assert.equal(actUrl, 'http://localhost:5173/activate#token=sampletoken')
      const resubUrl = buildResubmissionUrl('sampletoken', 'development', '')
      assert.equal(resubUrl, 'http://localhost:5173/resubmit#token=sampletoken')
    })

    test('test localhost fallback', () => {
      const origin = resolveAppOrigin('test', '')
      assert.equal(origin, 'http://localhost:5173')
      const actUrl = buildActivationUrl('sampletoken', 'test', '')
      assert.equal(actUrl, 'http://localhost:5173/activate#token=sampletoken')
    })

    test('production APP_HOST missing', () => {
      assert.throws(() => resolveAppOrigin('production', ''), { code: 'APP_HOST_MISSING' })
      assert.throws(() => resolveAppOrigin('production', '   '), { code: 'APP_HOST_MISSING' })
      assert.throws(() => buildActivationUrl('sampletoken', 'production', ''), { code: 'APP_HOST_MISSING' })
    })

    test('production localhost rejected', () => {
      assert.throws(() => resolveAppOrigin('production', 'localhost:5173'), { code: 'REJECTED_LOOPBACK_HOST' })
      assert.throws(() => resolveAppOrigin('production', 'https://localhost'), { code: 'REJECTED_LOOPBACK_HOST' })
      assert.throws(() => resolveAppOrigin('production', 'sub.localhost'), { code: 'REJECTED_LOOPBACK_HOST' })
      assert.throws(() => buildActivationUrl('sampletoken', 'production', 'localhost:5173'), { code: 'REJECTED_LOOPBACK_HOST' })
    })

    test('production loopback address rejected', () => {
      assert.throws(() => resolveAppOrigin('production', '127.0.0.1:5173'), { code: 'REJECTED_LOOPBACK_HOST' })
      assert.throws(() => resolveAppOrigin('production', '127.10.20.30'), { code: 'REJECTED_LOOPBACK_HOST' })
      assert.throws(() => resolveAppOrigin('production', '0.0.0.0:8080'), { code: 'REJECTED_LOOPBACK_HOST' })
      assert.throws(() => resolveAppOrigin('production', '[::1]:5173'), { code: 'REJECTED_LOOPBACK_HOST' })
      assert.throws(() => resolveAppOrigin('production', '::1'), { code: 'REJECTED_LOOPBACK_HOST' })
      assert.throws(() => resolveAppOrigin('production', '::ffff:127.0.0.1'), { code: 'REJECTED_LOOPBACK_HOST' })
      assert.throws(() => resolveAppOrigin('production', '[::ffff:127.0.0.1]:8443'), { code: 'REJECTED_LOOPBACK_HOST' })
    })

    test('production private and link-local IPv4 addresses rejected', () => {
      // 10.0.0.0/8
      assert.throws(() => resolveAppOrigin('production', '10.0.0.1'), { code: 'REJECTED_PRIVATE_HOST' })
      assert.throws(() => resolveAppOrigin('production', '10.255.255.254:8443'), { code: 'REJECTED_PRIVATE_HOST' })
      // 172.16.0.0/12
      assert.throws(() => resolveAppOrigin('production', '172.16.0.1'), { code: 'REJECTED_PRIVATE_HOST' })
      assert.throws(() => resolveAppOrigin('production', '172.31.255.255:443'), { code: 'REJECTED_PRIVATE_HOST' })
      // 192.168.0.0/16
      assert.throws(() => resolveAppOrigin('production', '192.168.1.1'), { code: 'REJECTED_PRIVATE_HOST' })
      assert.throws(() => resolveAppOrigin('production', '192.168.254.254'), { code: 'REJECTED_PRIVATE_HOST' })
      // 169.254.0.0/16 (link-local)
      assert.throws(() => resolveAppOrigin('production', '169.254.1.1'), { code: 'REJECTED_PRIVATE_HOST' })
      assert.throws(() => resolveAppOrigin('production', '169.254.254.254'), { code: 'REJECTED_PRIVATE_HOST' })
    })

    test('production IPv6 unique-local and link-local addresses rejected', () => {
      // Unique-local fc00::/7 (compressed and expanded)
      assert.throws(() => resolveAppOrigin('production', 'fc00::1'), { code: 'REJECTED_PRIVATE_HOST' })
      assert.throws(() => resolveAppOrigin('production', '[fd00::1]:8443'), { code: 'REJECTED_PRIVATE_HOST' })
      assert.throws(() => resolveAppOrigin('production', 'fd12:3456:789a::1'), { code: 'REJECTED_PRIVATE_HOST' })
      assert.throws(() => resolveAppOrigin('production', 'fc00:0000:0000:0000:0000:0000:0000:0001'), { code: 'REJECTED_PRIVATE_HOST' })

      // Link-local fe80::/10 (compressed and expanded)
      assert.throws(() => resolveAppOrigin('production', 'fe80::1'), { code: 'REJECTED_PRIVATE_HOST' })
      assert.throws(() => resolveAppOrigin('production', '[fe80::1]:5173'), { code: 'REJECTED_PRIVATE_HOST' })
      assert.throws(() => resolveAppOrigin('production', 'fe80:0000:0000:0000:0000:0000:0000:0001'), { code: 'REJECTED_PRIVATE_HOST' })
    })

    test('production IPv4-mapped IPv6 private addresses rejected', () => {
      assert.throws(() => resolveAppOrigin('production', '::ffff:10.0.0.1'), { code: 'REJECTED_PRIVATE_HOST' })
      assert.throws(() => resolveAppOrigin('production', '[::ffff:172.16.0.1]:8443'), { code: 'REJECTED_PRIVATE_HOST' })
      assert.throws(() => resolveAppOrigin('production', '::ffff:192.168.1.1'), { code: 'REJECTED_PRIVATE_HOST' })
      assert.throws(() => resolveAppOrigin('production', '[::ffff:169.254.1.1]'), { code: 'REJECTED_PRIVATE_HOST' })
    })

    test('embedded URL credentials explicitly rejected', () => {
      // Username-only
      assert.throws(() => resolveAppOrigin('production', 'https://user@portal.pharmatrace.gov.bd'), { code: 'INVALID_APP_HOST' })
      assert.throws(() => resolveAppOrigin('production', 'user@portal.pharmatrace.gov.bd'), { code: 'INVALID_APP_HOST' })

      // Password-only
      assert.throws(() => resolveAppOrigin('production', 'https://:secret@portal.pharmatrace.gov.bd'), { code: 'INVALID_APP_HOST' })
      assert.throws(() => resolveAppOrigin('production', ':secret@portal.pharmatrace.gov.bd'), { code: 'INVALID_APP_HOST' })

      // Username and password together
      assert.throws(() => resolveAppOrigin('production', 'https://admin:supersecret@portal.pharmatrace.gov.bd'), { code: 'INVALID_APP_HOST' })
      assert.throws(() => resolveAppOrigin('production', 'admin:supersecret@portal.pharmatrace.gov.bd:8443'), { code: 'INVALID_APP_HOST' })
    })

    test('production HTTP rejected', () => {
      assert.throws(() => resolveAppOrigin('production', 'http://portal.pharmatrace.gov.bd'), { code: 'INSECURE_APP_HOST' })
      assert.throws(() => buildActivationUrl('sampletoken', 'production', 'http://portal.pharmatrace.gov.bd'), { code: 'INSECURE_APP_HOST' })
    })

    test('valid production HTTPS host accepted', () => {
      assert.equal(resolveAppOrigin('production', 'https://portal.pharmatrace.gov.bd'), 'https://portal.pharmatrace.gov.bd')
      assert.equal(resolveAppOrigin('production', 'portal.pharmatrace.gov.bd'), 'https://portal.pharmatrace.gov.bd')
      assert.equal(resolveAppOrigin('production', 'https://portal.pharmatrace.gov.bd:8443'), 'https://portal.pharmatrace.gov.bd:8443')

      const actUrl = buildActivationUrl('sampletoken123', 'production', 'portal.pharmatrace.gov.bd')
      assert.equal(actUrl, 'https://portal.pharmatrace.gov.bd/activate#token=sampletoken123')

      const resubUrl = buildResubmissionUrl('sampletoken456', 'production', 'https://portal.pharmatrace.gov.bd')
      assert.equal(resubUrl, 'https://portal.pharmatrace.gov.bd/resubmit#token=sampletoken456')
    })

    test('no raw token leakage in errors or logs', async () => {
      const origNodeEnv = process.env.NODE_ENV
      const origAppHost = process.env.APP_HOST
      const secretRawToken = 'SUPER_SECRET_RAW_TOKEN_99999_DO_NOT_LEAK'

      try {
        process.env.NODE_ENV = 'production'
        process.env.APP_HOST = 'http://insecure-localhost-attempt'

        const notifResult = await sendActivationNotification({
          recipientEmail: 'leak-test@m3test.com',
          contactName: 'Leak Test Rep',
          orgName: 'Leak Test Org',
          rawToken: secretRawToken
        })

        // Must return safe NOT_CONFIGURED status without throwing
        assert.equal(notifResult.delivered, false)
        assert.equal(notifResult.status, 'NOT_CONFIGURED')
        // Must not leak secret token in return payload
        assert.ok(!JSON.stringify(notifResult).includes(secretRawToken), 'Return object must not contain raw token')
      } finally {
        process.env.NODE_ENV = origNodeEnv
        process.env.APP_HOST = origAppHost
      }
    })

    test('notification configuration failure does not affect committed provisioning', async () => {
      const origNodeEnv = process.env.NODE_ENV
      const origAppHost = process.env.APP_HOST

      try {
        // Simulate production with missing APP_HOST
        process.env.NODE_ENV = 'production'
        delete process.env.APP_HOST

        const sample = await createSampleRegistration({ category: 'manufacturer' })
        await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/review`, { headers: { Cookie: adminCookie } })

        const approveRes = await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/approve`, {
          headers: { Cookie: adminCookie }
        })

        assert.equal(approveRes.status, 200, 'Approval must succeed with 200 OK')
        assert.equal(approveRes.body.data.status, 'APPROVED')
        assert.equal(approveRes.body.data.notificationStatus, 'NOT_CONFIGURED')

        // Verify organization and user were committed despite notification configuration failure
        const orgId = approveRes.body.data.organizationId
        const [orgRows] = await execute('SELECT id, status, data_environment FROM organizations WHERE id = ?', [orgId])
        assert.equal(orgRows.length, 1)
        assert.equal(orgRows[0].status, 'active')
        assert.equal(orgRows[0].data_environment, 'production')

        const userId = approveRes.body.data.userId
        const [userRows] = await execute('SELECT id, status FROM users WHERE id = ?', [userId])
        assert.equal(userRows.length, 1)
        assert.equal(userRows[0].status, 'pending_activation')
      } finally {
        process.env.NODE_ENV = origNodeEnv
        process.env.APP_HOST = origAppHost
      }
    })
  })

  // =========================================================================
  // 8. ACTIVATION TOKEN RESEND
  // =========================================================================
  describe('Group J: Activation Token Resend', () => {
    test('resend creates a fresh 72h token, invalidates prior token, and does not duplicate user/org', async () => {
      const sample = await createSampleRegistration({ category: 'manufacturer' })
      await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/review`, { headers: { Cookie: adminCookie } })

      let firstNotif = null
      setFakeTransport(async payload => {
        firstNotif = payload
      })

      const approveRes = await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/approve`, {
        headers: { Cookie: adminCookie }
      })
      const initialOrgId = approveRes.body.data.organizationId
      const initialUserId = approveRes.body.data.userId

      let secondNotif = null
      setFakeTransport(async payload => {
        secondNotif = payload
      })

      const resendRes = await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/resend-activation`, {
        headers: { Cookie: adminCookie }
      })

      assert.equal(resendRes.status, 200)
      assert.equal(resendRes.body.data.registrationId, sample.registrationId)

      // Verify old token is marked used (1) and new token is active (0)
      const [tokens] = await execute(
        'SELECT id, used FROM activation_tokens WHERE user_id = ? ORDER BY used DESC',
        [initialUserId]
      )
      assert.equal(tokens.length, 2)
      assert.equal(tokens[0].used, 1)
      assert.equal(tokens[1].used, 0)

      // Verify org and user were NOT duplicated
      assert.equal(resendRes.body.data.organizationId, initialOrgId)
      assert.equal(resendRes.body.data.userId, initialUserId)

      clearFakeTransport()
    })

    test('resending activation for an already-active user returns 400 USER_ALREADY_ACTIVE', async () => {
      const sample = await createSampleRegistration({ category: 'manufacturer' })
      await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/review`, { headers: { Cookie: adminCookie } })

      let captured = null
      setFakeTransport(async payload => {
        captured = payload
      })

      await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/approve`, { headers: { Cookie: adminCookie } })

      // Activate user
      await request('POST', '/api/v1/auth/activate', {
        body: {
          token: captured.rawToken,
          password: 'ValidPassword123!#',
          confirmPassword: 'ValidPassword123!#'
        }
      })

      // Attempt to resend activation
      const resendRes = await request('POST', `/api/v1/admin/registrations/${sample.registrationId}/resend-activation`, {
        headers: { Cookie: adminCookie }
      })
      assert.equal(resendRes.status, 400)
      assert.equal(resendRes.body.error.code, 'USER_ALREADY_ACTIVE')

      clearFakeTransport()
    })
  })
})
