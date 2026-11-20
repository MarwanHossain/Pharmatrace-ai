// PharmaTrace AI — Shared Change Password Integration Test Suite
// Conforms to Revision 3.2 §1.2 & §4.1 specifications
// Verifies self-service password changing across all 6 canonical roles
process.env.NODE_ENV = process.env.NODE_ENV || 'test'

import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import { app } from '../src/app.js'
import { getPool, closeDatabasePool, execute } from '../src/config/database.js'
import { createMigrationConnection } from '../src/database/migrator.js'
import { hashPassword, comparePassword } from '../src/utils/passwords.js'
import { signAccessToken, AUTH_COOKIE_NAME } from '../src/utils/tokens.js'

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
        let raw = ''
        res.on('data', chunk => {
          raw += chunk
        })
        res.on('end', () => {
          let body = {}
          try {
            body = JSON.parse(raw)
          } catch {
            body = raw
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
const INITIAL_PASS = 'InitialPass123!#'
const NEW_PASS = 'NewSecurePass2026!#'

const TEST_USERS = [
  { id: `usr-cp-admin-${RUN_ID}`, email: `admin_${RUN_ID}@pharmatrace.test`, role: 'admin', orgId: null },
  { id: `usr-cp-mfg-${RUN_ID}`, email: `mfg_${RUN_ID}@pharmatrace.test`, role: 'manufacturer', orgId: `org-cp-mfg-${RUN_ID}` },
  { id: `usr-cp-dist-${RUN_ID}`, email: `dist_${RUN_ID}@pharmatrace.test`, role: 'distributor', orgId: `org-cp-dist-${RUN_ID}` },
  { id: `usr-cp-whol-${RUN_ID}`, email: `whol_${RUN_ID}@pharmatrace.test`, role: 'wholesaler', orgId: `org-cp-whol-${RUN_ID}` },
  { id: `usr-cp-pharm-${RUN_ID}`, email: `pharm_${RUN_ID}@pharmatrace.test`, role: 'pharmacy', orgId: `org-cp-pharm-${RUN_ID}` },
  { id: `usr-cp-inv-${RUN_ID}`, email: `inv_${RUN_ID}@pharmatrace.test`, role: 'investigator', orgId: null }
]

const INACTIVE_USER = {
  id: `usr-cp-inactive-${RUN_ID}`,
  email: `inactive_${RUN_ID}@pharmatrace.test`,
  role: 'manufacturer',
  orgId: null
}

const userTokens = {}

describe('PharmaTrace AI — Cross-Role Password Change Suite', () => {
  before(async () => {
    server = http.createServer(app)
    await new Promise(resolve => server.listen(0, resolve))
    const port = server.address().port
    baseUrl = `http://127.0.0.1:${port}`

    const initialHash = await hashPassword(INITIAL_PASS)

    // Seed test organizations
    for (const u of TEST_USERS) {
      if (u.orgId) {
        await execute(
          `INSERT INTO organizations (
            id, name, type, license_number, address, contact_name, contact_email, contact_phone, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'Dhaka, BD', 'Contact Person', ?, '+8801700000000', 'active', NOW(), NOW())`,
          [u.orgId, `Org ${u.role} ${RUN_ID}`, u.role, `LIC-CP-${u.role.toUpperCase()}-${RUN_ID}`, u.email]
        )
      }
    }

    // Seed test users
    for (const u of TEST_USERS) {
      await execute(
        `INSERT INTO users (
          id, org_id, name, email, password_hash, role, status, token_version, failed_login_attempts, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', 1, 0, NOW(), NOW())`,
        [u.id, u.orgId, `Test ${u.role}`, u.email, initialHash, u.role]
      )
      userTokens[u.role] = signAccessToken({ id: u.id, email: u.email, role: u.role, tokenVersion: 1 })
    }

    // Seed inactive user
    await execute(
      `INSERT INTO users (
        id, org_id, name, email, password_hash, role, status, token_version, failed_login_attempts, created_at, updated_at
      ) VALUES (?, NULL, 'Inactive User', ?, ?, 'manufacturer', 'inactive', 1, 0, NOW(), NOW())`,
      [INACTIVE_USER.id, INACTIVE_USER.email, initialHash]
    )
    userTokens['inactive'] = signAccessToken({ id: INACTIVE_USER.id, email: INACTIVE_USER.email, role: INACTIVE_USER.role, tokenVersion: 1 })
  })

  after(async () => {
    // Teardown test entities via migration connection
    // Note: user_security_audit_log records are strictly immutable by design and protected
    // by storage engine triggers (unconditional 45000 rejection). They are preserved.
    const migConn = await createMigrationConnection()
    try {
      const allUserIds = [...TEST_USERS.map(u => u.id), INACTIVE_USER.id]
      const placeholders = allUserIds.map(() => '?').join(',')

      await migConn.query('SET FOREIGN_KEY_CHECKS = 0')
      await migConn.query(`DELETE FROM users WHERE id IN (${placeholders})`, allUserIds)

      const orgIds = TEST_USERS.map(u => u.orgId).filter(Boolean)
      if (orgIds.length > 0) {
        const orgPlaceholders = orgIds.map(() => '?').join(',')
        await migConn.query(`DELETE FROM organizations WHERE id IN (${orgPlaceholders})`, orgIds)
      }
      await migConn.query('SET FOREIGN_KEY_CHECKS = 1')
    } catch (err) {
      console.warn('Cleanup warning in change_password test:', err.message)
    } finally {
      await migConn.end()
    }

    if (server) {
      await new Promise(resolve => server.close(resolve))
    }
    await closeDatabasePool()
  })

  // =========================================================================
  // 1. Authorization & Security Boundaries
  // =========================================================================

  describe('1. Authorization & Security Boundaries', () => {
    test('Unauthenticated request to /auth/change-password returns 401', async () => {
      const res = await request('POST', '/api/v1/auth/change-password', {
        body: { currentPassword: INITIAL_PASS, newPassword: NEW_PASS }
      })
      assert.equal(res.status, 401)
      assert.equal(res.body.error?.code, 'AUTH_TOKEN_MISSING')
    })

    test('Request without CSRF header (X-Requested-With) returns 403', async () => {
      const res = await request('POST', '/api/v1/auth/change-password', {
        headers: {
          'Cookie': `${AUTH_COOKIE_NAME}=${userTokens.manufacturer}`,
          'X-Requested-With': ''
        },
        body: { currentPassword: INITIAL_PASS, newPassword: NEW_PASS }
      })
      assert.equal(res.status, 403)
      assert.equal(res.body.error?.code, 'CSRF_INVALID_HEADER')
    })

    test('Request with untrusted Origin returns 403', async () => {
      const res = await request('POST', '/api/v1/auth/change-password', {
        headers: {
          'Cookie': `${AUTH_COOKIE_NAME}=${userTokens.manufacturer}`,
          'Origin': 'http://malicious-attacker.com'
        },
        body: { currentPassword: INITIAL_PASS, newPassword: NEW_PASS }
      })
      assert.equal(res.status, 403)
    })

    test('Inactive user account is blocked from changing password (403)', async () => {
      const res = await request('POST', '/api/v1/auth/change-password', {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${userTokens.inactive}` },
        body: { currentPassword: INITIAL_PASS, newPassword: NEW_PASS }
      })
      assert.equal(res.status, 403)
      assert.equal(res.body.error?.code, 'ACCOUNT_NOT_ACTIVE')
    })
  })

  // =========================================================================
  // 2. Input Validation & Policy Enforcement
  // =========================================================================

  describe('2. Input Validation & Password Policy Enforcement', () => {
    test('Missing currentPassword returns 400 VALIDATION_ERROR', async () => {
      const res = await request('POST', '/api/v1/auth/change-password', {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${userTokens.manufacturer}` },
        body: { newPassword: NEW_PASS }
      })
      assert.equal(res.status, 400)
      assert.equal(res.body.error?.code, 'VALIDATION_ERROR')
    })

    test('Missing newPassword returns 400 VALIDATION_ERROR', async () => {
      const res = await request('POST', '/api/v1/auth/change-password', {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${userTokens.manufacturer}` },
        body: { currentPassword: INITIAL_PASS }
      })
      assert.equal(res.status, 400)
      assert.equal(res.body.error?.code, 'VALIDATION_ERROR')
    })

    test('New password identical to current password is rejected with 400 IDENTICAL_PASSWORD', async () => {
      const res = await request('POST', '/api/v1/auth/change-password', {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${userTokens.manufacturer}` },
        body: { currentPassword: INITIAL_PASS, newPassword: INITIAL_PASS }
      })
      assert.equal(res.status, 400)
      assert.equal(res.body.error?.code, 'IDENTICAL_PASSWORD')
    })

    test('Weak new password (<10 chars) is rejected with 400 INVALID_PASSWORD_COMPLEXITY', async () => {
      const res = await request('POST', '/api/v1/auth/change-password', {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${userTokens.manufacturer}` },
        body: { currentPassword: INITIAL_PASS, newPassword: 'Weak1!#' }
      })
      assert.equal(res.status, 400)
      assert.equal(res.body.error?.code, 'INVALID_PASSWORD_COMPLEXITY')
      assert.match(res.body.error?.message, /at least 10 characters/)
    })

    test('Weak new password (missing symbol or digit) is rejected with 400', async () => {
      const res = await request('POST', '/api/v1/auth/change-password', {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${userTokens.manufacturer}` },
        body: { currentPassword: INITIAL_PASS, newPassword: 'NoSymbolDigitPass' }
      })
      assert.equal(res.status, 400)
      assert.equal(res.body.error?.code, 'INVALID_PASSWORD_COMPLEXITY')
    })

    test('New password exceeding 72 UTF-8 bytes is rejected with 400', async () => {
      const longPass = 'A1!'.repeat(25) // 75 chars
      const res = await request('POST', '/api/v1/auth/change-password', {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${userTokens.manufacturer}` },
        body: { currentPassword: INITIAL_PASS, newPassword: longPass }
      })
      assert.equal(res.status, 400)
      assert.equal(res.body.error?.code, 'INVALID_PASSWORD_COMPLEXITY')
      assert.match(res.body.error?.message, /maximum length of 72 UTF-8 bytes/)
    })

    test('Incorrect current password returns 401 INVALID_CURRENT_PASSWORD', async () => {
      const mfgUser = TEST_USERS.find(u => u.role === 'manufacturer')
      const [beforeUser] = await execute('SELECT password_hash, token_version FROM users WHERE id = ?', [mfgUser.id])

      const res = await request('POST', '/api/v1/auth/change-password', {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${userTokens.manufacturer}` },
        body: { currentPassword: 'WrongPassword123!#', newPassword: NEW_PASS }
      })
      assert.equal(res.status, 401)
      assert.equal(res.body.error?.code, 'INVALID_CURRENT_PASSWORD')

      // DB password_hash and token_version must remain untouched
      const [afterUser] = await execute('SELECT password_hash, token_version FROM users WHERE id = ?', [mfgUser.id])
      assert.equal(afterUser[0].password_hash, beforeUser[0].password_hash)
      assert.equal(afterUser[0].token_version, beforeUser[0].token_version)

      // Zero audit records inserted
      const [auditRows] = await execute('SELECT * FROM user_security_audit_log WHERE user_id = ?', [mfgUser.id])
      assert.equal(auditRows.length, 0)
    })
  })

  // =========================================================================
  // 3. Successful Execution, Session Revocation, and Audit Verification
  // =========================================================================

  describe('3. Successful Password Change & Immediate Session Invalidation', () => {
    test('Manufacturer successfully changes password, increments token_version, clears cookie, and logs audit', async () => {
      const mfgUser = TEST_USERS.find(u => u.role === 'manufacturer')
      const [beforeRows] = await execute('SELECT password_hash, token_version FROM users WHERE id = ?', [mfgUser.id])
      const initialTokenVersion = beforeRows[0].token_version

      const res = await request('POST', '/api/v1/auth/change-password', {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${userTokens.manufacturer}` },
        body: { currentPassword: INITIAL_PASS, newPassword: NEW_PASS }
      })

      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.equal(res.body.data?.requiresReauth, true)
      assert.ok(res.body.message.includes('Password changed successfully'))

      // Strictly verify no password or hash in response
      assert.equal(res.body.password, undefined)
      assert.equal(res.body.password_hash, undefined)
      assert.equal(res.body.data?.password, undefined)
      assert.equal(res.body.data?.password_hash, undefined)

      // Verify cookie cleared
      const setCookie = res.headers['set-cookie']
      assert.ok(setCookie)
      assert.ok(setCookie.some(c => c.includes(`${AUTH_COOKIE_NAME}=;`)))

      // Verify MariaDB record: password_hash updated to cost 12 bcrypt, token_version incremented
      const [afterRows] = await execute('SELECT password_hash, token_version FROM users WHERE id = ?', [mfgUser.id])
      assert.notEqual(afterRows[0].password_hash, beforeRows[0].password_hash)
      assert.equal(afterRows[0].token_version, initialTokenVersion + 1)

      const isNewMatch = await comparePassword(NEW_PASS, afterRows[0].password_hash)
      assert.equal(isNewMatch, true)

      // Verify persistent audit record in user_security_audit_log
      const [auditRows] = await execute(
        'SELECT * FROM user_security_audit_log WHERE user_id = ? AND event_type = "PASSWORD_CHANGED"',
        [mfgUser.id]
      )
      assert.equal(auditRows.length, 1)
      assert.equal(auditRows[0].user_id, mfgUser.id)
      assert.equal(auditRows[0].event_type, 'PASSWORD_CHANGED')

      const meta = typeof auditRows[0].metadata === 'string' ? JSON.parse(auditRows[0].metadata) : auditRows[0].metadata
      assert.equal(meta.role, 'manufacturer')
      assert.equal(meta.email, mfgUser.email)
    })

    test('Old session is immediately revoked (token_version mismatch -> 401 SESSION_REVOKED)', async () => {
      const res = await request('GET', '/api/v1/auth/me', {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${userTokens.manufacturer}` }
      })
      assert.equal(res.status, 401)
      assert.equal(res.body.error?.code, 'SESSION_REVOKED')
    })

    test('Old password fails authentication (401 INVALID_CREDENTIALS)', async () => {
      const mfgUser = TEST_USERS.find(u => u.role === 'manufacturer')
      const res = await request('POST', '/api/v1/auth/login', {
        body: { email: mfgUser.email, password: INITIAL_PASS }
      })
      assert.equal(res.status, 401)
      assert.equal(res.body.error?.code, 'INVALID_CREDENTIALS')
    })

    test('Fresh login with new password succeeds and establishes fresh session', async () => {
      const mfgUser = TEST_USERS.find(u => u.role === 'manufacturer')
      const res = await request('POST', '/api/v1/auth/login', {
        body: { email: mfgUser.email, password: NEW_PASS }
      })
      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.equal(res.body.user?.email, mfgUser.email)
      assert.equal(res.body.user?.role, 'manufacturer')

      const cookieHeader = res.headers['set-cookie']
      assert.ok(cookieHeader)
      const freshTokenCookie = cookieHeader[0].split(';')[0]

      // Verify fresh session works on /auth/me
      const meRes = await request('GET', '/api/v1/auth/me', {
        headers: { Cookie: freshTokenCookie }
      })
      assert.equal(meRes.status, 200)
      assert.equal(meRes.body.user?.email, mfgUser.email)
    })
  })

  // =========================================================================
  // 4. Cross-Role Verification (All Six Canonical Roles)
  // =========================================================================

  describe('4. Cross-Role Self-Service Capability (All 6 Canonical Roles)', () => {
    const rolesToTest = ['admin', 'investigator', 'distributor', 'wholesaler', 'pharmacy']

    for (const role of rolesToTest) {
      test(`Role "${role}" successfully changes own password`, async () => {
        const user = TEST_USERS.find(u => u.role === role)
        const roleToken = userTokens[role]
        const roleNewPass = `PassFor${role.toUpperCase()}2026!#`

        const res = await request('POST', '/api/v1/auth/change-password', {
          headers: { Cookie: `${AUTH_COOKIE_NAME}=${roleToken}` },
          body: { currentPassword: INITIAL_PASS, newPassword: roleNewPass }
        })

        assert.equal(res.status, 200)
        assert.equal(res.body.success, true)

        // Verify audit log
        const [audit] = await execute(
          'SELECT * FROM user_security_audit_log WHERE user_id = ? AND event_type = "PASSWORD_CHANGED"',
          [user.id]
        )
        assert.ok(audit.length >= 1)

        // Verify fresh login
        const loginRes = await request('POST', '/api/v1/auth/login', {
          body: { email: user.email, password: roleNewPass }
        })
        assert.equal(loginRes.status, 200)
        assert.equal(loginRes.body.user?.role, role)
      })
    }
  })

  // =========================================================================
  // 5. Account Isolation & Arbitrary Target Id Immunity
  // =========================================================================

  describe('5. Account Isolation & Arbitrary Target Id Immunity', () => {
    test('Request body targetUserId is strictly ignored; only authenticated user password changes', async () => {
      const adminUser = TEST_USERS.find(u => u.role === 'admin')
      const distUser = TEST_USERS.find(u => u.role === 'distributor')

      // Dist user attempts to change admin's password by injecting targetUserId
      const [distBefore] = await execute('SELECT password_hash FROM users WHERE id = ?', [distUser.id])
      const [adminBefore] = await execute('SELECT password_hash FROM users WHERE id = ?', [adminUser.id])

      // Re-login dist user to get active token
      const distLogin = await request('POST', '/api/v1/auth/login', {
        body: { email: distUser.email, password: `PassForDISTRIBUTOR2026!#` }
      })
      const distCookie = distLogin.headers['set-cookie'][0].split(';')[0]

      const maliciousPass = 'AttackerInjectedPass2026!#'
      const res = await request('POST', '/api/v1/auth/change-password', {
        headers: { Cookie: distCookie },
        body: {
          targetUserId: adminUser.id,
          userId: adminUser.id,
          targetEmail: adminUser.email,
          currentPassword: `PassForDISTRIBUTOR2026!#`,
          newPassword: maliciousPass
        }
      })

      assert.equal(res.status, 200)

      // Admin password MUST NOT have changed
      const [adminAfter] = await execute('SELECT password_hash FROM users WHERE id = ?', [adminUser.id])
      assert.equal(adminAfter[0].password_hash, adminBefore[0].password_hash)

      // Dist user's OWN password changed
      const [distAfter] = await execute('SELECT password_hash FROM users WHERE id = ?', [distUser.id])
      assert.notEqual(distAfter[0].password_hash, distBefore[0].password_hash)
      const isDistMatch = await comparePassword(maliciousPass, distAfter[0].password_hash)
      assert.equal(isDistMatch, true)
    })
  })

  // =========================================================================
  // 6. Immutability & Least-Privilege Verification
  // =========================================================================

  describe('6. Audit Immutability & Least-Privilege Verification', () => {
    test('Direct UPDATE or DELETE on user_security_audit_log is rejected (privilege & trigger)', async () => {
      const adminUser = TEST_USERS.find(u => u.role === 'admin')

      // 1. Runtime user (pharmatrace_app) denied at permission layer
      await assert.rejects(
        () => execute('UPDATE user_security_audit_log SET reason = "tampered" WHERE user_id = ?', [adminUser.id]),
        /command denied|immutable/
      )

      await assert.rejects(
        () => execute('DELETE FROM user_security_audit_log WHERE user_id = ?', [adminUser.id]),
        /command denied|immutable/
      )

      // 2. Privileged connection (pharmatrace_migrator) denied by storage trigger
      const migConn = await createMigrationConnection()
      try {
        await assert.rejects(
          () => migConn.query('UPDATE user_security_audit_log SET reason = "tampered" WHERE user_id = ?', [adminUser.id]),
          /immutable and cannot be updated/
        )
        await assert.rejects(
          () => migConn.query('DELETE FROM user_security_audit_log WHERE user_id = ?', [adminUser.id]),
          /immutable and cannot be deleted/
        )
      } finally {
        await migConn.end()
      }
    })
  })
})
