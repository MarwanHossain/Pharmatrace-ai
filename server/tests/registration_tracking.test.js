// PharmaTrace AI — Registration Tracking & Applicant Resubmission Integration Tests
// Phase 3 Milestone 2: Registration Tracking, Single-Use Access Tokens, Hardened Rate Limiting & Resubmission Engine
process.env.NODE_ENV = 'test'
import { describe, test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import http from 'http'
import crypto from 'crypto'
import { app } from '../src/app.js'
import { getPool, closeDatabasePool } from '../src/config/database.js'
import {
  submitRegistration,
  resetRefAttemptsForTest,
  reserveRefAttempt,
  recordRefFailure,
  releaseRefReservation,
  isRefThrottled,
  getRefMapSizeForTest,
  getRefEntryForTest,
  setRefEntryForTest,
  sweepExpiredEntriesForTest,
  MAX_REF_ATTEMPTS,
  MAX_REF_MAP_SIZE
} from '../src/services/registration.service.js'
import { createRegistrationAccessToken, hashToken } from '../src/utils/tokens.js'
import { isRateLimitExempt } from '../src/middleware/rateLimiter.js'
import { sanitizeLogUrl } from '../src/middleware/requestLogger.js'
import { UPLOAD_DIR } from '../src/middleware/upload.js'
import { logger } from '../src/utils/logger.js'

let server
let baseUrl
const pool = getPool()

// Standard CSRF headers used across mutating requests
const standardHeaders = {
  'X-Requested-With': 'XMLHttpRequest',
  'Origin': 'http://localhost:5173',
  'X-Test-Suite': 'true',
  'Connection': 'close'
}

/**
 * Creates a sample registration in the database using submitRegistration
 */
async function createTestRegistration(overrides = {}) {
  const defaults = {
    category: 'manufacturer',
    pharmacy_classification: 'NOT_APPLICABLE',
    org_name: 'TrackTest Tracking Pharma Ltd',
    license_number: 'DL-TRACK-2026-001',
    address: 'Plot 10, Gazipur Industrial Area, Dhaka',
    contact_name: 'Dr. Shahabuddin Ahmed',
    contact_email: 'shahab@testtrackingpharma.com',
    contact_phone: '+8801700112233',
    applicant_note: 'Initial test registration.'
  }

  const data = { ...defaults, ...overrides }

  // Create a temporary file on disk for the initial intake
  const tempFileName = `test-intake-${crypto.randomUUID()}.pdf`
  const tempFilePath = path.join(UPLOAD_DIR, tempFileName)
  fs.writeFileSync(tempFilePath, 'Initial registration document PDF dummy content')

  const files = [
    {
      fieldname: 'license',
      originalname: 'mfg_license.pdf',
      filename: tempFileName,
      path: tempFilePath,
      size: 48,
      mimetype: 'application/pdf'
    }
  ]

  const result = await submitRegistration({ data, files })
  return result
}

/**
 * Helper to clean up all test data and test files from disk
 */
async function cleanupTestData() {
  resetRefAttemptsForTest()

  const [testRegs] = await pool.query(
    "SELECT id FROM organization_registrations WHERE org_name LIKE 'TrackTest %'"
  )

  if (testRegs.length > 0) {
    const regIds = testRegs.map(r => r.id)
    const placeholders = regIds.map(() => '?').join(',')

    // Get stored filenames to delete from disk
    const [docs] = await pool.query(
      `SELECT stored_filename FROM registration_documents WHERE registration_id IN (${placeholders})`,
      regIds
    )

    for (const doc of docs) {
      const filePath = path.join(UPLOAD_DIR, doc.stored_filename)
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath)
        } catch {
          // ignore
        }
      }
    }

    await pool.query(`DELETE FROM registration_access_tokens WHERE registration_id IN (${placeholders})`, regIds)
    await pool.query(`DELETE FROM registration_audit_log WHERE registration_id IN (${placeholders})`, regIds)
    await pool.query(`DELETE FROM registration_documents WHERE registration_id IN (${placeholders})`, regIds)
    await pool.query(`DELETE FROM registration_submissions WHERE registration_id IN (${placeholders})`, regIds)
    await pool.query(`DELETE FROM organization_registrations WHERE id IN (${placeholders})`, regIds)
  }
}

describe('Phase 3 Milestone 2 — Registration Tracking & Applicant Resubmission Suite', () => {
  before(async () => {
    server = http.createServer(app)
    await new Promise(resolve => server.listen(0, resolve))
    server.unref()
    baseUrl = `http://127.0.0.1:${server.address().port}`
    await cleanupTestData()
  })

  after(async () => {
    await cleanupTestData()
    if (server) {
      server.close()
    }
    await closeDatabasePool()
  })

  beforeEach(async () => {
    await cleanupTestData()
  })

  // ==========================================================================
  // 1. Correction 1: Untrusted Test Header Rate Limiter Bypass Elimination
  // ==========================================================================
  describe('Correction 1: Rate Limiter Exemption Security (isRateLimitExempt)', () => {
    test('strictly forbids rate limit bypass via X-Test-Suite in production environment', () => {
      const prevEnv = process.env.NODE_ENV
      try {
        process.env.NODE_ENV = 'production'
        const reqWithHeader = { headers: { 'x-test-suite': 'true' } }
        assert.equal(isRateLimitExempt(reqWithHeader), false)

        const reqWithoutHeader = { headers: {} }
        assert.equal(isRateLimitExempt(reqWithoutHeader), false)
      } finally {
        process.env.NODE_ENV = prevEnv || 'test'
      }
    })

    test('strictly forbids rate limit bypass via X-Test-Suite in development environment', () => {
      const prevEnv = process.env.NODE_ENV
      try {
        process.env.NODE_ENV = 'development'
        const reqWithHeader = { headers: { 'x-test-suite': 'true' } }
        assert.equal(isRateLimitExempt(reqWithHeader), false)

        const reqWithoutHeader = { headers: {} }
        assert.equal(isRateLimitExempt(reqWithoutHeader), false)
      } finally {
        process.env.NODE_ENV = prevEnv || 'test'
      }
    })

    test('permits rate limit exemption strictly when NODE_ENV is test AND X-Test-Suite is true', () => {
      const prevEnv = process.env.NODE_ENV
      try {
        process.env.NODE_ENV = 'test'
        const reqValid = { headers: { 'x-test-suite': 'true' } }
        assert.equal(isRateLimitExempt(reqValid), true)

        const reqMissingHeader = { headers: {} }
        assert.equal(isRateLimitExempt(reqMissingHeader), false)

        const reqFalseHeader = { headers: { 'x-test-suite': 'false' } }
        assert.equal(isRateLimitExempt(reqFalseHeader), false)
      } finally {
        process.env.NODE_ENV = prevEnv || 'test'
      }
    })
  })

  // ==========================================================================
  // 2. Correction 2: Pathname-Only Request Logging & Zero Credential Leakage
  // ==========================================================================
  describe('Correction 2: Pathname-Only Request Logging (sanitizeLogUrl)', () => {
    test('extracts strictly URL pathname and completely strips query strings', () => {
      assert.equal(
        sanitizeLogUrl('/api/v1/registrations/access/verify?token=0123456789abcdef0123456789abcdef'),
        '/api/v1/registrations/access/verify'
      )

      assert.equal(
        sanitizeLogUrl('/api/v1/registrations/access/verify?%74oken=secret_value'),
        '/api/v1/registrations/access/verify'
      )

      assert.equal(
        sanitizeLogUrl('/api/v1/registrations/access/verify?%61ccess_token=secret_value'),
        '/api/v1/registrations/access/verify'
      )

      assert.equal(
        sanitizeLogUrl('/api/v1/registrations/track?%70in=123456'),
        '/api/v1/registrations/track'
      )

      assert.equal(
        sanitizeLogUrl('/api/v1/registrations/access/verify?TOKEN=SECRET_TOKEN'),
        '/api/v1/registrations/access/verify'
      )

      assert.equal(
        sanitizeLogUrl('/api/v1/registrations/access/verify?Access_Token=SECRET_VALUE&foo=bar'),
        '/api/v1/registrations/access/verify'
      )

      assert.equal(
        sanitizeLogUrl('/api/v1/registrations/track?ref=REG-2026-0001&trackingPin=123456&pin=654321'),
        '/api/v1/registrations/track'
      )

      assert.equal(
        sanitizeLogUrl('/api/v1/registrations/categories/availability'),
        '/api/v1/registrations/categories/availability'
      )
    })

    test('proves no secret or query string appears in captured application logs', async () => {
      const capturedLogs = []
      const originalInfo = logger.info
      const originalWarn = logger.warn
      const originalError = logger.error

      logger.info = (msg, meta) => capturedLogs.push({ level: 'info', msg, meta })
      logger.warn = (msg, meta) => capturedLogs.push({ level: 'warn', msg, meta })
      logger.error = (msg, meta) => capturedLogs.push({ level: 'error', msg, meta })

      try {
        const secretToken = 'SECRET_TOKEN_XYZ_9876543210'
        const secretPin = '789123'

        // 1. Normal request logging with sensitive query strings
        await fetch(`${baseUrl}/api/v1/registrations/categories/availability?token=${secretToken}&%70in=${secretPin}`, {
          method: 'GET',
          headers: standardHeaders
        })

        // 2. Rejected route logging with percent-encoded query token
        await fetch(`${baseUrl}/api/v1/registrations/access/verify?%74oken=${secretToken}`, {
          method: 'GET',
          headers: standardHeaders
        })

        // 3. Trigger 404 with sensitive query parameter
        await fetch(`${baseUrl}/api/v1/registrations/unknown-endpoint?access_token=${secretToken}`, {
          method: 'GET',
          headers: standardHeaders
        })

        assert.ok(capturedLogs.length >= 3)
        for (const log of capturedLogs) {
          const serialized = JSON.stringify(log)
          assert.equal(serialized.includes(secretToken), false, `Secret token leaked in log: ${serialized}`)
          assert.equal(serialized.includes(secretPin), false, `Secret PIN leaked in log: ${serialized}`)
          assert.equal(serialized.includes('?token='), false, `Query string leaked in log: ${serialized}`)
          assert.equal(serialized.includes('?%74oken='), false, `Encoded query string leaked in log: ${serialized}`)
          assert.equal(serialized.includes('?access_token='), false, `Access token query leaked in log: ${serialized}`)
        }
      } finally {
        logger.info = originalInfo
        logger.warn = originalWarn
        logger.error = originalError
      }
    })
  })

  // ==========================================================================
  // 3. Correction 3: Non-Evicting Throttler Capacity Policy
  // ==========================================================================
  describe('Correction 3: Non-Evicting Throttler Capacity Policy (refAttempts)', () => {
    test('deletes empty entries when attempt timestamps expire', () => {
      resetRefAttemptsForTest()
      const testRef = 'REG-TEST-EXPIRY'
      recordRefFailure(testRef)
      assert.equal(getRefMapSizeForTest() > 0, true)

      // Simulate passage of time (> 15 minutes)
      const entry = getRefEntryForTest(testRef)
      assert.ok(entry)
      entry.failures = [Date.now() - (16 * 60 * 1000)] // 16 minutes ago

      const throttled = isRefThrottled(testRef)
      assert.equal(throttled, false)
      assert.equal(getRefEntryForTest(testRef), undefined)
    })

    test('active failure entries and pending reservations are NEVER evicted', () => {
      resetRefAttemptsForTest()
      const activeRef = 'REG-ACTIVE-PRESERVED'
      recordRefFailure(activeRef)
      const activeEntry = getRefEntryForTest(activeRef)
      assert.ok(activeEntry)
      assert.equal(activeEntry.failures.length, 1)

      const pendingRef = 'REG-PENDING-PRESERVED'
      setRefEntryForTest(pendingRef, { failures: [], pending: 1 })

      // Run sweep
      sweepExpiredEntriesForTest()

      // Both must remain intact in the map
      assert.ok(getRefEntryForTest(activeRef), 'Active entry must never be evicted')
      assert.ok(getRefEntryForTest(pendingRef), 'Pending entry must never be evicted')
    })

    test('refuses new reservation with false when capacity is reached and all entries are active', () => {
      resetRefAttemptsForTest()
      process.env.ENFORCE_REF_LIMIT = 'true'
      try {
        // Fill map to MAX_REF_MAP_SIZE with active entries
        const now = Date.now()
        for (let i = 0; i < MAX_REF_MAP_SIZE; i++) {
          setRefEntryForTest(`REG-CAP-${i}`, { failures: [now], pending: 0 })
        }
        assert.equal(getRefMapSizeForTest(), MAX_REF_MAP_SIZE)

        // Attempting to reserve a new reference must be refused (false) without evicting any existing active record
        const canReserveNew = reserveRefAttempt('REG-BRAND-NEW')
        assert.equal(canReserveNew, false)
        assert.equal(getRefMapSizeForTest(), MAX_REF_MAP_SIZE)
        assert.ok(getRefEntryForTest('REG-CAP-0'), 'First entry was preserved')
        assert.ok(getRefEntryForTest(`REG-CAP-${MAX_REF_MAP_SIZE - 1}`), 'Last entry was preserved')
      } finally {
        delete process.env.ENFORCE_REF_LIMIT
        resetRefAttemptsForTest()
      }
    })

    test('existing reference retains its previous failure count even when map is at capacity', () => {
      resetRefAttemptsForTest()
      process.env.ENFORCE_REF_LIMIT = 'true'
      try {
        const now = Date.now()
        const targetRef = 'REG-TARGET-EXISTING'
        setRefEntryForTest(targetRef, { failures: [now, now - 1000], pending: 0 })

        for (let i = 0; i < MAX_REF_MAP_SIZE - 1; i++) {
          setRefEntryForTest(`REG-FILL-${i}`, { failures: [now], pending: 0 })
        }
        assert.equal(getRefMapSizeForTest(), MAX_REF_MAP_SIZE)

        // Existing reference can still make an attempt within its 5-attempt budget
        const canAttemptExisting = reserveRefAttempt(targetRef)
        assert.equal(canAttemptExisting, true)

        const entry = getRefEntryForTest(targetRef)
        assert.equal(entry.failures.length, 2)
        assert.equal(entry.pending, 1)

        releaseRefReservation(targetRef)
        assert.equal(entry.pending, 0)
      } finally {
        delete process.env.ENFORCE_REF_LIMIT
        resetRefAttemptsForTest()
      }
    })

    test('reservation counters never become negative on release or failure', () => {
      resetRefAttemptsForTest()
      const testRef = 'REG-NON-NEGATIVE'
      setRefEntryForTest(testRef, { failures: [], pending: 0 })

      releaseRefReservation(testRef)
      const entry = getRefEntryForTest(testRef)
      // Entry is either deleted (cleaned up) or pending is 0, never negative
      if (entry) {
        assert.equal(entry.pending >= 0, true)
      }

      recordRefFailure(testRef)
      const afterFailure = getRefEntryForTest(testRef)
      assert.ok(afterFailure)
      assert.equal(afterFailure.pending >= 0, true)
    })
  })

  // ==========================================================================
  // 4. Concurrency Correction: Atomic Per-Reference Attempt Reservation
  // ==========================================================================
  describe('Concurrency Correction: Atomic Per-Reference Attempt Reservation', () => {
    test('concurrent failed tracking requests cannot exceed the 5-attempt budget', async () => {
      process.env.ENFORCE_REF_LIMIT = 'true'
      try {
        const reg = await createTestRegistration()

        // Launch 7 simultaneous failed tracking requests at the exact same millisecond
        const simultaneousRequests = Array.from({ length: 7 }, () =>
          fetch(`${baseUrl}/api/v1/registrations/track`, {
            method: 'POST',
            headers: {
              ...standardHeaders,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              referenceNumber: reg.referenceNumber,
              trackingPin: '000000' // wrong PIN
            })
          })
        )

        const responses = await Promise.all(simultaneousRequests)
        const statuses = responses.map(r => r.status)

        const count401 = statuses.filter(s => s === 401).length
        const count429 = statuses.filter(s => s === 429).length

        // Exactly 5 requests can consume attempt budget; remaining 2 must be throttled with 429
        assert.equal(count401, 5, `Expected exactly 5 failures (401), got ${count401}`)
        assert.equal(count429, 2, `Expected exactly 2 rate-limited (429), got ${count429}`)
      } finally {
        delete process.env.ENFORCE_REF_LIMIT
        resetRefAttemptsForTest()
      }
    })
  })

  // ==========================================================================
  // 5. Public Registration Status Tracking (POST /api/v1/registrations/track)
  // ==========================================================================
  describe('POST /api/v1/registrations/track', () => {
    test('returns 200 with sanitized tracking dossier for valid reference and PIN', async () => {
      const reg = await createTestRegistration()

      const res = await fetch(`${baseUrl}/api/v1/registrations/track`, {
        method: 'POST',
        headers: {
          ...standardHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          referenceNumber: reg.referenceNumber,
          trackingPin: reg.trackingPin
        })
      })

      assert.equal(res.status, 200)
      const json = await res.json()
      assert.equal(json.success, true)

      const dossier = json.data
      assert.equal(dossier.referenceNumber, reg.referenceNumber)
      assert.equal(dossier.status, 'SUBMITTED')
      assert.equal(dossier.category, 'manufacturer')
      assert.equal(dossier.orgName, 'TrackTest Tracking Pharma Ltd')
      assert.equal(dossier.pharmacyClassification, 'NOT_APPLICABLE')
      assert.equal(dossier.contactEmail, 'shahab@testtrackingpharma.com')
      assert.equal(dossier.currentVersion, 1)
      assert.equal(dossier.documentsCount, 1)
      assert.equal(dossier.canResubmit, false)
      assert.equal(dossier.reviewNotes, null)
      assert.equal(dossier.rejectionReason, null)
      assert.ok(dossier.submittedAt)
      assert.ok(dossier.updatedAt)

      // Strict security checks: ensure no hashes, internal reviewer IDs or secrets are leaked
      assert.equal(dossier.tracking_pin_hash, undefined)
      assert.equal(dossier.trackingPin, undefined)
      assert.equal(dossier.trackingPinHash, undefined)
      assert.equal(dossier.reviewed_by_user_id, undefined)
      assert.equal(dossier.reviewedByUserId, undefined)
      assert.equal(dossier.internal_notes, undefined)
    })

    test('exposes reviewNotes and sets canResubmit = true strictly when status is INFORMATION_REQUESTED', async () => {
      const reg = await createTestRegistration()

      await pool.query(
        `UPDATE organization_registrations 
         SET status = 'INFORMATION_REQUESTED', review_notes = 'Please provide updated GMP renewal certificate.'
         WHERE id = ?`,
        [reg.registrationId]
      )

      const res = await fetch(`${baseUrl}/api/v1/registrations/track`, {
        method: 'POST',
        headers: {
          ...standardHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          referenceNumber: reg.referenceNumber,
          trackingPin: reg.trackingPin
        })
      })

      assert.equal(res.status, 200)
      const json = await res.json()
      assert.equal(json.success, true)
      assert.equal(json.data.status, 'INFORMATION_REQUESTED')
      assert.equal(json.data.canResubmit, true)
      assert.equal(json.data.reviewNotes, 'Please provide updated GMP renewal certificate.')
    })

    test('exposes rejectionReason strictly when status is REJECTED', async () => {
      const reg = await createTestRegistration()

      await pool.query(
        `UPDATE organization_registrations 
         SET status = 'REJECTED', rejection_reason = 'INVALID_LICENSE', rejection_explanation = 'The provided license is expired.'
         WHERE id = ?`,
        [reg.registrationId]
      )

      const res = await fetch(`${baseUrl}/api/v1/registrations/track`, {
        method: 'POST',
        headers: {
          ...standardHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          referenceNumber: reg.referenceNumber,
          trackingPin: reg.trackingPin
        })
      })

      assert.equal(res.status, 200)
      const json = await res.json()
      assert.equal(json.success, true)
      assert.equal(json.data.status, 'REJECTED')
      assert.equal(json.data.canResubmit, false)
      assert.equal(json.data.reviewNotes, null)
      assert.equal(json.data.rejectionReason, 'INVALID_LICENSE')
    })

    test('rejects incorrect tracking PIN with 401 INVALID_CREDENTIALS', async () => {
      const reg = await createTestRegistration()

      const res = await fetch(`${baseUrl}/api/v1/registrations/track`, {
        method: 'POST',
        headers: {
          ...standardHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          referenceNumber: reg.referenceNumber,
          trackingPin: '999999' // wrong PIN
        })
      })

      assert.equal(res.status, 401)
      const json = await res.json()
      assert.equal(json.success, false)
      assert.equal(json.error.code, 'INVALID_CREDENTIALS')
      assert.equal(json.error.message, 'Invalid registration reference number or tracking PIN.')
    })

    test('rejects non-existent reference number with 401 INVALID_CREDENTIALS in constant work time', async () => {
      const start = Date.now()
      const res = await fetch(`${baseUrl}/api/v1/registrations/track`, {
        method: 'POST',
        headers: {
          ...standardHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          referenceNumber: 'REG-2099-9999',
          trackingPin: '123456'
        })
      })
      const elapsed = Date.now() - start

      assert.equal(res.status, 401)
      const json = await res.json()
      assert.equal(json.success, false)
      assert.equal(json.error.code, 'INVALID_CREDENTIALS')
      assert.equal(json.error.message, 'Invalid registration reference number or tracking PIN.')
      assert.ok(elapsed > 30, `Expected elapsed time > 30ms due to bcrypt dummy hash, got ${elapsed}ms`)
    })

    test('rejects malformed tracking PIN format with 400 INVALID_PIN_FORMAT', async () => {
      const invalidPins = ['12345', '1234567', 'abcdef', '12 456', '', null]

      for (const pin of invalidPins) {
        const res = await fetch(`${baseUrl}/api/v1/registrations/track`, {
          method: 'POST',
          headers: {
            ...standardHeaders,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            referenceNumber: 'REG-2026-0001',
            trackingPin: pin
          })
        })

        assert.equal(res.status, 400, `Expected 400 for PIN: ${pin}`)
        const json = await res.json()
        assert.equal(json.success, false)
        assert.equal(json.error.code, 'INVALID_PIN_FORMAT')
      }
    })

    test('enforces CSRF protection on POST /api/v1/registrations/track', async () => {
      // Missing X-Requested-With header
      const noCsrfRes = await fetch(`${baseUrl}/api/v1/registrations/track`, {
        method: 'POST',
        headers: {
          'Origin': 'http://localhost:5173',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          referenceNumber: 'REG-2026-0001',
          trackingPin: '123456'
        })
      })
      assert.equal(noCsrfRes.status, 403)

      // Untrusted Origin
      const untrustedOriginRes = await fetch(`${baseUrl}/api/v1/registrations/track`, {
        method: 'POST',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'Origin': 'https://attacker-phishing.org',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          referenceNumber: 'REG-2026-0001',
          trackingPin: '123456'
        })
      })
      assert.equal(untrustedOriginRes.status, 403)
    })
  })

  // ==========================================================================
  // 6. Access Token Verification & Security Headers (GET /api/v1/registrations/access/verify)
  // ==========================================================================
  describe('GET /api/v1/registrations/access/verify', () => {
    test('rejects query parameter token transport with 400 INSECURE_TOKEN_TRANSPORT', async () => {
      const res = await fetch(`${baseUrl}/api/v1/registrations/access/verify?token=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`, {
        headers: standardHeaders
      })

      assert.equal(res.status, 400)
      const json = await res.json()
      assert.equal(json.success, false)
      assert.equal(json.error.code, 'INSECURE_TOKEN_TRANSPORT')
      assert.ok(json.error.message.includes('Authorization header'))

      // Security headers must be present on rejection
      assert.equal(res.headers.get('cache-control'), 'no-store, no-cache, must-revalidate, private')
      assert.equal(res.headers.get('pragma'), 'no-cache')
      assert.equal(res.headers.get('referrer-policy'), 'no-referrer')
    })

    test('rejects missing Authorization header with 401 AUTHENTICATION_REQUIRED', async () => {
      const res = await fetch(`${baseUrl}/api/v1/registrations/access/verify`, {
        headers: standardHeaders
      })

      assert.equal(res.status, 401)
      const json = await res.json()
      assert.equal(json.error.code, 'AUTHENTICATION_REQUIRED')
      assert.equal(res.headers.get('cache-control'), 'no-store, no-cache, must-revalidate, private')
    })

    test('validates unused token via Authorization: Bearer <token> and sets strict anti-caching headers', async () => {
      const reg = await createTestRegistration()
      await pool.query(
        `UPDATE organization_registrations 
         SET status = 'INFORMATION_REQUESTED', review_notes = 'Upload updated trade license.'
         WHERE id = ?`,
        [reg.registrationId]
      )

      const tokenData = await createRegistrationAccessToken(pool, reg.registrationId, 7)

      const res = await fetch(`${baseUrl}/api/v1/registrations/access/verify`, {
        headers: {
          ...standardHeaders,
          'Authorization': `Bearer ${tokenData.rawToken}`
        }
      })

      assert.equal(res.status, 200)
      const json = await res.json()
      assert.equal(json.success, true)
      assert.equal(json.data.valid, true)
      assert.equal(json.data.referenceNumber, reg.referenceNumber)
      assert.equal(json.data.status, 'INFORMATION_REQUESTED')
      assert.equal(json.data.category, 'manufacturer')
      assert.equal(json.data.orgName, 'TrackTest Tracking Pharma Ltd')
      assert.equal(json.data.currentVersion, 1)
      assert.equal(json.data.reviewNotes, 'Upload updated trade license.')
      assert.ok(json.data.expiresAt)

      // Correction 4: Assert exact anti-caching and privacy headers
      assert.equal(res.headers.get('cache-control'), 'no-store, no-cache, must-revalidate, private')
      assert.equal(res.headers.get('pragma'), 'no-cache')
      assert.equal(res.headers.get('referrer-policy'), 'no-referrer')

      // Verification does NOT consume token
      const [checkRows] = await pool.query(
        'SELECT used FROM registration_access_tokens WHERE id = ?',
        [tokenData.id]
      )
      assert.equal(checkRows[0].used, 0)
    })

    test('rejects expired token with 403 TOKEN_EXPIRED', async () => {
      const reg = await createTestRegistration()
      await pool.query(
        "UPDATE organization_registrations SET status = 'INFORMATION_REQUESTED' WHERE id = ?",
        [reg.registrationId]
      )

      const tokenData = await createRegistrationAccessToken(pool, reg.registrationId, -1) // expired yesterday

      const res = await fetch(`${baseUrl}/api/v1/registrations/access/verify`, {
        headers: {
          ...standardHeaders,
          'Authorization': `Bearer ${tokenData.rawToken}`
        }
      })

      assert.equal(res.status, 403)
      const json = await res.json()
      assert.equal(json.error.code, 'TOKEN_EXPIRED')
    })

    test('rejects revoked token with 403 TOKEN_REVOKED', async () => {
      const reg = await createTestRegistration()
      await pool.query(
        "UPDATE organization_registrations SET status = 'INFORMATION_REQUESTED' WHERE id = ?",
        [reg.registrationId]
      )

      const tokenData = await createRegistrationAccessToken(pool, reg.registrationId, 7)
      await pool.query('UPDATE registration_access_tokens SET revoked = 1 WHERE id = ?', [tokenData.id])

      const res = await fetch(`${baseUrl}/api/v1/registrations/access/verify`, {
        headers: {
          ...standardHeaders,
          'Authorization': `Bearer ${tokenData.rawToken}`
        }
      })

      assert.equal(res.status, 403)
      const json = await res.json()
      assert.equal(json.error.code, 'TOKEN_REVOKED')
    })

    test('rejects already used token with 403 TOKEN_ALREADY_USED', async () => {
      const reg = await createTestRegistration()
      await pool.query(
        "UPDATE organization_registrations SET status = 'INFORMATION_REQUESTED' WHERE id = ?",
        [reg.registrationId]
      )

      const tokenData = await createRegistrationAccessToken(pool, reg.registrationId, 7)
      await pool.query('UPDATE registration_access_tokens SET used = 1 WHERE id = ?', [tokenData.id])

      const res = await fetch(`${baseUrl}/api/v1/registrations/access/verify`, {
        headers: {
          ...standardHeaders,
          'Authorization': `Bearer ${tokenData.rawToken}`
        }
      })

      assert.equal(res.status, 403)
      const json = await res.json()
      assert.equal(json.error.code, 'TOKEN_ALREADY_USED')
    })

    test('rejects token when registration is NOT in INFORMATION_REQUESTED status with 409 INVALID_STATE', async () => {
      const reg = await createTestRegistration() // status is 'SUBMITTED'
      const tokenData = await createRegistrationAccessToken(pool, reg.registrationId, 7)

      const res = await fetch(`${baseUrl}/api/v1/registrations/access/verify`, {
        headers: {
          ...standardHeaders,
          'Authorization': `Bearer ${tokenData.rawToken}`
        }
      })

      assert.equal(res.status, 409)
      const json = await res.json()
      assert.equal(json.error.code, 'INVALID_STATE')
    })
  })

  // ==========================================================================
  // 7. Applicant Resubmission Pipeline & Strict Multipart Field Validation
  // ==========================================================================
  describe('POST /api/v1/registrations/resubmit', () => {
    test('rejects query parameter token in resubmission with 400 INSECURE_TOKEN_TRANSPORT', async () => {
      const form = new FormData()
      form.append('applicant_note', 'Attempting resubmit with query token.')

      const res = await fetch(`${baseUrl}/api/v1/registrations/resubmit?token=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 400)
      const json = await res.json()
      assert.equal(json.error.code, 'INSECURE_TOKEN_TRANSPORT')
    })

    test('rejects duplicate multipart scalar fields with 400 INVALID_INPUT_TYPE', async () => {
      const reg = await createTestRegistration()
      await pool.query(
        "UPDATE organization_registrations SET status = 'INFORMATION_REQUESTED' WHERE id = ?",
        [reg.registrationId]
      )

      // Multer parses duplicate keys into an array
      const form = new FormData()
      form.append('referenceNumber', reg.referenceNumber)
      form.append('trackingPin', reg.trackingPin)
      form.append('org_name', 'Duplicate Org 1')
      form.append('org_name', 'Duplicate Org 2') // Duplicate key!

      const res = await fetch(`${baseUrl}/api/v1/registrations/resubmit`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 400)
      const json = await res.json()
      assert.equal(json.error.code, 'INVALID_INPUT_TYPE')
    })

    test('rejects duplicate contact information fields with 400 INVALID_INPUT_TYPE', async () => {
      const reg = await createTestRegistration()
      await pool.query(
        "UPDATE organization_registrations SET status = 'INFORMATION_REQUESTED' WHERE id = ?",
        [reg.registrationId]
      )

      const form = new FormData()
      form.append('referenceNumber', reg.referenceNumber)
      form.append('trackingPin', reg.trackingPin)
      form.append('contact_email', 'email1@pharma.test')
      form.append('contact_email', 'email2@pharma.test') // Duplicate key!

      const res = await fetch(`${baseUrl}/api/v1/registrations/resubmit`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 400)
      const json = await res.json()
      assert.equal(json.error.code, 'INVALID_INPUT_TYPE')
    })

    test('rejects resubmission when application status is NOT INFORMATION_REQUESTED (409 INVALID_STATE)', async () => {
      const reg = await createTestRegistration() // Default is 'SUBMITTED'

      const form = new FormData()
      form.append('referenceNumber', reg.referenceNumber)
      form.append('trackingPin', reg.trackingPin)
      form.append('applicant_note', 'Attempting premature resubmission.')

      const res = await fetch(`${baseUrl}/api/v1/registrations/resubmit`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 409)
      const json = await res.json()
      assert.equal(json.error.code, 'INVALID_STATE')
    })

    test('rejects multipart resubmission with ?token= before Multer and leaves zero files on disk', async () => {
      const filesBefore = fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR) : []
      const secretToken = 'SECRET_QUERY_TOKEN_999888777'

      const form = new FormData()
      form.append('applicant_note', 'Attempting upload with insecure query token')
      const file = new Blob(['File content that must not be saved to disk'], { type: 'application/pdf' })
      form.append('document', file, 'insecure_token_upload.pdf')

      const res = await fetch(`${baseUrl}/api/v1/registrations/resubmit?token=${secretToken}`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 400)
      const json = await res.json()
      assert.equal(json.error.code, 'INSECURE_TOKEN_TRANSPORT')
      assert.equal(JSON.stringify(json).includes(secretToken), false, 'Token must not appear in response')

      const filesAfter = fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR) : []
      const leaked = filesAfter.filter(f => !filesBefore.includes(f))
      assert.equal(leaked.length, 0, `Expected 0 files on disk, found leaked: ${leaked.join(', ')}`)
    })

    test('rejects multipart resubmission with ?access_token= before Multer and leaves zero files on disk', async () => {
      const filesBefore = fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR) : []
      const secretToken = 'SECRET_ACCESS_TOKEN_555444333'

      const form = new FormData()
      const file = new Blob(['File content that must not be saved to disk'], { type: 'application/pdf' })
      form.append('document', file, 'insecure_access_token_upload.pdf')

      const res = await fetch(`${baseUrl}/api/v1/registrations/resubmit?access_token=${secretToken}`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 400)
      const json = await res.json()
      assert.equal(json.error.code, 'INSECURE_TOKEN_TRANSPORT')

      const filesAfter = fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR) : []
      const leaked = filesAfter.filter(f => !filesBefore.includes(f))
      assert.equal(leaked.length, 0, `Expected 0 files on disk, found leaked: ${leaked.join(', ')}`)
    })

    test('rejects multipart resubmission with percent-encoded query param ?%74oken= before Multer', async () => {
      const filesBefore = fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR) : []
      const secretToken = 'SECRET_ENCODED_TOKEN_111222'

      const form = new FormData()
      const file = new Blob(['File content that must not be saved to disk'], { type: 'application/pdf' })
      form.append('document', file, 'encoded_token_upload.pdf')

      const res = await fetch(`${baseUrl}/api/v1/registrations/resubmit?%74oken=${secretToken}`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 400)
      const json = await res.json()
      assert.equal(json.error.code, 'INSECURE_TOKEN_TRANSPORT')

      const filesAfter = fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR) : []
      const leaked = filesAfter.filter(f => !filesBefore.includes(f))
      assert.equal(leaked.length, 0, `Expected 0 files on disk, found leaked: ${leaked.join(', ')}`)
    })

    test('rejects multipart resubmission with percent-encoded query param ?%61ccess_token= before Multer', async () => {
      const filesBefore = fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR) : []
      const secretToken = 'SECRET_ENCODED_ACCESS_TOKEN_333'

      const form = new FormData()
      const file = new Blob(['File content that must not be saved to disk'], { type: 'application/pdf' })
      form.append('document', file, 'encoded_access_token_upload.pdf')

      const res = await fetch(`${baseUrl}/api/v1/registrations/resubmit?%61ccess_token=${secretToken}`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 400)
      const json = await res.json()
      assert.equal(json.error.code, 'INSECURE_TOKEN_TRANSPORT')

      const filesAfter = fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR) : []
      const leaked = filesAfter.filter(f => !filesBefore.includes(f))
      assert.equal(leaked.length, 0, `Expected 0 files on disk, found leaked: ${leaked.join(', ')}`)
    })

    test('rejects resubmission when authentication is missing (401 AUTHENTICATION_REQUIRED)', async () => {
      const form = new FormData()
      form.append('applicant_note', 'No auth provided.')

      const res = await fetch(`${baseUrl}/api/v1/registrations/resubmit`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 401)
      const json = await res.json()
      assert.equal(json.error.code, 'AUTHENTICATION_REQUIRED')
    })

    test('rejects resubmission when BOTH PIN and Token are provided (400 AMBIGUOUS_AUTHENTICATION)', async () => {
      const reg = await createTestRegistration()
      const tokenData = await createRegistrationAccessToken(pool, reg.registrationId, 7)

      const form = new FormData()
      form.append('referenceNumber', reg.referenceNumber)
      form.append('trackingPin', reg.trackingPin)

      const res = await fetch(`${baseUrl}/api/v1/registrations/resubmit`, {
        method: 'POST',
        headers: {
          ...standardHeaders,
          'Authorization': `Bearer ${tokenData.rawToken}`
        },
        body: form
      })

      assert.equal(res.status, 400)
      const json = await res.json()
      assert.equal(json.error.code, 'AMBIGUOUS_AUTHENTICATION')
    })

    test('rejects resubmission with wrong PIN (401 INVALID_CREDENTIALS)', async () => {
      const reg = await createTestRegistration()
      await pool.query(
        "UPDATE organization_registrations SET status = 'INFORMATION_REQUESTED' WHERE id = ?",
        [reg.registrationId]
      )

      const form = new FormData()
      form.append('referenceNumber', reg.referenceNumber)
      form.append('trackingPin', '999999') // wrong PIN

      const res = await fetch(`${baseUrl}/api/v1/registrations/resubmit`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 401)
      const json = await res.json()
      assert.equal(json.error.code, 'INVALID_CREDENTIALS')
    })

    test('rejects resubmission when payload contains password fields (400 PASSWORD_NOT_PERMITTED)', async () => {
      const reg = await createTestRegistration()
      await pool.query(
        "UPDATE organization_registrations SET status = 'INFORMATION_REQUESTED' WHERE id = ?",
        [reg.registrationId]
      )

      const form = new FormData()
      form.append('referenceNumber', reg.referenceNumber)
      form.append('trackingPin', reg.trackingPin)
      form.append('password', 'SecretP@ss123!')

      const res = await fetch(`${baseUrl}/api/v1/registrations/resubmit`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 400)
      const json = await res.json()
      assert.equal(json.error.code, 'PASSWORD_NOT_PERMITTED')
    })

    test('rejects tampering with immutable category or classification (400 IMMUTABLE_FIELD)', async () => {
      const reg = await createTestRegistration()
      await pool.query(
        "UPDATE organization_registrations SET status = 'INFORMATION_REQUESTED' WHERE id = ?",
        [reg.registrationId]
      )

      const formCat = new FormData()
      formCat.append('referenceNumber', reg.referenceNumber)
      formCat.append('trackingPin', reg.trackingPin)
      formCat.append('category', 'pharmacy')

      const resCat = await fetch(`${baseUrl}/api/v1/registrations/resubmit`, {
        method: 'POST',
        headers: standardHeaders,
        body: formCat
      })

      assert.equal(resCat.status, 400)
      const jsonCat = await resCat.json()
      assert.equal(jsonCat.error.code, 'IMMUTABLE_FIELD')
    })

    test('successfully resubmits via reference + PIN: updates version to 2, transitions to UNDER_REVIEW, preserves v1 docs', async () => {
      const reg = await createTestRegistration()
      await pool.query(
        `UPDATE organization_registrations 
         SET status = 'INFORMATION_REQUESTED', review_notes = 'Please provide updated trade license.' 
         WHERE id = ?`,
        [reg.registrationId]
      )

      const [v1Docs] = await pool.query(
        'SELECT id, stored_filename, submission_version FROM registration_documents WHERE registration_id = ?',
        [reg.registrationId]
      )
      assert.equal(v1Docs.length, 1)
      assert.equal(v1Docs[0].submission_version, 1)

      const form = new FormData()
      form.append('referenceNumber', reg.referenceNumber)
      form.append('trackingPin', reg.trackingPin)
      form.append('org_name', 'TrackTest Updated Pharma Ltd')
      form.append('address', 'Plot 99, Updated Industrial Area, Dhaka')
      form.append('applicant_note', 'Attached revised 2026 trade license as requested.')

      const v2FileBlob = new Blob(['Updated 2026 trade license document content'], { type: 'application/pdf' })
      form.append('trade_license', v2FileBlob, 'revised_license_2026.pdf')

      const res = await fetch(`${baseUrl}/api/v1/registrations/resubmit`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 200)
      const json = await res.json()
      assert.equal(json.success, true)
      assert.equal(json.data.referenceNumber, reg.referenceNumber)
      assert.equal(json.data.status, 'UNDER_REVIEW')
      assert.equal(json.data.submissionVersion, 2)
      assert.equal(json.data.documentsCount, 1)

      const [updatedRegRows] = await pool.query(
        'SELECT status, org_name, address FROM organization_registrations WHERE id = ?',
        [reg.registrationId]
      )
      assert.equal(updatedRegRows[0].status, 'UNDER_REVIEW')
      assert.equal(updatedRegRows[0].org_name, 'TrackTest Updated Pharma Ltd')

      const [allDocs] = await pool.query(
        'SELECT id, submission_version, original_name, stored_filename FROM registration_documents WHERE registration_id = ? ORDER BY submission_version ASC',
        [reg.registrationId]
      )
      assert.equal(allDocs.length, 2)
      assert.equal(allDocs[0].submission_version, 1)
      assert.equal(allDocs[1].submission_version, 2)
      assert.ok(fs.existsSync(path.join(UPLOAD_DIR, allDocs[0].stored_filename)))
      assert.ok(fs.existsSync(path.join(UPLOAD_DIR, allDocs[1].stored_filename)))

      const [submissions] = await pool.query(
        'SELECT version, submitted_data, applicant_note FROM registration_submissions WHERE registration_id = ? ORDER BY version ASC',
        [reg.registrationId]
      )
      assert.equal(submissions.length, 2)
      assert.equal(submissions[1].version, 2)
      assert.equal(submissions[1].applicant_note, 'Attached revised 2026 trade license as requested.')

      const [auditRows] = await pool.query(
        'SELECT actor_role, from_status, to_status, action_type, comment FROM registration_audit_log WHERE registration_id = ? ORDER BY id DESC LIMIT 1',
        [reg.registrationId]
      )
      assert.equal(auditRows.length, 1)
      assert.equal(auditRows[0].actor_role, 'APPLICANT')
      assert.equal(auditRows[0].from_status, 'INFORMATION_REQUESTED')
      assert.equal(auditRows[0].to_status, 'UNDER_REVIEW')
      assert.equal(auditRows[0].action_type, 'INFORMATION_RESUBMITTED')
    })

    test('successfully resubmits via Bearer access token and consumes token atomically (replay protection)', async () => {
      const reg = await createTestRegistration()
      await pool.query(
        `UPDATE organization_registrations 
         SET status = 'INFORMATION_REQUESTED', review_notes = 'Need updated contact phone.' 
         WHERE id = ?`,
        [reg.registrationId]
      )

      const tokenData = await createRegistrationAccessToken(pool, reg.registrationId, 7)

      const form = new FormData()
      form.append('contact_phone', '+8801799887766')
      form.append('applicant_note', 'Updated contact phone number.')

      const res = await fetch(`${baseUrl}/api/v1/registrations/resubmit`, {
        method: 'POST',
        headers: {
          ...standardHeaders,
          'Authorization': `Bearer ${tokenData.rawToken}`
        },
        body: form
      })

      assert.equal(res.status, 200)
      const json = await res.json()
      assert.equal(json.success, true)
      assert.equal(json.data.status, 'UNDER_REVIEW')
      assert.equal(json.data.submissionVersion, 2)

      const [tokenRows] = await pool.query(
        'SELECT used FROM registration_access_tokens WHERE id = ?',
        [tokenData.id]
      )
      assert.equal(tokenRows[0].used, 1)

      // Replay Protection: Trying to use the token again immediately fails with 403 TOKEN_ALREADY_USED
      const formReplay = new FormData()
      formReplay.append('applicant_note', 'Attempting replay with used token.')

      const replayRes = await fetch(`${baseUrl}/api/v1/registrations/resubmit`, {
        method: 'POST',
        headers: {
          ...standardHeaders,
          'Authorization': `Bearer ${tokenData.rawToken}`
        },
        body: formReplay
      })

      assert.equal(replayRes.status, 403)
      const replayJson = await replayRes.json()
      assert.equal(replayJson.error.code, 'TOKEN_ALREADY_USED')
    })

    test('cleans up newly uploaded files on validation rollback', async () => {
      const reg = await createTestRegistration()
      await pool.query(
        "UPDATE organization_registrations SET status = 'INFORMATION_REQUESTED' WHERE id = ?",
        [reg.registrationId]
      )

      const form = new FormData()
      form.append('referenceNumber', reg.referenceNumber)
      form.append('trackingPin', reg.trackingPin)
      form.append('contact_email', 'invalid-email-format') // Validation failure

      const dummyFile = new Blob(['Should be cleaned up on failure'], { type: 'application/pdf' })
      form.append('document', dummyFile, 'temp_failure_doc.pdf')

      const res = await fetch(`${baseUrl}/api/v1/registrations/resubmit`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 400)
      const json = await res.json()
      assert.equal(json.error.code, 'INVALID_CONTACT_EMAIL')

      const filesOnDisk = fs.readdirSync(UPLOAD_DIR)
      const matchedFiles = filesOnDisk.filter(f => f.includes('temp_failure_doc'))
      assert.equal(matchedFiles.length, 0)
    })

    test('cleans up partial files when Multer upload middleware encounters an error before the controller', async () => {
      const reg = await createTestRegistration()
      await pool.query(
        "UPDATE organization_registrations SET status = 'INFORMATION_REQUESTED' WHERE id = ?",
        [reg.registrationId]
      )

      // Submit 1 valid PDF followed by 1 invalid MIME type (.txt)
      const form = new FormData()
      form.append('referenceNumber', reg.referenceNumber)
      form.append('trackingPin', reg.trackingPin)

      const validPdf = new Blob(['Valid PDF content'], { type: 'application/pdf' })
      form.append('doc1', validPdf, 'pre_ctrl_clean_valid.pdf')

      const invalidTxt = new Blob(['Invalid TXT content'], { type: 'text/plain' })
      form.append('doc2', invalidTxt, 'pre_ctrl_clean_invalid.txt')

      const res = await fetch(`${baseUrl}/api/v1/registrations/resubmit`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 400)
      const json = await res.json()
      assert.equal(json.error.code, 'INVALID_FILE_TYPE')

      // Filesystem check: Confirm doc1 was cleaned up and not left orphaned
      const filesOnDisk = fs.readdirSync(UPLOAD_DIR)
      const matchedFiles = filesOnDisk.filter(f => f.includes('pre_ctrl_clean'))
      assert.equal(matchedFiles.length, 0, 'Expected partially written files to be unlinked on upload error')
    })

    test('concurrency: simultaneous resubmission requests on the same application resolve safely', async () => {
      const reg = await createTestRegistration()
      await pool.query(
        "UPDATE organization_registrations SET status = 'INFORMATION_REQUESTED' WHERE id = ?",
        [reg.registrationId]
      )

      const form1 = new FormData()
      form1.append('referenceNumber', reg.referenceNumber)
      form1.append('trackingPin', reg.trackingPin)
      form1.append('org_name', 'TrackTest Concurrent Org A')

      const form2 = new FormData()
      form2.append('referenceNumber', reg.referenceNumber)
      form2.append('trackingPin', reg.trackingPin)
      form2.append('org_name', 'TrackTest Concurrent Org B')

      const [res1, res2] = await Promise.all([
        fetch(`${baseUrl}/api/v1/registrations/resubmit`, {
          method: 'POST',
          headers: standardHeaders,
          body: form1
        }),
        fetch(`${baseUrl}/api/v1/registrations/resubmit`, {
          method: 'POST',
          headers: standardHeaders,
          body: form2
        })
      ])

      const statuses = [res1.status, res2.status].sort()
      assert.deepEqual(statuses, [200, 409])

      const [submissions] = await pool.query(
        'SELECT version FROM registration_submissions WHERE registration_id = ? ORDER BY version ASC',
        [reg.registrationId]
      )
      assert.equal(submissions.length, 2)
      assert.equal(submissions[0].version, 1)
      assert.equal(submissions[1].version, 2)
    })
  })
})
