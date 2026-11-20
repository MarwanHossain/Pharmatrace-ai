// PharmaTrace AI — Phase 4 Milestone 6 Administrative Portal Integration Test Suite
// Verifies Organizations, Users, Dashboard Summary & Activity, and Document Preview
process.env.NODE_ENV = process.env.NODE_ENV || 'test'

import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import { app } from '../src/app.js'
import { getPool, closeDatabasePool, execute } from '../src/config/database.js'
import { createMigrationConnection } from '../src/database/migrator.js'
import { hashPassword, comparePassword, validatePassword } from '../src/utils/passwords.js'
import { signAccessToken, verifyAccessToken } from '../src/utils/tokens.js'

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
const TEST_ADMIN_ID = 'usr-m6-admin-01'
const TEST_ADMIN_EMAIL = 'admin_m6@pharmatrace.test'

const TEST_MFG_USER_ID = 'usr-m6-mfg-01'
const TEST_MFG_USER_EMAIL = 'mfg_user_m6@pharmatrace.test'

const TEST_ORG_1_ID = 'org-m6-mfg-01'
const TEST_ORG_2_ID = 'org-m6-dist-02'

let adminToken
let mfgToken

describe('Phase 4 Milestone 6 — Administrator Portal & Document Management Suite', () => {
  before(async () => {
    server = http.createServer(app)
    await new Promise(resolve => server.listen(0, resolve))
    const port = server.address().port
    baseUrl = `http://127.0.0.1:${port}`

    // Seed or reset test organizations
    await execute(
      `INSERT INTO organizations (
        id, name, type, license_number, address, contact_name, contact_email, contact_phone, status, created_at, updated_at
      ) VALUES 
      (?, 'M6 Apex Pharma Ltd', 'manufacturer', 'LIC-M6-001', 'Gazipur, Dhaka', 'Md. Rahman', 'apex@m6pharma.com', '+8801711111111', 'active', NOW(), NOW()),
      (?, 'M6 Prime Logistics', 'distributor', 'LIC-M6-002', 'Tejgaon, Dhaka', 'S. Ahmed', 'prime@m6dist.com', '+8801722222222', 'suspended', NOW(), NOW())
      ON DUPLICATE KEY UPDATE status = VALUES(status), name = VALUES(name), updated_at = NOW()`,
      [TEST_ORG_1_ID, TEST_ORG_2_ID]
    )

    // Seed or reset test users
    const hashed = await hashPassword('ValidPass123!#')
    await execute(
      `INSERT INTO users (
        id, org_id, name, email, password_hash, role, status, token_version, failed_login_attempts, created_at, updated_at
      ) VALUES
      (?, NULL, 'M6 Administrator', ?, ?, 'admin', 'active', 1, 0, NOW(), NOW()),
      (?, ?, 'M6 Plant Manager', ?, ?, 'manufacturer', 'active', 1, 0, NOW(), NOW())
      ON DUPLICATE KEY UPDATE status = 'active', token_version = 1, failed_login_attempts = 0, locked_until = NULL, password_hash = VALUES(password_hash), updated_at = NOW()`,
      [TEST_ADMIN_ID, TEST_ADMIN_EMAIL, hashed, TEST_MFG_USER_ID, TEST_ORG_1_ID, TEST_MFG_USER_EMAIL, hashed]
    )

    // Ensure only TEST_MFG_USER_ID is linked to TEST_ORG_1_ID
    await execute(
      'UPDATE users SET org_id = NULL WHERE org_id = ? AND id != ?',
      [TEST_ORG_1_ID, TEST_MFG_USER_ID]
    )

    adminToken = signAccessToken({ id: TEST_ADMIN_ID, email: TEST_ADMIN_EMAIL, role: 'admin', tokenVersion: 1 })
    mfgToken = signAccessToken({ id: TEST_MFG_USER_ID, email: TEST_MFG_USER_EMAIL, role: 'manufacturer', tokenVersion: 1 })
  })

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve))
    }
    await closeDatabasePool()
  })

  // =========================================================================
  // Section 1: Authorization & RBAC
  // =========================================================================

  describe('1. RBAC & Security Isolation', () => {
    test('Unauthenticated request to /admin/organizations returns 401', async () => {
      const res = await request('GET', '/api/v1/admin/organizations')
      assert.equal(res.status, 401)
      assert.equal(res.body.error.code, 'AUTH_TOKEN_MISSING')
    })

    test('Manufacturer role accessing /admin/organizations returns 403', async () => {
      const res = await request('GET', '/api/v1/admin/organizations', {
        headers: { Cookie: `pt_access_token=${mfgToken}` }
      })
      assert.equal(res.status, 403)
      assert.equal(res.body.error.code, 'FORBIDDEN_ROLE')
    })

    test('Admin role accessing /admin/organizations succeeds with 200', async () => {
      const res = await request('GET', '/api/v1/admin/organizations', {
        headers: { Cookie: `pt_access_token=${adminToken}` }
      })
      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.ok(Array.isArray(res.body.items))
    })

    test('Unauthenticated request to /admin/users returns 401', async () => {
      const res = await request('GET', '/api/v1/admin/users')
      assert.equal(res.status, 401)
    })

    test('Manufacturer role accessing /admin/users returns 403', async () => {
      const res = await request('GET', '/api/v1/admin/users', {
        headers: { Cookie: `pt_access_token=${mfgToken}` }
      })
      assert.equal(res.status, 403)
    })

    test('Unauthenticated request to /admin/dashboard/summary returns 401', async () => {
      const res = await request('GET', '/api/v1/admin/dashboard/summary')
      assert.equal(res.status, 401)
    })
  })

  // =========================================================================
  // Section 2: Organizations Management
  // =========================================================================

  describe('2. Organizations Management (Database-Backed)', () => {
    test('Lists organizations with pagination, search, and userCount', async () => {
      const res = await request('GET', '/api/v1/admin/organizations?search=Apex', {
        headers: { Cookie: `pt_access_token=${adminToken}` }
      })
      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.equal(res.body.items.length, 1)
      assert.equal(res.body.items[0].id, TEST_ORG_1_ID)
      assert.equal(res.body.items[0].name, 'M6 Apex Pharma Ltd')
      assert.equal(res.body.items[0].userCount, 1)
      assert.equal(res.body.pagination.page, 1)
    })

    test('Filters organizations by type and status', async () => {
      const res = await request('GET', '/api/v1/admin/organizations?type=distributor&status=suspended', {
        headers: { Cookie: `pt_access_token=${adminToken}` }
      })
      assert.equal(res.status, 200)
      assert.ok(res.body.items.some(o => o.id === TEST_ORG_2_ID))
      assert.ok(!res.body.items.some(o => o.id === TEST_ORG_1_ID))
    })

    test('Retrieves single organization details including linked users', async () => {
      const res = await request('GET', `/api/v1/admin/organizations/${TEST_ORG_1_ID}`, {
        headers: { Cookie: `pt_access_token=${adminToken}` }
      })
      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.equal(res.body.organization.name, 'M6 Apex Pharma Ltd')
      assert.ok(Array.isArray(res.body.organization.users))
      assert.equal(res.body.organization.users.length, 1)
      assert.equal(res.body.organization.users[0].id, TEST_MFG_USER_ID)
    })

    test('Non-existent organization returns 404', async () => {
      const res = await request('GET', '/api/v1/admin/organizations/org-nonexistent-999', {
        headers: { Cookie: `pt_access_token=${adminToken}` }
      })
      assert.equal(res.status, 404)
      assert.equal(res.body.error.code, 'ORGANIZATION_NOT_FOUND')
    })

    test('Mutating organization status requires valid CSRF and updates status', async () => {
      // Missing CSRF header fails
      const noCsrfRes = await request('PATCH', `/api/v1/admin/organizations/${TEST_ORG_1_ID}/status`, {
        headers: {
          Cookie: `pt_access_token=${adminToken}`,
          'X-Requested-With': ''
        },
        body: { status: 'suspended', reason: 'Regulatory compliance investigation' }
      })
      assert.equal(noCsrfRes.status, 403)

      // Valid CSRF succeeds and suspends org
      const successRes = await request('PATCH', `/api/v1/admin/organizations/${TEST_ORG_1_ID}/status`, {
        headers: {
          Cookie: `pt_access_token=${adminToken}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: { status: 'suspended', reason: 'Regulatory compliance audit in progress' }
      })
      assert.equal(successRes.status, 200)
      assert.equal(successRes.body.status, 'suspended')

      // Verify in DB and verify linked user token_version was incremented
      const [rows] = await execute('SELECT status FROM organizations WHERE id = ?', [TEST_ORG_1_ID])
      assert.equal(rows[0].status, 'suspended')

      const [userRows] = await execute('SELECT token_version FROM users WHERE id = ?', [TEST_MFG_USER_ID])
      assert.equal(userRows[0].token_version, 2) // Incremented to revoke active sessions
    })
  })

  // =========================================================================
  // Section 3: Users Management
  // =========================================================================

  describe('3. Users Management (Database-Backed)', () => {
    test('Lists users with pagination and strictly omits password hashes', async () => {
      const res = await request('GET', '/api/v1/admin/users', {
        headers: { Cookie: `pt_access_token=${adminToken}` }
      })
      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.ok(Array.isArray(res.body.items))
      assert.ok(res.body.items.length >= 2)

      // Strict security assertion: no password_hash or token in payload
      for (const user of res.body.items) {
        assert.equal(user.password_hash, undefined)
        assert.equal(user.password, undefined)
      }
    })

    test('Searches users by email and filters by role', async () => {
      const res = await request('GET', `/api/v1/admin/users?search=${TEST_MFG_USER_EMAIL}&role=manufacturer`, {
        headers: { Cookie: `pt_access_token=${adminToken}` }
      })
      assert.equal(res.status, 200)
      assert.equal(res.body.items.length, 1)
      assert.equal(res.body.items[0].email, TEST_MFG_USER_EMAIL)
      assert.equal(res.body.items[0].role, 'manufacturer')
      assert.equal(res.body.items[0].orgName, 'M6 Apex Pharma Ltd')
    })

    test('Retrieves user detail without sensitive secrets and includes auditLogs array', async () => {
      const res = await request('GET', `/api/v1/admin/users/${TEST_MFG_USER_ID}`, {
        headers: { Cookie: `pt_access_token=${adminToken}` }
      })
      assert.equal(res.status, 200)
      assert.equal(res.body.user.id, TEST_MFG_USER_ID)
      assert.equal(res.body.user.email, TEST_MFG_USER_EMAIL)
      assert.equal(res.body.user.password_hash, undefined)
      assert.ok(Array.isArray(res.body.user.auditLogs))
    })

    test('Prevents admin from deactivating or locking their own active account', async () => {
      const res = await request('PATCH', `/api/v1/admin/users/${TEST_ADMIN_ID}/status`, {
        headers: {
          Cookie: `pt_access_token=${adminToken}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: { status: 'inactive', reason: 'Attempt self lockout' }
      })
      assert.equal(res.status, 403)
      assert.equal(res.body.error.code, 'SELF_DEACTIVATION_PROHIBITED')
    })

    test('Requires justification reason (min 5 chars) for user status modifications', async () => {
      // Missing reason
      const noReasonRes = await request('PATCH', `/api/v1/admin/users/${TEST_MFG_USER_ID}/status`, {
        headers: {
          Cookie: `pt_access_token=${adminToken}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: { status: 'inactive' }
      })
      assert.equal(noReasonRes.status, 400)
      assert.equal(noReasonRes.body.error.code, 'REASON_REQUIRED')

      // Short reason (< 5 characters)
      const shortReasonRes = await request('PATCH', `/api/v1/admin/users/${TEST_MFG_USER_ID}/status`, {
        headers: {
          Cookie: `pt_access_token=${adminToken}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: { status: 'inactive', reason: 'bad' }
      })
      assert.equal(shortReasonRes.status, 400)
      assert.equal(shortReasonRes.body.error.code, 'REASON_REQUIRED')
    })

    test('Enforces parent organization active invariant on user status activation', async () => {
      // In Section 2, TEST_ORG_1_ID was suspended.
      // 1. Attempting to activate user when parent org is suspended must fail with 409
      const conflictRes = await request('PATCH', `/api/v1/admin/users/${TEST_MFG_USER_ID}/status`, {
        headers: {
          Cookie: `pt_access_token=${adminToken}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: { status: 'active', reason: 'Attempt activation with suspended organization' }
      })
      assert.equal(conflictRes.status, 409)
      assert.equal(conflictRes.body.error.code, 'ORGANIZATION_NOT_ACTIVE')

      // 2. Attempting to activate user when parent org is decommissioned must fail with 409
      await execute('UPDATE organizations SET status = "decommissioned" WHERE id = ?', [TEST_ORG_1_ID])
      const decommRes = await request('PATCH', `/api/v1/admin/users/${TEST_MFG_USER_ID}/status`, {
        headers: {
          Cookie: `pt_access_token=${adminToken}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: { status: 'active', reason: 'Attempt activation with decommissioned organization' }
      })
      assert.equal(decommRes.status, 409)
      assert.equal(decommRes.body.error.code, 'ORGANIZATION_NOT_ACTIVE')

      // Restore organization to active
      await execute('UPDATE organizations SET status = "active" WHERE id = ?', [TEST_ORG_1_ID])

      // Now deactivating user succeeds and increments token_version
      const deactRes = await request('PATCH', `/api/v1/admin/users/${TEST_MFG_USER_ID}/status`, {
        headers: {
          Cookie: `pt_access_token=${adminToken}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: { status: 'inactive', reason: 'Regulatory compliance review' }
      })
      assert.equal(deactRes.status, 200)
      assert.equal(deactRes.body.status, 'inactive')

      // Now activating user succeeds
      const actRes = await request('PATCH', `/api/v1/admin/users/${TEST_MFG_USER_ID}/status`, {
        headers: {
          Cookie: `pt_access_token=${adminToken}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: { status: 'active', reason: 'Review complete and compliance restored' }
      })
      assert.equal(actRes.status, 200)
      assert.equal(actRes.body.status, 'active')
    })

    test('Account unlock safeguards: requires reason, validates locked state, and enforces organization invariant', async () => {
      // 1. Attempt unlock on non-locked user (currently 'active') -> 400 INVALID_STATUS
      const notLockedRes = await request('POST', `/api/v1/admin/users/${TEST_MFG_USER_ID}/unlock`, {
        headers: {
          Cookie: `pt_access_token=${adminToken}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: { reason: 'Valid reason but user is not locked' }
      })
      assert.equal(notLockedRes.status, 400)
      assert.equal(notLockedRes.body.error.code, 'INVALID_STATUS')

      // 2. Set user to 'locked'
      const lockRes = await request('PATCH', `/api/v1/admin/users/${TEST_MFG_USER_ID}/status`, {
        headers: {
          Cookie: `pt_access_token=${adminToken}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: { status: 'locked', reason: 'Simulated brute-force attack lockout' }
      })
      assert.equal(lockRes.status, 200)
      assert.equal(lockRes.body.status, 'locked')

      // 3. Attempt unlock without reason -> 400 REASON_REQUIRED
      const noReasonUnlock = await request('POST', `/api/v1/admin/users/${TEST_MFG_USER_ID}/unlock`, {
        headers: {
          Cookie: `pt_access_token=${adminToken}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: {}
      })
      assert.equal(noReasonUnlock.status, 400)
      assert.equal(noReasonUnlock.body.error.code, 'REASON_REQUIRED')

      // 4. Attempt unlock with parent organization suspended -> 409 ORGANIZATION_NOT_ACTIVE
      await execute('UPDATE organizations SET status = "suspended" WHERE id = ?', [TEST_ORG_1_ID])
      const orgBlockedUnlock = await request('POST', `/api/v1/admin/users/${TEST_MFG_USER_ID}/unlock`, {
        headers: {
          Cookie: `pt_access_token=${adminToken}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: { reason: 'Identity verified by administrator' }
      })
      assert.equal(orgBlockedUnlock.status, 409)
      assert.equal(orgBlockedUnlock.body.error.code, 'ORGANIZATION_NOT_ACTIVE')

      // 5. Attempt unlock with parent organization decommissioned -> 409 ORGANIZATION_NOT_ACTIVE
      await execute('UPDATE organizations SET status = "decommissioned" WHERE id = ?', [TEST_ORG_1_ID])
      const decommBlockedUnlock = await request('POST', `/api/v1/admin/users/${TEST_MFG_USER_ID}/unlock`, {
        headers: {
          Cookie: `pt_access_token=${adminToken}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: { reason: 'Identity verified by administrator' }
      })
      assert.equal(decommBlockedUnlock.status, 409)
      assert.equal(decommBlockedUnlock.body.error.code, 'ORGANIZATION_NOT_ACTIVE')

      // 6. Restore organization to active and perform valid unlock
      await execute('UPDATE organizations SET status = "active" WHERE id = ?', [TEST_ORG_1_ID])
      const successUnlock = await request('POST', `/api/v1/admin/users/${TEST_MFG_USER_ID}/unlock`, {
        headers: {
          Cookie: `pt_access_token=${adminToken}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: { reason: 'Identity verified in person by System Administrator' }
      })
      assert.equal(successUnlock.status, 200)
      assert.equal(successUnlock.body.status, 'active')
      assert.equal(successUnlock.body.failedLoginAttempts, 0)
      assert.equal(successUnlock.body.lockedUntil, null)

      // Confirm in DB
      const [dbUser] = await execute('SELECT status, failed_login_attempts, locked_until FROM users WHERE id = ?', [TEST_MFG_USER_ID])
      assert.equal(dbUser[0].status, 'active')
      assert.equal(dbUser[0].failed_login_attempts, 0)
      assert.equal(dbUser[0].locked_until, null)
    })

    test('Audit log immutability and persistence across status modification and unlock', async () => {
      // Verify audit logs were durably recorded in admin_audit_log
      const [logs] = await execute(
        'SELECT action_type, reason, previous_status, new_status FROM admin_audit_log WHERE target_user_id = ? ORDER BY created_at ASC',
        [TEST_MFG_USER_ID]
      )
      assert.ok(logs.length >= 3)
      assert.ok(logs.some(l => l.action_type === 'USER_UNLOCKED' && l.previous_status === 'locked' && l.new_status === 'active'))
      assert.ok(logs.some(l => l.action_type === 'USER_STATUS_CHANGED' && l.new_status === 'locked'))

      // Verify runtime least privilege: direct UPDATE/DELETE denied at permission layer
      await assert.rejects(
        () => execute('UPDATE admin_audit_log SET reason = "tampered" WHERE target_user_id = ?', [TEST_MFG_USER_ID]),
        /command denied|immutable and cannot be updated/
      )

      await assert.rejects(
        () => execute('DELETE FROM admin_audit_log WHERE target_user_id = ?', [TEST_MFG_USER_ID]),
        /command denied|immutable and cannot be deleted/
      )

      // Verify trigger immutability even under privileged connection
      const migConn = await createMigrationConnection()
      try {
        await assert.rejects(
          () => migConn.query('UPDATE admin_audit_log SET reason = "tampered" WHERE target_user_id = ?', [TEST_MFG_USER_ID]),
          /immutable and cannot be updated/
        )
        await assert.rejects(
          () => migConn.query('DELETE FROM admin_audit_log WHERE target_user_id = ?', [TEST_MFG_USER_ID]),
          /immutable and cannot be deleted/
        )
      } finally {
        await migConn.end()
      }
    })

    test('Independent accounts (org_id: null) are exempt from organization status invariant', async () => {
      const INDEP_USER_ID = `usr-m6-indep-${RUN_ID}`
      const INDEP_EMAIL = `indep_officer_${RUN_ID}@pharmatrace.test`
      const hashed = await hashPassword('ValidPass123!#')

      await execute(
        `INSERT INTO users (id, org_id, name, email, password_hash, role, status, token_version, failed_login_attempts, created_at, updated_at)
         VALUES (?, NULL, 'Officer Independent', ?, ?, 'investigator', 'active', 1, 0, NOW(), NOW())`,
        [INDEP_USER_ID, INDEP_EMAIL, hashed]
      )

      // Deactivate independent user
      const deact = await request('PATCH', `/api/v1/admin/users/${INDEP_USER_ID}/status`, {
        headers: {
          Cookie: `pt_access_token=${adminToken}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: { status: 'inactive', reason: 'Field officer temporary rotation' }
      })
      assert.equal(deact.status, 200)
      assert.equal(deact.body.status, 'inactive')

      // Activate independent user (no organization exists, should succeed without 409)
      const act = await request('PATCH', `/api/v1/admin/users/${INDEP_USER_ID}/status`, {
        headers: {
          Cookie: `pt_access_token=${adminToken}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: { status: 'active', reason: 'Field officer returned to duty' }
      })
      assert.equal(act.status, 200)
      assert.equal(act.body.status, 'active')

      // Lock and unlock independent user
      await request('PATCH', `/api/v1/admin/users/${INDEP_USER_ID}/status`, {
        headers: {
          Cookie: `pt_access_token=${adminToken}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: { status: 'locked', reason: 'Security check' }
      })

      const unlock = await request('POST', `/api/v1/admin/users/${INDEP_USER_ID}/unlock`, {
        headers: {
          Cookie: `pt_access_token=${adminToken}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: { reason: 'Security check cleared by admin' }
      })
      assert.equal(unlock.status, 200)
      assert.equal(unlock.body.status, 'active')
    })

    test('Administrator credential rotation mechanics validation', async () => {
      const ROTATE_USER_ID = `usr-m6-rotate-${RUN_ID}`
      const ROTATE_EMAIL = `rotate_admin_${RUN_ID}@pharmatrace.test`
      const initialHashed = await hashPassword('InitialPass123!#')

      await execute(
        `INSERT INTO users (id, org_id, name, email, password_hash, role, status, token_version, failed_login_attempts, created_at, updated_at)
         VALUES (?, NULL, 'Rotating Admin', ?, ?, 'admin', 'active', 1, 0, NOW(), NOW())`,
        [ROTATE_USER_ID, ROTATE_EMAIL, initialHashed]
      )

      // Test complexity enforcement
      const weakValidation = validatePassword('short')
      assert.equal(weakValidation.valid, false)

      const validNewPass = 'SuperSecurePass2026!#$'
      const strongValidation = validatePassword(validNewPass)
      assert.equal(strongValidation.valid, true)

      // Generate new bcrypt hash
      const newHash = await hashPassword(validNewPass)
      assert.ok(newHash.startsWith('$2b$12$'))

      // Verify hash satisfies comparePassword
      const match = await comparePassword(validNewPass, newHash)
      assert.equal(match, true)

      // Apply rotation: update password_hash and increment token_version
      await execute(
        'UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = NOW() WHERE id = ?',
        [newHash, ROTATE_USER_ID]
      )

      const [updated] = await execute('SELECT password_hash, token_version FROM users WHERE id = ?', [ROTATE_USER_ID])
      assert.equal(updated[0].token_version, 2)
      assert.equal(updated[0].password_hash, newHash)

      // Verify old token version is invalidated
      const oldToken = signAccessToken({ id: ROTATE_USER_ID, email: ROTATE_EMAIL, role: 'admin', tokenVersion: 1 })
      const decoded = verifyAccessToken(oldToken)
      assert.equal(decoded.tokenVersion < updated[0].token_version, true)
    })
  })

  // =========================================================================
  // Section 3b: Session Revocation Verification (A, B, C)
  // =========================================================================

  describe('3b. Session Revocation Verification (A, B, C)', () => {
    const ORG_REV_ID = `org-m6-rev-${RUN_ID}`

    before(async () => {
      await execute(
        `INSERT INTO organizations (
          id, name, type, license_number, address, contact_name, contact_email, contact_phone, status, created_at, updated_at
        ) VALUES 
        (?, 'Revocation Test Org', 'manufacturer', ?, 'Dhaka', 'Rev Contact', 'rev@test.com', '+8801700000000', 'active', NOW(), NOW())
        ON DUPLICATE KEY UPDATE status = 'active', updated_at = NOW()`,
        [ORG_REV_ID, `LIC-REV-${RUN_ID}`]
      )
    })

    test('(A) Manual account locking instantly revokes active sessions via token_version increment', async () => {
      const REV_USER_ID = `usr-m6-rev-a-${RUN_ID}`
      const REV_EMAIL = `rev_a_${RUN_ID}@pharmatrace.test`
      const rawPassword = 'ValidPass123!#'
      const hashed = await hashPassword(rawPassword)

      await execute(
        `INSERT INTO users (id, org_id, name, email, password_hash, role, status, token_version, failed_login_attempts, created_at, updated_at)
         VALUES (?, ?, 'Revoke A User', ?, ?, 'manufacturer', 'active', 1, 0, NOW(), NOW())`,
        [REV_USER_ID, ORG_REV_ID, REV_EMAIL, hashed]
      )

      // User has active token with tokenVersion: 1
      const activeToken = signAccessToken({ id: REV_USER_ID, email: REV_EMAIL, role: 'manufacturer', tokenVersion: 1 })

      // Verify active token can access /api/v1/auth/me
      const validMe = await request('GET', '/api/v1/auth/me', {
        headers: { Cookie: `pt_access_token=${activeToken}` }
      })
      assert.equal(validMe.status, 200)
      assert.equal(validMe.body.user.id, REV_USER_ID)

      // Admin locks user account via PATCH /api/v1/admin/users/:id/status
      const lockRes = await request('PATCH', `/api/v1/admin/users/${REV_USER_ID}/status`, {
        headers: {
          Cookie: `pt_access_token=${adminToken}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: { status: 'locked', reason: 'Security incident locking' }
      })
      assert.equal(lockRes.status, 200)
      assert.equal(lockRes.body.status, 'locked')

      // Previous active token is immediately rejected with 401 SESSION_REVOKED
      const revokedMe = await request('GET', '/api/v1/auth/me', {
        headers: { Cookie: `pt_access_token=${activeToken}` }
      })
      assert.equal(revokedMe.status, 401)
      assert.equal(revokedMe.body.error.code, 'SESSION_REVOKED')
    })

    test('(B) Account unlock requires re-authentication; previous tokens remain permanently revoked', async () => {
      const REV_USER_ID = `usr-m6-rev-b-${RUN_ID}`
      const REV_EMAIL = `rev_b_${RUN_ID}@pharmatrace.test`
      const rawPassword = 'ValidPass123!#'
      const hashed = await hashPassword(rawPassword)

      await execute(
        `INSERT INTO users (id, org_id, name, email, password_hash, role, status, token_version, failed_login_attempts, created_at, updated_at)
         VALUES (?, ?, 'Revoke B User', ?, ?, 'manufacturer', 'active', 1, 0, NOW(), NOW())`,
        [REV_USER_ID, ORG_REV_ID, REV_EMAIL, hashed]
      )

      const initialToken = signAccessToken({ id: REV_USER_ID, email: REV_EMAIL, role: 'manufacturer', tokenVersion: 1 })

      // Lock account
      await request('PATCH', `/api/v1/admin/users/${REV_USER_ID}/status`, {
        headers: {
          Cookie: `pt_access_token=${adminToken}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: { status: 'locked', reason: 'Pre-lock for unlock test' }
      })

      // Admin unlocks account via POST /api/v1/admin/users/:id/unlock
      const unlockRes = await request('POST', `/api/v1/admin/users/${REV_USER_ID}/unlock`, {
        headers: {
          Cookie: `pt_access_token=${adminToken}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: { reason: 'User identity re-verified by administrator' }
      })
      assert.equal(unlockRes.status, 200)
      assert.equal(unlockRes.body.status, 'active')

      // Old pre-lock token (tokenVersion 1) is still rejected (token_version was incremented on lock and unlock)
      const oldTokenMe = await request('GET', '/api/v1/auth/me', {
        headers: { Cookie: `pt_access_token=${initialToken}` }
      })
      assert.equal(oldTokenMe.status, 401)
      assert.equal(oldTokenMe.body.error.code, 'SESSION_REVOKED')

      // Fresh login succeeds and issues token with current token_version
      const loginRes = await request('POST', '/api/v1/auth/login', {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        body: { email: REV_EMAIL, password: rawPassword }
      })
      assert.equal(loginRes.status, 200)
      const setCookie = loginRes.headers['set-cookie']
      assert.ok(setCookie)
      const cookieVal = Array.isArray(setCookie) ? setCookie[0] : setCookie
      const tokenMatch = cookieVal.match(/pt_access_token=([^;]+)/)
      assert.ok(tokenMatch)
      const newToken = tokenMatch[1]

      // Authenticated request with fresh token succeeds
      const freshMe = await request('GET', '/api/v1/auth/me', {
        headers: { Cookie: `pt_access_token=${newToken}` }
      })
      assert.equal(freshMe.status, 200)
      assert.equal(freshMe.body.user.id, REV_USER_ID)
    })

    test('(C) Automatic failed-login lockout (5 attempts) transactionally increments token_version and invalidates active sessions', async () => {
      const REV_USER_ID = `usr-m6-rev-c-${RUN_ID}`
      const REV_EMAIL = `rev_c_${RUN_ID}@pharmatrace.test`
      const rawPassword = 'ValidPass123!#'
      const hashed = await hashPassword(rawPassword)

      await execute(
        `INSERT INTO users (id, org_id, name, email, password_hash, role, status, token_version, failed_login_attempts, created_at, updated_at)
         VALUES (?, ?, 'Revoke C User', ?, ?, 'manufacturer', 'active', 1, 0, NOW(), NOW())`,
        [REV_USER_ID, ORG_REV_ID, REV_EMAIL, hashed]
      )

      // User is logged in on device A
      const preLockToken = signAccessToken({ id: REV_USER_ID, email: REV_EMAIL, role: 'manufacturer', tokenVersion: 1 })
      const preMe = await request('GET', '/api/v1/auth/me', {
        headers: { Cookie: `pt_access_token=${preLockToken}` }
      })
      assert.equal(preMe.status, 200)

      // An attacker attempts 4 failed logins with wrong password
      for (let attempt = 1; attempt <= 4; attempt++) {
        const failRes = await request('POST', '/api/v1/auth/login', {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          body: { email: REV_EMAIL, password: 'WrongPassword999!' }
        })
        assert.equal(failRes.status, 401)
      }

      // 5th failed attempt triggers account lockout
      const fifthFail = await request('POST', '/api/v1/auth/login', {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        body: { email: REV_EMAIL, password: 'WrongPassword999!' }
      })
      assert.equal(fifthFail.status, 423)
      assert.equal(fifthFail.body.error.code, 'ACCOUNT_LOCKED')

      // Verify in DB that token_version was incremented and status is locked
      const [lockedUser] = await execute('SELECT status, token_version, failed_login_attempts, locked_until FROM users WHERE id = ?', [REV_USER_ID])
      assert.equal(lockedUser[0].status, 'locked')
      assert.equal(lockedUser[0].token_version, 2)
      assert.equal(lockedUser[0].failed_login_attempts, 5)
      assert.ok(lockedUser[0].locked_until)

      // Device A's active session is now IMMEDIATELY REVOKED
      const postLockMe = await request('GET', '/api/v1/auth/me', {
        headers: { Cookie: `pt_access_token=${preLockToken}` }
      })
      assert.equal(postLockMe.status, 401)
      assert.equal(postLockMe.body.error.code, 'SESSION_REVOKED')

      // Admin unlocks user
      await request('POST', `/api/v1/admin/users/${REV_USER_ID}/unlock`, {
        headers: {
          Cookie: `pt_access_token=${adminToken}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: { reason: 'Cleared security audit following automated brute-force block' }
      })

      // Old pre-lock token is STILL invalid
      const postUnlockOldMe = await request('GET', '/api/v1/auth/me', {
        headers: { Cookie: `pt_access_token=${preLockToken}` }
      })
      assert.equal(postUnlockOldMe.status, 401)
      assert.equal(postUnlockOldMe.body.error.code, 'SESSION_REVOKED')

      // User logs in freshly with correct password
      const newLogin = await request('POST', '/api/v1/auth/login', {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        body: { email: REV_EMAIL, password: rawPassword }
      })
      assert.equal(newLogin.status, 200)
      const setCookie = newLogin.headers['set-cookie']
      const cookieVal = Array.isArray(setCookie) ? setCookie[0] : setCookie
      const tokenMatch = cookieVal.match(/pt_access_token=([^;]+)/)
      const validNewToken = tokenMatch[1]

      const postUnlockFreshMe = await request('GET', '/api/v1/auth/me', {
        headers: { Cookie: `pt_access_token=${validNewToken}` }
      })
      assert.equal(postUnlockFreshMe.status, 200)
      assert.equal(postUnlockFreshMe.body.user.id, REV_USER_ID)
    })
  })

  // =========================================================================
  // Section 4: Live Dashboard Summary & Activity
  // =========================================================================

  describe('4. Live Dashboard Summary & Activity', () => {
    test('GET /api/v1/admin/dashboard/summary returns genuine database metrics', async () => {
      const res = await request('GET', '/api/v1/admin/dashboard/summary', {
        headers: { Cookie: `pt_access_token=${adminToken}` }
      })
      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.ok(res.body.summary.registrations)
      assert.ok(res.body.summary.organizations)
      assert.ok(Array.isArray(res.body.summary.organizationBreakdown))
      assert.ok(res.body.summary.users)

      // Verified non-zero counts reflecting real seeded database state
      assert.ok(res.body.summary.organizations.total >= 2)
      assert.ok(res.body.summary.users.total >= 2)
    })

    test('GET /api/v1/admin/dashboard/activity returns chronological audit events from MariaDB', async () => {
      const res = await request('GET', '/api/v1/admin/dashboard/activity?limit=5', {
        headers: { Cookie: `pt_access_token=${adminToken}` }
      })
      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.ok(Array.isArray(res.body.items))
    })
  })

  // =========================================================================
  // Section 5: Document Preview & Security
  // =========================================================================

  describe('5. Document Preview & Confinement', () => {
    test('Document preview for non-existent document returns 404', async () => {
      const res = await request('GET', '/api/v1/admin/registrations/reg-nonexistent/documents/doc-nonexistent/preview', {
        headers: { Cookie: `pt_access_token=${adminToken}` }
      })
      assert.equal(res.status, 404)
    })
  })
})
