// PharmaTrace AI — Authentication & Role-Based Access Control (RBAC) Middleware
// Conforms to Revision 3.2 §4.1 & §4.2 specifications
import { verifyAccessToken, AUTH_COOKIE_NAME } from '../utils/tokens.js'
import { execute } from '../config/database.js'
import { logger } from '../utils/logger.js'
import { sanitizeLogUrl } from './requestLogger.js'

export const CANONICAL_ROLES = Object.freeze([
  'admin',
  'investigator',
  'manufacturer',
  'distributor',
  'wholesaler',
  'pharmacy'
])

/**
 * Verifies JWT from signed HttpOnly cookie, revalidates user and org status in MariaDB,
 * and ensures token_version matches to provide instantaneous global revocation.
 */
export async function authenticateToken(req, res, next) {
  const token = req.cookies?.[AUTH_COOKIE_NAME]

  if (!token) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_TOKEN_MISSING',
        message: 'Authentication token missing. Please log in.'
      }
    })
  }

  let payload
  try {
    payload = verifyAccessToken(token)
  } catch (err) {
    logger.warn('JWT verification failed', { error: err.message, ip: req.ip })
    return res.status(401).json({
      success: false,
      error: {
        code: err.name === 'TokenExpiredError' ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_TOKEN_INVALID',
        message: 'Invalid or expired session. Please log in again.'
      }
    })
  }

  try {
    // Real-time verification of user status, token_version, and organization status
    const [rows] = await execute(
      `SELECT 
        u.id, 
        u.email, 
        u.role, 
        u.org_id, 
        u.status, 
        u.token_version, 
        o.name AS org_name,
        o.status AS org_status
      FROM users u
      LEFT JOIN organizations o ON u.org_id = o.id
      WHERE u.id = ?`,
      [payload.sub]
    )

    if (!rows || rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Account associated with token no longer exists.'
        }
      })
    }

    const user = rows[0]

    // Verify token_version for global session invalidation (logout-all / password changes)
    if (user.token_version !== payload.tokenVersion) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'SESSION_REVOKED',
          message: 'Session has been invalidated. Please log in again.'
        }
      })
    }

    // Verify user account status
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_NOT_ACTIVE',
          message: `User account is ${user.status}. Access denied.`
        }
      })
    }

    // Verify organization status for supply-chain entities
    if (user.org_id && user.org_status !== 'active') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ORGANIZATION_NOT_ACTIVE',
          message: `Associated organization is ${user.org_status}. Access denied.`
        }
      })
    }

    // Attach authenticated identity to request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      orgId: user.org_id || null,
      orgName: user.org_name || null,
      tokenVersion: user.token_version
    }

    next()
  } catch (error) {
    logger.error('Authentication database validation error', { error: error.message })
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_AUTH_ERROR',
        message: 'Internal authentication validation failure.'
      }
    })
  }
}

/**
 * Role-Based Access Control middleware.
 * Ensures the authenticated user possesses one of the authorized canonical roles.
 *
 * @param  {...string} allowedRoles
 * @returns {import('express').RequestHandler}
 */
export function requireRoles(...allowedRoles) {
  // Validate that all specified roles belong to the 6 canonical roles
  for (const role of allowedRoles) {
    if (!CANONICAL_ROLES.includes(role)) {
      throw new Error(`Invalid role configured in requireRoles: ${role}`)
    }
  }

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required.'
        }
      })
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('RBAC forbidden access attempt', {
        user: req.user.email,
        role: req.user.role,
        requiredRoles: allowedRoles,
        path: sanitizeLogUrl(req.originalUrl || req.url)
      })
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN_ROLE',
          message: `Role ${req.user.role} is not authorized to access this resource.`
        }
      })
    }

    next()
  }
}

/**
 * Tenant Isolation Enforcer.
 * Strictly guarantees that supply-chain roles can only query or mutate data
 * belonging to their server-derived req.user.orgId.
 * Admin and Investigator roles are exempt for system-wide regulatory oversight.
 *
 * @param {object} user - req.user
 * @param {string} targetOrgId - The organization ID of the record being accessed
 * @returns {boolean}
 */
export function enforceTenantScope(user, targetOrgId) {
  if (!user) {
    return false
  }

  // Admin and Investigator roles possess system-wide regulatory authority
  if (user.role === 'admin' || user.role === 'investigator') {
    return true
  }

  // Supply-chain participants must strictly match target organization ID
  if (!user.orgId || !targetOrgId) {
    return false
  }

  return user.orgId === targetOrgId
}
