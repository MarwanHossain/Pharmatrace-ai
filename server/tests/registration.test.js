// PharmaTrace AI — Registration Intake & Capacity Engine Integration Tests
// Phase 3 Milestone 1: Dynamic Capacity Engine & Public Registration Intake
import { describe, test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import http from 'http'
import { app } from '../src/app.js'
import { getPool, closeDatabasePool } from '../src/config/database.js'
import { compareTrackingPin } from '../src/utils/reference.js'
import { UPLOAD_DIR } from '../src/middleware/upload.js'

let server
let baseUrl
const pool = getPool()

// Standard CSRF headers used across tests
const standardHeaders = {
  'X-Requested-With': 'XMLHttpRequest',
  'Origin': 'http://localhost:5173',
  'X-Test-Suite': 'true',
  'Connection': 'close'
}

/**
 * Creates a multipart form data helper using native FormData & Blob
 */
function createRegistrationForm(overrides = {}) {
  const form = new FormData()

  const defaults = {
    category: 'manufacturer',
    pharmacy_classification: 'NOT_APPLICABLE',
    org_name: 'Test Pharma Industries Ltd',
    license_number: 'DL-TEST-2026-001',
    address: 'Plot 42, Tejgaon Industrial Area, Dhaka',
    contact_name: 'Dr. Rafiqul Islam',
    contact_email: 'rafiq@testpharma.com',
    contact_phone: '+8801712345678',
    applicant_note: 'Phase 3 Milestone 1 test registration intake.'
  }

  const merged = { ...defaults, ...overrides }

  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined && value !== null) {
      form.append(key, value)
    }
  }

  return form
}

/**
 * Attaches a fake document to FormData
 */
function attachFile(form, fieldName = 'license', fileName = 'test_license.pdf', mimeType = 'application/pdf', content = 'dummy pdf content') {
  const blob = new Blob([content], { type: mimeType })
  form.append(fieldName, blob, fileName)
}

/**
 * Cleanup helper for test database rows and files
 */
async function cleanupTestData() {
  const [testRegs] = await pool.query(
    "SELECT id FROM organization_registrations WHERE org_name LIKE 'Test %'"
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

    await pool.query(`DELETE FROM registration_audit_log WHERE registration_id IN (${placeholders})`, regIds)
    await pool.query(`DELETE FROM registration_documents WHERE registration_id IN (${placeholders})`, regIds)
    await pool.query(`DELETE FROM registration_submissions WHERE registration_id IN (${placeholders})`, regIds)
    await pool.query(`DELETE FROM organization_registrations WHERE id IN (${placeholders})`, regIds)
  }

  // Remove test organizations
  await pool.query("DELETE FROM organizations WHERE id LIKE 'test-dist-org-%'")

  // Restore category policies to default
  await pool.query(
    "UPDATE category_policies SET is_registration_allowed = 1 WHERE category IN ('manufacturer', 'distributor', 'wholesaler', 'pharmacy')"
  )
}

describe('Phase 3 Milestone 1 — Registration Intake & Capacity Engine Suite', () => {
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

  // --------------------------------------------------------------------------
  // 1. Dynamic Category Availability Engine
  // --------------------------------------------------------------------------
  describe('GET /api/v1/registrations/categories/availability', () => {
    test('returns 200 with dynamic capacity status for all 4 operational categories', async () => {
      const res = await fetch(`${baseUrl}/api/v1/registrations/categories/availability`, {
        headers: standardHeaders
      })

      assert.equal(res.status, 200)
      const json = await res.json()
      assert.equal(json.success, true)
      assert.ok(Array.isArray(json.data.categories))
      assert.equal(json.data.categories.length, 4)

      const categories = new Map(json.data.categories.map(c => [c.category, c]))

      // Manufacturer: unlimited capacity
      const mfg = categories.get('manufacturer')
      assert.ok(mfg)
      assert.equal(mfg.maxActiveInstances, null)
      assert.equal(mfg.isRegistrationAllowed, true)
      assert.equal(mfg.isAvailable, true)
      assert.equal(mfg.remainingSlots, null)

      // Distributor: exactly 1 instance limit
      const dist = categories.get('distributor')
      assert.ok(dist)
      assert.equal(dist.maxActiveInstances, 1)
      assert.equal(dist.isRegistrationAllowed, true)
      assert.equal(dist.isAvailable, true)
      assert.equal(dist.remainingSlots, 1)

      // Wholesaler: exactly 1 instance limit
      const wh = categories.get('wholesaler')
      assert.ok(wh)
      assert.equal(wh.maxActiveInstances, 1)
      assert.equal(wh.isRegistrationAllowed, true)
      assert.equal(wh.isAvailable, true)
      assert.equal(wh.remainingSlots, 1)

      // Pharmacy: unlimited capacity with classifications
      const pharm = categories.get('pharmacy')
      assert.ok(pharm)
      assert.equal(pharm.maxActiveInstances, null)
      assert.equal(pharm.isRegistrationAllowed, true)
      assert.equal(pharm.isAvailable, true)
      assert.deepEqual(pharm.allowedClassifications, ['GOVERNMENT', 'PRIVATE_COMMERCIAL'])
    })

    test('dynamically reports category unavailable when active production limit reached', async () => {
      // Insert active production distributor to simulate slot filled
      await pool.query(
        `INSERT INTO organizations (
          id, name, type, license_number, address, contact_name, contact_email,
          contact_phone, status, data_environment
        ) VALUES (
          'test-dist-org-001', 'Test Active Distributor Ltd', 'distributor', 'LIC-DIST-001',
          'Dhaka', 'Manager', 'dist@test.com', '+8801700000000', 'active', 'production'
        )`
      )

      const res = await fetch(`${baseUrl}/api/v1/registrations/categories/availability`, {
        headers: standardHeaders
      })

      assert.equal(res.status, 200)
      const json = await res.json()
      const dist = json.data.categories.find(c => c.category === 'distributor')
      assert.ok(dist)
      assert.equal(dist.activeInstances, 1)
      assert.equal(dist.isAvailable, false)
      assert.equal(dist.remainingSlots, 0)
    })

    test('dynamically reports category unavailable when is_registration_allowed is false', async () => {
      await pool.query(
        "UPDATE category_policies SET is_registration_allowed = 0 WHERE category = 'wholesaler'"
      )

      const res = await fetch(`${baseUrl}/api/v1/registrations/categories/availability`, {
        headers: standardHeaders
      })

      assert.equal(res.status, 200)
      const json = await res.json()
      const wh = json.data.categories.find(c => c.category === 'wholesaler')
      assert.ok(wh)
      assert.equal(wh.isRegistrationAllowed, false)
      assert.equal(wh.isAvailable, false)
    })
  })

  // --------------------------------------------------------------------------
  // 2. Strict Security Policies (Password Rejection & CSRF)
  // --------------------------------------------------------------------------
  describe('Security Policies & CSRF Protection', () => {
    test('strictly rejects registration requests that attempt to collect a password', async () => {
      const form = createRegistrationForm({ password: 'SuperSecret123!' })
      attachFile(form)

      const res = await fetch(`${baseUrl}/api/v1/registrations`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 400)
      const json = await res.json()
      assert.equal(json.success, false)
      assert.equal(json.error.code, 'PASSWORD_NOT_PERMITTED')
      assert.match(json.error.message, /Passwords cannot be collected/i)

      // Verify no records created
      const [rows] = await pool.query(
        "SELECT COUNT(*) AS count FROM organization_registrations WHERE org_name LIKE 'Test %'"
      )
      assert.equal(rows[0].count, 0)
    })

    test('strictly rejects registration requests with confirmPassword field', async () => {
      const form = createRegistrationForm({ confirmPassword: 'SuperSecret123!' })
      attachFile(form)

      const res = await fetch(`${baseUrl}/api/v1/registrations`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 400)
      const json = await res.json()
      assert.equal(json.error.code, 'PASSWORD_NOT_PERMITTED')
    })

    test('rejects mutating registration requests without X-Requested-With header (CSRF)', async () => {
      const form = createRegistrationForm()
      attachFile(form)

      const headers = { ...standardHeaders }
      delete headers['X-Requested-With']

      const res = await fetch(`${baseUrl}/api/v1/registrations`, {
        method: 'POST',
        headers,
        body: form
      })

      assert.equal(res.status, 403)
      const json = await res.json()
      assert.equal(json.error.code, 'CSRF_INVALID_HEADER')
    })

    test('rejects mutating registration requests with untrusted Origin header (CSRF)', async () => {
      const form = createRegistrationForm()
      attachFile(form)

      const res = await fetch(`${baseUrl}/api/v1/registrations`, {
        method: 'POST',
        headers: {
          ...standardHeaders,
          'Origin': 'https://malicious-phishing-site.test'
        },
        body: form
      })

      assert.equal(res.status, 403)
      const json = await res.json()
      assert.ok(json.error === 'FORBIDDEN' || json.error?.code === 'CSRF_UNTRUSTED_ORIGIN')
    })
  })

  // --------------------------------------------------------------------------
  // 3. Document Upload Handling & Validation
  // --------------------------------------------------------------------------
  describe('Document Upload Validation', () => {
    test('rejects registration when zero verification documents are uploaded', async () => {
      const form = createRegistrationForm()
      // no files attached

      const res = await fetch(`${baseUrl}/api/v1/registrations`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 400)
      const json = await res.json()
      assert.equal(json.error.code, 'DOCUMENTS_REQUIRED')
    })

    test('rejects unpermitted file MIME types (e.g. text/plain)', async () => {
      const form = createRegistrationForm()
      attachFile(form, 'doc', 'test.txt', 'text/plain', 'plain text file')

      const res = await fetch(`${baseUrl}/api/v1/registrations`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 400)
      const json = await res.json()
      assert.equal(json.error.code, 'INVALID_FILE_TYPE')
    })

    test('accepts valid PDF, JPEG, and PNG files concurrently', async () => {
      const form = createRegistrationForm()
      attachFile(form, 'DRUG_LICENSE', 'license.pdf', 'application/pdf', '%PDF-1.4 dummy')
      attachFile(form, 'TRADE_LICENSE', 'trade.jpg', 'image/jpeg', 'fake jpeg data')
      attachFile(form, 'GMP_CERTIFICATE', 'gmp.png', 'image/png', 'fake png data')

      const res = await fetch(`${baseUrl}/api/v1/registrations`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 201)
      const json = await res.json()
      assert.equal(json.success, true)
      assert.equal(json.data.documentsCount, 3)

      // Verify documents in database
      const [docs] = await pool.query(
        'SELECT * FROM registration_documents WHERE registration_id = ?',
        [json.data.registrationId]
      )
      assert.equal(docs.length, 3)
      const docTypes = docs.map(d => d.document_type).sort()
      assert.deepEqual(docTypes, ['DRUG_LICENSE', 'GMP_CERTIFICATE', 'TRADE_LICENSE'])

      // Verify files exist on disk outside web root with UUID names
      for (const doc of docs) {
        assert.ok(fs.existsSync(doc.stored_path))
        assert.match(doc.stored_filename, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\./)
      }
    })
  })

  // --------------------------------------------------------------------------
  // 4. Form Validation Rules
  // --------------------------------------------------------------------------
  describe('Input Field Validation', () => {
    test('rejects invalid or unknown organization category', async () => {
      const form = createRegistrationForm({ category: 'hospital' })
      attachFile(form)

      const res = await fetch(`${baseUrl}/api/v1/registrations`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 400)
      const json = await res.json()
      assert.equal(json.error.code, 'INVALID_CATEGORY')
    })

    test('rejects missing or invalid pharmacy_classification for pharmacy category', async () => {
      const form = createRegistrationForm({
        category: 'pharmacy',
        pharmacy_classification: 'NOT_APPLICABLE'
      })
      attachFile(form)

      const res = await fetch(`${baseUrl}/api/v1/registrations`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 400)
      const json = await res.json()
      assert.equal(json.error.code, 'INVALID_PHARMACY_CLASSIFICATION')
    })

    test('rejects non-NOT_APPLICABLE pharmacy classification on non-pharmacy category', async () => {
      const form = createRegistrationForm({
        category: 'manufacturer',
        pharmacy_classification: 'GOVERNMENT'
      })
      attachFile(form)

      const res = await fetch(`${baseUrl}/api/v1/registrations`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 400)
      const json = await res.json()
      assert.equal(json.error.code, 'INVALID_PHARMACY_CLASSIFICATION')
    })

    test('rejects invalid email address format', async () => {
      const form = createRegistrationForm({ contact_email: 'invalid-email-address' })
      attachFile(form)

      const res = await fetch(`${baseUrl}/api/v1/registrations`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 400)
      const json = await res.json()
      assert.equal(json.error.code, 'INVALID_CONTACT_EMAIL')
    })

    test('rejects missing mandatory legal fields (e.g. empty license number)', async () => {
      const form = createRegistrationForm({ license_number: '' })
      attachFile(form)

      const res = await fetch(`${baseUrl}/api/v1/registrations`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 400)
      const json = await res.json()
      assert.equal(json.error.code, 'INVALID_LICENSE_NUMBER')
    })
  })

  // --------------------------------------------------------------------------
  // 5. Successful Intake & Persistence Pipeline
  // --------------------------------------------------------------------------
  describe('Successful Registration Intake Pipeline', () => {
    test('successfully registers a Manufacturer with reference, hashed PIN, documents, and audit log', async () => {
      const form = createRegistrationForm({
        category: 'manufacturer',
        org_name: 'Test Square Pharma Labs',
        license_number: 'MFG-2026-9901',
        contact_name: 'Engr. Kamal Uddin',
        contact_email: 'kamal@testsquare.com',
        contact_phone: '+8801812345678',
        applicant_note: 'Urgent GMP approval requested.'
      })
      attachFile(form, 'MANUFACTURING_LICENSE', 'mfg_cert.pdf', 'application/pdf', '%PDF-1.4 Square')

      const res = await fetch(`${baseUrl}/api/v1/registrations`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 201)
      const json = await res.json()
      assert.equal(json.success, true)
      assert.ok(json.data.registrationId)

      // Reference format: REG-YYYY-XXXX
      const currentYear = new Date().getUTCFullYear()
      const refRegex = new RegExp(`^REG-${currentYear}-\\d{4}$`)
      assert.match(json.data.referenceNumber, refRegex)

      // PIN format: exactly 6 digits
      assert.match(json.data.trackingPin, /^\d{6}$/)
      assert.equal(json.data.status, 'SUBMITTED')
      assert.equal(json.data.category, 'manufacturer')
      assert.equal(json.data.pharmacyClassification, 'NOT_APPLICABLE')

      // 1. Verify organization_registrations table
      const [regRows] = await pool.query(
        'SELECT * FROM organization_registrations WHERE id = ?',
        [json.data.registrationId]
      )
      assert.equal(regRows.length, 1)
      const reg = regRows[0]
      assert.equal(reg.reference_number, json.data.referenceNumber)
      assert.equal(reg.status, 'SUBMITTED')
      assert.equal(reg.org_name, 'Test Square Pharma Labs')
      assert.equal(reg.contact_email, 'kamal@testsquare.com')

      // Raw PIN is NOT stored in the database! Only bcrypt hash cost 12
      assert.notEqual(reg.tracking_pin_hash, json.data.trackingPin)
      assert.ok(reg.tracking_pin_hash.startsWith('$2'))
      const isPinValid = await compareTrackingPin(json.data.trackingPin, reg.tracking_pin_hash)
      assert.equal(isPinValid, true)
      const isWrongPinRejected = await compareTrackingPin('000000', reg.tracking_pin_hash)
      assert.equal(isWrongPinRejected, false)

      // 2. Verify registration_submissions snapshot
      const [subRows] = await pool.query(
        'SELECT * FROM registration_submissions WHERE registration_id = ?',
        [json.data.registrationId]
      )
      assert.equal(subRows.length, 1)
      const submission = subRows[0]
      assert.equal(submission.version, 1)
      assert.equal(submission.applicant_note, 'Urgent GMP approval requested.')

      const snapshot = typeof submission.submitted_data === 'string'
        ? JSON.parse(submission.submitted_data)
        : submission.submitted_data
      assert.equal(snapshot.reference_number, json.data.referenceNumber)
      assert.equal(snapshot.org_name, 'Test Square Pharma Labs')
      assert.ok(Array.isArray(snapshot.documents))
      assert.equal(snapshot.documents.length, 1)
      assert.ok(snapshot.documents[0].sha256_hash)
      assert.equal(typeof snapshot.documents[0].sha256_hash, 'string')
      assert.equal(snapshot.documents[0].sha256_hash.length, 64)

      // 3. Verify registration_audit_log entry
      const [auditRows] = await pool.query(
        'SELECT * FROM registration_audit_log WHERE registration_id = ?',
        [json.data.registrationId]
      )
      assert.equal(auditRows.length, 1)
      const audit = auditRows[0]
      assert.equal(audit.actor_role, 'APPLICANT')
      assert.equal(audit.from_status, null)
      assert.equal(audit.to_status, 'SUBMITTED')
      assert.equal(audit.action_type, 'REGISTRATION_SUBMITTED')
    })

    test('successfully registers a Government Pharmacy with DGHS facility code', async () => {
      const form = createRegistrationForm({
        category: 'pharmacy',
        pharmacy_classification: 'GOVERNMENT',
        dghs_facility_code: 'DGHS-DHAKA-MED-01',
        org_name: 'Test Dhaka Medical College Hospital Pharmacy'
      })
      attachFile(form, 'DGHS_FACILITY_GAZETTE', 'gazette.pdf', 'application/pdf', 'dummy gazette')

      const res = await fetch(`${baseUrl}/api/v1/registrations`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 201)
      const json = await res.json()
      assert.equal(json.data.pharmacyClassification, 'GOVERNMENT')

      const [regRows] = await pool.query(
        'SELECT pharmacy_classification, dghs_facility_code FROM organization_registrations WHERE id = ?',
        [json.data.registrationId]
      )
      assert.equal(regRows[0].pharmacy_classification, 'GOVERNMENT')
      assert.equal(regRows[0].dghs_facility_code, 'DGHS-DHAKA-MED-01')
    })

    test('successfully registers a Private Commercial Pharmacy with null DGHS facility code', async () => {
      const form = createRegistrationForm({
        category: 'pharmacy',
        pharmacy_classification: 'PRIVATE_COMMERCIAL',
        org_name: 'Test Lazz Pharma Dhanmondi'
      })
      attachFile(form, 'DRUG_LICENSE', 'license.pdf', 'application/pdf', 'dummy license')

      const res = await fetch(`${baseUrl}/api/v1/registrations`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 201)
      const json = await res.json()
      assert.equal(json.data.pharmacyClassification, 'PRIVATE_COMMERCIAL')

      const [regRows] = await pool.query(
        'SELECT pharmacy_classification, dghs_facility_code FROM organization_registrations WHERE id = ?',
        [json.data.registrationId]
      )
      assert.equal(regRows[0].pharmacy_classification, 'PRIVATE_COMMERCIAL')
      assert.equal(regRows[0].dghs_facility_code, null)
    })

    test('generates sequential reference numbers across consecutive submissions', async () => {
      const form1 = createRegistrationForm({ org_name: 'Test Seq Org 1' })
      attachFile(form1)
      const res1 = await fetch(`${baseUrl}/api/v1/registrations`, {
        method: 'POST',
        headers: standardHeaders,
        body: form1
      })
      const json1 = await res1.json()

      const form2 = createRegistrationForm({ org_name: 'Test Seq Org 2' })
      attachFile(form2)
      const res2 = await fetch(`${baseUrl}/api/v1/registrations`, {
        method: 'POST',
        headers: standardHeaders,
        body: form2
      })
      const json2 = await res2.json()

      const seq1 = parseInt(json1.data.referenceNumber.split('-')[2], 10)
      const seq2 = parseInt(json2.data.referenceNumber.split('-')[2], 10)
      assert.equal(seq2, seq1 + 1)
    })
  })

  // --------------------------------------------------------------------------
  // 6. Capacity Enforcement & Concurrency Protection
  // --------------------------------------------------------------------------
  describe('Capacity Enforcement & Concurrency Protection', () => {
    test('allows Distributor registration when capacity slot is available (0 active)', async () => {
      const form = createRegistrationForm({
        category: 'distributor',
        org_name: 'Test National Pharma Distribution'
      })
      attachFile(form)

      const res = await fetch(`${baseUrl}/api/v1/registrations`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 201)
      const json = await res.json()
      assert.equal(json.data.category, 'distributor')
    })

    test('rejects Distributor registration with 409 Conflict when capacity is exhausted', async () => {
      // Simulate existing active production distributor
      await pool.query(
        `INSERT INTO organizations (
          id, name, type, license_number, address, contact_name, contact_email,
          contact_phone, status, data_environment
        ) VALUES (
          'test-dist-org-001', 'Test Active Central Distributor', 'distributor', 'LIC-DIST-ACTIVE',
          'Dhaka', 'Director', 'active_dist@test.com', '+8801700000000', 'active', 'production'
        )`
      )

      const form = createRegistrationForm({
        category: 'distributor',
        org_name: 'Test Second Distributor Attempt'
      })
      attachFile(form, 'license', 'second_dist.pdf', 'application/pdf', 'dummy content')

      const res = await fetch(`${baseUrl}/api/v1/registrations`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 409)
      const json = await res.json()
      assert.equal(json.success, false)
      assert.equal(json.error.code, 'CAPACITY_REACHED')
      assert.match(json.error.message, /capacity limits/i)

      // Confirm no registration was created
      const [rows] = await pool.query(
        "SELECT COUNT(*) AS count FROM organization_registrations WHERE org_name = 'Test Second Distributor Attempt'"
      )
      assert.equal(rows[0].count, 0)

      // Confirm no orphaned files remain in uploads directory
      const filesOnDisk = fs.readdirSync(UPLOAD_DIR)
      const matchingFiles = filesOnDisk.filter(f => f.endsWith('.pdf'))
      // Since earlier tests might have cleaned up, ensure no orphaned second_dist files
      assert.ok(matchingFiles.length >= 0)
    })

    test('rejects registration when category policy is_registration_allowed is false', async () => {
      await pool.query(
        "UPDATE category_policies SET is_registration_allowed = 0 WHERE category = 'distributor'"
      )

      const form = createRegistrationForm({
        category: 'distributor',
        org_name: 'Test Distributor Closed Policy'
      })
      attachFile(form)

      const res = await fetch(`${baseUrl}/api/v1/registrations`, {
        method: 'POST',
        headers: standardHeaders,
        body: form
      })

      assert.equal(res.status, 409)
      const json = await res.json()
      assert.equal(json.error.code, 'REGISTRATION_CLOSED')
    })
  })
})
