// PharmaTrace AI — Manufacturer Batch Service
// Implements secure multi-tenant production batch creation and tracking

import crypto from 'crypto'
import { execute } from '../config/database.js'
import { getProductById } from './manufacturer.product.service.js'
import { logger } from '../utils/logger.js'

export class BatchServiceError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message)
    this.name = 'BatchServiceError'
    this.code = code
    this.statusCode = statusCode
  }
}

/**
 * Validates ISO date format YYYY-MM-DD.
 *
 * @param {string} dateStr
 * @returns {boolean}
 */
function isValidIsoDate(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false
  }
  const d = new Date(dateStr + 'T00:00:00Z')
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateStr
}

/**
 * Lists production batches for the authenticated manufacturer.
 *
 * @param {string} manufacturerOrgId
 * @param {object} [params={}]
 * @param {string} [params.productId]
 * @param {string} [params.status] - 'Pending QA' | 'Released' | 'Quarantined' | 'Rejected'
 * @param {string} [params.search]
 * @param {number} [params.limit=50]
 * @param {number} [params.offset=0]
 * @returns {Promise<{ batches: Array<object>, total: number }>}
 */
export async function listBatches(manufacturerOrgId, params = {}) {
  if (!manufacturerOrgId) {
    throw new BatchServiceError('UNAUTHORIZED_ORG', 'Manufacturer organization ID required.', 401)
  }

  const conditions = ['b.manufacturer_id = ?']
  const queryParams = [manufacturerOrgId]

  if (params.productId) {
    conditions.push('b.product_id = ?')
    queryParams.push(params.productId)
  }

  if (params.status) {
    conditions.push('b.release_status = ?')
    queryParams.push(params.status)
  }

  if (params.search && String(params.search).trim() !== '') {
    const term = `%${String(params.search).trim()}%`
    conditions.push('(b.batch_no LIKE ? OR p.name LIKE ? OR p.generic_name LIKE ?)')
    queryParams.push(term, term, term)
  }

  const whereClause = conditions.join(' AND ')

  // Total count
  const [countRows] = await execute(
    `SELECT COUNT(*) as total 
     FROM batches b 
     JOIN products p ON b.product_id = p.id 
     WHERE ${whereClause}`,
    queryParams
  )
  const total = countRows[0]?.total || 0

  const limit = Math.max(1, Math.min(100, Number(params.limit) || 50))
  const offset = Math.max(0, Number(params.offset) || 0)

  const [batches] = await execute(
    `SELECT 
      b.id,
      b.batch_no,
      b.product_id,
      b.manufacturer_id,
      DATE_FORMAT(b.mfd, '%Y-%m-%d') AS mfd,
      DATE_FORMAT(b.exp, '%Y-%m-%d') AS exp,
      b.quantity,
      b.release_status,
      b.created_at,
      p.name AS product_name,
      p.generic_name,
      p.strength,
      p.dosage_form,
      p.pack_size,
      p.gtin,
      p.status AS product_status,
      (SELECT COUNT(*) FROM packages pkg WHERE pkg.batch_id = b.id) AS serialized_count
    FROM batches b
    JOIN products p ON b.product_id = p.id
    WHERE ${whereClause}
    ORDER BY b.created_at DESC
    LIMIT ? OFFSET ?`,
    [...queryParams, limit, offset]
  )

  return { batches, total }
}

/**
 * Retrieves a single batch by ID, scoped to manufacturer tenant.
 *
 * @param {string} manufacturerOrgId
 * @param {string} batchId
 * @returns {Promise<object|null>}
 */
export async function getBatchById(manufacturerOrgId, batchId) {
  const [rows] = await execute(
    `SELECT 
      b.id,
      b.batch_no,
      b.product_id,
      b.manufacturer_id,
      DATE_FORMAT(b.mfd, '%Y-%m-%d') AS mfd,
      DATE_FORMAT(b.exp, '%Y-%m-%d') AS exp,
      b.quantity,
      b.release_status,
      b.created_at,
      p.name AS product_name,
      p.generic_name,
      p.strength,
      p.dosage_form,
      p.pack_size,
      p.gtin,
      p.status AS product_status,
      (SELECT COUNT(*) FROM packages pkg WHERE pkg.batch_id = b.id) AS serialized_count
    FROM batches b
    JOIN products p ON b.product_id = p.id
    WHERE b.id = ? AND b.manufacturer_id = ?`,
    [batchId, manufacturerOrgId]
  )

  return rows[0] || null
}

/**
 * Creates a new production batch for the authenticated manufacturer.
 *
 * @param {string} manufacturerOrgId
 * @param {object} data
 * @param {string} data.productId
 * @param {string} data.batchNo
 * @param {string} data.mfd - Manufacturing date (YYYY-MM-DD)
 * @param {string} data.exp - Expiry date (YYYY-MM-DD)
 * @param {number} data.quantity
 * @returns {Promise<object>}
 */
export async function createBatch(manufacturerOrgId, data) {
  if (!manufacturerOrgId) {
    throw new BatchServiceError('UNAUTHORIZED_ORG', 'Manufacturer organization ID required.', 401)
  }

  const productId = String(data.productId ?? data.product_id ?? '').trim()
  const batchNo = String(data.batchNo ?? data.batch_no ?? data.no ?? '').trim().toUpperCase()
  const mfd = String(data.mfd ?? '').trim()
  const exp = String(data.exp ?? '').trim()
  const rawQuantity = data.quantity

  if (!productId) throw new BatchServiceError('INVALID_PRODUCT_ID', 'Product ID is required.')
  if (!batchNo) throw new BatchServiceError('INVALID_BATCH_NO', 'Batch number is required.')
  if (!mfd) throw new BatchServiceError('INVALID_MANUFACTURE_DATE', 'Manufacturing date is required.')
  if (!exp) throw new BatchServiceError('INVALID_EXPIRY_DATE', 'Expiry date is required.')

  // Validate product ownership & active status
  const product = await getProductById(manufacturerOrgId, productId)
  if (!product) {
    throw new BatchServiceError('PRODUCT_NOT_FOUND', 'Specified product not found or does not belong to your organization.', 404)
  }
  if (product.status !== 'active') {
    throw new BatchServiceError('PRODUCT_DISCONTINUED', 'Cannot create production batches for a discontinued product.', 400)
  }

  // Validate Quantity
  const quantity = Number(rawQuantity)
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new BatchServiceError('INVALID_QUANTITY', 'Batch production quantity must be a positive whole number greater than zero.')
  }

  // Validate Dates
  if (!isValidIsoDate(mfd)) {
    throw new BatchServiceError('INVALID_MANUFACTURE_DATE', 'Manufacturing date must be a valid date in YYYY-MM-DD format.')
  }
  if (!isValidIsoDate(exp)) {
    throw new BatchServiceError('INVALID_EXPIRY_DATE', 'Expiry date must be a valid date in YYYY-MM-DD format.')
  }

  const todayStr = new Date().toISOString().slice(0, 10)
  if (mfd > todayStr) {
    throw new BatchServiceError('FUTURE_MANUFACTURE_DATE', 'Manufacturing date cannot be in the future.')
  }
  if (exp <= mfd) {
    throw new BatchServiceError('INVALID_EXPIRY_DATE', 'Expiry date must be strictly after the manufacturing date.')
  }

  // Check unique batch number under this manufacturer (uq_batch_mfg)
  const [existingBatch] = await execute(
    'SELECT id FROM batches WHERE manufacturer_id = ? AND UPPER(batch_no) = ?',
    [manufacturerOrgId, batchNo]
  )
  if (existingBatch && existingBatch.length > 0) {
    throw new BatchServiceError('DUPLICATE_BATCH_NO', `A batch with number "${batchNo}" already exists for your organization.`, 409)
  }

  const id = `batch-${crypto.randomBytes(8).toString('hex')}`

  // Initial release status is strictly 'Pending QA'
  await execute(
    `INSERT INTO batches (
      id,
      batch_no,
      product_id,
      manufacturer_id,
      mfd,
      exp,
      quantity,
      release_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending QA')`,
    [id, batchNo, productId, manufacturerOrgId, mfd, exp, quantity]
  )

  logger.info('Production batch created', { batchId: id, batchNo, manufacturerOrgId, productId, quantity })
  return getBatchById(manufacturerOrgId, id)
}

/**
 * Releases a batch following authorized QA sign-off.
 * Enforces valid status transitions and blocks release of expired or already-released batches.
 *
 * @param {string} manufacturerOrgId
 * @param {string} batchId
 * @param {object} [options={}]
 * @param {object} [options.user] - Authenticated QA user
 * @param {string} [options.notes] - QA release notes / certificate of analysis reference
 * @returns {Promise<object>}
 */
export async function releaseBatch(manufacturerOrgId, batchId, options = {}) {
  if (!manufacturerOrgId) {
    throw new BatchServiceError('UNAUTHORIZED_ORG', 'Manufacturer organization ID required.', 401)
  }

  const batch = await getBatchById(manufacturerOrgId, batchId)
  if (!batch) {
    throw new BatchServiceError('BATCH_NOT_FOUND', 'Specified batch not found or does not belong to your organization.', 404)
  }

  if (batch.release_status === 'Released') {
    throw new BatchServiceError('BATCH_ALREADY_RELEASED', `Batch ${batch.batch_no} is already Released.`, 400)
  }

  if (batch.release_status === 'Rejected') {
    throw new BatchServiceError('BATCH_ALREADY_REJECTED', 'Cannot release a batch with terminal status "Rejected".', 400)
  }

  const todayStr = new Date().toISOString().slice(0, 10)
  if (batch.exp <= todayStr) {
    throw new BatchServiceError('BATCH_EXPIRED', `Cannot release batch ${batch.batch_no} because it has expired on ${batch.exp}.`, 400)
  }

  await execute(
    'UPDATE batches SET release_status = "Released" WHERE id = ? AND manufacturer_id = ?',
    [batchId, manufacturerOrgId]
  )

  logger.info('Production batch QA released', {
    batchId,
    batchNo: batch.batch_no,
    manufacturerOrgId,
    qaUserId: options.user?.id || null,
    notes: options.notes || null
  })

  return getBatchById(manufacturerOrgId, batchId)
}

/**
 * Updates batch release status with transition validation.
 *
 * @param {string} manufacturerOrgId
 * @param {string} batchId
 * @param {object} data
 * @param {string} data.status - 'Pending QA' | 'Released' | 'Quarantined' | 'Rejected'
 * @param {string} [data.notes]
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function updateBatchReleaseStatus(manufacturerOrgId, batchId, data, options = {}) {
  if (!manufacturerOrgId) {
    throw new BatchServiceError('UNAUTHORIZED_ORG', 'Manufacturer organization ID required.', 401)
  }

  const targetStatus = String(data?.status ?? '').trim()
  const validStatuses = ['Pending QA', 'Released', 'Quarantined', 'Rejected']
  if (!validStatuses.includes(targetStatus)) {
    throw new BatchServiceError(
      'INVALID_RELEASE_STATUS',
      `Release status must be one of: ${validStatuses.join(', ')}.`
    )
  }

  const batch = await getBatchById(manufacturerOrgId, batchId)
  if (!batch) {
    throw new BatchServiceError('BATCH_NOT_FOUND', 'Specified batch not found or does not belong to your organization.', 404)
  }

  const current = batch.release_status

  // Terminal state check
  if (current === 'Rejected' && targetStatus !== 'Rejected') {
    throw new BatchServiceError('BATCH_ALREADY_REJECTED', 'Cannot change status of a Rejected batch. Rejected is a terminal quality status.', 400)
  }

  // Idempotent
  if (current === targetStatus) {
    return batch
  }

  // Prevent reverting Released to Pending QA
  if (current === 'Released' && targetStatus === 'Pending QA') {
    throw new BatchServiceError('INVALID_STATUS_TRANSITION', 'Cannot revert a Released batch back to Pending QA. Use Quarantined if investigation is required.', 400)
  }

  // Check expiry if transitioning to Released
  const todayStr = new Date().toISOString().slice(0, 10)
  if (targetStatus === 'Released' && batch.exp <= todayStr) {
    throw new BatchServiceError('BATCH_EXPIRED', `Cannot release batch ${batch.batch_no} because it has expired on ${batch.exp}.`, 400)
  }

  await execute(
    'UPDATE batches SET release_status = ? WHERE id = ? AND manufacturer_id = ?',
    [targetStatus, batchId, manufacturerOrgId]
  )

  logger.info('Production batch status updated', {
    batchId,
    batchNo: batch.batch_no,
    prevStatus: current,
    newStatus: targetStatus,
    manufacturerOrgId,
    notes: data.notes || null
  })

  return getBatchById(manufacturerOrgId, batchId)
}
