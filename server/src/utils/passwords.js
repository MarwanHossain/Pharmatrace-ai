// PharmaTrace AI — Password Security & Cryptographic Utilities
// Conforms to Revision 3.2 §1.2 & §4.1 specifications
import bcrypt from 'bcrypt'
import crypto from 'crypto'

export const BCRYPT_SALT_ROUNDS = 12
export const MIN_PASSWORD_LENGTH = 10
export const MAX_PASSWORD_BYTES = 72

let cachedDummyHash = null

/**
 * Validates a plaintext password against Revision 3.2 security policies:
 * - Minimum 10 characters
 * - Maximum 72 UTF-8 bytes (bcrypt ceiling to prevent silent truncation)
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special symbol
 *
 * @param {string} password
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePassword(password) {
  if (typeof password !== 'string') {
    return { valid: false, error: 'Password must be a string.' }
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
    }
  }

  const byteLength = Buffer.byteLength(password, 'utf8')
  if (byteLength > MAX_PASSWORD_BYTES) {
    return {
      valid: false,
      error: `Password exceeds the maximum length of ${MAX_PASSWORD_BYTES} UTF-8 bytes.`
    }
  }

  const hasUpper = /[A-Z]/.test(password)
  const hasLower = /[a-z]/.test(password)
  const hasNumber = /\d/.test(password)
  const hasSymbol = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)

  if (!hasUpper || !hasLower || !hasNumber || !hasSymbol) {
    return {
      valid: false,
      error: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character.'
    }
  }

  return { valid: true }
}

/**
 * Hashes a plaintext password using bcrypt with cost factor 12.
 * Validates password criteria before hashing.
 *
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  const validation = validatePassword(password)
  if (!validation.valid) {
    throw new Error(validation.error)
  }
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS)
}

/**
 * Safely compares a plaintext password with a bcrypt hash.
 * Catches malformed or invalid hash formats without crashing.
 *
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export async function comparePassword(password, hash) {
  if (typeof password !== 'string' || typeof hash !== 'string' || !hash.startsWith('$2')) {
    return false
  }
  try {
    return await bcrypt.compare(password, hash)
  } catch {
    return false
  }
}

/**
 * Retrieves a genuinely generated, cached bcrypt cost-12 dummy hash.
 * Generated from a high-entropy ephemeral secret at runtime.
 *
 * @returns {Promise<string>}
 */
export async function getDummyHash() {
  if (!cachedDummyHash) {
    const ephemeralSecret = crypto.randomBytes(32).toString('hex')
    cachedDummyHash = await bcrypt.hash(ephemeralSecret, BCRYPT_SALT_ROUNDS)
  }
  return cachedDummyHash
}

/**
 * Constant-work password evaluation to mitigate user enumeration timing attacks.
 * If actualHash is provided and valid, evaluates against it.
 * If actualHash is missing, evaluates against the genuine cost-12 dummy hash.
 *
 * @param {string} password
 * @param {string|null} actualHash
 * @returns {Promise<boolean>}
 */
export async function compareConstantTime(password, actualHash) {
  const safePassword = typeof password === 'string' ? password : ''
  const isHashUsable = typeof actualHash === 'string' && actualHash.startsWith('$2')

  if (isHashUsable) {
    try {
      return await bcrypt.compare(safePassword, actualHash)
    } catch {
      // If the hash is corrupted, run against dummy hash to maintain constant time
      const dummy = await getDummyHash()
      await bcrypt.compare(safePassword, dummy)
      return false
    }
  } else {
    const dummy = await getDummyHash()
    await bcrypt.compare(safePassword, dummy)
    return false
  }
}
