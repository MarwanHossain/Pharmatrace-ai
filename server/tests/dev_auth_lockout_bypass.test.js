// PharmaTrace AI — Development Auth Lockout Bypass Test Suite
// Verifies development lockout bypass functionality and ensures production protections remain strictly inviolable.
process.env.NODE_ENV = process.env.NODE_ENV || 'test'

import { describe, test, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import { app } from '../src/app.js'
import { getPool, closeDatabasePool, execute } from '../src/config/database.js'
import { createMigrationConnection } from '../src/database/migrator.js'
import { hashPassword } from '../src/utils/passwords.js'
import { AUTH_COOKIE_NAME } from '../src/utils/tokens.js'
import { env, isAuthLockoutBypassEnabled, validateAuthConfig } from '../src/config/env.js'
import { isRateLimitExempt, isLoginRateLimitExempt } from '../src/middleware/rateLimiter.js'
import { logger } from '../src/utils/logger.js'

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

const TEST_ORG_ID = 'org-dev-lockout-test-01'
const TEST_USER_ID = 'usr-dev-lockout-test-01'
const TEST_USER_EMAIL = 'lockout_tester@pharmatrace.test'
const TEST_PASSWORD = 'ValidPassword123!#'

describe('PharmaTrace AI — Development Auth Lockout Bypass Suite', () => {
  before(async () => {
    // Start HTTP server on an ephemeral port
    server = http.createServer(app)
    await new Promise(resolve => server.listen(0, resolve))
    const port = server.address().port
    baseUrl = `http://127.0.0.1:${port}`

    // Clean up any stale records using migration connection
    const cleanConn = await createMigrationConnection()
    try {
      await cleanConn.query('DELETE FROM users WHERE id = ?', [TEST_USER_ID])
      await cleanConn.query('DELETE FROM organizations WHERE id = ?', [TEST_ORG_ID])
    } finally {
      await cleanConn.end()
    }

    // Create test organization
    await execute(
      `INSERT INTO organizations (id, name, type, license_number, address, contact_name, contact_email, contact_phone, status, created_at, updated_at)
       VALUES (?, 'Dev Lockout Test Pharma Ltd', 'manufacturer', 'LIC-DEV-TEST-001', '123 Test Road, Dhaka', 'Tester Contact', ?, '+8801700000000', 'active', NOW(), NOW())`,
      [TEST_ORG_ID, TEST_USER_EMAIL]
    )

    // Create test user
    const passwordHash = await hashPassword(TEST_PASSWORD)
    await execute(
      `INSERT INTO users (id, org_id, name, email, password_hash, role, status, failed_login_attempts, locked_until, token_version, created_at, updated_at)
       VALUES (?, ?, 'Lockout Tester', ?, ?, 'manufacturer', 'active', 0, NULL, 1, NOW(), NOW())`,
      [TEST_USER_ID, TEST_ORG_ID, TEST_USER_EMAIL, passwordHash]
    )
  })

  after(async () => {
    // Teardown test entities using migration connection
    const cleanConn = await createMigrationConnection()
    try {
      await cleanConn.query('DELETE FROM users WHERE id = ?', [TEST_USER_ID])
      await cleanConn.query('DELETE FROM organizations WHERE id = ?', [TEST_ORG_ID])
    } finally {
      await cleanConn.end()
    }

    if (server) {
      await new Promise(resolve => server.close(resolve))
    }
    await closeDatabasePool()
  })

  // =========================================================================
  // Section 1: Configuration & Environment Safeguard Unit Tests
  // =========================================================================

  describe('1. Environment Configuration & Safeguard Checks', () => {
    const originalNodeEnv = process.env.NODE_ENV
    const originalBypass = process.env.DEV_AUTH_LOCKOUT_BYPASS

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv
      if (originalBypass !== undefined) {
        process.env.DEV_AUTH_LOCKOUT_BYPASS = originalBypass
      } else {
        delete process.env.DEV_AUTH_LOCKOUT_BYPASS
      }
    })

    test('isAuthLockoutBypassEnabled() returns false by default when setting is unset', () => {
      process.env.NODE_ENV = 'development'
      delete process.env.DEV_AUTH_LOCKOUT_BYPASS
      assert.equal(isAuthLockoutBypassEnabled(), false)
      assert.equal(env.DEV_AUTH_LOCKOUT_BYPASS, false)
    })

    test('isAuthLockoutBypassEnabled() returns false when set to "false" or "0" in development', () => {
      process.env.NODE_ENV = 'development'
      process.env.DEV_AUTH_LOCKOUT_BYPASS = 'false'
      assert.equal(isAuthLockoutBypassEnabled(), false)

      process.env.DEV_AUTH_LOCKOUT_BYPASS = '0'
      assert.equal(isAuthLockoutBypassEnabled(), false)
    })

    test('isAuthLockoutBypassEnabled() returns true when explicitly set to "true", "1", or "yes" in development', () => {
      process.env.NODE_ENV = 'development'

      process.env.DEV_AUTH_LOCKOUT_BYPASS = 'true'
      assert.equal(isAuthLockoutBypassEnabled(), true)
      assert.equal(env.DEV_AUTH_LOCKOUT_BYPASS, true)

      process.env.DEV_AUTH_LOCKOUT_BYPASS = '1'
      assert.equal(isAuthLockoutBypassEnabled(), true)

      process.env.DEV_AUTH_LOCKOUT_BYPASS = 'yes'
      assert.equal(isAuthLockoutBypassEnabled(), true)
    })

    test('FAIL-SAFE: bypass returns false when NODE_ENV is missing (undefined)', () => {
      delete process.env.NODE_ENV
      process.env.DEV_AUTH_LOCKOUT_BYPASS = 'true'

      assert.equal(isAuthLockoutBypassEnabled(), false)
      assert.equal(env.DEV_AUTH_LOCKOUT_BYPASS, false)
    })

    test('FAIL-SAFE: bypass returns false when NODE_ENV is empty or whitespace-only ("")', () => {
      process.env.NODE_ENV = ''
      process.env.DEV_AUTH_LOCKOUT_BYPASS = 'true'

      assert.equal(isAuthLockoutBypassEnabled(), false)
      assert.equal(env.DEV_AUTH_LOCKOUT_BYPASS, false)

      process.env.NODE_ENV = '   '
      assert.equal(isAuthLockoutBypassEnabled(), false)
      assert.equal(env.DEV_AUTH_LOCKOUT_BYPASS, false)
    })

    test('isAuthLockoutBypassEnabled() normalizes environment string padding ("development ")', () => {
      process.env.NODE_ENV = 'development '
      process.env.DEV_AUTH_LOCKOUT_BYPASS = 'true'

      assert.equal(isAuthLockoutBypassEnabled(), true)
      assert.equal(env.DEV_AUTH_LOCKOUT_BYPASS, true)
    })

    test('FAIL-SAFE: bypass returns false in test environment (NODE_ENV="test")', () => {
      process.env.NODE_ENV = 'test'
      process.env.DEV_AUTH_LOCKOUT_BYPASS = 'true'

      assert.equal(isAuthLockoutBypassEnabled(), false)
      assert.equal(env.DEV_AUTH_LOCKOUT_BYPASS, false)
    })

    test('FAIL-SAFE: bypass returns false in production environment (NODE_ENV="production")', () => {
      process.env.NODE_ENV = 'production'

      process.env.DEV_AUTH_LOCKOUT_BYPASS = 'true'
      assert.equal(isAuthLockoutBypassEnabled(), false)
      assert.equal(env.DEV_AUTH_LOCKOUT_BYPASS, false)

      process.env.DEV_AUTH_LOCKOUT_BYPASS = '1'
      assert.equal(isAuthLockoutBypassEnabled(), false)

      process.env.DEV_AUTH_LOCKOUT_BYPASS = 'yes'
      assert.equal(isAuthLockoutBypassEnabled(), false)
    })

    test('FAIL-SAFE: bypass returns false for unrecognized environment values ("staging", "qa", "preprod", "DEVELOPMENT")', () => {
      const unrecognizedEnvs = ['staging', 'qa', 'preprod', 'uat', 'custom', 'DEVELOPMENT', 'dev']

      for (const envVal of unrecognizedEnvs) {
        process.env.NODE_ENV = envVal
        process.env.DEV_AUTH_LOCKOUT_BYPASS = 'true'

        assert.equal(
          isAuthLockoutBypassEnabled(),
          false,
          `Expected bypass to be disabled when NODE_ENV="${envVal}"`
        )
        assert.equal(env.DEV_AUTH_LOCKOUT_BYPASS, false)
      }
    })

    test('validateAuthConfig emits warning if DEV_AUTH_LOCKOUT_BYPASS is configured in production', () => {
      process.env.NODE_ENV = 'production'
      process.env.DEV_AUTH_LOCKOUT_BYPASS = 'true'
      process.env.JWT_SECRET = 'a'.repeat(32)

      let warned = false
      const originalWarn = logger.warn
      logger.warn = (msg) => {
        if (msg.includes('DEV_AUTH_LOCKOUT_BYPASS is configured but strictly ignored')) {
          warned = true
        }
      }

      try {
        validateAuthConfig()
        assert.equal(warned, true, 'Expected warning when DEV_AUTH_LOCKOUT_BYPASS is set in production')
      } finally {
        logger.warn = originalWarn
      }
    })
  })

  // =========================================================================
  // Section 2: Rate Limiter Exemption Unit Tests
  // =========================================================================

  describe('2. Rate Limiter Exemption Logic (isLoginRateLimitExempt)', () => {
    const originalNodeEnv = process.env.NODE_ENV
    const originalBypass = process.env.DEV_AUTH_LOCKOUT_BYPASS

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv
      if (originalBypass !== undefined) {
        process.env.DEV_AUTH_LOCKOUT_BYPASS = originalBypass
      } else {
        delete process.env.DEV_AUTH_LOCKOUT_BYPASS
      }
    })

    test('isLoginRateLimitExempt returns true in development when bypass is enabled', () => {
      process.env.NODE_ENV = 'development'
      process.env.DEV_AUTH_LOCKOUT_BYPASS = 'true'

      const reqStandard = { headers: {} }
      assert.equal(isLoginRateLimitExempt(reqStandard), true)
    })

    test('isLoginRateLimitExempt returns false in development when bypass is disabled and no test header', () => {
      process.env.NODE_ENV = 'development'
      process.env.DEV_AUTH_LOCKOUT_BYPASS = 'false'

      const reqStandard = { headers: {} }
      assert.equal(isLoginRateLimitExempt(reqStandard), false)
    })

    test('isLoginRateLimitExempt returns false in production even if DEV_AUTH_LOCKOUT_BYPASS is true', () => {
      process.env.NODE_ENV = 'production'
      process.env.DEV_AUTH_LOCKOUT_BYPASS = 'true'

      const reqStandard = { headers: {} }
      assert.equal(isLoginRateLimitExempt(reqStandard), false)

      const reqWithTestHeader = { headers: { 'x-test-suite': 'true' } }
      assert.equal(isLoginRateLimitExempt(reqWithTestHeader), false)
    })

    test('isLoginRateLimitExempt returns false when NODE_ENV is missing or empty even if bypass is set', () => {
      delete process.env.NODE_ENV
      process.env.DEV_AUTH_LOCKOUT_BYPASS = 'true'
      assert.equal(isLoginRateLimitExempt({ headers: {} }), false)

      process.env.NODE_ENV = ''
      assert.equal(isLoginRateLimitExempt({ headers: {} }), false)
    })

    test('isLoginRateLimitExempt returns false when NODE_ENV is unrecognized (staging, qa) even if bypass is set', () => {
      for (const envVal of ['staging', 'qa', 'preprod', 'DEVELOPMENT']) {
        process.env.NODE_ENV = envVal
        process.env.DEV_AUTH_LOCKOUT_BYPASS = 'true'
        assert.equal(isLoginRateLimitExempt({ headers: {} }), false)
      }
    })

    test('isRateLimitExempt (general) remains strictly unchanged and immune to DEV_AUTH_LOCKOUT_BYPASS', () => {
      process.env.NODE_ENV = 'development'
      process.env.DEV_AUTH_LOCKOUT_BYPASS = 'true'

      const req = { headers: { 'x-test-suite': 'true' } }
      // isRateLimitExempt only permits NODE_ENV === 'test'
      assert.equal(isRateLimitExempt(req), false)
    })
  })

  // =========================================================================
  // Section 3: Integration Tests — Development Mode With Bypass Enabled
  // =========================================================================

  describe('3. Integration: Development Mode with Bypass Enabled', () => {
    beforeEach(async () => {
      process.env.NODE_ENV = 'development'
      process.env.DEV_AUTH_LOCKOUT_BYPASS = 'true'

      // Reset user state to active with 0 failed attempts
      await execute(
        'UPDATE users SET failed_login_attempts = 0, status = "active", locked_until = NULL WHERE id = ?',
        [TEST_USER_ID]
      )
    })

    test('allows 12 consecutive failed logins without 429 IP throttle or 423 account lockout', async () => {
      // Execute 12 failed login attempts with wrong password
      for (let i = 1; i <= 12; i++) {
        const res = await request('POST', '/api/v1/auth/login', {
          body: {
            email: TEST_USER_EMAIL,
            password: 'WrongPassword999!#'
          }
        })

        // Every attempt MUST return 401 INVALID_CREDENTIALS, never 429 or 423
        assert.equal(res.status, 401, `Attempt ${i} should return 401`)
        assert.equal(res.body.error.code, 'INVALID_CREDENTIALS')
      }

      // Verify in database: user status remains active, locked_until is NULL, failed_login_attempts tracked
      const [rows] = await execute(
        'SELECT status, failed_login_attempts, locked_until FROM users WHERE id = ?',
        [TEST_USER_ID]
      )
      assert.equal(rows[0].status, 'active')
      assert.equal(rows[0].locked_until, null)
      assert.equal(rows[0].failed_login_attempts, 12)

      // Subsequent attempt 13 with correct password succeeds immediately
      const successRes = await request('POST', '/api/v1/auth/login', {
        body: {
          email: TEST_USER_EMAIL,
          password: TEST_PASSWORD
        }
      })

      assert.equal(successRes.status, 200)
      assert.equal(successRes.body.success, true)
      assert.equal(successRes.body.user.email, TEST_USER_EMAIL)

      // Verify failed_login_attempts is reset to 0
      const [postLoginRows] = await execute(
        'SELECT status, failed_login_attempts, locked_until FROM users WHERE id = ?',
        [TEST_USER_ID]
      )
      assert.equal(postLoginRows[0].status, 'active')
      assert.equal(postLoginRows[0].failed_login_attempts, 0)
      assert.equal(postLoginRows[0].locked_until, null)
    })

    test('allows an already-locked account to authenticate and self-unlock with correct password', async () => {
      // Manually set account to locked with 15-minute future lock
      await execute(
        `UPDATE users 
         SET status = 'locked', 
             failed_login_attempts = 5, 
             locked_until = DATE_ADD(NOW(), INTERVAL 15 MINUTE) 
         WHERE id = ?`,
        [TEST_USER_ID]
      )

      // Attempt login with valid password
      const res = await request('POST', '/api/v1/auth/login', {
        body: {
          email: TEST_USER_EMAIL,
          password: TEST_PASSWORD
        }
      })

      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)

      // Database should reflect unlocked active status
      const [rows] = await execute(
        'SELECT status, failed_login_attempts, locked_until FROM users WHERE id = ?',
        [TEST_USER_ID]
      )
      assert.equal(rows[0].status, 'active')
      assert.equal(rows[0].failed_login_attempts, 0)
      assert.equal(rows[0].locked_until, null)
    })
  })

  // =========================================================================
  // Section 4: Integration Tests — Lockout Enforcement When Bypass is Disabled
  // =========================================================================

  describe('4. Integration: Lockout Enforcement with Bypass Disabled', () => {
    beforeEach(async () => {
      process.env.NODE_ENV = 'development'
      process.env.DEV_AUTH_LOCKOUT_BYPASS = 'false'

      // Reset user state to active with 0 failed attempts
      await execute(
        'UPDATE users SET failed_login_attempts = 0, status = "active", locked_until = NULL WHERE id = ?',
        [TEST_USER_ID]
      )
    })

    test('triggers 423 ACCOUNT_LOCKED on 5th consecutive failed attempt when bypass is disabled', async () => {
      // Attempts 1 through 4 should return 401 INVALID_CREDENTIALS
      for (let i = 1; i <= 4; i++) {
        const res = await request('POST', '/api/v1/auth/login', {
          headers: { 'X-Test-Suite': 'true' }, // Avoid IP rate limit to test account lockout specifically
          body: {
            email: TEST_USER_EMAIL,
            password: 'WrongPassword999!#'
          }
        })
        assert.equal(res.status, 401, `Attempt ${i} should return 401`)
        assert.equal(res.body.error.code, 'INVALID_CREDENTIALS')
      }

      // 5th attempt must trigger account lockout (HTTP 423)
      const fifthRes = await request('POST', '/api/v1/auth/login', {
        headers: { 'X-Test-Suite': 'true' },
        body: {
          email: TEST_USER_EMAIL,
          password: 'WrongPassword999!#'
        }
      })
      assert.equal(fifthRes.status, 423)
      assert.equal(fifthRes.body.error.code, 'ACCOUNT_LOCKED')

      // Database check: user is locked with future locked_until
      const [rows] = await execute(
        'SELECT status, failed_login_attempts, locked_until FROM users WHERE id = ?',
        [TEST_USER_ID]
      )
      assert.equal(rows[0].status, 'locked')
      assert.equal(rows[0].failed_login_attempts, 5)
      assert.ok(rows[0].locked_until !== null)

      // 6th attempt (even with CORRECT password) must be rejected with 423 while locked
      const sixthRes = await request('POST', '/api/v1/auth/login', {
        headers: { 'X-Test-Suite': 'true' },
        body: {
          email: TEST_USER_EMAIL,
          password: TEST_PASSWORD
        }
      })
      assert.equal(sixthRes.status, 423)
      assert.equal(sixthRes.body.error.code, 'ACCOUNT_LOCKED')
    })
  })

  // =========================================================================
  // Section 5: Unrestricted Logout Testing
  // =========================================================================

  describe('5. Unrestricted Client Logout Verification', () => {
    test('POST /api/v1/auth/logout succeeds repeatedly without rate limiting or affecting user counters', async () => {
      // Reset user state
      await execute(
        'UPDATE users SET failed_login_attempts = 2, status = "active", locked_until = NULL WHERE id = ?',
        [TEST_USER_ID]
      )

      // Execute 15 rapid logouts
      for (let i = 1; i <= 15; i++) {
        const res = await request('POST', '/api/v1/auth/logout')
        assert.equal(res.status, 200, `Logout ${i} should return 200`)
        assert.equal(res.body.success, true)
        assert.equal(res.body.message, 'Logged out successfully.')
        
        // Confirm cookie deletion header is present
        const setCookie = res.headers['set-cookie']
        assert.ok(setCookie, 'Expected Set-Cookie header clearing session')
        assert.ok(setCookie.some(c => c.includes(`${AUTH_COOKIE_NAME}=`)))
      }

      // Verify database state: user's failed_login_attempts remains completely untouched
      const [rows] = await execute(
        'SELECT status, failed_login_attempts, locked_until FROM users WHERE id = ?',
        [TEST_USER_ID]
      )
      assert.equal(rows[0].status, 'active')
      assert.equal(rows[0].failed_login_attempts, 2)
      assert.equal(rows[0].locked_until, null)
    })
  })
})
