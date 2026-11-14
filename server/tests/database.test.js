// PharmaTrace AI — MariaDB Connection & Pool Resilience Tests
import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'
import mysql from 'mysql2/promise'
import {
  getPool,
  checkDatabaseHealth,
  closeDatabasePool,
  execute
} from '../src/config/database.js'

describe('MariaDB Connection & Pool Resilience', () => {
  after(async () => {
    await closeDatabasePool()
  })

  test('checkDatabaseHealth successfully connects to XAMPP MariaDB and executes validation query', async () => {
    const health = await checkDatabaseHealth()

    // When XAMPP MariaDB is running, connection succeeds
    assert.equal(health.ok, true, `Database health check failed: ${health.message} (${health.code})`)
    assert.equal(health.status, 'ready')
    assert.ok(health.version.includes('MariaDB') || health.version.length > 0, 'Version string must be returned')
    assert.ok(typeof health.latencyMs === 'number', 'Latency must be numeric')
  })

  test('Parameterized queries execute correctly on MariaDB connection pool', async () => {
    // Execute a simple parameterized query to verify parameter binding
    const [rows] = await execute('SELECT ? AS test_val, ? AS test_num', ['PharmaTrace', 42])

    assert.ok(Array.isArray(rows), 'Rows must be an array')
    assert.equal(rows[0].test_val, 'PharmaTrace')
    assert.equal(Number(rows[0].test_num), 42)
  })

  test('Connection pool is reusable across multiple sequential and concurrent queries', async () => {
    const promises = []

    for (let i = 1; i <= 5; i++) {
      promises.push(execute('SELECT ? AS iteration', [i]))
    }

    const results = await Promise.all(promises)

    assert.equal(results.length, 5)
    for (let i = 0; i < 5; i++) {
      const [rows] = results[i]
      assert.equal(Number(rows[0].iteration), i + 1)
    }
  })

  test('Database connection failure produces structured error without throwing or claiming connectivity', async () => {
    // Create an isolated pool pointing to an intentionally unreachable port
    const badPool = mysql.createPool({
      host: '127.0.0.1',
      port: 59999, // Unused port
      user: 'root',
      connectTimeout: 1000
    })

    try {
      const health = await checkDatabaseHealth(badPool)

      assert.equal(health.ok, false, 'Health check must report failure for unreachable port')
      assert.equal(health.status, 'disconnected')
      assert.equal(health.message, 'Database service is unavailable')
      assert.ok(health.code, 'Error code must be present')
    } finally {
      await badPool.end()
    }
  })

  test('closeDatabasePool shuts down cleanly and resets pool instance', async () => {
    // Ensure pool is initialized
    getPool()

    // Close pool
    await closeDatabasePool()

    // Subsequent call to closeDatabasePool should be safe (idempotent)
    await closeDatabasePool()
  })
})
