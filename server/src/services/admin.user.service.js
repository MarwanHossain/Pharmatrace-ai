// PharmaTrace AI — Administrative User Management Service
// Implements Phase 4 M6 Users Management specifications
import { execute, getPool } from '../config/database.js'
import { logger } from '../utils/logger.js'

const ALLOWED_ROLES = Object.freeze(['admin', 'investigator', 'manufacturer', 'distributor', 'wholesaler', 'pharmacy'])
const ALLOWED_STATUSES = Object.freeze(['pending_activation', 'active', 'inactive', 'locked'])
const MUTABLE_STATUSES = Object.freeze(['active', 'inactive', 'locked'])
const ALLOWED_SORT_COLUMNS = Object.freeze({
  name: 'u.name',
  email: 'u.email',
  role: 'u.role',
  status: 'u.status',
  created_at: 'u.created_at',
  last_login_at: 'u.last_login_at'
})

function escapeLike(str) {
  return str.replace(/([%_\\])/g, '\\$1')
}

/**
 * Lists users with server-side pagination, search, role/status filtering, and organization details.
 * Strictly omits password hashes and cryptographic secrets.
 *
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function listUsers({
  page = 1,
  limit = 10,
  role,
  status,
  orgId,
  search,
  sortBy = 'created_at',
  sortOrder = 'DESC'
} = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1)
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10))
  const offset = (pageNum - 1) * limitNum

  const conditions = []
  const values = []

  // 1. Role Filter
  if (role && typeof role === 'string' && role.trim()) {
    const normalizedRole = role.trim().toLowerCase()
    if (ALLOWED_ROLES.includes(normalizedRole)) {
      conditions.push('u.role = ?')
      values.push(normalizedRole)
    }
  }

  // 2. Status Filter
  if (status && typeof status === 'string' && status.trim()) {
    const normalizedStatus = status.trim().toLowerCase()
    if (ALLOWED_STATUSES.includes(normalizedStatus)) {
      conditions.push('u.status = ?')
      values.push(normalizedStatus)
    }
  }

  // 3. Organization ID Filter
  if (orgId && typeof orgId === 'string' && orgId.trim()) {
    conditions.push('u.org_id = ?')
    values.push(orgId.trim())
  }

  // 4. Search Filter
  if (search && typeof search === 'string' && search.trim()) {
    const escaped = escapeLike(search.trim().toLowerCase())
    conditions.push('(LOWER(u.name) LIKE ? OR LOWER(u.email) LIKE ? OR LOWER(o.name) LIKE ?)')
    const pattern = `%${escaped}%`
    values.push(pattern, pattern, pattern)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const sortCol = ALLOWED_SORT_COLUMNS[sortBy] || ALLOWED_SORT_COLUMNS.created_at
  const sortDir = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

  // Total count query
  const countSql = `
    SELECT COUNT(*) AS total 
    FROM users u 
    LEFT JOIN organizations o ON u.org_id = o.id 
    ${whereClause}
  `
  const [countRows] = await execute(countSql, values)
  const total = Number(countRows[0]?.total || 0)
  const totalPages = Math.ceil(total / limitNum) || 1

  // Item fetch query (Strictly omits password_hash)
  const itemsSql = `
    SELECT 
      u.id,
      u.org_id AS orgId,
      u.name,
      u.email,
      u.role,
      u.status,
      u.token_version AS tokenVersion,
      u.last_login_at AS lastLoginAt,
      u.failed_login_attempts AS failedLoginAttempts,
      u.locked_until AS lockedUntil,
      u.created_at AS createdAt,
      u.updated_at AS updatedAt,
      o.name AS orgName,
      o.type AS orgType,
      o.status AS orgStatus
    FROM users u
    LEFT JOIN organizations o ON u.org_id = o.id
    ${whereClause}
    ORDER BY ${sortCol} ${sortDir}
    LIMIT ? OFFSET ?
  `
  const queryValues = [...values, limitNum, offset]
  const [items] = await execute(itemsSql, queryValues)

  return {
    items,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages
    }
  }
}

/**
 * Retrieves details for a specific user, omitting password hashes.
 * Includes chronological administrative audit log records.
 *
 * @param {string} id - User ID
 * @returns {Promise<object|null>}
 */
export async function getUserDetail(id) {
  if (!id || typeof id !== 'string') return null

  const sql = `
    SELECT 
      u.id,
      u.org_id AS orgId,
      u.name,
      u.email,
      u.role,
      u.status,
      u.token_version AS tokenVersion,
      u.last_login_at AS lastLoginAt,
      u.failed_login_attempts AS failedLoginAttempts,
      u.locked_until AS lockedUntil,
      u.created_at AS createdAt,
      u.updated_at AS updatedAt,
      o.name AS orgName,
      o.type AS orgType,
      o.status AS orgStatus,
      o.license_number AS orgLicenseNumber
    FROM users u
    LEFT JOIN organizations o ON u.org_id = o.id
    WHERE u.id = ?
  `
  const [rows] = await execute(sql, [id])
  if (!rows || rows.length === 0) return null

  const user = rows[0]

  // Retrieve chronological audit trail for this user from MariaDB
  try {
    const auditSql = `
      SELECT 
        a.id,
        a.admin_user_id AS adminUserId,
        a.action_type AS actionType,
        a.reason,
        a.previous_status AS previousStatus,
        a.new_status AS newStatus,
        a.metadata,
        a.created_at AS createdAt,
        u.name AS adminName,
        u.email AS adminEmail
      FROM admin_audit_log a
      LEFT JOIN users u ON a.admin_user_id = u.id
      WHERE a.target_user_id = ?
      ORDER BY a.created_at DESC
      LIMIT 20
    `
    const [auditRows] = await execute(auditSql, [id])
    user.auditLogs = auditRows || []
  } catch (err) {
    logger.warn('Failed to load user audit log trail', { userId: id, error: err.message })
    user.auditLogs = []
  }

  return user
}

/**
 * Updates a user's account status (active, inactive, locked) with administrative safeguards,
 * organization-state invariant checks, and immutable audit logging.
 *
 * @param {string} id - Target User ID
 * @param {string} newStatus - 'active' | 'inactive' | 'locked'
 * @param {string} reason - Justification for change (min 5 chars)
 * @param {string} adminUserId - Authenticated administrator ID
 * @returns {Promise<object>}
 */
export async function updateUserStatus(id, newStatus, reason, adminUserId) {
  if (!id || typeof id !== 'string') {
    const err = new Error('User ID is required.')
    err.code = 'INVALID_INPUT'
    err.statusCode = 400
    throw err
  }

  const normalizedStatus = String(newStatus || '').trim().toLowerCase()
  if (!MUTABLE_STATUSES.includes(normalizedStatus)) {
    const err = new Error(`Invalid target status. Permitted: ${MUTABLE_STATUSES.join(', ')}`)
    err.code = 'INVALID_STATUS'
    err.statusCode = 400
    throw err
  }

  const cleanReason = String(reason || '').trim()
  if (!cleanReason || cleanReason.length < 5) {
    const err = new Error('A justified reason (at least 5 characters) is required for user account modifications.')
    err.code = 'REASON_REQUIRED'
    err.statusCode = 400
    throw err
  }

  // Self-lockout prevention: Admin cannot deactivate or lock their own account
  if (id === adminUserId && (normalizedStatus === 'inactive' || normalizedStatus === 'locked')) {
    const err = new Error('Administrators cannot deactivate or lock their own active account.')
    err.code = 'SELF_DEACTIVATION_PROHIBITED'
    err.statusCode = 403
    throw err
  }

  const pool = getPool()
  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()

    // 1. Fetch target user with FOR UPDATE
    const [existing] = await connection.execute(
      'SELECT id, email, status, role, org_id FROM users WHERE id = ? FOR UPDATE',
      [id]
    )
    if (existing.length === 0) {
      const err = new Error('User not found.')
      err.code = 'USER_NOT_FOUND'
      err.statusCode = 404
      throw err
    }

    const user = existing[0]
    const prevStatus = user.status

    // 2. Organization status invariant:
    // If activating a user, their affiliated organization must be active
    if (normalizedStatus === 'active' && user.org_id) {
      const [orgRows] = await connection.execute(
        'SELECT id, name, status FROM organizations WHERE id = ? FOR UPDATE',
        [user.org_id]
      )
      const org = orgRows[0]
      if (!org || org.status !== 'active') {
        const currentOrgStatus = org ? org.status : 'not_found'
        const err = new Error(
          `Cannot activate user associated with organization '${org?.name || user.org_id}' because the organization status is '${currentOrgStatus}'. Parent organization must be active.`
        )
        err.code = 'ORGANIZATION_NOT_ACTIVE'
        err.statusCode = 409
        throw err
      }
    }

    // 3. Execute update with appropriate security adjustments
    if (normalizedStatus === 'active') {
      await connection.execute(
        `UPDATE users 
         SET status = 'active', 
             failed_login_attempts = 0, 
             locked_until = NULL, 
             updated_at = NOW() 
         WHERE id = ?`,
        [id]
      )
    } else if (normalizedStatus === 'inactive') {
      await connection.execute(
        `UPDATE users 
         SET status = 'inactive', 
             token_version = token_version + 1, 
             updated_at = NOW() 
         WHERE id = ?`,
        [id]
      )
    } else if (normalizedStatus === 'locked') {
      await connection.execute(
        `UPDATE users 
         SET status = 'locked', 
             locked_until = DATE_ADD(NOW(), INTERVAL 15 MINUTE), 
             token_version = token_version + 1, 
             updated_at = NOW() 
         WHERE id = ?`,
        [id]
      )
    }

    // 4. Record immutable audit log
    const actorId = adminUserId || id
    const metadata = JSON.stringify({
      previousStatus: prevStatus,
      newStatus: normalizedStatus,
      targetRole: user.role,
      orgId: user.org_id
    })

    await connection.execute(
      `INSERT INTO admin_audit_log (
        admin_user_id,
        target_user_id,
        action_type,
        reason,
        previous_status,
        new_status,
        metadata,
        created_at
      ) VALUES (?, ?, 'USER_STATUS_CHANGED', ?, ?, ?, ?, NOW())`,
      [actorId, id, cleanReason, prevStatus, normalizedStatus, metadata]
    )

    await connection.commit()

    logger.info('User status updated by administrator', {
      targetUserId: id,
      targetEmail: user.email,
      prevStatus,
      newStatus: normalizedStatus,
      reason: cleanReason,
      adminUserId: actorId
    })

    return {
      id,
      email: user.email,
      prevStatus,
      status: normalizedStatus,
      updatedAt: new Date().toISOString()
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

/**
 * Specifically unlocks a locked user account, validates locked status,
 * enforces organization status invariants, resets failure counters,
 * and records the action in the immutable audit log.
 *
 * @param {string} id - Target User ID
 * @param {string} reason - Administrative justification (min 5 chars)
 * @param {string} adminUserId - Authenticated administrator ID
 * @returns {Promise<object>}
 */
export async function unlockUser(id, reason, adminUserId) {
  if (!id || typeof id !== 'string') {
    const err = new Error('User ID is required.')
    err.code = 'INVALID_INPUT'
    err.statusCode = 400
    throw err
  }

  const cleanReason = String(reason || '').trim()
  if (!cleanReason || cleanReason.length < 5) {
    const err = new Error('A justified reason (at least 5 characters) is required for user account unlock.')
    err.code = 'REASON_REQUIRED'
    err.statusCode = 400
    throw err
  }

  const pool = getPool()
  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()

    // 1. Fetch target user with FOR UPDATE
    const [existing] = await connection.execute(
      'SELECT id, email, status, role, org_id, failed_login_attempts FROM users WHERE id = ? FOR UPDATE',
      [id]
    )
    if (existing.length === 0) {
      const err = new Error('User not found.')
      err.code = 'USER_NOT_FOUND'
      err.statusCode = 404
      throw err
    }

    const user = existing[0]

    // 2. Safeguard: Only locked accounts can be unlocked
    if (user.status !== 'locked') {
      const err = new Error(
        `Only locked accounts can be unlocked. Target user currently has status '${user.status}'.`
      )
      err.code = 'INVALID_STATUS'
      err.statusCode = 400
      throw err
    }

    // 3. Organization status invariant:
    // If user belongs to an organization, it must be active
    if (user.org_id) {
      const [orgRows] = await connection.execute(
        'SELECT id, name, status FROM organizations WHERE id = ? FOR UPDATE',
        [user.org_id]
      )
      const org = orgRows[0]
      if (!org || org.status !== 'active') {
        const currentOrgStatus = org ? org.status : 'not_found'
        const err = new Error(
          `Cannot unlock user associated with organization '${org?.name || user.org_id}' because the organization status is '${currentOrgStatus}'. Parent organization must be active.`
        )
        err.code = 'ORGANIZATION_NOT_ACTIVE'
        err.statusCode = 409
        throw err
      }
    }

    // 4. Reset lockout counters and set active
    await connection.execute(
      `UPDATE users 
       SET status = 'active', 
           failed_login_attempts = 0, 
           locked_until = NULL, 
           updated_at = NOW() 
       WHERE id = ?`,
      [id]
    )

    // 5. Durably record in immutable audit log
    const actorId = adminUserId || id
    const metadata = JSON.stringify({
      previousStatus: 'locked',
      newStatus: 'active',
      targetRole: user.role,
      orgId: user.org_id,
      previousFailedLoginAttempts: user.failed_login_attempts
    })

    await connection.execute(
      `INSERT INTO admin_audit_log (
        admin_user_id,
        target_user_id,
        action_type,
        reason,
        previous_status,
        new_status,
        metadata,
        created_at
      ) VALUES (?, ?, 'USER_UNLOCKED', ?, 'locked', 'active', ?, NOW())`,
      [actorId, id, cleanReason, metadata]
    )

    await connection.commit()

    logger.info('User account unlocked by administrator', {
      targetUserId: id,
      targetEmail: user.email,
      reason: cleanReason,
      adminUserId: actorId
    })

    return {
      id,
      email: user.email,
      status: 'active',
      failedLoginAttempts: 0,
      lockedUntil: null,
      message: 'User account successfully unlocked.'
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
