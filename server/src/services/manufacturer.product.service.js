// PharmaTrace AI — Manufacturer Product Service
// Implements secure multi-tenant pharmaceutical product management

import crypto from 'crypto'
import { execute } from '../config/database.js'
import { validateGtin } from '../utils/gtin.js'
import { logger } from '../utils/logger.js'

export class ProductServiceError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message)
    this.name = 'ProductServiceError'
    this.code = code
    this.statusCode = statusCode
  }
}

/**
 * Lists products for the authenticated manufacturer with optional filtering and pagination.
 *
 * @param {string} manufacturerOrgId - Authenticated manufacturer organization ID
 * @param {object} [params={}]
 * @param {string} [params.status] - Filter by status ('active' | 'discontinued')
 * @param {string} [params.search] - Search across name, generic_name, and gtin
 * @param {number} [params.limit=50]
 * @param {number} [params.offset=0]
 * @returns {Promise<{ products: Array<object>, total: number }>}
 */
export async function listProducts(manufacturerOrgId, params = {}) {
  if (!manufacturerOrgId) {
    throw new ProductServiceError('UNAUTHORIZED_ORG', 'Manufacturer organization ID required.', 401)
  }

  const conditions = ['manufacturer_id = ?']
  const queryParams = [manufacturerOrgId]

  if (params.status && (params.status === 'active' || params.status === 'discontinued')) {
    conditions.push('status = ?')
    queryParams.push(params.status)
  }

  if (params.search && String(params.search).trim() !== '') {
    const term = `%${String(params.search).trim()}%`
    conditions.push('(name LIKE ? OR generic_name LIKE ? OR gtin LIKE ?)')
    queryParams.push(term, term, term)
  }

  const whereClause = conditions.join(' AND ')

  // Total count
  const [countRows] = await execute(
    `SELECT COUNT(*) as total FROM products WHERE ${whereClause}`,
    queryParams
  )
  const total = countRows[0]?.total || 0

  const limit = Math.max(1, Math.min(100, Number(params.limit) || 50))
  const offset = Math.max(0, Number(params.offset) || 0)

  const [products] = await execute(
    `SELECT 
      id,
      manufacturer_id,
      name,
      generic_name,
      strength,
      dosage_form,
      pack_size,
      gtin,
      status,
      created_at
    FROM products
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?`,
    [...queryParams, limit, offset]
  )

  return { products, total }
}

/**
 * Retrieves a single product by ID, guaranteeing manufacturer tenant isolation.
 *
 * @param {string} manufacturerOrgId
 * @param {string} productId
 * @returns {Promise<object|null>}
 */
export async function getProductById(manufacturerOrgId, productId) {
  const [rows] = await execute(
    `SELECT 
      id,
      manufacturer_id,
      name,
      generic_name,
      strength,
      dosage_form,
      pack_size,
      gtin,
      status,
      created_at
    FROM products
    WHERE id = ? AND manufacturer_id = ?`,
    [productId, manufacturerOrgId]
  )

  return rows[0] || null
}

/**
 * Registers a new pharmaceutical product for the authenticated manufacturer.
 *
 * @param {string} manufacturerOrgId
 * @param {object} data
 * @param {string} data.name
 * @param {string} data.generic_name
 * @param {string} data.strength
 * @param {string} data.dosage_form
 * @param {string} data.pack_size
 * @param {string} [data.gtin]
 * @returns {Promise<object>}
 */
export async function createProduct(manufacturerOrgId, data) {
  if (!manufacturerOrgId) {
    throw new ProductServiceError('UNAUTHORIZED_ORG', 'Manufacturer organization ID required.', 401)
  }

  const name = String(data.name ?? '').trim()
  const genericName = String(data.generic_name ?? data.genericName ?? '').trim()
  const strength = String(data.strength ?? '').trim()
  const dosageForm = String(data.dosage_form ?? data.dosageForm ?? data.form ?? '').trim()
  const packSize = String(data.pack_size ?? data.packSize ?? '').trim()

  if (!name) throw new ProductServiceError('INVALID_NAME', 'Product trade name is required.')
  if (!genericName) throw new ProductServiceError('INVALID_GENERIC_NAME', 'Generic name is required.')
  if (!strength) throw new ProductServiceError('INVALID_STRENGTH', 'Product strength is required.')
  if (!dosageForm) throw new ProductServiceError('INVALID_DOSAGE_FORM', 'Dosage form is required.')
  if (!packSize) throw new ProductServiceError('INVALID_PACK_SIZE', 'Package size is required.')

  // Validate GTIN if provided
  let validatedGtin = null
  if (data.gtin !== undefined && data.gtin !== null && String(data.gtin).trim() !== '') {
    const gtinCheck = validateGtin(data.gtin)
    if (!gtinCheck.valid) {
      throw new ProductServiceError('INVALID_GTIN', gtinCheck.error)
    }
    validatedGtin = gtinCheck.value

    // Check GTIN global uniqueness
    const [existingGtin] = await execute('SELECT id FROM products WHERE gtin = ?', [validatedGtin])
    if (existingGtin && existingGtin.length > 0) {
      throw new ProductServiceError('DUPLICATE_GTIN', `A product with GTIN "${validatedGtin}" already exists.`, 409)
    }
  }

  // Check duplicate product under the same manufacturer (name + strength + pack_size)
  const [existingProd] = await execute(
    'SELECT id FROM products WHERE manufacturer_id = ? AND LOWER(name) = LOWER(?) AND LOWER(strength) = LOWER(?)',
    [manufacturerOrgId, name, strength]
  )
  if (existingProd && existingProd.length > 0) {
    throw new ProductServiceError(
      'DUPLICATE_PRODUCT',
      `A product with name "${name}" and strength "${strength}" already exists for your organization.`,
      409
    )
  }

  const id = `prod-${crypto.randomBytes(8).toString('hex')}`

  await execute(
    `INSERT INTO products (
      id,
      manufacturer_id,
      name,
      generic_name,
      strength,
      dosage_form,
      pack_size,
      gtin,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    [id, manufacturerOrgId, name, genericName, strength, dosageForm, packSize, validatedGtin]
  )

  logger.info('Product created successfully', { productId: id, manufacturerOrgId, name, gtin: validatedGtin })
  return getProductById(manufacturerOrgId, id)
}

/**
 * Updates product formulation details.
 *
 * @param {string} manufacturerOrgId
 * @param {string} productId
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function updateProduct(manufacturerOrgId, productId, data) {
  const existing = await getProductById(manufacturerOrgId, productId)
  if (!existing) {
    throw new ProductServiceError('PRODUCT_NOT_FOUND', 'Product not found or access denied.', 404)
  }

  const name = data.name !== undefined ? String(data.name).trim() : existing.name
  const genericName = data.generic_name !== undefined
    ? String(data.generic_name).trim()
    : (data.genericName !== undefined ? String(data.genericName).trim() : existing.generic_name)
  const strength = data.strength !== undefined ? String(data.strength).trim() : existing.strength
  const dosageForm = data.dosage_form !== undefined
    ? String(data.dosage_form).trim()
    : (data.dosageForm !== undefined ? String(data.dosageForm).trim() : existing.dosage_form)
  const packSize = data.pack_size !== undefined
    ? String(data.pack_size).trim()
    : (data.packSize !== undefined ? String(data.packSize).trim() : existing.pack_size)

  if (!name) throw new ProductServiceError('INVALID_NAME', 'Product trade name cannot be empty.')
  if (!genericName) throw new ProductServiceError('INVALID_GENERIC_NAME', 'Generic name cannot be empty.')
  if (!strength) throw new ProductServiceError('INVALID_STRENGTH', 'Product strength cannot be empty.')
  if (!dosageForm) throw new ProductServiceError('INVALID_DOSAGE_FORM', 'Dosage form cannot be empty.')
  if (!packSize) throw new ProductServiceError('INVALID_PACK_SIZE', 'Package size cannot be empty.')

  let validatedGtin = existing.gtin
  if (data.gtin !== undefined) {
    if (data.gtin === null || String(data.gtin).trim() === '') {
      validatedGtin = null
    } else {
      const gtinCheck = validateGtin(data.gtin)
      if (!gtinCheck.valid) {
        throw new ProductServiceError('INVALID_GTIN', gtinCheck.error)
      }
      validatedGtin = gtinCheck.value

      // Check GTIN collision with other products
      if (validatedGtin !== existing.gtin) {
        const [existingGtin] = await execute('SELECT id FROM products WHERE gtin = ? AND id != ?', [validatedGtin, productId])
        if (existingGtin && existingGtin.length > 0) {
          throw new ProductServiceError('DUPLICATE_GTIN', `A product with GTIN "${validatedGtin}" already exists.`, 409)
        }
      }
    }
  }

  await execute(
    `UPDATE products SET
      name = ?,
      generic_name = ?,
      strength = ?,
      dosage_form = ?,
      pack_size = ?,
      gtin = ?
    WHERE id = ? AND manufacturer_id = ?`,
    [name, genericName, strength, dosageForm, packSize, validatedGtin, productId, manufacturerOrgId]
  )

  return getProductById(manufacturerOrgId, productId)
}

/**
 * Updates product lifecycle status (soft discontinuation).
 *
 * @param {string} manufacturerOrgId
 * @param {string} productId
 * @param {string} nextStatus - 'active' | 'discontinued'
 * @returns {Promise<object>}
 */
export async function updateProductStatus(manufacturerOrgId, productId, nextStatus) {
  const existing = await getProductById(manufacturerOrgId, productId)
  if (!existing) {
    throw new ProductServiceError('PRODUCT_NOT_FOUND', 'Product not found or access denied.', 404)
  }

  if (nextStatus !== 'active' && nextStatus !== 'discontinued') {
    throw new ProductServiceError(
      'INVALID_STATUS',
      'Product status must be either "active" or "discontinued".'
    )
  }

  await execute(
    'UPDATE products SET status = ? WHERE id = ? AND manufacturer_id = ?',
    [nextStatus, productId, manufacturerOrgId]
  )

  logger.info('Product status updated', { productId, manufacturerOrgId, status: nextStatus })
  return getProductById(manufacturerOrgId, productId)
}
