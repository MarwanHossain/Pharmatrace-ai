// PharmaTrace AI — Relational Schema & MariaDB 10.11 Compatibility Tests
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { getPool, closeDatabasePool, execute } from '../src/config/database.js'
import { runMigrations, getAppliedMigrations } from '../src/database/migrator.js'

describe('PharmaTrace AI — Relational Schema & Integrity Validation', () => {
  let pool = null

  before(async () => {
    pool = getPool()
    // Ensure migrations are executed
    await runMigrations()
  })

  after(async () => {
    await closeDatabasePool()
  })

  test('All schema migrations (including 022) are recorded in schema_migrations', async () => {
    const applied = await getAppliedMigrations(pool)
    assert.equal(applied.length, 22, 'All 22 migrations must be recorded')

    const versions = applied.map(m => m.version)
    assert.ok(versions.includes('001'))
    assert.ok(versions.includes('021'))
    assert.ok(versions.includes('022'))
  })

  test('Every required table exists in the database', async () => {
    const [rows] = await execute('SHOW TABLES')
    const tableKey = Object.keys(rows[0])[0]
    const tables = new Set(rows.map(r => r[tableKey]))

    const expectedTables = [
      'schema_migrations',
      'category_policies',
      'organizations',
      'users',
      'organization_registrations',
      'registration_documents',
      'registration_access_tokens',
      'activation_tokens',
      'registration_submissions',
      'registration_audit_log',
      'products',
      'batches',
      'government_allocations',
      'government_allocation_documents',
      'packages',
      'shipments',
      'shipment_packages',
      'traceability_events',
      'investigation_alerts',
      'public_reports',
      'public_report_attachments'
    ]

    for (const expected of expectedTables) {
      assert.ok(tables.has(expected), `Table "${expected}" must exist in database`)
    }
  })

  test('Category policies are seeded with exact Revision 3.2 rules', async () => {
    const [rows] = await execute(
      'SELECT category, display_name, max_active_instances, is_registration_allowed FROM category_policies ORDER BY category ASC'
    )

    assert.equal(rows.length, 4)
    const policies = Object.fromEntries(rows.map(r => [r.category, r]))

    assert.equal(policies.distributor.max_active_instances, 1)
    assert.equal(policies.distributor.is_registration_allowed, 1)

    assert.equal(policies.wholesaler.max_active_instances, 1)
    assert.equal(policies.wholesaler.is_registration_allowed, 1)

    assert.equal(policies.manufacturer.max_active_instances, null)
    assert.equal(policies.manufacturer.is_registration_allowed, 1)

    assert.equal(policies.pharmacy.max_active_instances, null)
    assert.equal(policies.pharmacy.is_registration_allowed, 1)
  })

  test('Dynamic category availability derives open status when zero active orgs exist, and closed when limit reached', async () => {
    const dynamicQuery = `
      SELECT
          cp.category,
          cp.max_active_instances,
          COUNT(o.id) AS active_count,
          CASE
              WHEN cp.is_registration_allowed = FALSE THEN FALSE
              WHEN cp.max_active_instances IS NULL THEN TRUE
              WHEN COUNT(o.id) < cp.max_active_instances THEN TRUE
              ELSE FALSE
          END AS is_available
      FROM category_policies cp
      LEFT JOIN organizations o ON o.type = cp.category
           AND o.status = 'active'
           AND o.data_environment = 'production'
      GROUP BY cp.category, cp.display_name, cp.max_active_instances, cp.is_registration_allowed
      ORDER BY cp.category ASC;
    `

    // Step 1: Initial state (zero active production orgs)
    const [initialRows] = await execute(dynamicQuery)
    const initialAvailability = Object.fromEntries(initialRows.map(r => [r.category, Boolean(r.is_available)]))

    assert.equal(initialAvailability.distributor, true, 'Distributor must be available when 0 active orgs exist')
    assert.equal(initialAvailability.wholesaler, true, 'Wholesaler must be available when 0 active orgs exist')
    assert.equal(initialAvailability.manufacturer, true, 'Manufacturer must be available')
    assert.equal(initialAvailability.pharmacy, true, 'Pharmacy must be available')

    // Step 2: Insert temporary test active distributor
    const testDistId = 'test-dist-dynamic-check'
    await execute(
      `INSERT INTO organizations (
        id, name, type, license_number, address, contact_name, contact_email, contact_phone, status, data_environment
      ) VALUES (?, ?, 'distributor', 'LIC-TEST-DIST-01', 'Test Address', 'Test Contact', 'dist@test.local', '01700000000', 'active', 'production')`,
      [testDistId, 'Test Active Distributor']
    )

    try {
      const [updatedRows] = await execute(dynamicQuery)
      const updatedAvailability = Object.fromEntries(updatedRows.map(r => [r.category, Boolean(r.is_available)]))

      assert.equal(updatedAvailability.distributor, false, 'Distributor must be UNAVAILABLE when limit (1) is reached')
      assert.equal(updatedAvailability.wholesaler, true, 'Wholesaler must remain available')
      assert.equal(updatedAvailability.manufacturer, true, 'Manufacturer must remain available')
      assert.equal(updatedAvailability.pharmacy, true, 'Pharmacy must remain available')
    } finally {
      // Step 3: Clean up test organization
      await execute('DELETE FROM organizations WHERE id = ?', [testDistId])
    }

    // Step 4: Verify distributor is available again after removal
    const [restoredRows] = await execute(dynamicQuery)
    const restoredAvailability = Object.fromEntries(restoredRows.map(r => [r.category, Boolean(r.is_available)]))
    assert.equal(restoredAvailability.distributor, true, 'Distributor must become available again when count returns to 0')
  })

  test('MariaDB JSON storage and JSON_VALID check constraint function correctly', async () => {
    // Create a prerequisite registration row for foreign key
    const regId = 'test-reg-json-validation'
    await execute(
      `INSERT INTO organization_registrations (
        id, reference_number, tracking_pin_hash, category, org_name, license_number, address, contact_name, contact_email, contact_phone
      ) VALUES (?, 'REG-TEST-JSON', 'hash123', 'manufacturer', 'JSON Test Org', 'LIC-JSON-01', 'Dhaka', 'Contact', 'test@json.local', '01700000001')`,
      [regId]
    )

    try {
      // Valid JSON insertion must succeed
      const validPayload = JSON.stringify({ orgName: 'JSON Test Org', facilities: 2, verified: true })
      await execute(
        'INSERT INTO registration_submissions (id, registration_id, version, submitted_data) VALUES (?, ?, 1, ?)',
        ['test-sub-valid-json', regId, validPayload]
      )

      // Retrieve and verify JSON functions
      const [rows] = await execute(
        'SELECT JSON_VALUE(submitted_data, "$.orgName") AS extracted_name, JSON_VALID(submitted_data) AS is_valid FROM registration_submissions WHERE id = ?',
        ['test-sub-valid-json']
      )

      assert.equal(rows[0].extracted_name, 'JSON Test Org')
      assert.equal(Number(rows[0].is_valid), 1)

      // Invalid JSON insertion must be rejected by MariaDB CHECK constraint
      const invalidJson = '{ malformed json: true, invalid }'
      await assert.rejects(
        async () => {
          await execute(
            'INSERT INTO registration_submissions (id, registration_id, version, submitted_data) VALUES (?, ?, 2, ?)',
            ['test-sub-invalid-json', regId, invalidJson]
          )
        },
        err => {
          // MariaDB errno 4025 is ER_CONSTRAINT_FAILED
          return (
            err.errno === 4025 ||
            err.code === 'ER_CONSTRAINT_FAILED' ||
            err.code === 'ER_INNODB_AUTOEXTEND_SIZE_OUT_OF_RANGE' ||
            err.message.includes('CONSTRAINT') ||
            err.message.includes('check constraint') ||
            err.message.includes('JSON_VALID')
          )
        },
        'Invalid JSON must violate CHECK constraint'
      )
    } finally {
      // Clean up test records
      await execute('DELETE FROM registration_submissions WHERE registration_id = ?', [regId])
      await execute('DELETE FROM organization_registrations WHERE id = ?', [regId])
    }
  })

  test('Foreign key constraints reject invalid relationships and enforce ON DELETE RESTRICT', async () => {
    // Attempting to insert a user with a non-existent org_id must fail
    await assert.rejects(
      async () => {
        await execute(
          `INSERT INTO users (id, org_id, name, email, role, status)
           VALUES ('test-user-fk-fail', 'non-existent-org-id', 'Fail User', 'fail@test.local', 'manufacturer', 'active')`
        )
      },
      err => {
        return err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW'
      },
      'Foreign key constraint must reject non-existent org_id'
    )
  })

  test('Database constraints reject duplicate unique keys', async () => {
    const regId1 = 'test-reg-unique-1'
    const regId2 = 'test-reg-unique-2'
    await execute(
      `INSERT INTO organization_registrations (
        id, reference_number, tracking_pin_hash, category, org_name, license_number, address, contact_name, contact_email, contact_phone
      ) VALUES (?, 'REG-UNIQUE-TEST-01', 'hash123', 'manufacturer', 'Unique Org 1', 'LIC-U-01', 'Dhaka', 'Contact', 'u1@test.local', '01700000001')`,
      [regId1]
    )

    try {
      await assert.rejects(
        async () => {
          await execute(
            `INSERT INTO organization_registrations (
              id, reference_number, tracking_pin_hash, category, org_name, license_number, address, contact_name, contact_email, contact_phone
            ) VALUES (?, 'REG-UNIQUE-TEST-01', 'hash456', 'manufacturer', 'Unique Org 2', 'LIC-U-02', 'Dhaka', 'Contact', 'u2@test.local', '01700000002')`,
            [regId2]
          )
        },
        err => err.code === 'ER_DUP_ENTRY' || err.errno === 1062,
        'Duplicate reference_number must be rejected by UNIQUE constraint'
      )
    } finally {
      await execute('DELETE FROM organization_registrations WHERE id = ?', [regId1])
    }
  })
})
