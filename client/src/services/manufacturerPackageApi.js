// PharmaTrace AI — Manufacturer Package API Client
// Connects UI to authenticated MariaDB-backed package endpoints
import { api } from './api.js'

/**
 * Retrieves packages for the authenticated manufacturer with optional filtering.
 *
 * @param {object} [params={}]
 * @param {string} [params.batchId]
 * @param {string} [params.status]
 * @param {string} [params.allocationType]
 * @param {string} [params.search]
 * @param {number} [params.limit=100]
 * @param {number} [params.offset=0]
 * @param {object} [options={}]
 * @returns {Promise<{ packages: Array<object>, total: number }>}
 */
export async function getPackages(params = {}, options = {}) {
  const query = new URLSearchParams()
  if (params.batchId) query.set('batchId', params.batchId)
  if (params.status) query.set('status', params.status)
  if (params.allocationType) query.set('allocationType', params.allocationType)
  if (params.search) query.set('search', params.search)
  if (params.limit) query.set('limit', String(params.limit))
  if (params.offset) query.set('offset', String(params.offset))

  const queryString = query.toString()
  const endpoint = `/v1/manufacturer/packages${queryString ? `?${queryString}` : ''}`
  const response = await api.get(endpoint, options)
  const data = response.data || response
  return {
    packages: Array.isArray(data) ? data : (data.packages || data.items || []),
    total: response.total ?? data.total ?? (Array.isArray(data) ? data.length : 0)
  }
}

/**
 * Retrieves details for a specific serialized package.
 *
 * @param {string} serial
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function getPackage(serial, options = {}) {
  const response = await api.get(`/v1/manufacturer/packages/${encodeURIComponent(serial)}`, options)
  return response.data || response
}

/**
 * Serializes packages for a given batch.
 *
 * @param {object} params
 * @param {string} params.batchId
 * @param {number} params.quantity
 * @param {string} [params.allocationType='COMMERCIAL']
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function serializeBatch(params, options = {}) {
  const { batchId, quantity, allocationType = 'COMMERCIAL' } = params
  const payload = {
    quantity: Number(quantity),
    allocationType
  }
  const response = await api.post(`/v1/manufacturer/batches/${encodeURIComponent(batchId)}/serialize`, payload, options)
  return response.data || response
}
