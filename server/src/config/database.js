// PharmaTrace AI — MariaDB Connection Pool & Lifecycle Manager
// Targets: XAMPP MariaDB 10.11.16 via mysql2/promise
import mysql from 'mysql2/promise'
import { env } from './env.js'
import { logger } from '../utils/logger.js'

let pool = null

export function getPoolConfig(overrides = {}) {
  const user = (overrides.user !== undefined ? overrides.user : env.DB_USER || '').trim()

  // Prohibit root fallback or missing runtime account
  if (!user || user.toLowerCase() === 'root') {
    throw new Error(
      'DATABASE_CONFIGURATION_ERROR: Direct connection as "root" is strictly prohibited. ' +
      'PharmaTrace AI requires a dedicated least-privilege runtime account (DB_USER=pharmatrace_app).'
    )
  }

  // Ensure password is provided
  const password = overrides.password !== undefined ? overrides.password : env.DB_PASSWORD
  if (password === undefined || password === null) {
    throw new Error(
      'DATABASE_CONFIGURATION_ERROR: Missing database password for runtime user. ' +
      'Please configure DB_PASSWORD in server/.env.'
    )
  }

  const config = {
    host: overrides.host || env.DB_HOST,
    port: overrides.port || env.DB_PORT,
    user,
    password,
    charset: overrides.charset || env.DB_CHARSET,
    waitForConnections: overrides.waitForConnections !== undefined ? overrides.waitForConnections : env.DB_WAIT_FOR_CONNECTIONS,
    connectionLimit: overrides.connectionLimit || env.DB_CONNECTION_LIMIT,
    queueLimit: overrides.queueLimit !== undefined ? overrides.queueLimit : env.DB_QUEUE_LIMIT,
    connectTimeout: overrides.connectTimeout || env.DB_CONNECT_TIMEOUT,
    // Enable MariaDB-compatible date and timezone handling
    dateStrings: true,
    ...overrides
  }

  // Only bind database if explicitly non-empty, allowing generic server ping if DB not yet created
  const dbName = overrides.database !== undefined ? overrides.database : env.DB_NAME
  if (dbName && String(dbName).trim() !== '') {
    config.database = String(dbName).trim()
  }

  // Safety check: ensure runtime pool never connects to non-test database during tests
  if (config.database && env.NODE_ENV === 'test' && config.database !== 'pharmatrace_ai_test') {
    throw new Error(
      `DATABASE_SAFETY_ERROR: In test environment, runtime database must strictly be 'pharmatrace_ai_test', got '${config.database}'`
    )
  }

  return config
}

export function getPool(overrides = {}) {
  if (!pool) {
    const config = getPoolConfig(overrides)
    logger.info('Initializing MariaDB connection pool', {
      host: config.host,
      port: config.port,
      user: config.user,
      database: config.database || '[none]',
      connectionLimit: config.connectionLimit
    })
    pool = mysql.createPool(config)
  }
  return pool
}

/**
 * Executes a parameterized SQL query using a pooled connection.
 * @param {string} sql - Parameterized SQL query string
 * @param {Array} params - Array of parameters to bind
 * @returns {Promise<[any, any]>} Query result rows and field metadata
 */
export async function execute(sql, params = []) {
  const currentPool = getPool()
  return currentPool.execute(sql, params)
}

/**
 * Checks connectivity against the MariaDB server.
 * Executes a lightweight validation query and returns diagnostic status.
 * Never throws — returns a structured health status object.
 */
export async function checkDatabaseHealth(customPool = null) {
  const activePool = customPool || getPool()
  const start = Date.now()
  let connection = null

  try {
    connection = await activePool.getConnection()
    const [rows] = await connection.query('SELECT 1 AS connected, VERSION() AS version, NOW() AS server_time')
    const latencyMs = Date.now() - start

    const version = rows?.[0]?.version || 'unknown'
    return {
      ok: true,
      status: 'ready',
      version,
      latencyMs
    }
  } catch (err) {
    const latencyMs = Date.now() - start
    logger.error('MariaDB health check failed', {
      message: err.message,
      code: err.code,
      errno: err.errno,
      latencyMs
    })

    return {
      ok: false,
      status: 'disconnected',
      code: err.code || 'UNKNOWN_ERROR',
      message: 'Database service is unavailable'
    }
  } finally {
    if (connection) {
      try {
        connection.release()
      } catch (releaseErr) {
        logger.warn('Error releasing connection back to pool', { message: releaseErr.message })
      }
    }
  }
}

/**
 * Gracefully shuts down the connection pool, draining active connections.
 */
export async function closeDatabasePool() {
  if (pool) {
    logger.info('Closing MariaDB connection pool...')
    try {
      await pool.end()
      logger.info('MariaDB connection pool closed successfully.')
    } catch (err) {
      logger.error('Error closing MariaDB connection pool', { message: err.message })
    } finally {
      pool = null
    }
  }
}
