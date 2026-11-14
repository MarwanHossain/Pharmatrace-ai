// PharmaTrace AI — Registration Service
// Implements Revision 3.2 Dynamic Capacity Engine & Public Registration Intake
import crypto from 'crypto'
import { getPool } from '../config/database.js'
import {
  generateTrackingPin,
  generateReferenceNumber,
  hashTrackingPin,
  compareTrackingPin,
  validateTrackingPin
} from '../utils/reference.js'
import { compareConstantTime } from '../utils/passwords.js'
import { hashToken, validateTokenFormat } from '../utils/tokens.js'
import { computeFileHash, cleanupFiles } from '../middleware/upload.js'
import { logger } from '../utils/logger.js'

// In-memory sliding window for per-reference tracking attempt throttling
const REF_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
export const MAX_REF_ATTEMPTS = 5
export const MAX_REF_MAP_SIZE = 10000

// Map structure: ref -> { failures: number[], pending: number }
const refAttempts = new Map()

/**
 * Cleans expired timestamps for an entry.
 * If no failures remain and no pending reservations exist, deletes the entry from the Map.
 *
 * @param {string} ref
 * @param {number} now
 * @returns {{ failures: number[], pending: number } | null}
 */
function getOrCleanRefEntry(ref, now) {
  const entry = refAttempts.get(ref)
  if (!entry) return null

  entry.failures = entry.failures.filter(t => now - t < REF_WINDOW_MS)
  if (entry.failures.length === 0 && entry.pending <= 0) {
    refAttempts.delete(ref)
    return null
  }
  return entry
}

/**
 * Sweeps the map and deletes any entries that have zero active failures and zero pending reservations.
 * Strictly preserves all entries with active failure timestamps (<15 min) or pending in-flight reservations.
 *
 * @param {number} now
 */
function sweepExpiredEntries(now) {
  for (const [key, entry] of refAttempts.entries()) {
    entry.failures = entry.failures.filter(t => now - t < REF_WINDOW_MS)
    if (entry.failures.length === 0 && entry.pending <= 0) {
      refAttempts.delete(key)
    }
  }
}

/**
 * Synchronously reserves an attempt slot for a normalized reference number.
 * Accounts for both past failures and in-flight pending attempts to prevent concurrent race bypass.
 * If capacity is exhausted and no expired entry can be removed, refuses new reservation with false (HTTP 429).
 *
 * @param {string} ref - Normalized reference number
 * @returns {boolean} True if slot reserved; false if throttled
 */
export function reserveRefAttempt(ref) {
  const now = Date.now()
  let entry = getOrCleanRefEntry(ref, now)

  if (process.env.NODE_ENV === 'test' && !process.env.ENFORCE_REF_LIMIT) {
    return true
  }

  if (entry) {
    // Existing entry: existing reference counters remain intact; check budget
    if ((entry.failures.length + entry.pending) >= MAX_REF_ATTEMPTS) {
      return false
    }
    entry.pending += 1
    return true
  }

  // New reference entry: check capacity ceiling
  if (refAttempts.size >= MAX_REF_MAP_SIZE) {
    sweepExpiredEntries(now)
  }

  // If still at or above capacity (all entries are active or pending), refuse new reservation
  if (refAttempts.size >= MAX_REF_MAP_SIZE) {
    logger.warn('Per-reference tracking attempt map capacity reached', {
      currentSize: refAttempts.size,
      maxSize: MAX_REF_MAP_SIZE,
      ref
    })
    return false
  }

  refAttempts.set(ref, {
    failures: [],
    pending: 1
  })

  return true
}

/**
 * Records a failed attempt, converting a pending reservation into a failure timestamp.
 *
 * @param {string} ref - Normalized reference number
 */
export function recordRefFailure(ref) {
  const now = Date.now()
  let entry = refAttempts.get(ref)

  if (!entry) {
    if (refAttempts.size >= MAX_REF_MAP_SIZE) {
      sweepExpiredEntries(now)
    }
    if (refAttempts.size < MAX_REF_MAP_SIZE) {
      entry = { failures: [], pending: 0 }
      refAttempts.set(ref, entry)
    }
  }

  if (entry) {
    if (entry.pending > 0) {
      entry.pending -= 1
    }
    entry.failures = entry.failures.filter(t => now - t < REF_WINDOW_MS)
    entry.failures.push(now)
  }
}

/**
 * Releases a pending reservation without recording a failure (called on success or abort).
 *
 * @param {string} ref - Normalized reference number
 */
export function releaseRefReservation(ref) {
  const now = Date.now()
  const entry = refAttempts.get(ref)
  if (!entry) return

  if (entry.pending > 0) {
    entry.pending -= 1
  }

  entry.failures = entry.failures.filter(t => now - t < REF_WINDOW_MS)
  if (entry.failures.length === 0 && entry.pending <= 0) {
    refAttempts.delete(ref)
  }
}

/**
 * Checks if a reference is currently throttled.
 *
 * @param {string} ref
 * @returns {boolean}
 */
export function isRefThrottled(ref) {
  const now = Date.now()
  const entry = getOrCleanRefEntry(ref, now)
  if (process.env.NODE_ENV === 'test' && !process.env.ENFORCE_REF_LIMIT) {
    return false
  }
  if (!entry) return false
  return (entry.failures.length + entry.pending) >= MAX_REF_ATTEMPTS
}

export function resetRefAttemptsForTest() {
  refAttempts.clear()
}

export function getRefMapSizeForTest() {
  return refAttempts.size
}

export function getRefEntryForTest(ref) {
  return refAttempts.get(ref)
}

export function setRefEntryForTest(ref, entry) {
  refAttempts.set(ref, entry)
}

export function sweepExpiredEntriesForTest(now = Date.now()) {
  sweepExpiredEntries(now)
}

export const VALID_CATEGORIES = ['manufacturer', 'distributor', 'wholesaler', 'pharmacy']

export const VALID_DOCUMENT_TYPES = [
  'DRUG_LICENSE',
  'TRADE_LICENSE',
  'MANUFACTURING_LICENSE',
  'WHOLESALE_LICENSE',
  'INCORPORATION_CERTIFICATE',
  'GMP_CERTIFICATE',
  'DGHS_FACILITY_GAZETTE',
  'OTHER'
]

/**
 * Creates a structured application error with HTTP status and code.
 */
function createError(statusCode, code, message) {
  const err = new Error(message)
  err.statusCode = statusCode
  err.code = code
  return err
}

/**
 * Retrieves dynamic category availability and remaining capacity limits
 * derived from live database policies and active production organizations.
 *
 * @returns {Promise<{ categories: Array<object> }>}
 */
export async function getCategoryAvailability() {
  const pool = getPool()

  // 1. Fetch all category policies
  const [policies] = await pool.query(
    `SELECT category, display_name, max_active_instances, is_registration_allowed 
     FROM category_policies 
     ORDER BY category ASC`
  )

  // 2. Fetch active production organization counts
  const [activeCounts] = await pool.query(
    `SELECT type AS category, COUNT(*) AS active_count 
     FROM organizations 
     WHERE status = 'active' AND data_environment = 'production' 
     GROUP BY type`
  )

  const activeMap = new Map()
  for (const row of activeCounts) {
    activeMap.set(row.category, Number(row.active_count))
  }

  // 3. Assemble availability status for each operational category
  const categories = policies.map((policy) => {
    const activeInstances = activeMap.get(policy.category) || 0
    const maxActive = policy.max_active_instances !== null ? Number(policy.max_active_instances) : null
    const isRegistrationAllowed = Boolean(policy.is_registration_allowed)

    const isCapacityAvailable = maxActive === null || activeInstances < maxActive
    const isAvailable = isRegistrationAllowed && isCapacityAvailable
    const remainingSlots = maxActive !== null ? Math.max(0, maxActive - activeInstances) : null

    const categoryItem = {
      category: policy.category,
      displayName: policy.display_name,
      maxActiveInstances: maxActive,
      activeInstances,
      isRegistrationAllowed,
      isAvailable,
      remainingSlots
    }

    if (policy.category === 'pharmacy') {
      categoryItem.allowedClassifications = ['GOVERNMENT', 'PRIVATE_COMMERCIAL']
    }

    return categoryItem
  })

  return { categories }
}

/**
 * Maps a file field or name to a valid registration_documents document_type ENUM.
 */
function resolveDocumentType(file, data, index, category, classification) {
  // Check fieldname directly (case-insensitive)
  if (file && file.fieldname) {
    const normalized = file.fieldname.trim().toUpperCase()
    if (VALID_DOCUMENT_TYPES.includes(normalized)) {
      return normalized
    }
  }

  // Check data.document_types array or object if provided
  if (data && data.document_types) {
    let candidate = null
    if (Array.isArray(data.document_types)) {
      candidate = data.document_types[index]
    } else if (typeof data.document_types === 'object') {
      candidate = data.document_types[file.fieldname]
    } else if (typeof data.document_types === 'string') {
      try {
        const parsed = JSON.parse(data.document_types)
        candidate = Array.isArray(parsed) ? parsed[index] : parsed[file.fieldname]
      } catch {
        candidate = data.document_types
      }
    }
    if (candidate && typeof candidate === 'string') {
      const candidateNorm = candidate.trim().toUpperCase()
      if (VALID_DOCUMENT_TYPES.includes(candidateNorm)) {
        return candidateNorm
      }
    }
  }

  // Check data.document_type if single string provided
  if (data && typeof data.document_type === 'string') {
    const dtNorm = data.document_type.trim().toUpperCase()
    if (VALID_DOCUMENT_TYPES.includes(dtNorm)) {
      return dtNorm
    }
  }

  // Default intelligently based on organization category and classification
  if (category === 'manufacturer') return 'MANUFACTURING_LICENSE'
  if (category === 'pharmacy') {
    return classification === 'GOVERNMENT' ? 'DGHS_FACILITY_GAZETTE' : 'DRUG_LICENSE'
  }
  if (category === 'wholesaler') return 'WHOLESALE_LICENSE'
  if (category === 'distributor') return 'DRUG_LICENSE'

  return 'OTHER'
}

/**
 * Validates and submits a new organization registration intake.
 * Enforces:
 * - Immediate rejection of any password collection attempt.
 * - Minimum one supporting document (PDF/JPEG/PNG <= 10MB).
 * - Exact category policies & capacity checks inside row-locked InnoDB transaction.
 * - Ephemeral 6-digit tracking PIN generation and bcrypt cost-12 hashing.
 * - Sequential REG-YYYY-XXXX reference generation.
 * - SHA-256 document hashing and persistence.
 * - Atomic cleanup of uploaded files on any transaction failure or rollback.
 *
 * @param {object} params
 * @param {object} params.data - Parsed multipart form fields
 * @param {Array<object>} params.files - Uploaded file descriptors
 * @returns {Promise<object>} Registration intake result
 */
export async function submitRegistration({ data = {}, files = [] }) {
  // 1. Mandatory Security Policy: Public registration MUST NOT collect passwords
  if (
    data.password !== undefined ||
    data.confirmPassword !== undefined ||
    data.confirm_password !== undefined
  ) {
    await cleanupFiles(files)
    throw createError(
      400,
      'PASSWORD_NOT_PERMITTED',
      'Passwords cannot be collected during organization registration. User accounts are created upon DGDA approval and activated via secure activation token.'
    )
  }

  // 2. Validate supporting verification documents presence
  if (!Array.isArray(files) || files.length === 0) {
    await cleanupFiles(files)
    throw createError(
      400,
      'DOCUMENTS_REQUIRED',
      'At least one supporting verification document (PDF, JPEG, or PNG) must be provided.'
    )
  }

  // 3. Validate Organization Category
  const category = typeof data.category === 'string' ? data.category.trim().toLowerCase() : ''
  if (!VALID_CATEGORIES.includes(category)) {
    await cleanupFiles(files)
    throw createError(
      400,
      'INVALID_CATEGORY',
      `Category must be one of: ${VALID_CATEGORIES.join(', ')}.`
    )
  }

  // 4. Validate Pharmacy Classification
  let pharmacyClassification = 'NOT_APPLICABLE'
  let dghsFacilityCode = null

  if (category === 'pharmacy') {
    const rawClass = typeof data.pharmacy_classification === 'string'
      ? data.pharmacy_classification.trim().toUpperCase()
      : ''
    if (!['GOVERNMENT', 'PRIVATE_COMMERCIAL'].includes(rawClass)) {
      await cleanupFiles(files)
      throw createError(
        400,
        'INVALID_PHARMACY_CLASSIFICATION',
        'Pharmacy registration requires pharmacy_classification to be either GOVERNMENT or PRIVATE_COMMERCIAL.'
      )
    }
    pharmacyClassification = rawClass

    if (pharmacyClassification === 'GOVERNMENT') {
      dghsFacilityCode = typeof data.dghs_facility_code === 'string' && data.dghs_facility_code.trim().length > 0
        ? data.dghs_facility_code.trim()
        : null
    }
  } else {
    // For non-pharmacy categories, pharmacy_classification must be NOT_APPLICABLE
    if (data.pharmacy_classification && data.pharmacy_classification !== 'NOT_APPLICABLE') {
      await cleanupFiles(files)
      throw createError(
        400,
        'INVALID_PHARMACY_CLASSIFICATION',
        'Pharmacy classification is only applicable for the pharmacy category.'
      )
    }
  }

  // 5. Validate Organization Legal Information
  const orgName = typeof data.org_name === 'string' ? data.org_name.trim() : ''
  if (orgName.length < 2 || orgName.length > 255) {
    await cleanupFiles(files)
    throw createError(400, 'INVALID_ORG_NAME', 'Organization name is required (2–255 characters).')
  }

  const licenseNumber = typeof data.license_number === 'string' ? data.license_number.trim() : ''
  if (licenseNumber.length < 2 || licenseNumber.length > 128) {
    await cleanupFiles(files)
    throw createError(400, 'INVALID_LICENSE_NUMBER', 'License number is required (2–128 characters).')
  }

  const address = typeof data.address === 'string' ? data.address.trim() : ''
  if (address.length < 5) {
    await cleanupFiles(files)
    throw createError(400, 'INVALID_ADDRESS', 'Organization address is required (minimum 5 characters).')
  }

  // 6. Validate Authorized Contact Information
  const contactName = typeof data.contact_name === 'string' ? data.contact_name.trim() : ''
  if (contactName.length < 2 || contactName.length > 128) {
    await cleanupFiles(files)
    throw createError(400, 'INVALID_CONTACT_NAME', 'Contact person name is required (2–128 characters).')
  }

  const rawEmail = typeof data.contact_email === 'string' ? data.contact_email.trim().toLowerCase() : ''
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(rawEmail) || rawEmail.length > 128) {
    await cleanupFiles(files)
    throw createError(400, 'INVALID_CONTACT_EMAIL', 'A valid contact email address is required.')
  }
  const contactEmail = rawEmail

  const contactPhone = typeof data.contact_phone === 'string' ? data.contact_phone.trim() : ''
  if (contactPhone.length < 6 || contactPhone.length > 32) {
    await cleanupFiles(files)
    throw createError(400, 'INVALID_CONTACT_PHONE', 'A valid contact phone number is required (6–32 characters).')
  }

  const applicantNote = typeof data.applicant_note === 'string' && data.applicant_note.trim().length > 0
    ? data.applicant_note.trim().slice(0, 2000)
    : null

  // 7. Execute Atomic Intake Transaction
  const pool = getPool()
  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()

    // 7.1 Verify category registration policy with exclusive row lock
    const [policyRows] = await connection.query(
      `SELECT category, display_name, max_active_instances, is_registration_allowed 
       FROM category_policies 
       WHERE category = ? 
       FOR UPDATE`,
      [category]
    )

    if (policyRows.length === 0) {
      throw createError(400, 'INVALID_CATEGORY', 'Organization category does not exist in policy catalog.')
    }

    const policy = policyRows[0]

    if (!policy.is_registration_allowed) {
      throw createError(
        409,
        'REGISTRATION_CLOSED',
        `Registration is currently closed for category: ${policy.display_name}.`
      )
    }

    // 7.2 Enforce active production capacity limits with row-level locking
    if (policy.max_active_instances !== null) {
      const [orgCountRows] = await connection.query(
        `SELECT COUNT(*) AS active_count 
         FROM organizations 
         WHERE type = ? AND status = 'active' AND data_environment = 'production' 
         FOR UPDATE`,
        [category]
      )

      const activeCount = Number(orgCountRows[0].active_count)
      if (activeCount >= policy.max_active_instances) {
        logger.warn('Registration rejected: capacity reached', {
          category,
          activeCount,
          maxAllowed: policy.max_active_instances
        })
        throw createError(
          409,
          'CAPACITY_REACHED',
          `Registration for ${policy.display_name} is currently closed due to capacity limits. The maximum active production limit (${policy.max_active_instances}) has been reached.`
        )
      }
    }

    // 7.3 Generate unique sequential reference number
    const referenceNumber = await generateReferenceNumber(connection)

    // 7.4 Generate ephemeral 6-digit tracking PIN and hash with bcrypt cost 12
    const rawTrackingPin = generateTrackingPin()
    const trackingPinHash = await hashTrackingPin(rawTrackingPin)

    // 7.5 Create organization registration record
    const registrationId = `reg-${crypto.randomUUID()}`

    await connection.query(
      `INSERT INTO organization_registrations (
        id,
        reference_number,
        tracking_pin_hash,
        category,
        pharmacy_classification,
        dghs_facility_code,
        org_name,
        license_number,
        address,
        contact_name,
        contact_email,
        contact_phone,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED')`,
      [
        registrationId,
        referenceNumber,
        trackingPinHash,
        category,
        pharmacyClassification,
        dghsFacilityCode,
        orgName,
        licenseNumber,
        address,
        contactName,
        contactEmail,
        contactPhone
      ]
    )

    // 7.6 Process uploaded documents and record metadata + SHA-256 hashes
    const documentSnapshots = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const docId = `doc-${crypto.randomUUID()}`
      const docType = resolveDocumentType(file, data, i, category, pharmacyClassification)
      const sha256Hash = await computeFileHash(file.path)

      await connection.query(
        `INSERT INTO registration_documents (
          id,
          registration_id,
          submission_version,
          document_type,
          original_name,
          stored_filename,
          stored_path,
          file_size_bytes,
          mime_type
        ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)`,
        [
          docId,
          registrationId,
          docType,
          file.originalname,
          file.filename,
          file.path,
          file.size,
          file.mimetype
        ]
      )

      documentSnapshots.push({
        id: docId,
        document_type: docType,
        original_name: file.originalname,
        stored_filename: file.filename,
        file_size_bytes: file.size,
        mime_type: file.mimetype,
        sha256_hash: sha256Hash
      })
    }

    // 7.7 Persist versioned submission snapshot in registration_submissions
    const submissionId = `sub-${crypto.randomUUID()}`
    const submissionData = {
      reference_number: referenceNumber,
      category,
      pharmacy_classification: pharmacyClassification,
      dghs_facility_code: dghsFacilityCode,
      org_name: orgName,
      license_number: licenseNumber,
      address,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      applicant_note: applicantNote,
      documents: documentSnapshots,
      submitted_at: new Date().toISOString()
    }

    await connection.query(
      `INSERT INTO registration_submissions (
        id,
        registration_id,
        version,
        submitted_data,
        applicant_note
      ) VALUES (?, ?, 1, ?, ?)`,
      [
        submissionId,
        registrationId,
        JSON.stringify(submissionData),
        applicantNote
      ]
    )

    // 7.8 Record audit log entry
    await connection.query(
      `INSERT INTO registration_audit_log (
        registration_id,
        actor_user_id,
        actor_role,
        from_status,
        to_status,
        action_type,
        comment
      ) VALUES (?, NULL, 'APPLICANT', NULL, 'SUBMITTED', 'REGISTRATION_SUBMITTED', 'Initial organization registration submission.')`,
      [registrationId]
    )

    // 7.9 Commit transaction
    await connection.commit()

    logger.info('Organization registration successfully created', {
      registrationId,
      referenceNumber,
      category,
      orgName
    })

    return {
      registrationId,
      referenceNumber,
      trackingPin: rawTrackingPin,
      category,
      pharmacyClassification,
      orgName,
      contactEmail,
      status: 'SUBMITTED',
      documentsCount: files.length,
      createdAt: new Date().toISOString()
    }
  } catch (err) {
    await connection.rollback()
    await cleanupFiles(files)
    throw err
  } finally {
    connection.release()
  }
}

/**
 * Tracks registration application status by reference number and tracking PIN.
 * Implements constant-time dummy bcrypt comparison for non-existent references
 * to mitigate enumeration timing attacks. Excludes internal reviewer identifiers.
 *
 * @param {object} params
 * @param {string} params.referenceNumber
 * @param {string} params.trackingPin
 * @returns {Promise<object>} Sanitized tracking information
 */
export async function trackRegistration({ referenceNumber, trackingPin }) {
  if (!referenceNumber || typeof referenceNumber !== 'string') {
    throw createError(400, 'VALIDATION_ERROR', 'Registration reference number is required.')
  }

  const normRef = referenceNumber.trim().toUpperCase()

  const pinValidation = validateTrackingPin(trackingPin)
  if (!pinValidation.valid) {
    throw createError(400, 'INVALID_PIN_FORMAT', pinValidation.error)
  }

  // Atomically reserve attempt slot accounting for concurrent in-flight requests
  const canAttempt = reserveRefAttempt(normRef)
  if (!canAttempt) {
    throw createError(
      429,
      'RATE_LIMIT_EXCEEDED',
      'Too many tracking attempts for this registration reference. Please try again after 15 minutes.'
    )
  }

  let attemptResolved = false

  try {
    const pool = getPool()
    const [candidates] = await pool.query(
      `SELECT id, reference_number, tracking_pin_hash, category, pharmacy_classification,
              org_name, contact_email, status, review_notes, rejection_reason, rejection_explanation,
              created_at, updated_at
       FROM organization_registrations
       WHERE reference_number = ?`,
      [normRef]
    )

    const candidate = candidates.length > 0 ? candidates[0] : null

    // If registration does not exist, run genuine cost-12 dummy bcrypt comparison to preserve constant time
    if (!candidate) {
      await compareConstantTime(trackingPin, null)
      recordRefFailure(normRef)
      attemptResolved = true
      throw createError(401, 'INVALID_CREDENTIALS', 'Invalid registration reference number or tracking PIN.')
    }

    const isPinMatch = await compareTrackingPin(trackingPin, candidate.tracking_pin_hash)
    if (!isPinMatch) {
      recordRefFailure(normRef)
      attemptResolved = true
      throw createError(401, 'INVALID_CREDENTIALS', 'Invalid registration reference number or tracking PIN.')
    }

    // Success: release reservation without recording a failure
    releaseRefReservation(normRef)
    attemptResolved = true

    // Fetch current submission version and total documents count
  const [versionRows] = await pool.query(
    `SELECT COALESCE(MAX(version), 1) AS current_version
     FROM registration_submissions
     WHERE registration_id = ?`,
    [candidate.id]
  )

  const [docRows] = await pool.query(
    `SELECT COUNT(*) AS doc_count
     FROM registration_documents
     WHERE registration_id = ?`,
    [candidate.id]
  )

  const isInformationRequested = candidate.status === 'INFORMATION_REQUESTED'

  return {
    referenceNumber: candidate.reference_number,
    status: candidate.status,
    category: candidate.category,
    orgName: candidate.org_name,
    pharmacyClassification: candidate.pharmacy_classification,
    contactEmail: candidate.contact_email,
    currentVersion: Number(versionRows[0]?.current_version || 1),
    documentsCount: Number(docRows[0]?.doc_count || 0),
    canResubmit: isInformationRequested,
    reviewNotes: isInformationRequested ? candidate.review_notes : null,
    rejectionReason: candidate.status === 'REJECTED' ? candidate.rejection_reason : null,
    submittedAt: candidate.created_at,
    updatedAt: candidate.updated_at
  }
} finally {
  if (!attemptResolved) {
    releaseRefReservation(normRef)
  }
}
}

/**
 * Validates a single-use registration access token without consuming it.
 * Verification confirms token validity and grants access to dossier review details.
 *
 * @param {string} rawToken
 * @returns {Promise<object>} Token verification result
 */
export async function verifyRegistrationAccessToken(rawToken) {
  if (!validateTokenFormat(rawToken)) {
    throw createError(400, 'INVALID_TOKEN', 'A valid 64-character access token is required.')
  }

  const tokenHash = hashToken(rawToken)
  const pool = getPool()

  const [tokenRows] = await pool.query(
    `SELECT rat.id, rat.registration_id, rat.expires_at, rat.used, rat.revoked,
            reg.reference_number, reg.category, reg.org_name, reg.status, reg.review_notes,
            reg.pharmacy_classification, reg.license_number, reg.address,
            reg.contact_name, reg.contact_email, reg.contact_phone, reg.dghs_facility_code
     FROM registration_access_tokens rat
     JOIN organization_registrations reg ON reg.id = rat.registration_id
     WHERE rat.token_hash = ?`,
    [tokenHash]
  )

  if (tokenRows.length === 0) {
    throw createError(404, 'TOKEN_NOT_FOUND', 'Access token not found or invalid.')
  }

  const tokenRecord = tokenRows[0]

  if (tokenRecord.revoked) {
    throw createError(403, 'TOKEN_REVOKED', 'This access token has been revoked.')
  }

  if (tokenRecord.used) {
    throw createError(403, 'TOKEN_ALREADY_USED', 'This single-use access token has already been used.')
  }

  const isExpired = new Date(tokenRecord.expires_at).getTime() < Date.now()
  if (isExpired) {
    throw createError(403, 'TOKEN_EXPIRED', 'This access token has expired.')
  }

  if (tokenRecord.status !== 'INFORMATION_REQUESTED') {
    throw createError(
      409,
      'INVALID_STATE',
      `Application is not currently open for information updates. Current status: ${tokenRecord.status}.`
    )
  }

  const [versionRows] = await pool.query(
    `SELECT COALESCE(MAX(version), 1) AS current_version
     FROM registration_submissions
     WHERE registration_id = ?`,
    [tokenRecord.registration_id]
  )

  return {
    valid: true,
    referenceNumber: tokenRecord.reference_number,
    status: tokenRecord.status,
    category: tokenRecord.category,
    orgName: tokenRecord.org_name,
    pharmacyClassification: tokenRecord.pharmacy_classification,
    currentVersion: Number(versionRows[0]?.current_version || 1),
    reviewNotes: tokenRecord.review_notes,
    expiresAt: tokenRecord.expires_at
  }
}

/**
 * Handles applicant resubmission for applications in INFORMATION_REQUESTED status.
 * Atomically increments submission_version, records new documents with their SHA-256 digests,
 * preserves historical submissions, consumes the single-use token (if token-authenticated),
 * transitions status to UNDER_REVIEW, and writes to registration_audit_log.
 *
 * @param {object} params
 * @param {object} params.auth - Authentication credentials ({ referenceNumber, trackingPin, token })
 * @param {object} params.data - Multipart form data fields
 * @param {Array<object>} params.files - Newly uploaded verification documents
 * @returns {Promise<object>} Resubmission outcome
 */
export async function resubmitRegistration({ auth = {}, data = {}, files = [] }) {
  const hasPinAuth = Boolean(auth.referenceNumber && auth.trackingPin)
  const hasTokenAuth = Boolean(auth.token)

  if (!hasPinAuth && !hasTokenAuth) {
    await cleanupFiles(files)
    throw createError(
      401,
      'AUTHENTICATION_REQUIRED',
      'Authentication required: provide either reference number with tracking PIN, or an access token.'
    )
  }

  if (hasPinAuth && hasTokenAuth) {
    await cleanupFiles(files)
    throw createError(
      400,
      'AMBIGUOUS_AUTHENTICATION',
      'Ambiguous authentication: provide either reference number with tracking PIN, or an access token, not both.'
    )
  }

  if (hasPinAuth) {
    if (typeof auth.referenceNumber !== 'string' || typeof auth.trackingPin !== 'string') {
      await cleanupFiles(files)
      throw createError(400, 'INVALID_INPUT_TYPE', 'Reference number and tracking PIN must be strings.')
    }
    const pinValidation = validateTrackingPin(auth.trackingPin)
    if (!pinValidation.valid) {
      await cleanupFiles(files)
      throw createError(400, 'INVALID_PIN_FORMAT', pinValidation.error)
    }
  }

  if (hasTokenAuth) {
    if (typeof auth.token !== 'string') {
      await cleanupFiles(files)
      throw createError(400, 'INVALID_INPUT_TYPE', 'Access token must be a string.')
    }
    if (!validateTokenFormat(auth.token)) {
      await cleanupFiles(files)
      throw createError(400, 'INVALID_TOKEN', 'A valid 64-character access token is required.')
    }
  }

  // Reject password collection attempts
  if (
    data.password !== undefined ||
    data.confirmPassword !== undefined ||
    data.confirm_password !== undefined
  ) {
    await cleanupFiles(files)
    throw createError(
      400,
      'PASSWORD_NOT_PERMITTED',
      'Passwords cannot be collected during organization registration.'
    )
  }

  const pool = getPool()
  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()

    let reg = null
    let tokenIdToConsume = null

    // 1. Authenticate and acquire exclusive row lock
    if (hasTokenAuth) {
      const tokenHash = hashToken(auth.token)
      const [tokenRows] = await connection.query(
        `SELECT rat.id, rat.registration_id, rat.expires_at, rat.used, rat.revoked
         FROM registration_access_tokens rat
         WHERE rat.token_hash = ?
         FOR UPDATE`,
        [tokenHash]
      )

      if (tokenRows.length === 0) {
        throw createError(404, 'TOKEN_NOT_FOUND', 'Access token not found or invalid.')
      }

      const tokenRecord = tokenRows[0]
      if (tokenRecord.revoked) {
        throw createError(403, 'TOKEN_REVOKED', 'This access token has been revoked.')
      }
      if (tokenRecord.used) {
        throw createError(403, 'TOKEN_ALREADY_USED', 'This single-use access token has already been used.')
      }
      if (new Date(tokenRecord.expires_at).getTime() < Date.now()) {
        throw createError(403, 'TOKEN_EXPIRED', 'This access token has expired.')
      }

      tokenIdToConsume = tokenRecord.id

      const [regRows] = await connection.query(
        `SELECT * FROM organization_registrations WHERE id = ? FOR UPDATE`,
        [tokenRecord.registration_id]
      )
      if (regRows.length === 0) {
        throw createError(404, 'REGISTRATION_NOT_FOUND', 'Associated registration record was not found.')
      }
      reg = regRows[0]
    } else {
      const normRef = auth.referenceNumber.trim().toUpperCase()

      const canAttempt = reserveRefAttempt(normRef)
      if (!canAttempt) {
        throw createError(
          429,
          'RATE_LIMIT_EXCEEDED',
          'Too many resubmission attempts for this registration reference. Please try again after 15 minutes.'
        )
      }

      let attemptResolved = false

      try {
        const [regRows] = await connection.query(
          `SELECT * FROM organization_registrations WHERE reference_number = ? FOR UPDATE`,
          [normRef]
        )

        if (regRows.length === 0) {
          await compareConstantTime(auth.trackingPin, null)
          recordRefFailure(normRef)
          attemptResolved = true
          throw createError(401, 'INVALID_CREDENTIALS', 'Invalid registration reference number or tracking PIN.')
        }

        reg = regRows[0]
        const isPinMatch = await compareTrackingPin(auth.trackingPin, reg.tracking_pin_hash)
        if (!isPinMatch) {
          recordRefFailure(normRef)
          attemptResolved = true
          throw createError(401, 'INVALID_CREDENTIALS', 'Invalid registration reference number or tracking PIN.')
        }

        releaseRefReservation(normRef)
        attemptResolved = true
      } finally {
        if (!attemptResolved) {
          releaseRefReservation(normRef)
        }
      }
    }

    // 2. Strict State-Machine Check
    if (reg.status !== 'INFORMATION_REQUESTED') {
      throw createError(
        409,
        'INVALID_STATE',
        `Application is not currently open for resubmission. Current status: ${reg.status}.`
      )
    }

    // 3. Immutability Guards: Forbid altering statutory category or reference
    if (data.category !== undefined) {
      if (typeof data.category !== 'string') {
        throw createError(400, 'INVALID_INPUT_TYPE', 'Category must be a single string.')
      }
      if (data.category.trim().toLowerCase() !== reg.category) {
        throw createError(400, 'IMMUTABLE_FIELD', 'Organization category cannot be altered during resubmission.')
      }
    }

    if (data.pharmacy_classification !== undefined) {
      if (typeof data.pharmacy_classification !== 'string') {
        throw createError(400, 'INVALID_INPUT_TYPE', 'Pharmacy classification must be a single string.')
      }
      if (data.pharmacy_classification.trim().toUpperCase() !== reg.pharmacy_classification) {
        throw createError(400, 'IMMUTABLE_FIELD', 'Pharmacy classification cannot be altered during resubmission.')
      }
    }

    if (data.reference_number !== undefined) {
      if (typeof data.reference_number !== 'string') {
        throw createError(400, 'INVALID_INPUT_TYPE', 'Reference number must be a single string.')
      }
      if (data.reference_number.trim().toUpperCase() !== reg.reference_number) {
        throw createError(400, 'IMMUTABLE_FIELD', 'Registration reference number is immutable.')
      }
    }

    // 4. Validate mutable fields with explicit scalar type checks
    let updatedOrgName = reg.org_name
    if (data.org_name !== undefined) {
      if (typeof data.org_name !== 'string') {
        throw createError(400, 'INVALID_INPUT_TYPE', 'Organization name must be a single string.')
      }
      const trimmed = data.org_name.trim()
      if (trimmed.length < 2 || trimmed.length > 255) {
        throw createError(400, 'INVALID_ORG_NAME', 'Organization name must be 2–255 characters.')
      }
      updatedOrgName = trimmed
    }

    let updatedLicense = reg.license_number
    if (data.license_number !== undefined) {
      if (typeof data.license_number !== 'string') {
        throw createError(400, 'INVALID_INPUT_TYPE', 'License number must be a single string.')
      }
      const trimmed = data.license_number.trim()
      if (trimmed.length < 2 || trimmed.length > 128) {
        throw createError(400, 'INVALID_LICENSE_NUMBER', 'License number must be 2–128 characters.')
      }
      updatedLicense = trimmed
    }

    let updatedAddress = reg.address
    if (data.address !== undefined) {
      if (typeof data.address !== 'string') {
        throw createError(400, 'INVALID_INPUT_TYPE', 'Organization address must be a single string.')
      }
      const trimmed = data.address.trim()
      if (trimmed.length < 5) {
        throw createError(400, 'INVALID_ADDRESS', 'Organization address must be at least 5 characters.')
      }
      updatedAddress = trimmed
    }

    let updatedContactName = reg.contact_name
    if (data.contact_name !== undefined) {
      if (typeof data.contact_name !== 'string') {
        throw createError(400, 'INVALID_INPUT_TYPE', 'Contact person name must be a single string.')
      }
      const trimmed = data.contact_name.trim()
      if (trimmed.length < 2 || trimmed.length > 128) {
        throw createError(400, 'INVALID_CONTACT_NAME', 'Contact person name must be 2–128 characters.')
      }
      updatedContactName = trimmed
    }

    let updatedContactEmail = reg.contact_email
    if (data.contact_email !== undefined) {
      if (typeof data.contact_email !== 'string') {
        throw createError(400, 'INVALID_INPUT_TYPE', 'Contact email must be a single string.')
      }
      const trimmed = data.contact_email.trim().toLowerCase()
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(trimmed) || trimmed.length > 128) {
        throw createError(400, 'INVALID_CONTACT_EMAIL', 'A valid contact email address is required.')
      }
      updatedContactEmail = trimmed
    }

    let updatedContactPhone = reg.contact_phone
    if (data.contact_phone !== undefined) {
      if (typeof data.contact_phone !== 'string') {
        throw createError(400, 'INVALID_INPUT_TYPE', 'Contact phone number must be a single string.')
      }
      const trimmed = data.contact_phone.trim()
      if (trimmed.length < 6 || trimmed.length > 32) {
        throw createError(400, 'INVALID_CONTACT_PHONE', 'A valid contact phone number is required (6–32 characters).')
      }
      updatedContactPhone = trimmed
    }

    let updatedDghsCode = reg.dghs_facility_code
    if (reg.category === 'pharmacy' && reg.pharmacy_classification === 'GOVERNMENT') {
      if (data.dghs_facility_code !== undefined) {
        if (typeof data.dghs_facility_code !== 'string') {
          throw createError(400, 'INVALID_INPUT_TYPE', 'DGHS facility code must be a single string.')
        }
        updatedDghsCode = data.dghs_facility_code.trim().length > 0
          ? data.dghs_facility_code.trim()
          : null
      }
    } else if (data.dghs_facility_code !== undefined && data.dghs_facility_code !== null) {
      if (typeof data.dghs_facility_code !== 'string') {
        throw createError(400, 'INVALID_INPUT_TYPE', 'DGHS facility code must be a single string.')
      }
    }

    let applicantNote = null
    if (data.applicant_note !== undefined) {
      if (typeof data.applicant_note !== 'string') {
        throw createError(400, 'INVALID_INPUT_TYPE', 'Applicant note must be a single string.')
      }
      const trimmed = data.applicant_note.trim()
      applicantNote = trimmed.length > 0 ? trimmed.slice(0, 2000) : null
    }

    // 5. Compute next sequential submission version
    const [maxVersionRows] = await connection.query(
      `SELECT COALESCE(MAX(version), 1) AS max_version
       FROM registration_submissions
       WHERE registration_id = ?
       FOR UPDATE`,
      [reg.id]
    )
    const nextVersion = Number(maxVersionRows[0]?.max_version || 1) + 1

    // 6. Process and persist newly uploaded documents under nextVersion
    const newDocumentSnapshots = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const docId = `doc-${crypto.randomUUID()}`
      const docType = resolveDocumentType(file, data, i, reg.category, reg.pharmacy_classification)
      const sha256Hash = await computeFileHash(file.path)

      await connection.query(
        `INSERT INTO registration_documents (
          id, registration_id, submission_version, document_type,
          original_name, stored_filename, stored_path, file_size_bytes, mime_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          docId,
          reg.id,
          nextVersion,
          docType,
          file.originalname,
          file.filename,
          file.path,
          file.size,
          file.mimetype
        ]
      )

      newDocumentSnapshots.push({
        id: docId,
        submission_version: nextVersion,
        document_type: docType,
        original_name: file.originalname,
        stored_filename: file.filename,
        file_size_bytes: file.size,
        mime_type: file.mimetype,
        sha256_hash: sha256Hash
      })
    }

    // 7. Retain historical documents in the new version snapshot
    const [historicalDocRows] = await connection.query(
      `SELECT id, submission_version, document_type, original_name, stored_filename, file_size_bytes, mime_type
       FROM registration_documents
       WHERE registration_id = ? AND submission_version < ?
       ORDER BY uploaded_at ASC`,
      [reg.id, nextVersion]
    )

    const retainedDocs = historicalDocRows.map(doc => ({
      id: doc.id,
      submission_version: doc.submission_version,
      document_type: doc.document_type,
      original_name: doc.original_name,
      stored_filename: doc.stored_filename,
      file_size_bytes: doc.file_size_bytes,
      mime_type: doc.mime_type,
      retained: true
    }))

    // 8. Insert new immutable version snapshot into registration_submissions
    const submissionId = `sub-${crypto.randomUUID()}`
    const submissionSnapshot = {
      reference_number: reg.reference_number,
      category: reg.category,
      pharmacy_classification: reg.pharmacy_classification,
      dghs_facility_code: updatedDghsCode,
      org_name: updatedOrgName,
      license_number: updatedLicense,
      address: updatedAddress,
      contact_name: updatedContactName,
      contact_email: updatedContactEmail,
      contact_phone: updatedContactPhone,
      applicant_note: applicantNote,
      documents: [...retainedDocs, ...newDocumentSnapshots],
      submission_version: nextVersion,
      submitted_at: new Date().toISOString()
    }

    await connection.query(
      `INSERT INTO registration_submissions (
        id, registration_id, version, submitted_data, applicant_note
      ) VALUES (?, ?, ?, ?, ?)`,
      [
        submissionId,
        reg.id,
        nextVersion,
        JSON.stringify(submissionSnapshot),
        applicantNote
      ]
    )

    // 9. Update registration record and transition to UNDER_REVIEW
    await connection.query(
      `UPDATE organization_registrations
       SET org_name = ?,
           license_number = ?,
           address = ?,
           contact_name = ?,
           contact_email = ?,
           contact_phone = ?,
           dghs_facility_code = ?,
           status = 'UNDER_REVIEW',
           updated_at = NOW()
       WHERE id = ?`,
      [
        updatedOrgName,
        updatedLicense,
        updatedAddress,
        updatedContactName,
        updatedContactEmail,
        updatedContactPhone,
        updatedDghsCode,
        reg.id
      ]
    )

    // 10. Consume the access token if token authentication was used
    if (tokenIdToConsume) {
      await connection.query(
        `UPDATE registration_access_tokens
         SET used = 1
         WHERE id = ?`,
        [tokenIdToConsume]
      )
    }

    // 11. Record transition in registration_audit_log
    const auditComment = applicantNote
      ? `Applicant resubmitted documentation (v${nextVersion}): ${applicantNote}`
      : `Applicant resubmitted documentation (version ${nextVersion}).`

    await connection.query(
      `INSERT INTO registration_audit_log (
        registration_id, actor_user_id, actor_role, from_status,
        to_status, action_type, comment
      ) VALUES (?, NULL, 'APPLICANT', 'INFORMATION_REQUESTED', 'UNDER_REVIEW', 'INFORMATION_RESUBMITTED', ?)`,
      [reg.id, auditComment]
    )

    await connection.commit()

    logger.info('Organization registration successfully resubmitted', {
      registrationId: reg.id,
      referenceNumber: reg.reference_number,
      version: nextVersion,
      documentsCount: newDocumentSnapshots.length
    })

    return {
      referenceNumber: reg.reference_number,
      status: 'UNDER_REVIEW',
      submissionVersion: nextVersion,
      documentsCount: newDocumentSnapshots.length,
      updatedAt: new Date().toISOString()
    }
  } catch (err) {
    await connection.rollback()
    await cleanupFiles(files)
    throw err
  } finally {
    connection.release()
  }
}
