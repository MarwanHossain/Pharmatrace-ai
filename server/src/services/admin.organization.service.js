// PharmaTrace AI — Administrative Organization Management Service
// Implements Phase 4 M6 Organizations Management specifications
import path from 'path'
import fs from 'fs'
import { execute } from '../config/database.js'
import { UPLOAD_DIR } from '../middleware/upload.js'
import { logger } from '../utils/logger.js'

const ALLOWED_TYPES = Object.freeze(['manufacturer', 'distributor', 'wholesaler', 'pharmacy'])
const ALLOWED_STATUSES = Object.freeze(['active', 'suspended', 'decommissioned'])
const ALLOWED_SORT_COLUMNS = Object.freeze({
  name: 'o.name',
  type: 'o.type',
  status: 'o.status',
  license_number: 'o.license_number',
  created_at: 'o.created_at',
  updated_at: 'o.updated_at'
})

/**
 * Escapes characters for SQL LIKE clause to prevent wildcard injection.
 */
function escapeLike(str) {
  return str.replace(/([%_\\])/g, '\\$1')
}

/**
 * Lists organizations with pagination, search, filtering, and user counts.
 *
 * @param {object} params
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {string} [params.type]
 * @param {string} [params.status]
 * @param {string} [params.search]
 * @param {string} [params.sortBy='created_at']
 * @param {string} [params.sortOrder='DESC']
 * @returns {Promise<object>}
 */
export async function listOrganizations({
  page = 1,
  limit = 10,
  type,
  status,
  search,
  sortBy = 'created_at',
  sortOrder = 'DESC'
} = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1)
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10))
  const offset = (pageNum - 1) * limitNum

  const conditions = []
  const values = []

  // 1. Type / Category Filter
  if (type && typeof type === 'string' && type.trim()) {
    const normalizedType = type.trim().toLowerCase()
    if (ALLOWED_TYPES.includes(normalizedType)) {
      conditions.push('o.type = ?')
      values.push(normalizedType)
    }
  }

  // 2. Status Filter
  if (status && typeof status === 'string' && status.trim()) {
    const normalizedStatus = status.trim().toLowerCase()
    if (ALLOWED_STATUSES.includes(normalizedStatus)) {
      conditions.push('o.status = ?')
      values.push(normalizedStatus)
    }
  }

  // 3. Search Filter
  if (search && typeof search === 'string' && search.trim()) {
    const escaped = escapeLike(search.trim().toLowerCase())
    conditions.push('(LOWER(o.name) LIKE ? OR LOWER(o.license_number) LIKE ? OR LOWER(o.contact_email) LIKE ? OR LOWER(o.id) LIKE ?)')
    const pattern = `%${escaped}%`
    values.push(pattern, pattern, pattern, pattern)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  // 4. Sort resolution
  const sortCol = ALLOWED_SORT_COLUMNS[sortBy] || ALLOWED_SORT_COLUMNS.created_at
  const sortDir = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

  // Total count query
  const countSql = `SELECT COUNT(*) AS total FROM organizations o ${whereClause}`
  const [countRows] = await execute(countSql, values)
  const total = Number(countRows[0]?.total || 0)
  const totalPages = Math.ceil(total / limitNum) || 1

  // Item fetch query
  const itemsSql = `
    SELECT 
      o.id,
      o.name,
      o.type,
      o.pharmacy_classification AS pharmacyClassification,
      o.dghs_facility_code AS dghsFacilityCode,
      o.license_number AS licenseNumber,
      o.tax_id AS taxId,
      o.address,
      o.contact_name AS contactName,
      o.contact_email AS contactEmail,
      o.contact_phone AS contactPhone,
      o.status,
      o.data_environment AS dataEnvironment,
      o.created_at AS createdAt,
      o.updated_at AS updatedAt,
      (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id) AS userCount,
      (SELECT r.reference_number FROM organization_registrations r WHERE r.approved_org_id = o.id LIMIT 1) AS registrationReference,
      (SELECT r.id FROM organization_registrations r WHERE r.approved_org_id = o.id LIMIT 1) AS registrationId
    FROM organizations o
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
 * Retrieves full details for a single organization, including linked users
 * and approved regulatory registration documents.
 *
 * @param {string} id - Organization ID
 * @returns {Promise<object|null>}
 */
export async function getOrganizationDetail(id) {
  if (!id || typeof id !== 'string') return null

  const orgSql = `
    SELECT 
      o.id,
      o.name,
      o.type,
      o.pharmacy_classification AS pharmacyClassification,
      o.dghs_facility_code AS dghsFacilityCode,
      o.license_number AS licenseNumber,
      o.tax_id AS taxId,
      o.address,
      o.contact_name AS contactName,
      o.contact_email AS contactEmail,
      o.contact_phone AS contactPhone,
      o.status,
      o.data_environment AS dataEnvironment,
      o.created_at AS createdAt,
      o.updated_at AS updatedAt,
      r.id AS registrationId,
      r.reference_number AS registrationReference,
      r.reviewed_by AS reviewedBy,
      r.reviewed_at AS reviewedAt
    FROM organizations o
    LEFT JOIN organization_registrations r ON r.approved_org_id = o.id
    WHERE o.id = ?
  `
  const [orgRows] = await execute(orgSql, [id])
  if (orgRows.length === 0) {
    return null
  }

  const organization = orgRows[0]

  // 1. Linked users
  const usersSql = `
    SELECT 
      u.id,
      u.name,
      u.email,
      u.role,
      u.status,
      u.last_login_at AS lastLoginAt,
      u.created_at AS createdAt
    FROM users u
    WHERE u.org_id = ?
    ORDER BY u.created_at ASC
  `
  const [users] = await execute(usersSql, [id])

  // 2. Approved regulatory documents
  let documents = []
  if (organization.registrationId) {
    const docsSql = `
      SELECT 
        d.id,
        d.document_type AS documentType,
        d.original_name AS originalFilename,
        d.file_size_bytes AS fileSizeBytes,
        d.mime_type AS mimeType,
        d.submission_version AS submissionVersion,
        d.uploaded_at AS uploadedAt
      FROM registration_documents d
      WHERE d.registration_id = ?
      ORDER BY d.uploaded_at DESC
    `
    const [docRows] = await execute(docsSql, [organization.registrationId])
    documents = docRows
  }

  return {
    ...organization,
    users,
    documents
  }
}

/**
 * Updates organization status with audit safeguards.
 *
 * @param {string} id - Organization ID
 * @param {string} newStatus - 'active' | 'suspended' | 'decommissioned'
 * @param {string} reason - Audit explanation
 * @param {string} adminUserId - Authenticated administrator ID
 * @returns {Promise<object>}
 */
export async function updateOrganizationStatus(id, newStatus, reason, adminUserId) {
  if (!id || typeof id !== 'string') {
    const err = new Error('Organization ID is required.')
    err.code = 'INVALID_INPUT'
    err.statusCode = 400
    throw err
  }

  const normalizedStatus = String(newStatus || '').trim().toLowerCase()
  if (!ALLOWED_STATUSES.includes(normalizedStatus)) {
    const err = new Error(`Invalid organization status. Permitted: ${ALLOWED_STATUSES.join(', ')}`)
    err.code = 'INVALID_STATUS'
    err.statusCode = 400
    throw err
  }

  const cleanReason = String(reason || '').trim()
  if (!cleanReason || cleanReason.length < 5) {
    const err = new Error('A justified reason (at least 5 characters) is required for organization status modifications.')
    err.code = 'REASON_REQUIRED'
    err.statusCode = 400
    throw err
  }

  // Check if organization exists
  const [existing] = await execute('SELECT id, name, status FROM organizations WHERE id = ?', [id])
  if (existing.length === 0) {
    const err = new Error('Organization not found.')
    err.code = 'ORGANIZATION_NOT_FOUND'
    err.statusCode = 404
    throw err
  }

  const prevStatus = existing[0].status
  if (prevStatus === normalizedStatus) {
    return { id, status: normalizedStatus, message: 'Status is already set to the specified value.' }
  }

  // Update organization status
  await execute(
    'UPDATE organizations SET status = ?, updated_at = NOW() WHERE id = ?',
    [normalizedStatus, id]
  )

  // Security safeguard: If suspending or decommissioning, immediately revoke all active JWT sessions for its users
  if (normalizedStatus === 'suspended' || normalizedStatus === 'decommissioned') {
    await execute(
      'UPDATE users SET token_version = token_version + 1, updated_at = NOW() WHERE org_id = ?',
      [id]
    )
  }

  logger.info('Organization status updated by administrator', {
    orgId: id,
    orgName: existing[0].name,
    prevStatus,
    newStatus: normalizedStatus,
    reason: cleanReason,
    adminUserId
  })

  return {
    id,
    name: existing[0].name,
    prevStatus,
    status: normalizedStatus,
    updatedAt: new Date().toISOString()
  }
}

/**
 * Securely retrieves an approved document associated with an organization.
 *
 * @param {string} orgId - Organization ID
 * @param {string} docId - Document ID
 * @returns {Promise<{ resolvedPath: string, mimeType: string, originalFilename: string }>}
 */
export async function getOrganizationDocument(orgId, docId) {
  if (!orgId || !docId) {
    const err = new Error('Organization ID and Document ID are required.')
    err.code = 'INVALID_INPUT'
    err.statusCode = 400
    throw err
  }

  const [rows] = await execute(
    `SELECT d.id, d.original_name, d.stored_path, d.mime_type
     FROM registration_documents d
     JOIN organization_registrations r ON d.registration_id = r.id
     WHERE d.id = ? AND r.approved_org_id = ?`,
    [docId, orgId]
  )

  if (rows.length === 0) {
    const err = new Error('Document not found for this organization.')
    err.code = 'DOCUMENT_NOT_FOUND'
    err.statusCode = 404
    throw err
  }

  const doc = rows[0]
  const uploadBase = path.resolve(UPLOAD_DIR)
  const resolvedPath = path.resolve(doc.stored_path)

  // 1. Path traversal confinement check
  if (!resolvedPath.startsWith(uploadBase + path.sep) && resolvedPath !== uploadBase) {
    logger.warn('Document path traversal attempt detected in org document access', {
      orgId,
      docId,
      path: resolvedPath
    })
    const err = new Error('Document access denied.')
    err.code = 'ACCESS_DENIED'
    err.statusCode = 403
    throw err
  }

  // 2. Symlink protection
  try {
    const stat = await fs.promises.lstat(resolvedPath)
    if (stat.isSymbolicLink()) {
      const realTarget = await fs.promises.realpath(resolvedPath)
      if (!realTarget.startsWith(uploadBase + path.sep)) {
        logger.warn('Document symlink escape attempt detected in org document access', {
          orgId,
          docId,
          realTarget
        })
        const err = new Error('Document access denied.')
        err.code = 'ACCESS_DENIED'
        err.statusCode = 403
        throw err
      }
    }
  } catch (fsErr) {
    if (fsErr.code === 'ENOENT') {
      const err = new Error('Document file is missing on storage.')
      err.code = 'FILE_NOT_FOUND'
      err.statusCode = 404
      throw err
    }
    throw fsErr
  }

  // 3. Verify readability
  try {
    await fs.promises.access(resolvedPath, fs.constants.R_OK)
  } catch {
    const err = new Error('Document file cannot be read.')
    err.code = 'FILE_UNREADABLE'
    err.statusCode = 500
    throw err
  }

  return {
    resolvedPath,
    mimeType: doc.mime_type,
    originalFilename: doc.original_name
  }
}
