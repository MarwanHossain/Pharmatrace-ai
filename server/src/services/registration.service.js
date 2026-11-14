// PharmaTrace AI — Registration Service
// Implements Revision 3.2 Dynamic Capacity Engine & Public Registration Intake
import crypto from 'crypto'
import { getPool } from '../config/database.js'
import {
  generateTrackingPin,
  generateReferenceNumber,
  hashTrackingPin
} from '../utils/reference.js'
import { computeFileHash, cleanupFiles } from '../middleware/upload.js'
import { logger } from '../utils/logger.js'

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
