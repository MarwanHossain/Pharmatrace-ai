// PharmaTrace AI — Administrator Registration & Provisioning Service
// Conforms to Revision 3.2 §2, §3, §4 & Phase 3 Milestone 3 specifications
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import { getPool, execute } from '../config/database.js'
import { logger } from '../utils/logger.js'
import { generateActivationToken, hashToken } from '../utils/tokens.js'
import { UPLOAD_DIR } from '../middleware/upload.js'
import {
  sendActivationNotification,
  sendInformationRequestNotification
} from './notification.service.js'

export const ALLOWED_SORT_COLUMNS = Object.freeze([
  'created_at',
  'updated_at',
  'org_name',
  'reference_number',
  'category',
  'status'
])

export const VALID_CATEGORIES = Object.freeze([
  'manufacturer',
  'distributor',
  'wholesaler',
  'pharmacy'
])

export const VALID_STATUSES = Object.freeze([
  'SUBMITTED',
  'UNDER_REVIEW',
  'INFORMATION_REQUESTED',
  'APPROVED',
  'REJECTED'
])

/**
 * Lists registrations with pagination, filtering, searching, and sorting.
 *
 * @param {object} params
 * @param {number} [params.page=1]
 * @param {number} [params.limit=20]
 * @param {string} [params.status]
 * @param {string} [params.category]
 * @param {string} [params.search]
 * @param {string} [params.sortBy='created_at']
 * @param {string} [params.sortOrder='DESC']
 * @returns {Promise<{ items: Array<object>, pagination: object }>}
 */
export async function listRegistrations({
  page = 1,
  limit = 20,
  status,
  category,
  search,
  sortBy = 'created_at',
  sortOrder = 'DESC'
} = {}) {
  const sanitizedPage = Math.max(1, parseInt(page, 10) || 1)
  const sanitizedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20))
  const offset = (sanitizedPage - 1) * sanitizedLimit

  const safeSortBy = ALLOWED_SORT_COLUMNS.includes(sortBy) ? sortBy : 'created_at'
  const safeSortOrder = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

  const whereClauses = []
  const queryParams = []

  if (status) {
    const normalizedStatus = String(status).trim().toUpperCase()
    if (VALID_STATUSES.includes(normalizedStatus)) {
      whereClauses.push('r.status = ?')
      queryParams.push(normalizedStatus)
    }
  }

  if (category) {
    const normalizedCategory = String(category).trim().toLowerCase()
    if (VALID_CATEGORIES.includes(normalizedCategory)) {
      whereClauses.push('r.category = ?')
      queryParams.push(normalizedCategory)
    }
  }

  if (search && typeof search === 'string') {
    const term = `%${search.trim()}%`
    whereClauses.push(
      '(r.reference_number LIKE ? OR r.org_name LIKE ? OR r.license_number LIKE ? OR r.contact_email LIKE ?)'
    )
    queryParams.push(term, term, term, term)
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

  // 1. Total count query
  const countSql = `SELECT COUNT(*) AS total FROM organization_registrations r ${whereSql}`
  const [countRows] = await execute(countSql, queryParams)
  const totalItems = Number(countRows[0]?.total || 0)
  const totalPages = Math.ceil(totalItems / sanitizedLimit) || (totalItems === 0 ? 1 : 1)

  // 2. Paginated data query (Omit tracking_pin_hash and internal credentials)
  const dataSql = `
    SELECT 
      r.id,
      r.reference_number AS referenceNumber,
      r.category,
      r.org_name AS orgName,
      r.license_number AS licenseNumber,
      r.contact_name AS contactName,
      r.contact_email AS contactEmail,
      r.contact_phone AS contactPhone,
      r.pharmacy_classification AS pharmacyClassification,
      r.dghs_facility_code AS dghsFacilityCode,
      r.status,
      r.reviewed_by AS reviewedBy,
      r.reviewed_at AS reviewedAt,
      r.approved_org_id AS approvedOrgId,
      r.created_at AS createdAt,
      r.updated_at AS updatedAt
    FROM organization_registrations r
    ${whereSql}
    ORDER BY r.${safeSortBy} ${safeSortOrder}
    LIMIT ? OFFSET ?
  `

  const [items] = await execute(dataSql, [...queryParams, sanitizedLimit, offset])

  return {
    items,
    pagination: {
      page: sanitizedPage,
      limit: sanitizedLimit,
      totalItems,
      totalPages
    }
  }
}

/**
 * Retrieves full registration dossier, submission history versions, documents, and audit log.
 *
 * @param {string} id - Registration ID
 * @returns {Promise<object|null>}
 */
export async function getRegistrationDetail(id) {
  if (!id || typeof id !== 'string') return null

  // 1. Registration base record
  const [regRows] = await execute(
    `SELECT 
      r.id,
      r.reference_number AS referenceNumber,
      r.category,
      r.org_name AS orgName,
      r.license_number AS licenseNumber,
      r.address,
      r.contact_name AS contactName,
      r.contact_email AS contactEmail,
      r.contact_phone AS contactPhone,
      r.pharmacy_classification AS pharmacyClassification,
      r.dghs_facility_code AS dghsFacilityCode,
      r.status,
      r.reviewed_by AS reviewedBy,
      r.reviewed_at AS reviewedAt,
      r.review_notes AS reviewNotes,
      r.rejection_reason AS rejectionReason,
      r.rejection_explanation AS rejectionExplanation,
      r.approved_org_id AS approvedOrgId,
      r.created_at AS createdAt,
      r.updated_at AS updatedAt
    FROM organization_registrations r
    WHERE r.id = ?`,
    [id]
  )

  if (regRows.length === 0) {
    return null
  }

  const registration = regRows[0]

  // 2. Historical submission snapshots
  const [subRows] = await execute(
    `SELECT 
      version,
      submitted_data AS submittedData,
      applicant_note AS applicantNote,
      submitted_at AS submittedAt
    FROM registration_submissions
    WHERE registration_id = ?
    ORDER BY version ASC`,
    [id]
  )

  const submissions = subRows.map(sub => {
    let parsedData = null
    try {
      parsedData = typeof sub.submittedData === 'string' ? JSON.parse(sub.submittedData) : sub.submittedData
    } catch {
      parsedData = { raw: sub.submittedData, error: 'MALFORMED_JSON_PAYLOAD' }
    }
    return {
      version: sub.version,
      submittedData: parsedData,
      applicantNote: sub.applicantNote,
      submittedAt: sub.submittedAt
    }
  })

  // 3. Document metadata (Omit stored filesystem paths)
  const [docRows] = await execute(
    `SELECT 
      id,
      document_type AS documentType,
      original_name AS originalFilename,
      file_size_bytes AS fileSizeBytes,
      mime_type AS mimeType,
      submission_version AS submissionVersion,
      uploaded_at AS uploadedAt
    FROM registration_documents
    WHERE registration_id = ?
    ORDER BY submission_version ASC, uploaded_at ASC`,
    [id]
  )

  // 4. Audit trail
  const [auditRows] = await execute(
    `SELECT 
      id,
      actor_user_id AS actorUserId,
      actor_role AS actorRole,
      from_status AS fromStatus,
      to_status AS toStatus,
      action_type AS actionType,
      comment,
      created_at AS createdAt
    FROM registration_audit_log
    WHERE registration_id = ?
    ORDER BY created_at ASC`,
    [id]
  )

  return {
    registration,
    submissions,
    documents: docRows,
    auditLog: auditRows
  }
}

/**
 * Retrieves a document file for secure admin download with path traversal protection.
 *
 * @param {string} registrationId
 * @param {string} documentId
 * @returns {Promise<{ resolvedPath: string, mimeType: string, originalFilename: string }>}
 */
export async function getRegistrationDocument(registrationId, documentId) {
  if (!registrationId || !documentId) {
    const err = new Error('Registration ID and Document ID are required.')
    err.code = 'INVALID_INPUT'
    err.statusCode = 400
    throw err
  }

  const [rows] = await execute(
    `SELECT id, registration_id, document_type, original_name, stored_path, mime_type
     FROM registration_documents
     WHERE id = ? AND registration_id = ?`,
    [documentId, registrationId]
  )

  if (rows.length === 0) {
    const err = new Error('Document not found for this registration.')
    err.code = 'DOCUMENT_NOT_FOUND'
    err.statusCode = 404
    throw err
  }

  const doc = rows[0]
  const uploadBase = path.resolve(UPLOAD_DIR)
  const resolvedPath = path.resolve(doc.stored_path)

  // 1. Strict traversal check: must reside within UPLOAD_DIR
  if (!resolvedPath.startsWith(uploadBase + path.sep) && resolvedPath !== uploadBase) {
    logger.warn('Document path traversal attempt detected', {
      registrationId,
      documentId,
      path: resolvedPath
    })
    const err = new Error('Document access denied.')
    err.code = 'ACCESS_DENIED'
    err.statusCode = 403
    throw err
  }

  // 2. Symlink protection: verify realpath does not escape uploadBase
  try {
    const stat = await fs.promises.lstat(resolvedPath)
    if (stat.isSymbolicLink()) {
      const realTarget = await fs.promises.realpath(resolvedPath)
      if (!realTarget.startsWith(uploadBase + path.sep)) {
        logger.warn('Document symlink escape attempt detected', {
          registrationId,
          documentId,
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

  // 3. Verify file exists and is readable
  try {
    await fs.promises.access(resolvedPath, fs.constants.R_OK)
  } catch {
    const err = new Error('Document file cannot be read.')
    err.code = 'FILE_UNREADABLE'
    err.statusCode = 404
    throw err
  }

  return {
    resolvedPath,
    mimeType: doc.mime_type || 'application/octet-stream',
    originalFilename: doc.original_name || 'document.bin'
  }
}

/**
 * Transitions registration status from SUBMITTED to UNDER_REVIEW.
 *
 * @param {string} id
 * @param {object} adminUser
 * @param {string} [comment]
 * @returns {Promise<object>}
 */
export async function startRegistrationReview(id, adminUser, comment = null) {
  if (!id) {
    const err = new Error('Registration ID is required.')
    err.code = 'INVALID_INPUT'
    err.statusCode = 400
    throw err
  }

  const pool = getPool()
  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()

    // 1. Lock registration row FOR UPDATE
    const [regRows] = await connection.query(
      'SELECT id, reference_number, status FROM organization_registrations WHERE id = ? FOR UPDATE',
      [id]
    )

    if (regRows.length === 0) {
      await connection.rollback()
      const err = new Error('Registration application not found.')
      err.code = 'REGISTRATION_NOT_FOUND'
      err.statusCode = 404
      throw err
    }

    const reg = regRows[0]

    // 2. Strict status check: Only SUBMITTED can transition to UNDER_REVIEW
    if (reg.status !== 'SUBMITTED') {
      await connection.rollback()
      const err = new Error(
        `Registration cannot transition from '${reg.status}' to UNDER_REVIEW. Only SUBMITTED applications can enter review.`
      )
      err.code = 'INVALID_STATE_TRANSITION'
      err.statusCode = 409
      throw err
    }

    // 3. Update registration
    await connection.query(
      `UPDATE organization_registrations 
       SET status = 'UNDER_REVIEW', 
           reviewed_by = ?, 
           reviewed_at = NOW(), 
           updated_at = NOW() 
       WHERE id = ?`,
      [adminUser.id, id]
    )

    // 4. Record audit entry
    await connection.query(
      `INSERT INTO registration_audit_log (
        registration_id, actor_user_id, actor_role, 
        from_status, to_status, action_type, comment, created_at
      ) VALUES (?, ?, 'ADMIN', 'SUBMITTED', 'UNDER_REVIEW', 'REVIEW_STARTED', ?, NOW())`,
      [
        id,
        adminUser.id,
        comment || 'Administrator initiated formal application review.'
      ]
    )

    await connection.commit()

    logger.info('Registration review started', {
      registrationId: id,
      referenceNumber: reg.reference_number,
      adminId: adminUser.id
    })

    return {
      id,
      referenceNumber: reg.reference_number,
      status: 'UNDER_REVIEW'
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

/**
 * Transitions registration from UNDER_REVIEW to INFORMATION_REQUESTED and issues single-use access token.
 *
 * @param {string} id
 * @param {object} adminUser
 * @param {object} params
 * @param {string} params.reason
 * @param {number} [params.cureDays=7]
 * @returns {Promise<object>}
 */
export async function requestAdditionalInformation(
  id,
  adminUser,
  { reason, cureDays = 7 } = {}
) {
  if (!id) {
    const err = new Error('Registration ID is required.')
    err.code = 'INVALID_INPUT'
    err.statusCode = 400
    throw err
  }

  const trimmedReason = typeof reason === 'string' ? reason.trim() : ''
  if (!trimmedReason || trimmedReason.length < 10) {
    const err = new Error('Reason for requesting information must be at least 10 characters.')
    err.code = 'INVALID_INPUT'
    err.statusCode = 400
    throw err
  }

  const sanitizedCureDays = Math.min(30, Math.max(1, parseInt(cureDays, 10) || 7))

  const pool = getPool()
  const connection = await pool.getConnection()

  let rawToken = null
  let regSnapshot = null
  let expiresAtDate = null

  try {
    await connection.beginTransaction()

    // 1. Lock registration row FOR UPDATE
    const [regRows] = await connection.query(
      `SELECT id, reference_number, category, org_name, contact_name, contact_email, status 
       FROM organization_registrations WHERE id = ? FOR UPDATE`,
      [id]
    )

    if (regRows.length === 0) {
      await connection.rollback()
      const err = new Error('Registration application not found.')
      err.code = 'REGISTRATION_NOT_FOUND'
      err.statusCode = 404
      throw err
    }

    regSnapshot = regRows[0]

    // 2. Strict state transition rule: Only UNDER_REVIEW can transition to INFORMATION_REQUESTED
    if (regSnapshot.status !== 'UNDER_REVIEW') {
      await connection.rollback()
      const err = new Error(
        `Registration cannot transition from '${regSnapshot.status}' to INFORMATION_REQUESTED. Application must be UNDER_REVIEW.`
      )
      err.code = 'INVALID_STATE_TRANSITION'
      err.statusCode = 409
      throw err
    }

    // 3. Revoke any previously issued active access tokens (preserving historical token rows)
    await connection.query(
      `UPDATE registration_access_tokens 
       SET revoked = 1 
       WHERE registration_id = ? AND used = 0 AND revoked = 0`,
      [id]
    )

    // 4. Generate 256-bit cryptographically random token
    rawToken = generateActivationToken()
    const tokenHash = hashToken(rawToken)
    const tokenId = `rat-${crypto.randomUUID()}`

    await connection.query(
      `INSERT INTO registration_access_tokens (
        id, registration_id, token_hash, expires_at, used, revoked, created_at
      ) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), 0, 0, NOW())`,
      [tokenId, id, tokenHash, sanitizedCureDays]
    )

    const [tokenRow] = await connection.query(
      'SELECT expires_at FROM registration_access_tokens WHERE id = ?',
      [tokenId]
    )
    expiresAtDate = tokenRow[0]?.expires_at

    // 5. Update registration status and applicant-visible review_notes
    await connection.query(
      `UPDATE organization_registrations 
       SET status = 'INFORMATION_REQUESTED', 
           review_notes = ?, 
           reviewed_by = ?, 
           reviewed_at = NOW(), 
           updated_at = NOW() 
       WHERE id = ?`,
      [trimmedReason, adminUser.id, id]
    )

    // 6. Record audit entry
    await connection.query(
      `INSERT INTO registration_audit_log (
        registration_id, actor_user_id, actor_role, 
        from_status, to_status, action_type, comment, created_at
      ) VALUES (?, ?, 'ADMIN', 'UNDER_REVIEW', 'INFORMATION_REQUESTED', 'INFORMATION_REQUESTED', ?, NOW())`,
      [
        id,
        adminUser.id,
        `Additional information requested (${sanitizedCureDays} days): ${trimmedReason}`
      ]
    )

    await connection.commit()

    logger.info('Information request created and committed', {
      registrationId: id,
      referenceNumber: regSnapshot.reference_number,
      cureDays: sanitizedCureDays
    })
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }

  // 7. Post-commit asynchronous notification dispatch (Outside DB transaction)
  let notificationResult = { status: 'NOT_CONFIGURED' }
  try {
    notificationResult = await sendInformationRequestNotification({
      recipientEmail: regSnapshot.contact_email,
      contactName: regSnapshot.contact_name,
      orgName: regSnapshot.org_name,
      reason: trimmedReason,
      rawToken,
      cureDays: sanitizedCureDays,
      expiresAt: expiresAtDate
    })
  } catch (notifErr) {
    logger.warn('Failed to dispatch information request notification', {
      registrationId: id,
      error: notifErr.message
    })
    notificationResult = { status: 'FAILED', error: notifErr.message }
  }

  return {
    id,
    referenceNumber: regSnapshot.reference_number,
    status: 'INFORMATION_REQUESTED',
    expiresAt: expiresAtDate,
    notificationStatus: notificationResult.status
  }
}

/**
 * Reissues an information request link for an application in INFORMATION_REQUESTED status.
 *
 * @param {string} id
 * @param {object} adminUser
 * @param {object} params
 * @param {number} [params.cureDays=7]
 * @returns {Promise<object>}
 */
export async function resendInformationRequestLink(id, adminUser, { cureDays = 7 } = {}) {
  if (!id) {
    const err = new Error('Registration ID is required.')
    err.code = 'INVALID_INPUT'
    err.statusCode = 400
    throw err
  }

  const sanitizedCureDays = Math.min(30, Math.max(1, parseInt(cureDays, 10) || 7))

  const pool = getPool()
  const connection = await pool.getConnection()

  let rawToken = null
  let regSnapshot = null
  let expiresAtDate = null

  try {
    await connection.beginTransaction()

    const [regRows] = await connection.query(
      `SELECT id, reference_number, category, org_name, contact_name, contact_email, review_notes, status 
       FROM organization_registrations WHERE id = ? FOR UPDATE`,
      [id]
    )

    if (regRows.length === 0) {
      await connection.rollback()
      const err = new Error('Registration application not found.')
      err.code = 'REGISTRATION_NOT_FOUND'
      err.statusCode = 404
      throw err
    }

    regSnapshot = regRows[0]

    if (regSnapshot.status !== 'INFORMATION_REQUESTED') {
      await connection.rollback()
      const err = new Error(
        `Cannot resend information link. Application status is '${regSnapshot.status}', expected 'INFORMATION_REQUESTED'.`
      )
      err.code = 'INVALID_STATE_TRANSITION'
      err.statusCode = 409
      throw err
    }

    // Revoke previous active tokens (Preserve historical token rows)
    await connection.query(
      `UPDATE registration_access_tokens 
       SET revoked = 1 
       WHERE registration_id = ? AND used = 0 AND revoked = 0`,
      [id]
    )

    // Generate fresh 256-bit token
    rawToken = generateActivationToken()
    const tokenHash = hashToken(rawToken)
    const tokenId = `rat-${crypto.randomUUID()}`

    await connection.query(
      `INSERT INTO registration_access_tokens (
        id, registration_id, token_hash, expires_at, used, revoked, created_at
      ) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), 0, 0, NOW())`,
      [tokenId, id, tokenHash, sanitizedCureDays]
    )

    const [tokenRow] = await connection.query(
      'SELECT expires_at FROM registration_access_tokens WHERE id = ?',
      [tokenId]
    )
    expiresAtDate = tokenRow[0]?.expires_at

    // Audit log
    await connection.query(
      `INSERT INTO registration_audit_log (
        registration_id, actor_user_id, actor_role, 
        from_status, to_status, action_type, comment, created_at
      ) VALUES (?, ?, 'ADMIN', 'INFORMATION_REQUESTED', 'INFORMATION_REQUESTED', 'INFORMATION_REQUEST_RESENT', ?, NOW())`,
      [
        id,
        adminUser.id,
        `Administrator reissued information request access link (${sanitizedCureDays} days).`
      ]
    )

    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }

  // Post-commit notification dispatch
  let notificationResult = { status: 'NOT_CONFIGURED' }
  try {
    notificationResult = await sendInformationRequestNotification({
      recipientEmail: regSnapshot.contact_email,
      contactName: regSnapshot.contact_name,
      orgName: regSnapshot.org_name,
      reason: regSnapshot.review_notes || 'Additional documentation requested.',
      rawToken,
      cureDays: sanitizedCureDays,
      expiresAt: expiresAtDate
    })
  } catch (notifErr) {
    logger.warn('Failed to dispatch resent information request notification', {
      registrationId: id,
      error: notifErr.message
    })
    notificationResult = { status: 'FAILED', error: notifErr.message }
  }

  return {
    id,
    referenceNumber: regSnapshot.reference_number,
    status: 'INFORMATION_REQUESTED',
    expiresAt: expiresAtDate,
    notificationStatus: notificationResult.status
  }
}

/**
 * Rejects registration dossier with formal statutory reason and explanation.
 * Permitted source statuses: SUBMITTED, UNDER_REVIEW, INFORMATION_REQUESTED.
 *
 * @param {string} id
 * @param {object} adminUser
 * @param {object} params
 * @param {string} params.rejectionReason
 * @param {string} params.rejectionExplanation
 * @returns {Promise<object>}
 */
export async function rejectRegistration(
  id,
  adminUser,
  { rejectionReason, rejectionExplanation } = {}
) {
  if (!id) {
    const err = new Error('Registration ID is required.')
    err.code = 'INVALID_INPUT'
    err.statusCode = 400
    throw err
  }

  const reason = typeof rejectionReason === 'string' ? rejectionReason.trim() : ''
  const explanation = typeof rejectionExplanation === 'string' ? rejectionExplanation.trim() : ''

  if (!reason || reason.length < 3) {
    const err = new Error('Rejection reason must be at least 3 characters.')
    err.code = 'INVALID_INPUT'
    err.statusCode = 400
    throw err
  }

  if (!explanation || explanation.length < 10) {
    const err = new Error('Rejection explanation must be at least 10 characters.')
    err.code = 'INVALID_INPUT'
    err.statusCode = 400
    throw err
  }

  const pool = getPool()
  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()

    // 1. Lock registration row FOR UPDATE
    const [regRows] = await connection.query(
      'SELECT id, reference_number, status FROM organization_registrations WHERE id = ? FOR UPDATE',
      [id]
    )

    if (regRows.length === 0) {
      await connection.rollback()
      const err = new Error('Registration application not found.')
      err.code = 'REGISTRATION_NOT_FOUND'
      err.statusCode = 404
      throw err
    }

    const reg = regRows[0]

    // 2. Reject only from permitted source states (APPROVED and REJECTED are terminal)
    const PERMITTED_REJECTION_SOURCES = ['SUBMITTED', 'UNDER_REVIEW', 'INFORMATION_REQUESTED']
    if (!PERMITTED_REJECTION_SOURCES.includes(reg.status)) {
      await connection.rollback()
      const err = new Error(
        `Cannot reject application in terminal status '${reg.status}'.`
      )
      err.code = 'INVALID_STATE_TRANSITION'
      err.statusCode = 409
      throw err
    }

    // 3. Revoke any active access tokens
    await connection.query(
      `UPDATE registration_access_tokens 
       SET revoked = 1 
       WHERE registration_id = ? AND used = 0 AND revoked = 0`,
      [id]
    )

    // 4. Update registration to REJECTED
    await connection.query(
      `UPDATE organization_registrations 
       SET status = 'REJECTED', 
           rejection_reason = ?, 
           rejection_explanation = ?, 
           reviewed_by = ?, 
           reviewed_at = NOW(), 
           updated_at = NOW() 
       WHERE id = ?`,
      [reason, explanation, adminUser.id, id]
    )

    // 5. Insert audit log
    await connection.query(
      `INSERT INTO registration_audit_log (
        registration_id, actor_user_id, actor_role, 
        from_status, to_status, action_type, comment, created_at
      ) VALUES (?, ?, 'ADMIN', ?, 'REJECTED', 'APPLICATION_REJECTED', ?, NOW())`,
      [
        id,
        adminUser.id,
        reg.status,
        `Reason: ${reason}. Explanation: ${explanation}`
      ]
    )

    await connection.commit()

    logger.info('Registration application rejected', {
      registrationId: id,
      referenceNumber: reg.reference_number,
      reason
    })

    return {
      id,
      referenceNumber: reg.reference_number,
      status: 'REJECTED'
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

/**
 * Atomically approves registration, verifies category capacity with serialization mutex,
 * provisions active organization, provisions initial user (pending_activation),
 * issues single-use activation token, and commits audit trail.
 *
 * @param {string} id
 * @param {object} adminUser
 * @param {object} params
 * @param {string} [params.reviewNotes]
 * @param {boolean} [params.dghsVerified]
 * @returns {Promise<object>}
 */
export async function approveRegistration(
  id,
  adminUser,
  { reviewNotes, dghsVerified = false } = {}
) {
  if (!id) {
    const err = new Error('Registration ID is required.')
    err.code = 'INVALID_INPUT'
    err.statusCode = 400
    throw err
  }

  // 1. Safe pre-read of immutable category and classification outside transaction
  const [preRows] = await execute(
    'SELECT id, category, pharmacy_classification, dghs_facility_code FROM organization_registrations WHERE id = ?',
    [id]
  )

  if (preRows.length === 0) {
    const err = new Error('Registration application not found.')
    err.code = 'REGISTRATION_NOT_FOUND'
    err.statusCode = 404
    throw err
  }

  const targetCategory = preRows[0].category
  const pharmacyClassification = preRows[0].pharmacy_classification

  // Pre-validate Government Pharmacy requirements
  if (pharmacyClassification === 'GOVERNMENT') {
    if (!dghsVerified) {
      const err = new Error(
        'DGDA Administrator verification of DGHS Health Facility Code is mandatory to approve a Government Pharmacy.'
      )
      err.code = 'DGHS_VERIFICATION_REQUIRED'
      err.statusCode = 422
      throw err
    }
    if (!preRows[0].dghs_facility_code || String(preRows[0].dghs_facility_code).trim() === '') {
      const err = new Error(
        'A valid DGHS Health Facility Code is required for Government Pharmacy approval.'
      )
      err.code = 'DGHS_CODE_REQUIRED'
      err.statusCode = 422
      throw err
    }
  }

  const pool = getPool()
  const connection = await pool.getConnection()

  let rawToken = null
  let provisionedOrgId = null
  let provisionedUserId = null
  let regSnapshot = null

  try {
    await connection.beginTransaction()

    // 2. Lock category_policies row FOR UPDATE (Serialization Mutex Pivot)
    const [policyRows] = await connection.query(
      `SELECT category, display_name, max_active_instances, is_registration_allowed 
       FROM category_policies 
       WHERE category = ? 
       FOR UPDATE`,
      [targetCategory]
    )

    if (policyRows.length === 0) {
      await connection.rollback()
      const err = new Error(`Category policy for '${targetCategory}' not found.`)
      err.code = 'INVALID_CATEGORY'
      err.statusCode = 400
      throw err
    }

    const policy = policyRows[0]

    // 3. Lock organization_registrations row FOR UPDATE
    const [regRows] = await connection.query(
      'SELECT * FROM organization_registrations WHERE id = ? FOR UPDATE',
      [id]
    )

    if (regRows.length === 0) {
      await connection.rollback()
      const err = new Error('Registration application not found.')
      err.code = 'REGISTRATION_NOT_FOUND'
      err.statusCode = 404
      throw err
    }

    regSnapshot = regRows[0]

    // 4. Verify category still matches pre-read
    if (regSnapshot.category !== targetCategory) {
      await connection.rollback()
      const err = new Error('Application category mismatch detected during locking.')
      err.code = 'INVARIANT_FAILURE'
      err.statusCode = 409
      throw err
    }

    // 5. Recheck current status: strictly UNDER_REVIEW
    if (regSnapshot.status === 'APPROVED') {
      await connection.rollback()
      const err = new Error('Registration application has already been approved.')
      err.code = 'INVALID_STATE_TRANSITION'
      err.statusCode = 409
      throw err
    }

    if (regSnapshot.status !== 'UNDER_REVIEW') {
      await connection.rollback()
      const err = new Error(
        `Registration cannot be approved from '${regSnapshot.status}'. Only applications in UNDER_REVIEW status can be approved.`
      )
      err.code = 'INVALID_STATE_TRANSITION'
      err.statusCode = 409
      throw err
    }

    if (regSnapshot.approved_org_id !== null) {
      await connection.rollback()
      const err = new Error('Registration already references an approved organization.')
      err.code = 'INVARIANT_FAILURE'
      err.statusCode = 409
      throw err
    }

    // 6. Capacity check under category policy mutex
    if (policy.is_registration_allowed === 0) {
      await connection.rollback()
      const err = new Error(
        `Registration for ${policy.display_name || targetCategory} is administratively closed by DGDA.`
      )
      err.code = 'REGISTRATION_CLOSED'
      err.statusCode = 409
      throw err
    }

    const [countRows] = await connection.query(
      `SELECT COUNT(*) AS active_count 
       FROM organizations 
       WHERE type = ? AND status = 'active' AND data_environment = 'production' 
       FOR UPDATE`,
      [targetCategory]
    )

    const activeCount = Number(countRows[0]?.active_count || 0)
    if (policy.max_active_instances !== null && activeCount >= policy.max_active_instances) {
      await connection.rollback()
      const err = new Error(
        `Registration capacity reached for ${policy.display_name || targetCategory}. The authorized limit (${policy.max_active_instances}) is active.`
      )
      err.code = 'CAPACITY_REACHED'
      err.statusCode = 409
      throw err
    }

    // 7. Check database uniqueness for license number and user email
    const [existingLicenseRows] = await connection.query(
      'SELECT id FROM organizations WHERE license_number = ?',
      [regSnapshot.license_number]
    )
    if (existingLicenseRows.length > 0) {
      await connection.rollback()
      const err = new Error(
        `An organization with license number '${regSnapshot.license_number}' already exists.`
      )
      err.code = 'DUPLICATE_LICENSE'
      err.statusCode = 409
      throw err
    }

    const [existingEmailRows] = await connection.query(
      'SELECT id FROM users WHERE email = ?',
      [regSnapshot.contact_email]
    )
    if (existingEmailRows.length > 0) {
      await connection.rollback()
      const err = new Error(
        `A user account with contact email '${regSnapshot.contact_email}' already exists.`
      )
      err.code = 'DUPLICATE_EMAIL'
      err.statusCode = 409
      throw err
    }

    // 8. Provision organization
    provisionedOrgId = `org-${crypto.randomUUID()}`
    const isGovPharmacy = regSnapshot.pharmacy_classification === 'GOVERNMENT'

    await connection.query(
      `INSERT INTO organizations (
        id, name, type, pharmacy_classification, dghs_facility_code,
        government_verification_evidence, government_verified_by, government_verified_at,
        license_number, address, contact_name, contact_email, contact_phone,
        status, data_environment, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'production', NOW(), NOW())`,
      [
        provisionedOrgId,
        regSnapshot.org_name,
        regSnapshot.category,
        regSnapshot.pharmacy_classification || 'NOT_APPLICABLE',
        regSnapshot.dghs_facility_code || null,
        isGovPharmacy ? 'DGDA Administrator Attestation' : null,
        isGovPharmacy ? adminUser.id : null,
        isGovPharmacy ? new Date() : null,
        regSnapshot.license_number,
        regSnapshot.address,
        regSnapshot.contact_name,
        regSnapshot.contact_email,
        regSnapshot.contact_phone
      ]
    )

    // 9. Provision initial user in pending_activation status
    provisionedUserId = `usr-${crypto.randomUUID()}`
    await connection.query(
      `INSERT INTO users (
        id, org_id, name, email, password_hash, role, 
        token_version, status, failed_login_attempts, created_at, updated_at
      ) VALUES (?, ?, ?, ?, NULL, ?, 1, 'pending_activation', 0, NOW(), NOW())`,
      [
        provisionedUserId,
        provisionedOrgId,
        regSnapshot.contact_name,
        regSnapshot.contact_email,
        regSnapshot.category
      ]
    )

    // 10. Generate 256-bit activation token (72-hour TTL)
    rawToken = generateActivationToken()
    const tokenHash = hashToken(rawToken)
    const activationTokenId = `act-${crypto.randomUUID()}`

    await connection.query(
      `INSERT INTO activation_tokens (
        id, user_id, token_hash, expires_at, used, created_at
      ) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 72 HOUR), 0, NOW())`,
      [activationTokenId, provisionedUserId, tokenHash]
    )

    // 11. Update registration status and record approved_org_id
    await connection.query(
      `UPDATE organization_registrations 
       SET status = 'APPROVED', 
           approved_org_id = ?, 
           reviewed_by = ?, 
           reviewed_at = NOW(), 
           review_notes = ?, 
           updated_at = NOW() 
       WHERE id = ?`,
      [provisionedOrgId, adminUser.id, reviewNotes || null, id]
    )

    // 12. Revoke any remaining unused applicant information-request tokens
    await connection.query(
      `UPDATE registration_access_tokens 
       SET revoked = 1 
       WHERE registration_id = ? AND used = 0 AND revoked = 0`,
      [id]
    )

    // 13. Audit log
    await connection.query(
      `INSERT INTO registration_audit_log (
        registration_id, actor_user_id, actor_role, 
        from_status, to_status, action_type, comment, created_at
      ) VALUES (?, ?, 'ADMIN', 'UNDER_REVIEW', 'APPROVED', 'APPLICATION_APPROVED', ?, NOW())`,
      [
        id,
        adminUser.id,
        reviewNotes || `Registration approved and organization ${provisionedOrgId} provisioned.`
      ]
    )

    await connection.commit()

    logger.info('Organization registration successfully approved and provisioned', {
      registrationId: id,
      referenceNumber: regSnapshot.reference_number,
      organizationId: provisionedOrgId,
      userId: provisionedUserId
    })
  } catch (error) {
    await connection.rollback()

    // Map unique constraint database errors
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.message.includes('uq_org_license')) {
        const err = new Error(
          `An organization with license number '${regSnapshot?.license_number}' already exists.`
        )
        err.code = 'DUPLICATE_LICENSE'
        err.statusCode = 409
        throw err
      }
      if (error.message.includes('uq_user_email')) {
        const err = new Error(
          `A user account with contact email '${regSnapshot?.contact_email}' already exists.`
        )
        err.code = 'DUPLICATE_EMAIL'
        err.statusCode = 409
        throw err
      }
    }

    throw error
  } finally {
    connection.release()
  }

  // 14. Post-commit asynchronous notification dispatch (Outside DB transaction)
  let notificationResult = { status: 'NOT_CONFIGURED' }
  try {
    notificationResult = await sendActivationNotification({
      recipientEmail: regSnapshot.contact_email,
      contactName: regSnapshot.contact_name,
      orgName: regSnapshot.org_name,
      rawToken
    })
  } catch (notifErr) {
    logger.warn('Failed to dispatch activation notification', {
      registrationId: id,
      error: notifErr.message
    })
    notificationResult = { status: 'FAILED', error: notifErr.message }
  }

  return {
    registrationId: id,
    referenceNumber: regSnapshot.reference_number,
    organizationId: provisionedOrgId,
    userId: provisionedUserId,
    status: 'APPROVED',
    notificationStatus: notificationResult.status
  }
}

/**
 * Resends activation token for an approved registration.
 *
 * @param {string} id
 * @param {object} adminUser
 * @returns {Promise<object>}
 */
export async function resendActivationToken(id, adminUser) {
  if (!id) {
    const err = new Error('Registration ID is required.')
    err.code = 'INVALID_INPUT'
    err.statusCode = 400
    throw err
  }

  const pool = getPool()
  const connection = await pool.getConnection()

  let rawToken = null
  let regSnapshot = null
  let userSnapshot = null

  try {
    await connection.beginTransaction()

    // 1. Lock registration row FOR UPDATE
    const [regRows] = await connection.query(
      `SELECT id, reference_number, category, org_name, contact_name, contact_email, approved_org_id, status 
       FROM organization_registrations WHERE id = ? FOR UPDATE`,
      [id]
    )

    if (regRows.length === 0) {
      await connection.rollback()
      const err = new Error('Registration application not found.')
      err.code = 'REGISTRATION_NOT_FOUND'
      err.statusCode = 404
      throw err
    }

    regSnapshot = regRows[0]

    if (regSnapshot.status !== 'APPROVED') {
      await connection.rollback()
      const err = new Error('Registration is not in APPROVED status. Cannot resend activation token.')
      err.code = 'REGISTRATION_NOT_APPROVED'
      err.statusCode = 400
      throw err
    }

    if (!regSnapshot.approved_org_id) {
      await connection.rollback()
      const err = new Error('Approved registration lacks an associated organization ID.')
      err.code = 'INVARIANT_FAILURE'
      err.statusCode = 500
      throw err
    }

    // 2. Lock provisioned user record
    const [userRows] = await connection.query(
      'SELECT id, email, status, role FROM users WHERE org_id = ? AND email = ? FOR UPDATE',
      [regSnapshot.approved_org_id, regSnapshot.contact_email]
    )

    if (userRows.length === 0) {
      await connection.rollback()
      const err = new Error('Provisioned initial user account was not found.')
      err.code = 'USER_NOT_FOUND'
      err.statusCode = 404
      throw err
    }

    userSnapshot = userRows[0]

    if (userSnapshot.status === 'active') {
      await connection.rollback()
      const err = new Error('User account is already active. Cannot reissue an activation token.')
      err.code = 'USER_ALREADY_ACTIVE'
      err.statusCode = 400
      throw err
    }

    if (userSnapshot.status !== 'pending_activation') {
      await connection.rollback()
      const err = new Error(`Cannot reissue activation token for user in '${userSnapshot.status}' status.`)
      err.code = 'INVALID_USER_STATUS'
      err.statusCode = 400
      throw err
    }

    // 3. Invalidate outstanding unused activation tokens (mark used=1 to prevent replay)
    await connection.query(
      'UPDATE activation_tokens SET used = 1, used_at = NOW() WHERE user_id = ? AND used = 0',
      [userSnapshot.id]
    )

    // 4. Generate fresh 256-bit token with 72-hour TTL
    rawToken = generateActivationToken()
    const tokenHash = hashToken(rawToken)
    const activationTokenId = `act-${crypto.randomUUID()}`

    await connection.query(
      `INSERT INTO activation_tokens (
        id, user_id, token_hash, expires_at, used, created_at
      ) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 72 HOUR), 0, NOW())`,
      [activationTokenId, userSnapshot.id, tokenHash]
    )

    // 5. Audit log
    await connection.query(
      `INSERT INTO registration_audit_log (
        registration_id, actor_user_id, actor_role, 
        from_status, to_status, action_type, comment, created_at
      ) VALUES (?, ?, 'ADMIN', 'APPROVED', 'APPROVED', 'ACTIVATION_TOKEN_RESENT', ?, NOW())`,
      [
        id,
        adminUser.id,
        `Administrator reissued account activation token for user ${userSnapshot.id}.`
      ]
    )

    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }

  // 6. Post-commit notification dispatch
  let notificationResult = { status: 'NOT_CONFIGURED' }
  try {
    notificationResult = await sendActivationNotification({
      recipientEmail: regSnapshot.contact_email,
      contactName: regSnapshot.contact_name,
      orgName: regSnapshot.org_name,
      rawToken
    })
  } catch (notifErr) {
    logger.warn('Failed to dispatch resent activation notification', {
      registrationId: id,
      error: notifErr.message
    })
    notificationResult = { status: 'FAILED', error: notifErr.message }
  }

  return {
    registrationId: id,
    organizationId: regSnapshot.approved_org_id,
    userId: userSnapshot.id,
    notificationStatus: notificationResult.status
  }
}
