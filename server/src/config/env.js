// PharmaTrace AI — Validated Environment Configuration
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { logger } from '../utils/logger.js'

// Locate project server root and load .env if present
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

function parseNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback
  const normalized = String(value).trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes'
}

function parseOrigins(value, fallback = ['http://localhost:5173', 'http://127.0.0.1:5173']) {
  if (!value || typeof value !== 'string') return fallback
  return value
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)
}

const nodeEnv = process.env.NODE_ENV || 'development'
const isTestEnv = nodeEnv === 'test'
const defaultDbName = isTestEnv ? 'pharmatrace_ai_test' : 'pharmatrace_ai'

const resolvedDbName = process.env.DB_NAME || defaultDbName
const resolvedMigrationDbName = process.env.MIGRATION_DB_NAME || process.env.DB_NAME || defaultDbName

// MANDATORY SAFETY GUARD: Prevent automated tests from targeting development or production databases
if (isTestEnv) {
  const allowlistedTestDb = 'pharmatrace_ai_test'
  if (resolvedDbName !== allowlistedTestDb) {
    throw new Error(
      `FATAL_TEST_SAFETY_VIOLATION: Automated tests are prohibited from connecting to runtime database '${resolvedDbName}'. ` +
      `Only the exact allowlisted test database '${allowlistedTestDb}' is permitted when NODE_ENV=test. Execution halted.`
    )
  }
  if (resolvedMigrationDbName !== allowlistedTestDb) {
    throw new Error(
      `FATAL_TEST_SAFETY_VIOLATION: Test migrations are prohibited from targeting database '${resolvedMigrationDbName}'. ` +
      `Only the exact allowlisted test database '${allowlistedTestDb}' is permitted when NODE_ENV=test. Execution halted.`
    )
  }
}

export const env = Object.freeze({
  PORT: parseNumber(process.env.PORT, 5000),
  NODE_ENV: nodeEnv,
  CORS_ORIGIN: parseOrigins(process.env.CORS_ORIGIN),

  // Application Runtime Database Connection (Least Privilege: pharmatrace_app)
  DB_HOST: process.env.DB_HOST || '127.0.0.1',
  DB_PORT: parseNumber(process.env.DB_PORT, 3306),
  DB_NAME: resolvedDbName,
  DB_USER: process.env.DB_USER || 'pharmatrace_app',
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_CHARSET: process.env.DB_CHARSET || 'utf8mb4',

  // Migration Account Connection (DDL Management: pharmatrace_migrator)
  MIGRATION_DB_HOST: process.env.MIGRATION_DB_HOST || process.env.DB_HOST || '127.0.0.1',
  MIGRATION_DB_PORT: parseNumber(process.env.MIGRATION_DB_PORT || process.env.DB_PORT, 3306),
  MIGRATION_DB_NAME: resolvedMigrationDbName,
  MIGRATION_DB_USER: process.env.MIGRATION_DB_USER || 'pharmatrace_migrator',
  MIGRATION_DB_PASSWORD: process.env.MIGRATION_DB_PASSWORD,

  // Connection Pool Tuning
  DB_CONNECTION_LIMIT: parseNumber(process.env.DB_CONNECTION_LIMIT, 10),
  DB_WAIT_FOR_CONNECTIONS: parseBoolean(process.env.DB_WAIT_FOR_CONNECTIONS, true),
  DB_QUEUE_LIMIT: parseNumber(process.env.DB_QUEUE_LIMIT, 0),
  DB_CONNECT_TIMEOUT: parseNumber(process.env.DB_CONNECT_TIMEOUT, 10000),

  // Authentication & Session Security (Revision 3.2 §4.2)
  JWT_SECRET: process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'pharmatrace-ai-insecure-dev-jwt-secret-min-32-chars!'),
  JWT_EXPIRES_IN: '15m',

  // Development-Only Lockout Bypass Controls (Revision 3.2 dev-only)
  get DEV_AUTH_LOCKOUT_BYPASS() {
    return isAuthLockoutBypassEnabled()
  }
})

/**
 * Evaluates whether development authentication lockout bypass is active.
 *
 * STRICT SECURITY REQUIREMENT:
 * Fail-Safe Design: The bypass is permitted ONLY when NODE_ENV is explicitly 'development'.
 * If NODE_ENV is missing, empty, 'test', 'production', or any unrecognized value,
 * this function unconditionally returns false.
 *
 * Even in 'development', the bypass is enabled only when DEV_AUTH_LOCKOUT_BYPASS
 * is explicitly set to a truthy boolean ('true', '1', or 'yes').
 *
 * @returns {boolean}
 */
export function isAuthLockoutBypassEnabled() {
  const currentEnv = typeof process.env.NODE_ENV === 'string' ? process.env.NODE_ENV.trim() : ''
  if (currentEnv !== 'development') {
    return false
  }
  return parseBoolean(process.env.DEV_AUTH_LOCKOUT_BYPASS, false)
}

/**
 * Validates critical security configuration at application startup.
 * Halts execution if production environment lacks mandatory cryptographic secrets.
 */
export function validateAuthConfig() {
  const currentEnv = process.env.NODE_ENV || env.NODE_ENV
  if (currentEnv === 'production') {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      throw new Error('CRITICAL: JWT_SECRET must be configured with at least 32 characters in production mode.')
    }
    if (parseBoolean(process.env.DEV_AUTH_LOCKOUT_BYPASS, false)) {
      logger.warn('SECURITY ALERT: DEV_AUTH_LOCKOUT_BYPASS is configured but strictly ignored because application is running in production mode.')
    }
  }
}
