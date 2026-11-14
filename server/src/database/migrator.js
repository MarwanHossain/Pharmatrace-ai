// PharmaTrace AI — Deterministic Schema Migration Engine
// Targets: XAMPP MariaDB 10.11.16 via mysql2/promise
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import mysql from 'mysql2/promise'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const MIGRATIONS_DIR = path.resolve(__dirname, './migrations')

export function getMigrationConfig(overrides = {}) {
  return {
    host: env.MIGRATION_DB_HOST,
    port: env.MIGRATION_DB_PORT,
    user: env.MIGRATION_DB_USER,
    password: env.MIGRATION_DB_PASSWORD,
    database: env.MIGRATION_DB_NAME,
    charset: env.DB_CHARSET || 'utf8mb4',
    multipleStatements: true,
    connectTimeout: env.DB_CONNECT_TIMEOUT,
    ...overrides
  }
}

/**
 * Creates an administrative database connection for executing DDL migrations.
 */
export async function createMigrationConnection(overrides = {}) {
  const config = getMigrationConfig(overrides)
  return mysql.createConnection(config)
}

/**
 * Ensures the schema_migrations tracking table exists.
 */
export async function ensureMigrationTable(connection) {
  const sql = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `
  await connection.query(sql)
}

/**
 * Retrieves the set of already applied migration versions.
 */
export async function getAppliedMigrations(connection) {
  await ensureMigrationTable(connection)
  const [rows] = await connection.query('SELECT version, name, executed_at FROM schema_migrations ORDER BY version ASC')
  return rows
}

/**
 * Scans the migrations directory and returns sorted migration file descriptors.
 */
export async function getAvailableMigrations() {
  const files = await fs.readdir(MIGRATIONS_DIR)
  const sqlFiles = files.filter(f => f.endsWith('.sql')).sort()

  return sqlFiles.map(filename => {
    const match = filename.match(/^(\d+)[-_](.+)\.sql$/i)
    const version = match ? match[1] : filename.replace(/\.sql$/i, '')
    const name = match ? match[2] : filename

    return {
      version,
      name,
      filename,
      filePath: path.join(MIGRATIONS_DIR, filename)
    }
  })
}

/**
 * Executes all pending migrations in strict alphanumeric order.
 * Halts safely on any failure without marking the failed migration as applied.
 */
export async function runMigrations(options = {}) {
  const connection = options.connection || await createMigrationConnection()
  const shouldClose = !options.connection

  try {
    await ensureMigrationTable(connection)
    const appliedRows = await getAppliedMigrations(connection)
    const appliedSet = new Map(appliedRows.map(r => [r.version, r]))
    const available = await getAvailableMigrations()

    const applied = []
    const skipped = []

    for (const migration of available) {
      if (appliedSet.has(migration.version)) {
        skipped.push({
          ...migration,
          executedAt: appliedSet.get(migration.version).executed_at
        })
        logger.debug(`[SKIPPED] Migration ${migration.filename} already applied`)
        continue
      }

      logger.info(`[APPLYING] Migration ${migration.filename}...`)
      const sqlContent = await fs.readFile(migration.filePath, 'utf8')

      // Execute migration statements
      try {
        await connection.query(sqlContent)

        // Record execution in schema_migrations
        await connection.query(
          'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
          [migration.version, migration.filename]
        )

        applied.push(migration)
        logger.info(`[APPLIED] Migration ${migration.filename} completed successfully.`)
      } catch (err) {
        logger.error(`[FAILED] Migration ${migration.filename} encountered an error:`, {
          message: err.message,
          code: err.code,
          errno: err.errno,
          sqlState: err.sqlState
        })
        throw new Error(`Migration ${migration.filename} failed: ${err.message}`)
      }
    }

    return {
      success: true,
      applied,
      skipped,
      totalAvailable: available.length
    }
  } finally {
    if (shouldClose && connection) {
      await connection.end()
    }
  }
}

/**
 * Returns complete migration status report (applied vs pending).
 */
export async function getMigrationStatus(connection = null) {
  const conn = connection || await createMigrationConnection()
  const shouldClose = !connection

  try {
    await ensureMigrationTable(conn)
    const appliedRows = await getAppliedMigrations(conn)
    const appliedMap = new Map(appliedRows.map(r => [r.version, r]))
    const available = await getAvailableMigrations()

    return available.map(m => {
      const record = appliedMap.get(m.version)
      return {
        version: m.version,
        filename: m.filename,
        status: record ? 'APPLIED' : 'PENDING',
        executedAt: record ? record.executed_at : null
      }
    })
  } finally {
    if (shouldClose && conn) {
      await conn.end()
    }
  }
}
