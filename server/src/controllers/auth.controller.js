// PharmaTrace AI — Authentication Controller
// Implements Revision 3.2 §4.1 & §4.2 Specifications
import { getPool } from '../config/database.js'
import {
  validatePassword,
  hashPassword,
  compareConstantTime
} from '../utils/passwords.js'
import {
  signAccessToken,
  getAuthCookieOptions,
  AUTH_COOKIE_NAME,
  hashToken,
  validateTokenFormat
} from '../utils/tokens.js'
import { logger } from '../utils/logger.js'

/**
 * Normalizes email address for consistent comparison.
 */
function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

/**
 * Handles user login with atomic MariaDB account lockout and expired-lock recovery.
 * POST /api/v1/auth/login
 */
export async function login(req, res) {
  const { email, password } = req.body || {}

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Email and password are required.'
      }
    })
  }

  const normalized = normalizeEmail(email)
  const pool = getPool()

  // 1. Initial lookup for password hash outside transaction (CPU-heavy bcrypt)
  const [candidates] = await pool.query(
    'SELECT id, email, password_hash FROM users WHERE email = ?',
    [normalized]
  )

  const candidate = candidates.length > 0 ? candidates[0] : null

  // 2. Perform constant-time password comparison (uses genuine dummy hash if account not found)
  const isMatch = await compareConstantTime(password, candidate?.password_hash)

  // 3. If account does not exist, return generic error (constant time already spent)
  if (!candidate) {
    logger.warn('Login failed: non-existent email', { email: normalized, ip: req.ip })
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.'
      }
    })
  }

  // 4. Concurrency-safe atomic transaction using InnoDB row-level locking
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    // Lock user row and fetch current database time and organization state
    const [rows] = await connection.query(
      `SELECT 
        u.id, 
        u.email, 
        u.role, 
        u.org_id, 
        u.status, 
        u.failed_login_attempts, 
        u.locked_until, 
        u.token_version, 
        NOW() AS db_now,
        o.status AS org_status
      FROM users u
      LEFT JOIN organizations o ON u.org_id = o.id
      WHERE u.id = ?
      FOR UPDATE`,
      [candidate.id]
    )

    if (rows.length === 0) {
      await connection.rollback()
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' }
      })
    }

    const user = rows[0]
    const dbNow = new Date(user.db_now)
    const isLockActive = user.status === 'locked' && user.locked_until && new Date(user.locked_until) > dbNow

    // Check if account is currently locked under active lock window
    if (isLockActive) {
      await connection.rollback()
      logger.warn('Login rejected: account is actively locked', { userId: user.id, email: user.email })
      return res.status(423).json({
        success: false,
        error: {
          code: 'ACCOUNT_LOCKED',
          message: 'Account is temporarily locked due to multiple failed login attempts. Please try again after 15 minutes.'
        }
      })
    }

    // Verify account status
    if (user.status === 'inactive') {
      await connection.rollback()
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_INACTIVE',
          message: 'Account is inactive. Please contact DGDA administration.'
        }
      })
    }

    if (user.status === 'pending_activation') {
      await connection.rollback()
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_PENDING_ACTIVATION',
          message: 'Account is pending activation. Please use your activation link.'
        }
      })
    }

    // Verify organization status
    if (user.org_id && user.org_status !== 'active') {
      await connection.rollback()
      return res.status(403).json({
        success: false,
        error: {
          code: 'ORGANIZATION_NOT_ACTIVE',
          message: `Associated organization is ${user.org_status}. Access denied.`
        }
      })
    }

    // Process failed password under row lock
    if (!isMatch) {
      const isExpiredLock = user.status === 'locked' && (!user.locked_until || new Date(user.locked_until) <= dbNow)
      const newAttempts = isExpiredLock ? 1 : (user.failed_login_attempts + 1)

      if (newAttempts >= 5) {
        // Trigger 15-minute lockout on 5th consecutive failure
        await connection.query(
          `UPDATE users 
           SET failed_login_attempts = ?, 
               status = 'locked', 
               locked_until = DATE_ADD(NOW(), INTERVAL 15 MINUTE),
               updated_at = NOW() 
           WHERE id = ?`,
          [newAttempts, user.id]
        )
        await connection.commit()

        logger.warn('Account locked after 5 failed login attempts', { userId: user.id, email: user.email })
        return res.status(423).json({
          success: false,
          error: {
            code: 'ACCOUNT_LOCKED',
            message: 'Account has been locked due to 5 consecutive failed login attempts. Please try again after 15 minutes.'
          }
        })
      } else {
        // Increment failure counter
        await connection.query(
          `UPDATE users 
           SET failed_login_attempts = ?, 
               status = 'active', 
               locked_until = NULL,
               updated_at = NOW() 
           WHERE id = ?`,
          [newAttempts, user.id]
        )
        await connection.commit()

        logger.warn('Login failed: invalid password', { userId: user.id, attempt: newAttempts })
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password.'
          }
        })
      }
    }

    // Successful authentication: Reset failure counters and expired locks
    await connection.query(
      `UPDATE users 
       SET failed_login_attempts = 0, 
           locked_until = NULL, 
           status = 'active', 
           last_login_at = NOW(),
           updated_at = NOW() 
       WHERE id = ?`,
      [user.id]
    )

    await connection.commit()

    // Issue 15-minute JWT and set HttpOnly cookie
    const token = signAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
      orgId: user.org_id,
      tokenVersion: user.token_version
    })

    res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions())

    logger.info('User successfully authenticated', { userId: user.id, role: user.role })

    return res.status(200).json({
      success: true,
      message: 'Authentication successful.',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        orgId: user.org_id
      }
    })
  } catch (error) {
    await connection.rollback()
    logger.error('Login transaction error', { error: error.message })
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An internal authentication error occurred.' }
    })
  } finally {
    connection.release()
  }
}

/**
 * Handles client logout by clearing the session cookie.
 * POST /api/v1/auth/logout
 */
export async function logout(req, res) {
  res.clearCookie(AUTH_COOKIE_NAME, { path: '/' })
  return res.status(200).json({
    success: true,
    message: 'Logged out successfully.'
  })
}

/**
 * Handles global session revocation across all devices by incrementing token_version.
 * POST /api/v1/auth/logout-all
 */
export async function logoutAll(req, res) {
  const pool = getPool()
  try {
    await pool.query(
      'UPDATE users SET token_version = token_version + 1, updated_at = NOW() WHERE id = ?',
      [req.user.id]
    )

    res.clearCookie(AUTH_COOKIE_NAME, { path: '/' })

    logger.info('Global logout executed', { userId: req.user.id })
    return res.status(200).json({
      success: true,
      message: 'All active sessions invalidated successfully.'
    })
  } catch (error) {
    logger.error('Logout-all error', { error: error.message, userId: req.user?.id })
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to invalidate all sessions.' }
    })
  }
}

/**
 * Returns the currently authenticated user context.
 * GET /api/v1/auth/me
 */
export async function getMe(req, res) {
  return res.status(200).json({
    success: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      orgId: req.user.orgId
    }
  })
}

/**
 * Verifies activation token validity without consuming it (renders setup form).
 * GET /api/v1/auth/activate/verify?token=...
 */
export async function verifyActivationToken(req, res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Referrer-Policy': 'no-referrer'
  })

  // Extract token from Authorization: Bearer <token>
  let token = null
  const authHeader = req.headers.authorization
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim()
  }

  if (!token) {
    return res.status(400).json({
      success: false,
      error: { code: 'TOKEN_REQUIRED', message: 'Activation token is required via Authorization Bearer header.' }
    })
  }

  if (!validateTokenFormat(token)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_TOKEN_FORMAT', message: 'Invalid activation token format.' }
    })
  }

  let tokenHash
  try {
    tokenHash = hashToken(token)
  } catch {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_TOKEN_FORMAT', message: 'Invalid activation token format.' }
    })
  }

  const pool = getPool()
  const [rows] = await pool.query(
    `SELECT 
      t.id, 
      t.used, 
      t.expires_at, 
      u.email, 
      u.name, 
      u.role, 
      u.status AS user_status, 
      o.name AS org_name,
      NOW() AS db_now
    FROM activation_tokens t
    JOIN users u ON t.user_id = u.id
    LEFT JOIN organizations o ON u.org_id = o.id
    WHERE t.token_hash = ?`,
    [tokenHash]
  )

  if (rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: { code: 'TOKEN_NOT_FOUND', message: 'Invalid activation token.' }
    })
  }

  const record = rows[0]

  if (record.used) {
    return res.status(410).json({
      success: false,
      error: { code: 'TOKEN_ALREADY_USED', message: 'Activation token has already been used.' }
    })
  }

  if (new Date(record.expires_at) <= new Date(record.db_now)) {
    return res.status(410).json({
      success: false,
      error: { code: 'TOKEN_EXPIRED', message: 'Activation token has expired. Please contact DGDA.' }
    })
  }

  if (record.user_status !== 'pending_activation') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_ACCOUNT_STATUS', message: 'Account is not in pending activation status.' }
    })
  }

  return res.status(200).json({
    success: true,
    data: {
      valid: true,
      email: record.email,
      name: record.name,
      role: record.role,
      orgName: record.org_name
    }
  })
}

/**
 * Consumes single-use activation token, sets initial password, and activates account.
 * POST /api/v1/auth/activate
 */
export async function activateAccount(req, res) {
  const { token, password, confirmPassword } = req.body || {}

  if (!token || typeof token !== 'string') {
    return res.status(400).json({
      success: false,
      error: { code: 'TOKEN_REQUIRED', message: 'Activation token is required.' }
    })
  }

  if (!password || !confirmPassword) {
    return res.status(400).json({
      success: false,
      error: { code: 'PASSWORD_REQUIRED', message: 'Password and password confirmation are required.' }
    })
  }

  if (password !== confirmPassword) {
    return res.status(400).json({
      success: false,
      error: { code: 'PASSWORD_MISMATCH', message: 'Password and confirmation do not match.' }
    })
  }

  const validation = validatePassword(password)
  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      error: { code: 'WEAK_PASSWORD', message: validation.error }
    })
  }

  let tokenHash
  try {
    tokenHash = hashToken(token)
  } catch {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid activation token format.' }
    })
  }

  const pool = getPool()
  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()

    // 1. Lock token record for atomic single-use consumption
    const [rows] = await connection.query(
      `SELECT 
        t.id AS token_id, 
        t.user_id, 
        t.used, 
        t.expires_at, 
        u.status AS user_status,
        NOW() AS db_now
      FROM activation_tokens t
      JOIN users u ON t.user_id = u.id
      WHERE t.token_hash = ?
      FOR UPDATE`,
      [tokenHash]
    )

    if (rows.length === 0) {
      await connection.rollback()
      return res.status(404).json({
        success: false,
        error: { code: 'TOKEN_NOT_FOUND', message: 'Invalid activation token.' }
      })
    }

    const tokenRow = rows[0]

    if (tokenRow.used) {
      await connection.rollback()
      return res.status(410).json({
        success: false,
        error: { code: 'TOKEN_ALREADY_USED', message: 'Activation token has already been used.' }
      })
    }

    if (new Date(tokenRow.expires_at) <= new Date(tokenRow.db_now)) {
      await connection.rollback()
      return res.status(410).json({
        success: false,
        error: { code: 'TOKEN_EXPIRED', message: 'Activation token has expired. Please contact DGDA.' }
      })
    }

    if (tokenRow.user_status !== 'pending_activation') {
      await connection.rollback()
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ACCOUNT_STATUS', message: 'Account is not in pending activation status.' }
      })
    }

    // 2. Hash password with bcrypt cost 12
    const passwordHash = await hashPassword(password)

    // 3. Mark token consumed atomically
    await connection.query(
      'UPDATE activation_tokens SET used = TRUE, used_at = NOW() WHERE id = ?',
      [tokenRow.token_id]
    )

    // 4. Activate user and initialize security fields
    await connection.query(
      `UPDATE users 
       SET password_hash = ?, 
           status = 'active', 
           token_version = 1, 
           failed_login_attempts = 0, 
           locked_until = NULL, 
           updated_at = NOW() 
       WHERE id = ?`,
      [passwordHash, tokenRow.user_id]
    )

    await connection.commit()

    logger.info('User account successfully activated', { userId: tokenRow.user_id })
    return res.status(200).json({
      success: true,
      message: 'Account activated successfully. You can now log in.'
    })
  } catch (error) {
    await connection.rollback()
    logger.error('Account activation error', { error: error.message })
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred during account activation.' }
    })
  } finally {
    connection.release()
  }
}
