// PharmaTrace AI — JWT and Cryptographic Token Utilities
// Conforms to Revision 3.2 §4.1 & §4.2 specifications
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { env } from '../config/env.js'

export const AUTH_COOKIE_NAME = 'pt_access_token'
export const JWT_EXPIRY = '15m'
export const JWT_EXPIRY_MS = 15 * 60 * 1000 // 15 minutes in milliseconds

/**
 * Returns cookie configuration options based on the current execution environment.
 * Development: SameSite=Lax, Secure=false, HttpOnly=true, Path=/
 * Production:  SameSite=Strict, Secure=true, HttpOnly=true, Path=/
 *
 * @param {object} overrides
 * @returns {import('express').CookieOptions}
 */
export function getAuthCookieOptions(overrides = {}) {
  const isProduction = env.NODE_ENV === 'production'
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/',
    maxAge: JWT_EXPIRY_MS,
    ...overrides
  }
}

/**
 * Signs a 15-minute JSON Web Token for the authenticated user session.
 *
 * @param {object} user - User domain entity
 * @param {string} user.id
 * @param {string} user.email
 * @param {string} user.role
 * @param {string|null} user.orgId
 * @param {number} user.tokenVersion
 * @returns {string} Signed JWT
 */
export function signAccessToken(user) {
  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.')
  }

  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    orgId: user.orgId || user.org_id || null,
    tokenVersion: user.tokenVersion || user.token_version || 1
  }

  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: JWT_EXPIRY,
    algorithm: 'HS256'
  })
}

/**
 * Verifies and decodes a JWT access token.
 *
 * @param {string} token
 * @returns {object} Decoded JWT payload
 */
export function verifyAccessToken(token) {
  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.')
  }
  return jwt.verify(token, env.JWT_SECRET, {
    algorithms: ['HS256']
  })
}

/**
 * Generates a 256-bit cryptographically secure random token (64 hex characters)
 * for account activation.
 *
 * @returns {string} Raw high-entropy token string
 */
export function generateActivationToken() {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Computes the SHA-256 hash of a raw token for secure database storage and lookup.
 *
 * @param {string} rawToken
 * @returns {string} 64-character hex digest
 */
export function hashToken(rawToken) {
  if (typeof rawToken !== 'string' || !rawToken) {
    throw new Error('Invalid token for hashing.')
  }
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

/**
 * Validates whether a token matches the 64-character hexadecimal format.
 *
 * @param {string} token
 * @returns {boolean}
 */
export function validateTokenFormat(token) {
  return typeof token === 'string' && /^[0-9a-fA-F]{64}$/.test(token)
}

/**
 * Creates a single-use registration access token in the database.
 * Used for applicant information resubmission workflows.
 *
 * @param {import('mysql2/promise').Connection|import('mysql2/promise').Pool} connectionOrPool
 * @param {string} registrationId
 * @param {number} [expiresInDays=7]
 * @returns {Promise<{ id: string, rawToken: string, tokenHash: string, expiresAt: Date }>}
 */
export async function createRegistrationAccessToken(connectionOrPool, registrationId, expiresInDays = 7) {
  const rawToken = generateActivationToken()
  const tokenHash = hashToken(rawToken)
  const id = `rat-${crypto.randomUUID()}`

  await connectionOrPool.query(
    `INSERT INTO registration_access_tokens (
      id, registration_id, token_hash, expires_at, used, revoked
    ) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), 0, 0)`,
    [id, registrationId, tokenHash, expiresInDays]
  )

  const [rows] = await connectionOrPool.query(
    'SELECT expires_at FROM registration_access_tokens WHERE id = ?',
    [id]
  )

  return {
    id,
    rawToken,
    tokenHash,
    expiresAt: rows[0]?.expires_at
  }
}
