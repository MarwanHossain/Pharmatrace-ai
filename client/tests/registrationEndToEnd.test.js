// PharmaTrace AI — Phase 3 Milestone 5 End-to-End Integration Test Suite
// Verifies complete 17-step applicant-to-administrator lifecycle against live Express backend & MariaDB
import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import crypto from 'crypto'

import app from '../../server/src/app.js'
import { getPool, execute, closeDatabasePool } from '../../server/src/config/database.js'
import { createMigrationConnection } from '../../server/src/database/migrator.js'
import { hashPassword } from '../../server/src/utils/passwords.js'
import {
  setFakeTransport,
  clearFakeTransport,
  getCapturedNotifications,
  clearCapturedNotifications
} from '../../server/src/services/notification.service.js'

import {
  listRegistrations,
  getRegistrationDetail,
  startReview,
  requestInformation,
  resendInformationLink,
  approveRegistration,
  rejectRegistration,
  resendActivation
} from '../src/services/adminRegistrationApi.js'

import {
  submitRegistration,
  trackRegistration,
  verifyAccessToken,
  resubmitRegistration
} from '../src/services/registrationApi.js'

import { api } from '../src/services/api.js'

let server
let baseUrl
const pool = getPool()

const TEST_PREFIX = 'M5-E2E-'
const TEST_ADMIN_ID = `usr-admin-${crypto.randomUUID().slice(0, 8)}`
const TEST_ADMIN_EMAIL = `m5_admin_${crypto.randomUUID().slice(0, 8)}@pharmatrace.gov.bd`
const TEST_ADMIN_PASSWORD = 'AdminSecureP@ssword123!'

let adminCookie = ''
let standardAdminHeaders = {}

before(async () => {
  // 1. Start live Express HTTP server on free port
  server = http.createServer(app)
  await new Promise(resolve => server.listen(0, resolve))
  const port = server.address().port
  baseUrl = `http://127.0.0.1:${port}`

  // 2. Enable in-memory fake notification transport
  setFakeTransport(async () => {})
  clearCapturedNotifications()

  // 3. Seed active administrator in MariaDB
  const hashedPassword = await hashPassword(TEST_ADMIN_PASSWORD)
  await pool.query(
    `INSERT INTO users (id, org_id, name, email, password_hash, role, token_version, status, failed_login_attempts, created_at, updated_at)
     VALUES (?, NULL, 'M5 Test Administrator', ?, ?, 'admin', 1, 'active', 0, NOW(), NOW())`,
    [TEST_ADMIN_ID, TEST_ADMIN_EMAIL, hashedPassword]
  )

  // 4. Authenticate administrator via POST /api/v1/auth/login
  const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'Origin': 'http://localhost:5173'
    },
    body: JSON.stringify({
      email: TEST_ADMIN_EMAIL,
      password: TEST_ADMIN_PASSWORD
    })
  })

  assert.equal(loginRes.status, 200)
  const setCookie = loginRes.headers.get('set-cookie')
  assert.ok(setCookie && setCookie.includes('pt_access_token='))

  adminCookie = setCookie.split(';')[0]
  standardAdminHeaders = {
    'Cookie': adminCookie,
    'Origin': 'http://localhost:5173',
    'X-Requested-With': 'XMLHttpRequest'
  }
})

after(async () => {
  clearFakeTransport()
  clearCapturedNotifications()

  // Cleanup test data in MariaDB (respect foreign key constraints using migration account)
  try {
    const migConn = await createMigrationConnection()
    try {
      const [regs] = await migConn.query(
        `SELECT id, approved_org_id FROM organization_registrations WHERE reference_number LIKE ? OR org_name LIKE ?`,
        [`${TEST_PREFIX}%`, `${TEST_PREFIX}%`]
      )

      for (const r of regs) {
        await migConn.query(`DELETE FROM activation_tokens WHERE user_id IN (SELECT id FROM users WHERE org_id = ?)`, [r.approved_org_id])
        await migConn.query(`DELETE FROM registration_access_tokens WHERE registration_id = ?`, [r.id])
        await migConn.query(`DELETE FROM registration_documents WHERE registration_id = ?`, [r.id])
        await migConn.query(`DELETE FROM registration_submissions WHERE registration_id = ?`, [r.id])
        await migConn.query(`DELETE FROM registration_audit_log WHERE registration_id = ?`, [r.id])
        await migConn.query(`DELETE FROM organization_registrations WHERE id = ?`, [r.id])
        if (r.approved_org_id) {
          await migConn.query(`DELETE FROM users WHERE org_id = ?`, [r.approved_org_id])
          await migConn.query(`DELETE FROM organizations WHERE id = ?`, [r.approved_org_id])
        }
      }

      await migConn.query(`DELETE FROM users WHERE id = ?`, [TEST_ADMIN_ID])
    } finally {
      await migConn.end()
    }
  } catch (err) {
    console.error('Error during test cleanup:', err)
  } finally {
    if (server) {
      await new Promise(resolve => server.close(resolve))
    }
    clearFakeTransport()
    await closeDatabasePool()
  }
})

describe('Milestone 5: Complete Applicant-to-Administrator Lifecycle Workflow', () => {
  let createdRegId = null
  let createdReference = null
  let createdPin = null
  let uploadedDocId = null
  let issuedToken = null
  let provisionedOrgId = null
  let provisionedUserId = null

  test('Step 1 & 2: Public applicant submits Manufacturer application and receives Reference & PIN', async () => {
    const formData = new FormData()
    const uniqueLicense = `LIC-M5-${crypto.randomUUID().slice(0, 8)}`
    const uniqueOrgName = `${TEST_PREFIX} Meridian Pharma Ltd`
    const uniqueContactEmail = `contact-${crypto.randomUUID().slice(0, 8)}@meridian-m5.test`

    formData.append('category', 'manufacturer')
    formData.append('org_name', uniqueOrgName)
    formData.append('license_number', uniqueLicense)
    formData.append('tax_id', '123456789012')
    formData.append('address', 'Plot 42, Tejgaon Industrial Area, Dhaka-1208')
    formData.append('contact_name', 'Dr. Farhana Ahmed')
    formData.append('contact_email', uniqueContactEmail)
    formData.append('contact_phone', '+8801712345678')

    // Attach sample regulatory document
    const samplePdfBlob = new Blob(['%PDF-1.4 Mock Manufacturer Drug License Document Content'], {
      type: 'application/pdf'
    })
    formData.append('documents', samplePdfBlob, 'drug_license_2026.pdf')
    formData.append('document_types', 'DRUG_LICENSE')

    const res = await submitRegistration(formData, {
      baseUrl: `${baseUrl}/api`,
      headers: { 'Origin': 'http://localhost:5173' }
    })

    assert.ok(res.registrationId)
    assert.ok(res.referenceNumber)
    assert.ok(res.trackingPin)
    assert.equal(res.status, 'SUBMITTED')

    createdRegId = res.registrationId
    createdReference = res.referenceNumber
    createdPin = res.trackingPin
  })

  test('Step 3 & 4: Administrator session is validated through GET /api/v1/auth/me', async () => {
    const meRes = await api.get('/v1/auth/me', {
      baseUrl: `${baseUrl}/api`,
      headers: standardAdminHeaders
    })

    assert.equal(meRes.success, true)
    const user = meRes.data?.user || meRes.user
    assert.equal(user.id, TEST_ADMIN_ID)
    assert.equal(user.role, 'admin')
  })

  test('Step 5: Administrator locates the application in the queue', async () => {
    const queueRes = await listRegistrations(
      { search: createdReference },
      { baseUrl: `${baseUrl}/api`, headers: standardAdminHeaders }
    )

    assert.ok(queueRes.items && queueRes.items.length >= 1)
    const match = queueRes.items.find(i => i.id === createdRegId)
    assert.ok(match, 'Submitted registration should appear in administrative queue')
    assert.equal(match.status, 'SUBMITTED')
    assert.equal(match.category, 'manufacturer')
  })

  test('Step 6 & 7: Administrator opens dossier and inspects submitted document metadata and file download', async () => {
    const dossier = await getRegistrationDetail(createdRegId, {
      baseUrl: `${baseUrl}/api`,
      headers: standardAdminHeaders
    })

    assert.ok(dossier.registration)
    assert.equal(dossier.registration.id, createdRegId)
    assert.equal(dossier.registration.status, 'SUBMITTED')
    assert.equal(dossier.submissions.length, 1)
    assert.equal(dossier.documents.length, 1)

    const doc = dossier.documents[0]
    uploadedDocId = doc.id
    assert.equal(doc.originalFilename, 'drug_license_2026.pdf')
    assert.equal(doc.mimeType, 'application/pdf')

    // Document download test via binary fetch
    const downloadRes = await fetch(
      `${baseUrl}/api/v1/admin/registrations/${createdRegId}/documents/${uploadedDocId}/download`,
      { headers: standardAdminHeaders }
    )

    assert.equal(downloadRes.status, 200)
    assert.equal(downloadRes.headers.get('content-type'), 'application/pdf')
    assert.ok(downloadRes.headers.get('content-disposition').includes('drug_license_2026.pdf'))
    assert.equal(downloadRes.headers.get('x-content-type-options'), 'nosniff')

    const downloadedText = await downloadRes.text()
    assert.ok(downloadedText.includes('Mock Manufacturer Drug License'))
  })

  test('Step 8: Administrator starts review, transitioning status to UNDER_REVIEW', async () => {
    const res = await startReview(
      createdRegId,
      { reviewNotes: 'DGDA Senior Reviewer initiated formal verification.' },
      { baseUrl: `${baseUrl}/api`, headers: standardAdminHeaders }
    )

    assert.equal(res.status, 'UNDER_REVIEW')

    // Verify dossier reflects updated status and audit trail
    const updated = await getRegistrationDetail(createdRegId, {
      baseUrl: `${baseUrl}/api`,
      headers: standardAdminHeaders
    })
    assert.equal(updated.registration.status, 'UNDER_REVIEW')
    const lastAudit = updated.auditLog[updated.auditLog.length - 1]
    assert.equal(lastAudit.actionType, 'REVIEW_STARTED')
    assert.equal(lastAudit.actorRole, 'ADMIN')
  })

  test('Step 9 & 10: Administrator requests additional documentation with cureDays=7', async () => {
    clearCapturedNotifications()

    const res = await requestInformation(
      createdRegId,
      {
        reason: 'Please provide certified GMP certificate copy for Tejgaon facility.',
        cureDays: 7
      },
      { baseUrl: `${baseUrl}/api`, headers: standardAdminHeaders }
    )

    assert.equal(res.status, 'INFORMATION_REQUESTED')
    assert.equal(res.notificationStatus, 'DELIVERED_FAKE')

    // Inspect captured fake transport notification
    const notifications = getCapturedNotifications()
    assert.ok(notifications.length >= 1)
    const notif = notifications[notifications.length - 1]
    assert.ok(notif.rawToken)
    assert.ok(notif.activationUrl || notif.reason)
    issuedToken = notif.rawToken
  })

  test('Step 11 & 12: Applicant tracks status, verifies token, and resubmits documentation', async () => {
    // 1. Applicant tracks via PIN
    const trackingRes = await trackRegistration(
      { referenceNumber: createdReference, trackingPin: createdPin },
      { baseUrl: `${baseUrl}/api`, headers: { 'Origin': 'http://localhost:5173' } }
    )
    assert.equal(trackingRes.status, 'INFORMATION_REQUESTED')
    assert.ok(trackingRes.reviewNotes.includes('GMP certificate'))

    // 2. Applicant verifies access link
    const verifyRes = await verifyAccessToken(issuedToken, { baseUrl: `${baseUrl}/api` })
    assert.equal(verifyRes.valid, true)
    assert.equal(verifyRes.status, 'INFORMATION_REQUESTED')

    // 3. Applicant resubmits with additional document and applicant note
    const resubmitData = new FormData()
    resubmitData.append('applicant_note', 'Attached certified GMP certificate as requested by reviewer.')

    const gmpDocBlob = new Blob(['%PDF-1.4 Mock GMP Certificate Compliance Stamp 2026'], {
      type: 'application/pdf'
    })
    resubmitData.append('documents', gmpDocBlob, 'gmp_certificate_certified.pdf')
    resubmitData.append('document_types', 'GMP_CERTIFICATE')

    const resubmitRes = await resubmitRegistration(
      { auth: { token: issuedToken }, formData: resubmitData },
      {
        baseUrl: `${baseUrl}/api`,
        headers: { 'Origin': 'http://localhost:5173' }
      }
    )
    assert.equal(resubmitRes.status, 'UNDER_REVIEW')
  })

  test('Step 13: Administrator inspects new submission version (v2) and applicant note', async () => {
    const updated = await getRegistrationDetail(createdRegId, {
      baseUrl: `${baseUrl}/api`,
      headers: standardAdminHeaders
    })

    assert.equal(updated.registration.status, 'UNDER_REVIEW')
    assert.equal(updated.submissions.length, 2)
    assert.equal(updated.documents.length, 2)

    const v2Submission = updated.submissions.find(s => s.version === 2)
    assert.ok(v2Submission)
    assert.ok(v2Submission.applicantNote.includes('Attached certified GMP certificate'))

    const gmpDoc = updated.documents.find(d => d.documentType === 'GMP_CERTIFICATE')
    assert.ok(gmpDoc)
    assert.equal(gmpDoc.submissionVersion, 2)
  })

  test('Step 14, 15 & 16: Administrator approves application, atomically provisioning production organization & initial user', async () => {
    clearCapturedNotifications()

    const res = await approveRegistration(
      createdRegId,
      { reviewNotes: 'GMP certificate verified. All statutory requirements satisfied.' },
      { baseUrl: `${baseUrl}/api`, headers: standardAdminHeaders }
    )

    assert.equal(res.status, 'APPROVED')
    assert.ok(res.organizationId)
    assert.ok(res.userId)

    provisionedOrgId = res.organizationId
    provisionedUserId = res.userId

    // Verify MariaDB organization record
    const [orgRows] = await pool.query(
      `SELECT id, name, type, status, data_environment FROM organizations WHERE id = ?`,
      [provisionedOrgId]
    )
    assert.equal(orgRows.length, 1)
    assert.equal(orgRows[0].status, 'active')
    assert.equal(orgRows[0].data_environment, 'production')
    assert.equal(orgRows[0].type, 'manufacturer')

    // Verify MariaDB initial user record
    const [userRows] = await pool.query(
      `SELECT id, org_id, role, status FROM users WHERE id = ?`,
      [provisionedUserId]
    )
    assert.equal(userRows.length, 1)
    assert.equal(userRows[0].status, 'pending_activation')
    assert.equal(userRows[0].role, 'manufacturer')
    assert.equal(userRows[0].org_id, provisionedOrgId)
  })

  test('Step 17: Administrator reissues account activation token', async () => {
    clearCapturedNotifications()

    const res = await resendActivation(createdRegId, {
      baseUrl: `${baseUrl}/api`,
      headers: standardAdminHeaders
    })

    assert.equal(res.organizationId, provisionedOrgId)
    assert.equal(res.userId, provisionedUserId)
    assert.equal(res.notificationStatus, 'DELIVERED_FAKE')

    // Verify audit log has ACTIVATION_TOKEN_RESENT
    const updated = await getRegistrationDetail(createdRegId, {
      baseUrl: `${baseUrl}/api`,
      headers: standardAdminHeaders
    })
    const lastAudit = updated.auditLog[updated.auditLog.length - 1]
    assert.equal(lastAudit.actionType, 'ACTIVATION_TOKEN_RESENT')
  })

  test('Rejection Workflow: Administrator formally rejects non-compliant application', async () => {
    // 1. Submit a separate registration to test rejection
    const formData = new FormData()
    formData.append('category', 'wholesaler')
    formData.append('org_name', `${TEST_PREFIX} Non-Compliant Wholesaler Ltd`)
    formData.append('license_number', `LIC-M5-REJ-${crypto.randomUUID().slice(0, 8)}`)
    formData.append('address', 'Chittagong Port Road')
    formData.append('contact_name', 'Mr. Rejection Test')
    formData.append('contact_email', `rej-${crypto.randomUUID().slice(0, 8)}@reject.test`)
    formData.append('contact_phone', '+8801812345678')

    const docBlob = new Blob(['%PDF-1.4 Expired Wholesaler License'], { type: 'application/pdf' })
    formData.append('documents', docBlob, 'wholesaler_license.pdf')
    formData.append('document_types', 'WHOLESALE_LICENSE')

    const subRes = await submitRegistration(formData, {
      baseUrl: `${baseUrl}/api`,
      headers: { 'Origin': 'http://localhost:5173' }
    })
    const rejRegId = subRes.registrationId

    // 2. Reject registration directly
    const res = await rejectRegistration(
      rejRegId,
      {
        rejectionReason: 'EXPIRED_WHOLESALE_LICENSE',
        rejectionExplanation: 'The presented wholesale drug license has lapsed by more than 180 days without renewal.'
      },
      { baseUrl: `${baseUrl}/api`, headers: standardAdminHeaders }
    )

    assert.equal(res.status, 'REJECTED')

    // 3. Verify terminal status in dossier
    const dossier = await getRegistrationDetail(rejRegId, {
      baseUrl: `${baseUrl}/api`,
      headers: standardAdminHeaders
    })
    assert.equal(dossier.registration.status, 'REJECTED')
    assert.equal(dossier.registration.rejectionReason, 'EXPIRED_WHOLESALE_LICENSE')
    assert.ok(dossier.registration.rejectionExplanation.includes('lapsed by more than 180 days'))
  })
})
