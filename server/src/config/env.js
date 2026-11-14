// PharmaTrace AI — Validated Environment Configuration
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

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

export const env = Object.freeze({
  PORT: parseNumber(process.env.PORT, 5000),
  NODE_ENV: process.env.NODE_ENV || 'development',
  CORS_ORIGIN: parseOrigins(process.env.CORS_ORIGIN),

  // Application Runtime Database Connection (Least Privilege)
  DB_HOST: process.env.DB_HOST || '127.0.0.1',
  DB_PORT: parseNumber(process.env.DB_PORT, 3306),
  DB_NAME: process.env.DB_NAME || 'pharmatrace_ai',
  DB_USER: process.env.DB_USER || 'root',
  DB_PASSWORD: process.env.DB_PASSWORD ?? '',
  DB_CHARSET: process.env.DB_CHARSET || 'utf8mb4',

  // Migration Account Connection (DDL Management)
  MIGRATION_DB_HOST: process.env.MIGRATION_DB_HOST || process.env.DB_HOST || '127.0.0.1',
  MIGRATION_DB_PORT: parseNumber(process.env.MIGRATION_DB_PORT || process.env.DB_PORT, 3306),
  MIGRATION_DB_NAME: process.env.MIGRATION_DB_NAME || process.env.DB_NAME || 'pharmatrace_ai',
  MIGRATION_DB_USER: process.env.MIGRATION_DB_USER || process.env.DB_USER || 'root',
  MIGRATION_DB_PASSWORD: process.env.MIGRATION_DB_PASSWORD ?? (process.env.DB_PASSWORD ?? ''),

  // Connection Pool Tuning
  DB_CONNECTION_LIMIT: parseNumber(process.env.DB_CONNECTION_LIMIT, 10),
  DB_WAIT_FOR_CONNECTIONS: parseBoolean(process.env.DB_WAIT_FOR_CONNECTIONS, true),
  DB_QUEUE_LIMIT: parseNumber(process.env.DB_QUEUE_LIMIT, 0),
  DB_CONNECT_TIMEOUT: parseNumber(process.env.DB_CONNECT_TIMEOUT, 10000),

  // Authentication & Session Security (Revision 3.2 §4.2)
  JWT_SECRET: process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'pharmatrace-ai-insecure-dev-jwt-secret-min-32-chars!'),
  JWT_EXPIRES_IN: '15m'
})

/**
 * Validates critical security configuration at application startup.
 * Halts execution if production environment lacks mandatory cryptographic secrets.
 */
export function validateAuthConfig() {
  if (env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      throw new Error('CRITICAL: JWT_SECRET must be configured with at least 32 characters in production mode.')
    }
  }
}
