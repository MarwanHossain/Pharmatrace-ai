// PharmaTrace AI — Manufacturer Package Serialization Service
// Implements secure MariaDB transaction-backed package serialization, GS1 DataMatrix & QR codes
import { getPool, execute } from '../config/database.js'
import {
  buildGs1DataMatrixPayload,
  generateGs1DataMatrixSvg,
  generateQrCodeSvg,
  buildCanonicalVerificationUrl
} from '../utils/datamatrix.js'
import { logger } from '../utils/logger.js'

export class PackageServiceError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message)
    this.name = 'PackageServiceError'
    this.code = code
    this.statusCode = statusCode
  }
}

/**
 * Serializes a specified quantity of packages for a QA-released batch.
 * Operates in a strict MariaDB transaction with pessimistic row-locking (`FOR UPDATE`)
 * to prevent over-serialization under high concurrency.
 *
 * @param {string} manufacturerOrgId
 * @param {string} batchId
 * @param {object} params
 * @param {number} params.quantity - Positive integer
 * @param {string} [params.allocationType='COMMERCIAL'] - 'COMMERCIAL' | 'GOVERNMENT'
 * @param {object} [params.user] - Authenticated user initiating serialization
 * @param {string} [params.appBaseUrl]
 * @returns {Promise<object>}
 */
export async function serializeBatch(manufacturerOrgId, batchId, params = {}) {
  if (!manufacturerOrgId) {
    throw new PackageServiceError('UNAUTHORIZED_ORG', 'Manufacturer organization ID required.', 401)
  }

  const rawQty = params.quantity
  if (rawQty === undefined || rawQty === null || typeof rawQty === 'boolean') {
    throw new PackageServiceError('INVALID_QUANTITY', 'Serialization quantity must be a positive whole number.')
  }
  const qty = Number(rawQty)
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new PackageServiceError('INVALID_QUANTITY', 'Serialization quantity must be a positive whole number greater than zero.')
  }

  const rawAllocation = String(params.allocationType || 'COMMERCIAL').toUpperCase().trim()
  if (rawAllocation !== 'COMMERCIAL' && rawAllocation !== 'GOVERNMENT') {
    throw new PackageServiceError('INVALID_ALLOCATION_TYPE', 'Allocation type must be either "COMMERCIAL" or "GOVERNMENT".')
  }

  const pool = getPool()
  const conn = await pool.getConnection()

  try {
    await conn.beginTransaction()

    // 1. Lock batch row FOR UPDATE to ensure serialized count and capacity are concurrency-safe
    const [batchRows] = await conn.query(
      `SELECT 
        b.id,
        b.batch_no,
        b.product_id,
        b.manufacturer_id,
        DATE_FORMAT(b.mfd, '%Y-%m-%d') AS mfd,
        DATE_FORMAT(b.exp, '%Y-%m-%d') AS exp,
        b.quantity,
        b.release_status,
        p.name AS product_name,
        p.generic_name,
        p.strength,
        p.dosage_form,
        p.pack_size,
        p.gtin
      FROM batches b
      JOIN products p ON b.product_id = p.id
      WHERE b.id = ? AND b.manufacturer_id = ?
      FOR UPDATE`,
      [batchId, manufacturerOrgId]
    )

    if (batchRows.length === 0) {
      throw new PackageServiceError('BATCH_NOT_FOUND', 'Specified batch not found or does not belong to your organization.', 404)
    }

    const batch = batchRows[0]

    // 2. Strict QA Release Enforcement
    if (batch.release_status !== 'Released') {
      throw new PackageServiceError(
        'BATCH_NOT_RELEASED',
        `Batch ${batch.batch_no} is currently "${batch.release_status}" and cannot be serialized until authorized QA release.`,
        400
      )
    }

    // 3. Expiry date check
    const todayStr = new Date().toISOString().slice(0, 10)
    if (batch.exp <= todayStr) {
      throw new PackageServiceError('BATCH_EXPIRED', `Batch ${batch.batch_no} expired on ${batch.exp} and cannot be serialized.`, 400)
    }

    // 4. Count existing packages for this batch
    const [countRows] = await conn.query(
      'SELECT COUNT(*) as serialized_count FROM packages WHERE batch_id = ?',
      [batchId]
    )
    const currentCount = Number(countRows[0]?.serialized_count || 0)
    const remaining = batch.quantity - currentCount

    if (remaining <= 0) {
      throw new PackageServiceError(
        'BATCH_MAX_CAPACITY_REACHED',
        `Batch ${batch.batch_no} has reached its maximum quantity limit (${batch.quantity} packages).`,
        400
      )
    }

    if (qty > remaining) {
      throw new PackageServiceError(
        'REQUESTED_QUANTITY_EXCEEDS_REMAINING',
        `Only ${remaining} packages remain for batch ${batch.batch_no} (requested ${qty}).`,
        400
      )
    }

    // 5. Query existing serial numbers to identify highest sequence index and avoid gaps/collisions
    const [existingSerialsRows] = await conn.query(
      'SELECT serial FROM packages WHERE batch_id = ?',
      [batchId]
    )
    const existingSerialSet = new Set(existingSerialsRows.map(r => r.serial))

    // Parse max sequence from existing serials (Format: SN-<batchNo>-<00000>)
    let maxSeq = 0
    const seqRegex = new RegExp(`^SN-${batch.batch_no}-(\\d+)$`)
    for (const s of existingSerialSet) {
      const match = s.match(seqRegex)
      if (match) {
        const val = parseInt(match[1], 10)
        if (val > maxSeq) maxSeq = val
      }
    }

    const added = []
    let candidate = maxSeq + 1

    while (added.length < qty && candidate <= batch.quantity + 10000) {
      const serial = `SN-${batch.batch_no}-${String(candidate).padStart(5, '0')}`
      if (!existingSerialSet.has(serial)) {
        existingSerialSet.add(serial)
        added.push(serial)
      }
      candidate += 1
    }

    if (added.length < qty) {
      throw new PackageServiceError('SERIALIZATION_ALLOCATION_FAILED', `Unable to allocate ${qty} unique serial numbers for batch ${batch.batch_no}.`, 500)
    }

    // 6. Bulk Insert into `packages` table
    const packageValues = added.map(serial => [
      serial,
      batch.id,
      manufacturerOrgId,
      rawAllocation,
      manufacturerOrgId, // Initial custodian is manufacturer
      'available',
      0 // verify_count starts at 0
    ])

    const placeholders = packageValues.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ')
    const flatPackageParams = packageValues.flat()

    await conn.query(
      `INSERT INTO packages (
        serial,
        batch_id,
        manufacturer_org_id,
        allocation_type,
        custodian_org_id,
        status,
        verify_count
      ) VALUES ${placeholders}`,
      flatPackageParams
    )

    // 7. Bulk Insert initial `traceability_events`
    const actorUserId = params.user?.id || null
    const eventPayload = JSON.stringify({
      action: 'PACKAGE_SERIALIZED',
      batchNo: batch.batch_no,
      productId: batch.product_id,
      productName: batch.product_name,
      allocationType: rawAllocation,
      mfd: batch.mfd,
      exp: batch.exp
    })

    const eventValues = added.map(serial => [
      serial,
      'PACKAGE_SERIALIZED',
      actorUserId,
      manufacturerOrgId,
      eventPayload
    ])

    const eventPlaceholders = eventValues.map(() => '(?, ?, ?, ?, ?)').join(', ')
    const flatEventParams = eventValues.flat()

    await conn.query(
      `INSERT INTO traceability_events (
        serial,
        event_type,
        actor_user_id,
        actor_org_id,
        event_payload
      ) VALUES ${eventPlaceholders}`,
      flatEventParams
    )

    await conn.commit()

    logger.info('Batch successfully serialized', {
      batchId,
      batchNo: batch.batch_no,
      quantitySerialized: added.length,
      newTotalSerialized: currentCount + added.length,
      remainingCapacity: remaining - added.length,
      manufacturerOrgId
    })

    // 8. Construct response records with GS1 DataMatrix & QR metadata
    const packageRecords = added.map(serial => {
      const gs1Payload = buildGs1DataMatrixPayload({
        gtin: batch.gtin,
        serial,
        exp: batch.exp,
        batchNo: batch.batch_no,
        fallbackSeed: batch.product_id
      })
      const verificationUrl = buildCanonicalVerificationUrl(serial, params.appBaseUrl)

      return {
        serial,
        batchId: batch.id,
        batchNo: batch.batch_no,
        productId: batch.product_id,
        productName: batch.product_name,
        genericName: batch.generic_name,
        strength: batch.strength,
        dosageForm: batch.dosage_form,
        packSize: batch.pack_size,
        gtin: gs1Payload.gtin14,
        mfd: batch.mfd,
        exp: batch.exp,
        status: 'available',
        custodianOrgId: manufacturerOrgId,
        allocationType: rawAllocation,
        verifyCount: 0,
        gs1DataMatrix: {
          hri: gs1Payload.hri,
          barcodeText: gs1Payload.barcodeText
        },
        verificationUrl
      }
    })

    return {
      success: true,
      batchId: batch.id,
      batchNo: batch.batch_no,
      serializedCount: currentCount + added.length,
      remainingCapacity: remaining - added.length,
      packages: packageRecords
    }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

/**
 * Lists packages for the authenticated manufacturer with filtering and pagination.
 *
 * @param {string} manufacturerOrgId
 * @param {object} [params={}]
 * @param {string} [params.batchId]
 * @param {string} [params.status]
 * @param {string} [params.allocationType]
 * @param {string} [params.search]
 * @param {number} [params.limit=50]
 * @param {number} [params.offset=0]
 * @returns {Promise<{ packages: Array<object>, total: number }>}
 */
export async function listPackages(manufacturerOrgId, params = {}) {
  if (!manufacturerOrgId) {
    throw new PackageServiceError('UNAUTHORIZED_ORG', 'Manufacturer organization ID required.', 401)
  }

  const conditions = ['p.manufacturer_org_id = ?']
  const queryParams = [manufacturerOrgId]

  if (params.batchId) {
    conditions.push('p.batch_id = ?')
    queryParams.push(params.batchId)
  }

  if (params.status) {
    conditions.push('p.status = ?')
    queryParams.push(params.status)
  }

  if (params.allocationType) {
    conditions.push('p.allocation_type = ?')
    queryParams.push(String(params.allocationType).toUpperCase())
  }

  if (params.search && String(params.search).trim() !== '') {
    const term = `%${String(params.search).trim()}%`
    conditions.push('(p.serial LIKE ? OR b.batch_no LIKE ? OR prod.name LIKE ?)')
    queryParams.push(term, term, term)
  }

  const whereClause = conditions.join(' AND ')

  const [countRows] = await execute(
    `SELECT COUNT(*) as total 
     FROM packages p
     JOIN batches b ON p.batch_id = b.id
     JOIN products prod ON b.product_id = prod.id
     WHERE ${whereClause}`,
    queryParams
  )
  const total = Number(countRows[0]?.total || 0)

  const limit = Math.max(1, Math.min(200, Number(params.limit) || 50))
  const offset = Math.max(0, Number(params.offset) || 0)

  const [rows] = await execute(
    `SELECT 
      p.serial,
      p.batch_id,
      p.manufacturer_org_id,
      p.allocation_type,
      p.custodian_org_id,
      p.status,
      p.verify_count,
      p.created_at,
      p.updated_at,
      b.batch_no,
      DATE_FORMAT(b.mfd, '%Y-%m-%d') AS mfd,
      DATE_FORMAT(b.exp, '%Y-%m-%d') AS exp,
      b.release_status AS batch_release_status,
      prod.id AS product_id,
      prod.name AS product_name,
      prod.generic_name,
      prod.strength,
      prod.dosage_form,
      prod.pack_size,
      prod.gtin
    FROM packages p
    JOIN batches b ON p.batch_id = b.id
    JOIN products prod ON b.product_id = prod.id
    WHERE ${whereClause}
    ORDER BY p.created_at DESC, p.serial ASC
    LIMIT ? OFFSET ?`,
    [...queryParams, limit, offset]
  )

  const appBaseUrl = params.appBaseUrl || process.env.APP_BASE_URL || 'http://localhost:5173'

  const packages = rows.map(pkg => {
    const gs1 = buildGs1DataMatrixPayload({
      gtin: pkg.gtin,
      serial: pkg.serial,
      exp: pkg.exp,
      batchNo: pkg.batch_no,
      fallbackSeed: pkg.product_id
    })
    return {
      ...pkg,
      verificationUrl: buildCanonicalVerificationUrl(pkg.serial, appBaseUrl),
      gs1DataMatrixHri: gs1.hri
    }
  })

  return { packages, total }
}

/**
 * Retrieves a single package by serial number, scoped to the manufacturer.
 *
 * @param {string} manufacturerOrgId
 * @param {string} serial
 * @param {object} [options={}]
 * @returns {Promise<object|null>}
 */
export async function getPackageBySerial(manufacturerOrgId, serial, options = {}) {
  const cleanSerial = String(serial || '').trim().toUpperCase()
  if (!cleanSerial) {
    throw new PackageServiceError('INVALID_SERIAL', 'Package serial is required.')
  }

  const [rows] = await execute(
    `SELECT 
      p.serial,
      p.batch_id,
      p.manufacturer_org_id,
      p.allocation_type,
      p.government_allocation_id,
      p.custodian_org_id,
      p.status,
      p.verify_count,
      p.created_at,
      p.updated_at,
      b.batch_no,
      DATE_FORMAT(b.mfd, '%Y-%m-%d') AS mfd,
      DATE_FORMAT(b.exp, '%Y-%m-%d') AS exp,
      b.release_status AS batch_release_status,
      prod.id AS product_id,
      prod.name AS product_name,
      prod.generic_name,
      prod.strength,
      prod.dosage_form,
      prod.pack_size,
      prod.gtin,
      mfg.name AS manufacturer_name,
      cust.name AS custodian_name
    FROM packages p
    JOIN batches b ON p.batch_id = b.id
    JOIN products prod ON b.product_id = prod.id
    JOIN organizations mfg ON p.manufacturer_org_id = mfg.id
    LEFT JOIN organizations cust ON p.custodian_org_id = cust.id
    WHERE p.serial = ? AND p.manufacturer_org_id = ?`,
    [cleanSerial, manufacturerOrgId]
  )

  if (rows.length === 0) return null

  const pkg = rows[0]
  const appBaseUrl = options.appBaseUrl || process.env.APP_BASE_URL || 'http://localhost:5173'
  const verificationUrl = buildCanonicalVerificationUrl(pkg.serial, appBaseUrl)

  const gs1Payload = buildGs1DataMatrixPayload({
    gtin: pkg.gtin,
    serial: pkg.serial,
    exp: pkg.exp,
    batchNo: pkg.batch_no,
    fallbackSeed: pkg.product_id
  })

  // Generate SVGs
  const dataMatrixSvg = generateGs1DataMatrixSvg(gs1Payload.barcodeText)
  const qrSvg = await generateQrCodeSvg(verificationUrl)

  // Fetch traceability events
  const [events] = await execute(
    `SELECT id, serial, event_type, actor_user_id, actor_org_id, event_payload, created_at
     FROM traceability_events
     WHERE serial = ?
     ORDER BY created_at ASC`,
    [pkg.serial]
  )

  return {
    ...pkg,
    verificationUrl,
    gs1DataMatrix: {
      hri: gs1Payload.hri,
      barcodeText: gs1Payload.barcodeText,
      svg: dataMatrixSvg
    },
    qrCode: {
      verificationUrl,
      svg: qrSvg
    },
    history: events.map(e => ({
      id: e.id,
      eventType: e.event_type,
      actorUserId: e.actor_user_id,
      actorOrgId: e.actor_org_id,
      createdAt: e.created_at,
      payload: typeof e.event_payload === 'string' ? JSON.parse(e.event_payload) : e.event_payload
    }))
  }
}
