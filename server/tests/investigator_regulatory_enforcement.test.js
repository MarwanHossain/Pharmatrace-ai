// PharmaTrace AI — Regulatory Investigation & Enforcement Integration Tests
// Validates Milestone M8: RBAC, Alerts, Detection Engine, Traceability Search, Case Lifecycle & Audit Immutability
process.env.NODE_ENV = 'test'

import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import crypto from 'crypto'
import { app } from '../src/app.js'
import { getPool, closeDatabasePool, execute } from '../src/config/database.js'
import { runMigrations, createMigrationConnection } from '../src/database/migrator.js'
import { signAccessToken } from '../src/utils/tokens.js'

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

    if (options.token) {
      headers['Cookie'] = `pt_access_token=${options.token}`
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

describe('PharmaTrace AI — Milestone M8: Regulatory Investigation & Enforcement Engine', () => {
  // Test identities
  const testSuffix = crypto.randomUUID().slice(0, 8)
  const investigatorUser = {
    id: `usr-inv-${testSuffix}`,
    name: 'Inspector Regulatory Lead',
    email: `investigator_${testSuffix}@pharmatrace.test`,
    role: 'investigator',
    status: 'active',
    token_version: 1
  }

  const manufacturerUser = {
    id: `usr-mfg-${testSuffix}`,
    name: 'Plant Manager',
    email: `mfg_${testSuffix}@pharmatrace.test`,
    role: 'manufacturer',
    org_id: `org-mfg-${testSuffix}`,
    status: 'active',
    token_version: 1
  }

  const testOrgMfg = {
    id: `org-mfg-${testSuffix}`,
    name: `Test Mfg Pharma ${testSuffix}`,
    type: 'manufacturer',
    license_number: `LIC-MFG-${testSuffix}`,
    address: 'Tejgaon I/A, Dhaka',
    contact_name: 'Lead Chemist',
    contact_email: `contact_${testSuffix}@mfg.test`,
    contact_phone: '01711111111',
    status: 'active',
    data_environment: 'test'
  }

  const testOrgDist = {
    id: `org-dist-${testSuffix}`,
    name: `Test Dist Logistics ${testSuffix}`,
    type: 'distributor',
    license_number: `LIC-DIST-${testSuffix}`,
    address: 'Tongi, Gazipur',
    contact_name: 'Depot Manager',
    contact_email: `contact_${testSuffix}@dist.test`,
    contact_phone: '01722222222',
    status: 'inactive',
    data_environment: 'test'
  }

  const testOrgPharm = {
    id: `org-pharm-${testSuffix}`,
    name: `Test Model Pharmacy ${testSuffix}`,
    type: 'pharmacy',
    license_number: `LIC-PHARM-${testSuffix}`,
    address: 'Dhanmondi, Dhaka',
    contact_name: 'Chief Pharmacist',
    contact_email: `contact_${testSuffix}@pharm.test`,
    contact_phone: '01733333333',
    status: 'active',
    data_environment: 'test'
  }

  const testProduct = {
    id: `prod-${testSuffix}`,
    manufacturer_id: `org-mfg-${testSuffix}`,
    name: `Napa Rapid ${testSuffix}`,
    generic_name: 'Paracetamol',
    strength: '500mg',
    dosage_form: 'Tablet',
    pack_size: '10x10',
    gtin: '0894' + Math.floor(1000000000 + Math.random() * 9000000000).toString()
  }

  const testBatch = {
    id: `batch-${testSuffix}`,
    batch_no: `BAT-${testSuffix.toUpperCase()}`,
    product_id: `prod-${testSuffix}`,
    manufacturer_id: `org-mfg-${testSuffix}`,
    mfd: '2026-01-01',
    exp: '2028-12-31',
    quantity: 500,
    release_status: 'Released'
  }

  const testPackages = [
    {
      serial: `SN-M8-${testSuffix}-001`,
      batch_id: `batch-${testSuffix}`,
      manufacturer_org_id: `org-mfg-${testSuffix}`,
      custodian_org_id: `org-mfg-${testSuffix}`,
      allocation_type: 'commercial',
      status: 'available',
      verify_count: 3 // Triggers duplicate scan rule!
    },
    {
      serial: `SN-M8-${testSuffix}-002`,
      batch_id: `batch-${testSuffix}`,
      manufacturer_org_id: `org-mfg-${testSuffix}`,
      custodian_org_id: `org-pharm-${testSuffix}`,
      allocation_type: 'government', // Triggers government diversion rule (in pharmacy)!
      status: 'available',
      verify_count: 0
    },
    {
      serial: `SN-M8-${testSuffix}-003`,
      batch_id: `batch-${testSuffix}`,
      manufacturer_org_id: `org-mfg-${testSuffix}`,
      custodian_org_id: `org-dist-${testSuffix}`,
      allocation_type: 'commercial',
      status: 'quarantined',
      verify_count: 0
    }
  ]

  let investigatorToken = ''
  let manufacturerToken = ''

  before(async () => {
    await runMigrations()

    const migConn = await createMigrationConnection()
    try {
      // 1. Insert test organizations
      for (const org of [testOrgMfg, testOrgDist, testOrgPharm]) {
        await migConn.query(
          `INSERT INTO organizations (id, name, type, license_number, address, contact_name, contact_email, contact_phone, status, data_environment)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [org.id, org.name, org.type, org.license_number, org.address, org.contact_name, org.contact_email, org.contact_phone, org.status, org.data_environment]
        )
      }

      // 2. Insert test users
      await migConn.query(
        `INSERT INTO users (id, name, email, role, status, token_version)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [investigatorUser.id, investigatorUser.name, investigatorUser.email, investigatorUser.role, investigatorUser.status, investigatorUser.token_version]
      )

      await migConn.query(
        `INSERT INTO users (id, name, email, role, org_id, status, token_version)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [manufacturerUser.id, manufacturerUser.name, manufacturerUser.email, manufacturerUser.role, manufacturerUser.org_id, manufacturerUser.status, manufacturerUser.token_version]
      )

      // 3. Insert test product & batch
      await migConn.query(
        `INSERT INTO products (id, manufacturer_id, name, generic_name, strength, dosage_form, pack_size, gtin)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [testProduct.id, testProduct.manufacturer_id, testProduct.name, testProduct.generic_name, testProduct.strength, testProduct.dosage_form, testProduct.pack_size, testProduct.gtin]
      )

      await migConn.query(
        `INSERT INTO batches (id, batch_no, product_id, manufacturer_id, mfd, exp, quantity, release_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [testBatch.id, testBatch.batch_no, testBatch.product_id, testBatch.manufacturer_id, testBatch.mfd, testBatch.exp, testBatch.quantity, testBatch.release_status]
      )

      // 4. Insert test packages
      for (const pkg of testPackages) {
        await migConn.query(
          `INSERT INTO packages (serial, batch_id, manufacturer_org_id, custodian_org_id, allocation_type, status, verify_count)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [pkg.serial, pkg.batch_id, pkg.manufacturer_org_id, pkg.custodian_org_id, pkg.allocation_type, pkg.status, pkg.verify_count]
        )
      }

      // 5. Insert traceability event for 001
      await migConn.query(
        `INSERT INTO traceability_events (id, serial, event_type, actor_user_id, actor_org_id, event_payload)
         VALUES (?, ?, 'SERIALIZED', ?, ?, ?)`,
        [`evt-ser-${testSuffix}`, testPackages[0].serial, manufacturerUser.id, testOrgMfg.id, JSON.stringify({ batch_no: testBatch.batch_no })]
      )

      // 6. Insert a public report for testing
      await migConn.query(
        `INSERT INTO public_reports (id, report_number, report_type, package_serial, reported_store_name, reported_store_address, city_district, description, status)
         VALUES (?, ?, 'GOVERNMENT_MEDICINE_DIVERSION', ?, 'Model Store Gulshan', 'Plot 4, Road 11', 'Dhaka', 'Government medicine sold above MRP', 'PENDING')`,
        [`rep-${testSuffix}`, `REP-${testSuffix.toUpperCase()}`, testPackages[1].serial]
      )
    } finally {
      await migConn.end()
    }

    // Sign auth JWTs
    investigatorToken = signAccessToken({
      id: investigatorUser.id,
      email: investigatorUser.email,
      role: investigatorUser.role,
      tokenVersion: investigatorUser.token_version
    })

    manufacturerToken = signAccessToken({
      id: manufacturerUser.id,
      email: manufacturerUser.email,
      role: manufacturerUser.role,
      orgId: manufacturerUser.org_id,
      tokenVersion: manufacturerUser.token_version
    })

    // Start HTTP test server
    server = http.createServer(app)
    await new Promise(resolve => server.listen(0, resolve))
    baseUrl = `http://localhost:${server.address().port}`
  })

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve))
    }
    // Audit logs and evidence records are immutable by design and preserved in test database
    await closeDatabasePool()
  })

  test('1. RBAC Enforcement: Strict access controls on /investigator endpoints', async () => {
    // 1.1 Unauthenticated request returns 401
    const unauthRes = await request('GET', '/api/v1/investigator/dashboard')
    assert.equal(unauthRes.status, 401)
    assert.equal(unauthRes.body.error.code, 'AUTH_TOKEN_MISSING')

    // 1.2 Non-investigator role (e.g. manufacturer) returns 403
    const forbiddenRes = await request('GET', '/api/v1/investigator/dashboard', {
      token: manufacturerToken
    })
    assert.equal(forbiddenRes.status, 403)
    assert.equal(forbiddenRes.body.error.code, 'FORBIDDEN_ROLE')

    // 1.3 Investigator role succeeds with 200
    const successRes = await request('GET', '/api/v1/investigator/dashboard', {
      token: investigatorToken
    })
    assert.equal(successRes.status, 200)
    assert.equal(successRes.body.success, true)
    assert.ok(successRes.body.data.metrics)
  })

  test('2. Dashboard Feeds: Real metrics and activity filters', async () => {
    const res = await request('GET', '/api/v1/investigator/dashboard', {
      token: investigatorToken
    })
    assert.equal(res.status, 200)
    const metrics = res.body.data.metrics

    // Must be real numbers from MariaDB
    assert.ok(typeof metrics.trackedPackages === 'number')
    assert.ok(typeof metrics.quarantinedPackages === 'number')
    assert.ok(metrics.trackedPackages >= 3)
    assert.ok(metrics.quarantinedPackages >= 1)

    // Test activity feed query
    const actRes = await request('GET', `/api/v1/investigator/activity?serial=${testPackages[0].serial}`, {
      token: investigatorToken
    })
    assert.equal(actRes.status, 200)
    assert.ok(actRes.body.data.events.length >= 1)
    assert.equal(actRes.body.data.events[0].serial, testPackages[0].serial)
    assert.equal(actRes.body.data.events[0].event_type, 'SERIALIZED')
  })

  test('3. Regulatory Alerts & Detection Rules Engine: Evaluates live DB anomalies', async () => {
    // 3.1 Trigger the deterministic rule-based evaluation scan
    const scanRes = await request('POST', '/api/v1/investigator/alerts/scan', {
      token: investigatorToken
    })
    assert.equal(scanRes.status, 200)
    assert.equal(scanRes.body.success, true)
    assert.ok(scanRes.body.data.evaluatedRulesCount >= 5)

    // 3.2 List alerts and verify generated rule alerts
    const alertsRes = await request('GET', `/api/v1/investigator/alerts?packageSerial=${testSuffix}`, {
      token: investigatorToken
    })
    assert.equal(alertsRes.status, 200)
    const alerts = alertsRes.body.data.alerts

    // Must find duplicate scan alert for package 001 (verify_count = 3)
    const dupAlert = alerts.find(a => a.package_serial === testPackages[0].serial && a.alert_type === 'DUPLICATE_SCAN_ANOMALY')
    assert.ok(dupAlert, 'Duplicate scan alert must be generated for package 001')
    assert.equal(dupAlert.alert_type, 'DUPLICATE_SCAN_ANOMALY')
    assert.equal(dupAlert.severity, 'HIGH')
    assert.equal(dupAlert.status, 'OPEN')

    // Must find government diversion alert for package 002 (allocation=government in pharmacy)
    const govtAlert = alerts.find(a => a.package_serial === testPackages[1].serial && a.alert_type === 'GOVERNMENT_DIVERSION_INDICATOR')
    assert.ok(govtAlert, 'Government diversion alert must be generated for package 002')
    assert.equal(govtAlert.alert_type, 'GOVERNMENT_DIVERSION_INDICATOR')
    assert.equal(govtAlert.severity, 'CRITICAL')

    // 3.3 Update alert status
    const updateRes = await request('PATCH', `/api/v1/investigator/alerts/${dupAlert.id}/status`, {
      token: investigatorToken,
      body: { status: 'TRIAGED' }
    })
    assert.equal(updateRes.status, 200)
    assert.equal(updateRes.body.data.status, 'TRIAGED')
    assert.equal(updateRes.body.data.assigned_officer_id, investigatorUser.id)
  })

  test('4. Traceability Search & Detailed Package Custody History', async () => {
    // 4.1 Search by serial
    const searchSerialRes = await request('GET', `/api/v1/investigator/search?q=${testPackages[0].serial}`, {
      token: investigatorToken
    })
    assert.equal(searchSerialRes.status, 200)
    assert.ok(searchSerialRes.body.data.packages.length >= 1)
    assert.equal(searchSerialRes.body.data.packages[0].serial, testPackages[0].serial)

    // 4.2 Search by QR URL
    const qrUrl = `/verify?serial=${testPackages[0].serial}`
    const searchUrlRes = await request('GET', `/api/v1/investigator/search?q=${encodeURIComponent(qrUrl)}`, {
      token: investigatorToken
    })
    assert.equal(searchUrlRes.status, 200)
    assert.ok(searchUrlRes.body.data.packages.length >= 1)
    assert.equal(searchUrlRes.body.data.packages[0].serial, testPackages[0].serial)

    // 4.3 Search by batch number
    const searchBatchRes = await request('GET', `/api/v1/investigator/search?q=${testBatch.batch_no}`, {
      token: investigatorToken
    })
    assert.equal(searchBatchRes.status, 200)
    assert.ok(searchBatchRes.body.data.batches.length >= 1)
    assert.equal(searchBatchRes.body.data.batches[0].batch_no, testBatch.batch_no)

    // 4.4 Get package details with complete timeline
    const pkgDetailsRes = await request('GET', `/api/v1/investigator/packages/${testPackages[0].serial}`, {
      token: investigatorToken
    })
    assert.equal(pkgDetailsRes.status, 200)
    const pkgData = pkgDetailsRes.body.data

    assert.equal(pkgData.package.serial, testPackages[0].serial)
    assert.equal(pkgData.product.name, testProduct.name)
    assert.equal(pkgData.batch.batchNo, testBatch.batch_no)
    assert.equal(pkgData.manufacturer.id, testOrgMfg.id)
    assert.ok(Array.isArray(pkgData.timeline))
    assert.equal(pkgData.timeline[0].eventType, 'SERIALIZED')
    assert.ok(Array.isArray(pkgData.alerts))
    assert.ok(pkgData.alerts.length >= 1)
  })

  test('5. Investigation Case Management Lifecycle: Create, Assign, Evidence, Review & Closure', async () => {
    // Retrieve the duplicate scan alert
    const [alertRows] = await execute(
      'SELECT id FROM investigation_alerts WHERE package_serial = ? LIMIT 1',
      [testPackages[0].serial]
    )
    assert.ok(alertRows.length > 0)
    const alertId = alertRows[0].id

    // 5.1 Create case linked to the alert
    const createRes = await request('POST', '/api/v1/investigator/cases', {
      token: investigatorToken,
      body: {
        title: `Suspected QR Duplication on ${testPackages[0].serial}`,
        alertId: alertId,
        priority: 'high',
        findings: 'Preliminary inspection indicates multiple verification hits in disparate geo-locations within 1 hour.',
        evidence: [
          {
            evidenceType: 'verified_fact',
            description: `MariaDB verification counter is 3 for package ${testPackages[0].serial}`,
            sourceRef: `pkg:${testPackages[0].serial}`
          }
        ]
      }
    })

    assert.equal(createRes.status, 201)
    const createdCase = createRes.body.data
    assert.ok(createdCase.id)
    assert.ok(createdCase.case_number.startsWith('INV-'))
    assert.equal(createdCase.title, `Suspected QR Duplication on ${testPackages[0].serial}`)
    assert.equal(createdCase.status, 'open')
    assert.equal(createdCase.priority, 'high')
    assert.ok(createdCase.evidence.length >= 1)
    const hasVerifiedFact = createdCase.evidence.some(e => e.evidence_type === 'verified_fact')
    assert.ok(hasVerifiedFact, 'Created case must include the supplied verified_fact evidence')
    assert.ok(createdCase.auditLog.length >= 1)
    const initialActions = createdCase.auditLog.map(l => l.action)
    assert.ok(initialActions.includes('CASE_CREATED'), 'Audit log must record CASE_CREATED')

    const caseId = createdCase.id

    // Verify linked alert was updated to INVESTIGATING
    const [alertCheck] = await execute('SELECT status FROM investigation_alerts WHERE id = ?', [alertId])
    assert.equal(alertCheck[0].status, 'INVESTIGATING')

    // 5.2 Add additional typed evidence
    const addEvRes = await request('POST', `/api/v1/investigator/cases/${caseId}/evidence`, {
      token: investigatorToken,
      body: {
        evidenceType: 'reported_allegation',
        description: 'Field inspection officer reported counterfeit packaging with blurred QR print.',
        sourceRef: 'INSP-FIELD-01'
      }
    })
    assert.equal(addEvRes.status, 201)
    assert.equal(addEvRes.body.data.evidence_type, 'reported_allegation')

    // 5.3 Update case findings and transition status to under_review
    const updateRes1 = await request('PATCH', `/api/v1/investigator/cases/${caseId}`, {
      token: investigatorToken,
      body: {
        findings: 'Laboratory chemical analysis confirmed substandard active pharmaceutical ingredient (API) concentration.',
        status: 'under_review'
      }
    })
    assert.equal(updateRes1.status, 200)
    assert.equal(updateRes1.body.data.status, 'under_review')

    // 5.4 Resolve and close case
    const closeRes = await request('PATCH', `/api/v1/investigator/cases/${caseId}`, {
      token: investigatorToken,
      body: {
        resolution: 'Administrative seizure order issued. Retail stock confiscated and manufacturer notified.',
        status: 'closed'
      }
    })
    assert.equal(closeRes.status, 200)
    const closedCase = closeRes.body.data
    assert.equal(closedCase.status, 'closed')
    assert.ok(closedCase.closed_at)
    assert.equal(closedCase.closed_by_user_id, investigatorUser.id)
    assert.equal(closedCase.resolution, 'Administrative seizure order issued. Retail stock confiscated and manufacturer notified.')

    // 5.5 Verify full immutable history in case details
    const fullCaseRes = await request('GET', `/api/v1/investigator/cases/${caseId}`, {
      token: investigatorToken
    })
    assert.equal(fullCaseRes.status, 200)
    const fullCase = fullCaseRes.body.data

    assert.ok(fullCase.evidence.length >= 2)
    const evTypes = fullCase.evidence.map(e => e.evidence_type)
    assert.ok(evTypes.includes('verified_fact'), 'Evidence must include verified_fact')
    assert.ok(evTypes.includes('reported_allegation'), 'Evidence must include reported_allegation')

    assert.ok(fullCase.auditLog.length >= 3)
    const actions = fullCase.auditLog.map(l => l.action)
    assert.ok(actions.includes('CASE_CREATED'))
    assert.ok(actions.includes('EVIDENCE_ADDED'))
    assert.ok(actions.includes('CASE_UPDATED'))
  })

  test('6. Audit & Evidence Immutability: Triggers reject direct modifications', async () => {
    // 6.1 Direct UPDATE on investigation_evidence is rejected by MariaDB trigger
    const migConn = await createMigrationConnection()
    try {
      const [evRows] = await migConn.query(
        'SELECT id FROM investigation_evidence LIMIT 1'
      )
      assert.ok(evRows.length > 0)
      const evId = evRows[0].id

      await assert.rejects(
        async () => {
          await migConn.query(
            'UPDATE investigation_evidence SET description = "tampered" WHERE id = ?',
            [evId]
          )
        },
        err => {
          return err.message.includes('strictly immutable') || err.sqlState === '45000'
        },
        'Direct UPDATE on investigation_evidence must fail with immutability rejection'
      )

      // 6.2 Direct DELETE on investigation_evidence is rejected by MariaDB trigger
      await assert.rejects(
        async () => {
          await migConn.query(
            'DELETE FROM investigation_evidence WHERE id = ?',
            [evId]
          )
        },
        err => {
          return err.message.includes('strictly immutable') || err.sqlState === '45000'
        },
        'Direct DELETE on investigation_evidence must fail with immutability rejection'
      )

      // 6.3 Direct UPDATE on investigation_case_audit_log is rejected by trigger
      const [auditRows] = await migConn.query(
        'SELECT id FROM investigation_case_audit_log LIMIT 1'
      )
      assert.ok(auditRows.length > 0)
      const auditId = auditRows[0].id

      await assert.rejects(
        async () => {
          await migConn.query(
            'UPDATE investigation_case_audit_log SET notes = "tampered" WHERE id = ?',
            [auditId]
          )
        },
        err => {
          return err.message.includes('strictly immutable') || err.sqlState === '45000'
        },
        'Direct UPDATE on investigation_case_audit_log must fail with immutability rejection'
      )

      // 6.4 Direct DELETE on investigation_case_audit_log is rejected by trigger
      await assert.rejects(
        async () => {
          await migConn.query(
            'DELETE FROM investigation_case_audit_log WHERE id = ?',
            [auditId]
          )
        },
        err => {
          return err.message.includes('strictly immutable') || err.sqlState === '45000'
        },
        'Direct DELETE on investigation_case_audit_log must fail with immutability rejection'
      )

      // 6.5 Deleting a case with evidence or audit history is rejected by database protection
      const [caseRows] = await migConn.query(
        'SELECT id FROM investigation_cases LIMIT 1'
      )
      assert.ok(caseRows.length > 0)
      const targetCaseId = caseRows[0].id

      // Count evidence and audit entries before deletion attempt
      const [beforeEv] = await migConn.query(
        'SELECT COUNT(*) AS c FROM investigation_evidence WHERE case_id = ?',
        [targetCaseId]
      )
      const [beforeAudit] = await migConn.query(
        'SELECT COUNT(*) AS c FROM investigation_case_audit_log WHERE case_id = ?',
        [targetCaseId]
      )

      await assert.rejects(
        async () => {
          await migConn.query(
            'DELETE FROM investigation_cases WHERE id = ?',
            [targetCaseId]
          )
        },
        err => {
          return (
            err.message.includes('cannot be deleted') ||
            err.message.includes('foreign key constraint fails') ||
            err.sqlState === '45000' ||
            err.sqlState === '23000'
          )
        },
        'Deleting an investigation case must be rejected at database level'
      )

      // 6.6 Verify no evidence or audit history disappeared after rejected deletion
      const [afterEv] = await migConn.query(
        'SELECT COUNT(*) AS c FROM investigation_evidence WHERE case_id = ?',
        [targetCaseId]
      )
      const [afterAudit] = await migConn.query(
        'SELECT COUNT(*) AS c FROM investigation_case_audit_log WHERE case_id = ?',
        [targetCaseId]
      )
      assert.equal(Number(afterEv[0].c), Number(beforeEv[0].c), 'Evidence count must remain completely intact')
      assert.equal(Number(afterAudit[0].c), Number(beforeAudit[0].c), 'Audit history count must remain completely intact')
    } finally {
      await migConn.end()
    }

    // 6.7 Normal case updates, evidence insertion and audit-log insertion continue working
    const [openCaseRow] = await pool.query(
      'SELECT id FROM investigation_cases WHERE status = "open" LIMIT 1'
    )
    assert.ok(openCaseRow.length > 0)
    const testCaseId = openCaseRow[0].id

    // Insert system-linked evidence with valid entity reference
    const newEvRes = await request('POST', `/api/v1/investigator/cases/${testCaseId}/evidence`, {
      token: investigatorToken,
      body: {
        evidenceType: 'verified_fact',
        description: 'Post-migration normal evidence attachment verification.',
        sourceRef: 'INSP-VERIFY-028',
        sourceEntityType: 'package',
        sourceEntityId: testPackages[0].serial
      }
    })
    assert.equal(newEvRes.status, 201)
    assert.equal(newEvRes.body.data.source_entity_type, 'package')
    assert.equal(newEvRes.body.data.source_entity_id, testPackages[0].serial)

    // Verify physical-inspection / external-document evidence without internal event ID is preserved
    const extEvRes = await request('POST', `/api/v1/investigator/cases/${testCaseId}/evidence`, {
      token: investigatorToken,
      body: {
        evidenceType: 'document',
        description: 'Physical inspection affidavit signed by field officer.',
        sourceRef: 'Signed Affidavit Document #994'
      }
    })
    assert.equal(extEvRes.status, 201)
    assert.equal(extEvRes.body.data.source_ref, 'Signed Affidavit Document #994')
    assert.equal(extEvRes.body.data.source_entity_type, null)

    // Verify normal case updates continue working
    const updateRes = await request('PATCH', `/api/v1/investigator/cases/${testCaseId}`, {
      token: investigatorToken,
      body: {
        findings: 'Updated findings confirming Migration 028 retention guarantees.'
      }
    })
    assert.equal(updateRes.status, 200)
    assert.equal(updateRes.body.data.findings, 'Updated findings confirming Migration 028 retention guarantees.')
  })

  test('7. Dashboard activity filtering across date, org, product, batch, serial, event type', async () => {
    // 7.1 Filter by serial
    const serialRes = await request('GET', `/api/v1/investigator/dashboard/activity?serial=${testPackages[0].serial}`, {
      token: investigatorToken
    })
    assert.equal(serialRes.status, 200)
    assert.ok(serialRes.body.data.events.every(e => e.serial === testPackages[0].serial))

    // 7.2 Filter by eventType
    const eventRes = await request('GET', '/api/v1/investigator/dashboard/activity?eventType=SERIALIZED', {
      token: investigatorToken
    })
    assert.equal(eventRes.status, 200)
    assert.ok(eventRes.body.data.events.every(e => e.event_type === 'SERIALIZED'))

    // 7.3 Filter by batch
    const batchRes = await request('GET', `/api/v1/investigator/dashboard/activity?batchNo=${testBatch.batch_no}`, {
      token: investigatorToken
    })
    assert.equal(batchRes.status, 200)
    assert.ok(batchRes.body.data.events.every(e => e.batch_no === testBatch.batch_no))

    // 7.4 Filter by product
    const prodRes = await request('GET', `/api/v1/investigator/dashboard/activity?productId=${testProduct.id}`, {
      token: investigatorToken
    })
    assert.equal(prodRes.status, 200)
    assert.ok(prodRes.body.data.events.length > 0)

    // 7.5 Filter by organization
    const orgRes = await request('GET', `/api/v1/investigator/dashboard/activity?orgId=${testOrgMfg.id}`, {
      token: investigatorToken
    })
    assert.equal(orgRes.status, 200)
    assert.ok(orgRes.body.data.events.length > 0)

    // 7.6 Filter by date range
    const today = new Date().toISOString().slice(0, 10)
    const dateRes = await request('GET', `/api/v1/investigator/dashboard/activity?dateFrom=${today}&dateTo=${today}`, {
      token: investigatorToken
    })
    assert.equal(dateRes.status, 200)
    assert.ok(dateRes.body.data.events.length > 0)
  })

  test('8. Precise alert explanations: screening indicators and condition findings', async () => {
    const alertsRes = await request('GET', '/api/v1/investigator/alerts', {
      token: investigatorToken
    })
    assert.equal(alertsRes.status, 200)
    const alerts = alertsRes.body.data.alerts

    // Repeated scan alert must clearly specify screening indicator, not proof of counterfeit
    const scanAlert = alerts.find(a => a.alert_type === 'DUPLICATE_SCAN_ANOMALY')
    if (scanAlert) {
      assert.ok(scanAlert.summary.toLowerCase().includes('screening indicator'))
      assert.ok(scanAlert.details.toLowerCase().includes('screening indicators'))
      assert.ok(scanAlert.details.toLowerCase().includes('not proof of counterfeiting'))
    }

    // Damaged package alert must specify condition finding, not numerical count mismatch
    const damagedAlert = alerts.find(a => a.alert_type === 'SHIPMENT_QUANTITY_DISCREPANCY' && a.package_serial === testPackages[2].serial)
    if (damagedAlert) {
      assert.ok(damagedAlert.summary.toLowerCase().includes('physical condition discrepancy'))
      assert.ok(damagedAlert.details.toLowerCase().includes('condition finding, not a numerical quantity count mismatch'))
    }
  })
})
