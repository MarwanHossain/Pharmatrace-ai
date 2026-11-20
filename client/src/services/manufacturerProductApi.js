// PharmaTrace AI — Manufacturer Product API Client
// Connects UI to authenticated MariaDB-backed product endpoints

import { api } from './api.js'

/**
 * Retrieves products for the authenticated manufacturer with optional filtering.
 *
 * @param {object} [params={}]
 * @param {string} [params.status] - 'active' | 'discontinued'
 * @param {string} [params.search]
 * @param {number} [params.limit=50]
 * @param {number} [params.offset=0]
 * @param {object} [options={}]
 * @returns {Promise<{ products: Array<object>, total: number }>}
 */
export async function getProducts(params = {}, options = {}) {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.search) query.set('search', params.search)
  if (params.limit) query.set('limit', String(params.limit))
  if (params.offset) query.set('offset', String(params.offset))

  const queryString = query.toString()
  const endpoint = `/v1/manufacturer/products${queryString ? `?${queryString}` : ''}`
  const response = await api.get(endpoint, options)
  const data = response.data || response
  return {
    products: Array.isArray(data) ? data : (data.products || data.items || []),
    total: response.total ?? data.total ?? (Array.isArray(data) ? data.length : 0)
  }
}

/**
 * Retrieves details for a specific product.
 *
 * @param {string} id
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function getProduct(id, options = {}) {
  const response = await api.get(`/v1/manufacturer/products/${encodeURIComponent(id)}`, options)
  return response.data || response
}

/**
 * Registers a new pharmaceutical product.
 *
 * @param {object} productData
 * @param {string} productData.name
 * @param {string} productData.generic_name
 * @param {string} productData.strength
 * @param {string} productData.dosage_form
 * @param {string} productData.pack_size
 * @param {string} [productData.gtin]
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function createProduct(productData, options = {}) {
  const payload = {
    name: productData.name?.trim(),
    generic_name: (productData.generic_name || productData.genericName)?.trim(),
    strength: productData.strength?.trim(),
    dosage_form: (productData.dosage_form || productData.dosageForm || productData.form)?.trim(),
    pack_size: (productData.pack_size || productData.packSize)?.trim(),
    gtin: productData.gtin?.trim() || null
  }
  const response = await api.post('/v1/manufacturer/products', payload, options)
  return response.data || response
}

/**
 * Updates formulation and packaging details of an existing product.
 *
 * @param {string} id
 * @param {object} productData
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function updateProduct(id, productData, options = {}) {
  const payload = {
    name: productData.name?.trim(),
    generic_name: (productData.generic_name || productData.genericName)?.trim(),
    strength: productData.strength?.trim(),
    dosage_form: (productData.dosage_form || productData.dosageForm || productData.form)?.trim(),
    pack_size: (productData.pack_size || productData.packSize)?.trim(),
    gtin: productData.gtin?.trim() || null
  }
  const response = await api.put(`/v1/manufacturer/products/${encodeURIComponent(id)}`, payload, options)
  return response.data || response
}

/**
 * Updates lifecycle status of a product (soft discontinuation).
 *
 * @param {string} id
 * @param {string} status - 'active' | 'discontinued'
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function updateProductStatus(id, status, options = {}) {
  const response = await api.patch(
    `/v1/manufacturer/products/${encodeURIComponent(id)}/status`,
    { status },
    options
  )
  return response.data || response
}
