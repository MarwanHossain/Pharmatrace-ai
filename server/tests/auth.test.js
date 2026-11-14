// PharmaTrace AI — Complete Phase 2 Authentication & Authorization Integration Test Suite
import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import crypto from 'crypto'
import { app } from '../src/app.js'
import { getPool, closeDatabasePool, execute } from '../src/config/database.js'
import { hashPassword } from '../src/utils/passwords.js'
import { signAccessToken, hashToken, AUTH_COOKIE_NAME } from '../src/utils/tokens.js'
import { assertTenantAccess, buildTenantQueryScope } from '../src/utils/tenancy.js'
import { bootstrapAdmin } from '../src/scripts/bootstrapAdmin.js'

let server
let baseUrl
const pool = getPool()

// Helper to make HTTP requests against test server
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

// Test fixtures identifiers
const TEST_ORG_ACTIVE = 'org-test-active-001'
const TEST_ORG_SUSPENDED = 'org-test-suspended-002'

const TEST_USER_ACTIVE = 'usr-test-active-001'
const TEST_USER_INACTIVE = 'usr-test-inactive-002'
const TEST_USER_PENDING = 'usr-test-pending-003'
const TEST_USER_ORG_SUSPENDED = 'usr-test-suspended-004'
const TEST_USER_LOCKOUT = 'usr-test-lockout-005'
const TEST_USER_ACTIVATION = 'usr-test-activation-006'

const TEST_PASSWORD = 'ValidPassword123!#'

describe('Phase 2 Authentication & Authorization Integration Suite', () => {
  before(async () => {
    // Start HTTP server on random ephemeral port
    server = http.createServer(app)
    await new Promise(resolve => server.listen(0, resolve))
    const port = server.address().port
    baseUrl = `http://127.0.0.1:${port}`

    // Clean up any stale test records from prior runs
    await execute('DELETE FROM activation_tokens WHERE id LIKE "tok-test-%"')
    await execute('DELETE FROM users WHERE id LIKE "usr-test-%"')
    await execute('DELETE FROM organizations WHERE id LIKE "org-test-%"')

    // 1. Seed test organizations
    await execute(
      `INSERT INTO organizations (
        id, name, type, license_number, address, contact_name, contact_email, contact_phone, status
      ) VALUES 
      (?, 'Test Active Pharma Ltd', 'manufacturer', 'LIC-ACT-001', 'Dhaka', 'Contact', 'act@pharma.com', '123', 'active'),
      (?, 'Test Suspended Wholesaler', 'wholesaler', 'LIC-SUS-002', 'Chittagong', 'Contact', 'sus@pharma.com', '456', 'suspended')`,
      [TEST_ORG_ACTIVE, TEST_ORG_SUSPENDED]
    )

    // Hash password for seed users
    const hashed = await hashPassword(TEST_PASSWORD)

    // 2. Seed test users
    await execute(
      `INSERT INTO users (
        id, org_id, name, email, password_hash, role, status, token_version, failed_login_attempts
      ) VALUES
      (?, ?, 'Active User', 'active@pharmatrace.test', ?, 'manufacturer', 'active', 1, 0),
      (?, ?, 'Inactive User', 'inactive@pharmatrace.test', ?, 'manufacturer', 'inactive', 1, 0),
      (?, ?, 'Pending User', 'pending@pharmatrace.test', NULL, 'manufacturer', 'pending_activation', 1, 0),
      (?, ?, 'Suspended Org User', 'suspended_org@pharmatrace.test', ?, 'wholesaler', 'active', 1, 0),
      (?, ?, 'Lockout Target', 'lockout@pharmatrace.test', ?, 'pharmacy', 'active', 1, 0),
      (?, ?, 'Activation Target', 'activation@pharmatrace.test', NULL, 'distributor', 'pending_activation', 1, 0)`,
      [
        TEST_USER_ACTIVE, TEST_ORG_ACTIVE, hashed,
        TEST_USER_INACTIVE, TEST_ORG_ACTIVE, hashed,
        TEST_USER_PENDING, TEST_ORG_ACTIVE,
        TEST_USER_ORG_SUSPENDED, TEST_ORG_SUSPENDED, hashed,
        TEST_USER_LOCKOUT, TEST_ORG_ACTIVE, hashed,
        TEST_USER_ACTIVATION, TEST_ORG_ACTIVE
      ]
    )
  })

  after(async () => {
    // Teardown test entities
    await execute('DELETE FROM activation_tokens WHERE id LIKE "tok-test-%"')
    await execute('DELETE FROM users WHERE id LIKE "usr-test-%"')
    await execute('DELETE FROM organizations WHERE id LIKE "org-test-%"')

    if (server) {
      await new Promise(resolve => server.close(resolve))
    }
    await closeDatabasePool()
  })

  // =========================================================================
  // 1. AUTHENTICATION & LOGIN TESTS
  // =========================================================================

  test('POST /api/v1/auth/login succeeds with valid credentials and sets HttpOnly cookie', async () => {
    const res = await request('POST', '/api/v1/auth/login', {
      body: { email: 'active@pharmatrace.test', password: TEST_PASSWORD }
    })

    assert.equal(res.status, 200)
    assert.equal(res.body.success, true)
    assert.equal(res.body.user.email, 'active@pharmatrace.test')
    assert.equal(res.body.user.role, 'manufacturer')
    assert.equal(res.body.user.orgId, TEST_ORG_ACTIVE)

    // Verify Set-Cookie header
    const setCookie = res.headers['set-cookie']
    assert.ok(setCookie)
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie
    assert.ok(cookieStr.includes('pt_access_token='))
    assert.ok(cookieStr.toLowerCase().includes('httponly'))
    assert.ok(cookieStr.toLowerCase().includes('path=/'))
  })

  test('POST /api/v1/auth/login rejects incorrect password with generic 401', async () => {
    const res = await request('POST', '/api/v1/auth/login', {
      body: { email: 'active@pharmatrace.test', password: 'WrongPassword123!#' }
    })

    assert.equal(res.status, 401)
    assert.equal(res.body.success, false)
    assert.equal(res.body.error.code, 'INVALID_CREDENTIALS')
    assert.match(res.body.error.message, /invalid email or password/i)
  })

  test('POST /api/v1/auth/login rejects unknown email with generic 401 (constant time)', async () => {
    const res = await request('POST', '/api/v1/auth/login', {
      body: { email: 'nonexistent@pharmatrace.test', password: TEST_PASSWORD }
    })

    assert.equal(res.status, 401)
    assert.equal(res.body.success, false)
    assert.equal(res.body.error.code, 'INVALID_CREDENTIALS')
    assert.match(res.body.error.message, /invalid email or password/i)
  })

  test('POST /api/v1/auth/login rejects inactive user accounts with 403', async () => {
    const res = await request('POST', '/api/v1/auth/login', {
      body: { email: 'inactive@pharmatrace.test', password: TEST_PASSWORD }
    })

    assert.equal(res.status, 403)
    assert.equal(res.body.error.code, 'ACCOUNT_INACTIVE')
  })

  test('POST /api/v1/auth/login rejects pending activation accounts with 403', async () => {
    const res = await request('POST', '/api/v1/auth/login', {
      body: { email: 'pending@pharmatrace.test', password: TEST_PASSWORD }
    })

    assert.equal(res.status, 403)
    assert.equal(res.body.error.code, 'ACCOUNT_PENDING_ACTIVATION')
  })

  test('POST /api/v1/auth/login rejects users belonging to suspended organizations with 403', async () => {
    const res = await request('POST', '/api/v1/auth/login', {
      body: { email: 'suspended_org@pharmatrace.test', password: TEST_PASSWORD }
    })

    assert.equal(res.status, 403)
    assert.equal(res.body.error.code, 'ORGANIZATION_NOT_ACTIVE')
  })

  test('POST /api/v1/auth/logout rejects requests without CSRF header with 403', async () => {
    const res = await request('POST', '/api/v1/auth/logout', {
      headers: {
        'X-Requested-With': ''
      }
    })
    assert.equal(res.status, 403)
    assert.equal(res.body.error.code, 'CSRF_INVALID_HEADER')
  })

  test('POST /api/v1/auth/logout succeeds with valid CSRF headers and clears authentication cookie', async () => {
    const res = await request('POST', '/api/v1/auth/logout')
    assert.equal(res.status, 200)
    assert.equal(res.body.success, true)

    const setCookie = res.headers['set-cookie']
    assert.ok(setCookie)
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie
    assert.ok(cookieStr.includes('pt_access_token=;') || cookieStr.includes('Expires=Thu, 01 Jan 1970'))
  })

  // =========================================================================
  // 2. CONCURRENCY-SAFE ACCOUNT LOCKOUT TESTS
  // =========================================================================

  test('Account lockout: 4 failures do not lock; 5th failure triggers 15-minute lock', async () => {
    const targetEmail = 'lockout@pharmatrace.test'

    // Attempts 1 to 4 should return 401 and increment attempts
    for (let i = 1; i <= 4; i++) {
      const res = await request('POST', '/api/v1/auth/login', {
        body: { email: targetEmail, password: 'BadPassword123!#' }
      })
      assert.equal(res.status, 401)
      assert.equal(res.body.error.code, 'INVALID_CREDENTIALS')

      // Verify counter in DB
      const [rows] = await execute('SELECT failed_login_attempts, status FROM users WHERE id = ?', [TEST_USER_LOCKOUT])
      assert.equal(rows[0].failed_login_attempts, i)
      assert.equal(rows[0].status, 'active')
    }

    // Attempt 5 triggers lock (returns 423)
    const res5 = await request('POST', '/api/v1/auth/login', {
      body: { email: targetEmail, password: 'BadPassword123!#' }
    })
    assert.equal(res5.status, 423)
    assert.equal(res5.body.error.code, 'ACCOUNT_LOCKED')
    assert.match(res5.body.error.message, /locked due to 5 consecutive failed/i)

    // Verify row locked in DB
    const [lockedRow] = await execute(
      'SELECT status, failed_login_attempts, locked_until FROM users WHERE id = ?',
      [TEST_USER_LOCKOUT]
    )
    assert.equal(lockedRow[0].status, 'locked')
    assert.equal(lockedRow[0].failed_login_attempts, 5)
    assert.ok(new Date(lockedRow[0].locked_until) > new Date())

    // 6th attempt while locked immediately returns 423 even with CORRECT password
    const res6 = await request('POST', '/api/v1/auth/login', {
      body: { email: targetEmail, password: TEST_PASSWORD }
    })
    assert.equal(res6.status, 423)
    assert.equal(res6.body.error.code, 'ACCOUNT_LOCKED')
  })

  test('Account lockout: expired lock (>15m) recovers automatically on next valid login', async () => {
    // Manually backdate locked_until to simulate 16 minutes elapsed
    await execute(
      'UPDATE users SET locked_until = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id = ?',
      [TEST_USER_LOCKOUT]
    )

    // Login with correct password triggers expired-lock recovery
    const res = await request('POST', '/api/v1/auth/login', {
      body: { email: 'lockout@pharmatrace.test', password: TEST_PASSWORD }
    })

    assert.equal(res.status, 200)
    assert.equal(res.body.success, true)

    // Verify counters reset in DB
    const [recoveredRow] = await execute(
      'SELECT status, failed_login_attempts, locked_until FROM users WHERE id = ?',
      [TEST_USER_LOCKOUT]
    )
    assert.equal(recoveredRow[0].status, 'active')
    assert.equal(recoveredRow[0].failed_login_attempts, 0)
    assert.equal(recoveredRow[0].locked_until, null)
  })

  test('Account lockout: concurrent failed attempts serialize correctly without race conditions', async () => {
    // Reset lockout counters
    await execute('UPDATE users SET failed_login_attempts = 0, status = "active", locked_until = NULL WHERE id = ?', [TEST_USER_LOCKOUT])

    // Fire 6 simultaneous failed attempts
    const attempts = Array.from({ length: 6 }, () =>
      request('POST', '/api/v1/auth/login', {
        body: { email: 'lockout@pharmatrace.test', password: 'ParallelBadPass123!#' }
      })
    )

    const results = await Promise.all(attempts)
    const statuses = results.map(r => r.status)

    // At least one attempt must have triggered 423 (the 5th and subsequent)
    assert.ok(statuses.includes(423))
    assert.ok(statuses.includes(401))

    const [dbState] = await execute('SELECT status, failed_login_attempts FROM users WHERE id = ?', [TEST_USER_LOCKOUT])
    assert.equal(dbState[0].status, 'locked')
    assert.ok(dbState[0].failed_login_attempts >= 5)
  })

  // =========================================================================
  // 3. ACTIVATION WORKFLOW TESTS
  // =========================================================================

  test('Activation: verify endpoint returns token metadata without consuming it', async () => {
    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = hashToken(rawToken)

    // Insert valid activation token (72-hour TTL)
    await execute(
      `INSERT INTO activation_tokens (id, user_id, token_hash, used, expires_at)
       VALUES ('tok-test-001', ?, ?, FALSE, DATE_ADD(NOW(), INTERVAL 72 HOUR))`,
      [TEST_USER_ACTIVATION, tokenHash]
    )

    const res = await request('GET', `/api/v1/auth/activate/verify?token=${rawToken}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.success, true)
    assert.equal(res.body.data.email, 'activation@pharmatrace.test')
    assert.equal(res.body.data.role, 'distributor')

    // Verify token was NOT consumed
    const [tokenCheck] = await execute('SELECT used FROM activation_tokens WHERE id = "tok-test-001"')
    assert.equal(tokenCheck[0].used, 0)
  })

  test('Activation: POST /api/v1/auth/activate activates account and consumes token atomically', async () => {
    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = hashToken(rawToken)

    await execute(
      `INSERT INTO activation_tokens (id, user_id, token_hash, used, expires_at)
       VALUES ('tok-test-002', ?, ?, FALSE, DATE_ADD(NOW(), INTERVAL 72 HOUR))`,
      [TEST_USER_ACTIVATION, tokenHash]
    )

    const newPassword = 'NewActivatedPassword123!#'
    const res = await request('POST', '/api/v1/auth/activate', {
      body: {
        token: rawToken,
        password: newPassword,
        confirmPassword: newPassword
      }
    })

    assert.equal(res.status, 200)
    assert.equal(res.body.success, true)

    // Verify token consumed
    const [tokenCheck] = await execute('SELECT used, used_at FROM activation_tokens WHERE id = "tok-test-002"')
    assert.equal(tokenCheck[0].used, 1)
    assert.ok(tokenCheck[0].used_at !== null)

    // Verify user is active and can log in with new password
    const [userCheck] = await execute('SELECT status, password_hash FROM users WHERE id = ?', [TEST_USER_ACTIVATION])
    assert.equal(userCheck[0].status, 'active')
    assert.ok(userCheck[0].password_hash !== null)

    const loginRes = await request('POST', '/api/v1/auth/login', {
      body: { email: 'activation@pharmatrace.test', password: newPassword }
    })
    assert.equal(loginRes.status, 200)
    assert.equal(loginRes.body.success, true)
  })

  test('Activation: Replay attack with already-used token is rejected with 410', async () => {
    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = hashToken(rawToken)

    // Insert already used token
    await execute(
      `INSERT INTO activation_tokens (id, user_id, token_hash, used, used_at, expires_at)
       VALUES ('tok-test-003', ?, ?, TRUE, NOW(), DATE_ADD(NOW(), INTERVAL 72 HOUR))`,
      [TEST_USER_ACTIVATION, tokenHash]
    )

    const res = await request('POST', '/api/v1/auth/activate', {
      body: {
        token: rawToken,
        password: 'ValidPassword123!#',
        confirmPassword: 'ValidPassword123!#'
      }
    })

    assert.equal(res.status, 410)
    assert.equal(res.body.error.code, 'TOKEN_ALREADY_USED')
  })

  test('Activation: Expired token (>72h) is rejected with 410', async () => {
    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = hashToken(rawToken)

    // Insert expired token
    await execute(
      `INSERT INTO activation_tokens (id, user_id, token_hash, used, expires_at)
       VALUES ('tok-test-004', ?, ?, FALSE, DATE_SUB(NOW(), INTERVAL 1 HOUR))`,
      [TEST_USER_ACTIVATION, tokenHash]
    )

    const res = await request('POST', '/api/v1/auth/activate', {
      body: {
        token: rawToken,
        password: 'ValidPassword123!#',
        confirmPassword: 'ValidPassword123!#'
      }
    })

    assert.equal(res.status, 410)
    assert.equal(res.body.error.code, 'TOKEN_EXPIRED')
  })

  // =========================================================================
  // 4. SESSION REVOCATION & LOGOUT-ALL TESTS
  // =========================================================================

  test('Session revocation: logout-all increments token_version and immediately invalidates active JWTs', async () => {
    // Generate valid JWT for active user
    const token = signAccessToken({
      id: TEST_USER_ACTIVE,
      email: 'active@pharmatrace.test',
      role: 'manufacturer',
      orgId: TEST_ORG_ACTIVE,
      tokenVersion: 1
    })

    const cookieHeader = `pt_access_token=${token}`

    // 1. Verify GET /api/v1/auth/me works with this token
    const meRes1 = await request('GET', '/api/v1/auth/me', {
      headers: { Cookie: cookieHeader }
    })
    assert.equal(meRes1.status, 200)
    assert.equal(meRes1.body.user.email, 'active@pharmatrace.test')

    // 2. Perform logout-all
    const logoutAllRes = await request('POST', '/api/v1/auth/logout-all', {
      headers: { Cookie: cookieHeader }
    })
    assert.equal(logoutAllRes.status, 200)

    // Verify token_version incremented in DB
    const [userRow] = await execute('SELECT token_version FROM users WHERE id = ?', [TEST_USER_ACTIVE])
    assert.equal(userRow[0].token_version, 2)

    // 3. Re-attempt GET /api/v1/auth/me with original token — must be rejected with 401 SESSION_REVOKED
    const meRes2 = await request('GET', '/api/v1/auth/me', {
      headers: { Cookie: cookieHeader }
    })
    assert.equal(meRes2.status, 401)
    assert.equal(meRes2.body.error.code, 'SESSION_REVOKED')
  })

  // =========================================================================
  // 5. CSRF & CORS DEFENSE TESTS
  // =========================================================================

  test('CSRF Defense: Mutating request without X-Requested-With header is rejected with 403', async () => {
    const res = await request('POST', '/api/v1/auth/login', {
      headers: {
        'X-Requested-With': '' // Missing custom header
      },
      body: { email: 'active@pharmatrace.test', password: TEST_PASSWORD }
    })

    assert.equal(res.status, 403)
    assert.equal(res.body.error.code, 'CSRF_INVALID_HEADER')
  })

  test('CSRF / CORS Defense: Mutating request with untrusted Origin is rejected with 403', async () => {
    const res = await request('POST', '/api/v1/auth/login', {
      headers: {
        'Origin': 'http://malicious-attacker-site.com'
      },
      body: { email: 'active@pharmatrace.test', password: TEST_PASSWORD }
    })

    assert.equal(res.status, 403)
    assert.ok(res.body.error === 'FORBIDDEN' || res.body.error?.code === 'CSRF_UNTRUSTED_ORIGIN')
  })

  // =========================================================================
  // 6. TENANT ISOLATION TESTS
  // =========================================================================

  test('Tenant isolation: assertTenantAccess blocks cross-organization access for supply-chain roles', () => {
    const manufacturerUser = { id: 'usr-1', role: 'manufacturer', orgId: 'org-A' }

    // Same organization access permitted
    assert.equal(assertTenantAccess(manufacturerUser, 'org-A'), true)

    // Cross-organization access throws 403
    assert.throws(
      () => assertTenantAccess(manufacturerUser, 'org-B'),
      /Tenant boundary violation/i
    )

    // Admin and Investigator roles permitted system-wide
    const adminUser = { id: 'usr-admin', role: 'admin', orgId: 'org-dgda' }
    const investigatorUser = { id: 'usr-inv', role: 'investigator', orgId: 'org-dgda' }
    assert.equal(assertTenantAccess(adminUser, 'org-A'), true)
    assert.equal(assertTenantAccess(investigatorUser, 'org-B'), true)
  })

  test('Tenant isolation: buildTenantQueryScope injects org_id filter for supply-chain queries', () => {
    const user = { id: 'usr-1', role: 'pharmacy', orgId: 'org-pharma-123' }
    const scope = buildTenantQueryScope(user, 'p.org_id')
    assert.equal(scope.sql, 'p.org_id = ?')
    assert.deepEqual(scope.params, ['org-pharma-123'])

    // Admin scope produces non-filtering 1=1
    const admin = { id: 'usr-admin', role: 'admin' }
    const adminScope = buildTenantQueryScope(admin)
    assert.equal(adminScope.sql, '1=1')
    assert.deepEqual(adminScope.params, [])
  })

  // =========================================================================
  // 7. INITIAL ADMINISTRATOR BOOTSTRAP TESTS
  // =========================================================================

  test('Bootstrap admin: creates initial DGDA administrator safely via transaction', async () => {
    // Delete any existing admin user for testing bootstrap
    await execute('DELETE FROM users WHERE role = "admin"')

    const result = await bootstrapAdmin({
      email: 'dgda_lead@pharmatrace.gov.bd',
      password: 'BootstrapAdmin2026!#'
    })

    assert.equal(result.created, true)
    assert.equal(result.email, 'dgda_lead@pharmatrace.gov.bd')

    // Verify admin exists in database
    const [adminRow] = await execute('SELECT email, role, status FROM users WHERE role = "admin"')
    assert.equal(adminRow.length, 1)
    assert.equal(adminRow[0].email, 'dgda_lead@pharmatrace.gov.bd')
    assert.equal(adminRow[0].status, 'active')

    // Second bootstrap attempt is safely aborted to prevent duplicate initial admins
    const duplicateAttempt = await bootstrapAdmin({
      email: 'second_admin@pharmatrace.gov.bd',
      password: 'BootstrapAdmin2026!#'
    })
    assert.equal(duplicateAttempt.created, false)
  })
})
