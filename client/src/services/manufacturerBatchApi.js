// PharmaTrace AI — Manufacturer Production Batch API Client
// Connects UI to authenticated MariaDB-backed batch endpoints

import { api } from './api.js'

/**
 * Retrieves production batches for the authenticated manufacturer with optional filtering.
 *
 * @param {object} [params={}]
 * @param {string} [params.productId]
 * @param {string} [params.status] - 'Pending QA' | 'Released' | 'Quarantined' | 'Rejected'
 * @param {string} [params.search]
 * @param {number} [params.limit=50]
 * @param {number} [params.offset=0]
 * @param {object} [options={}]
 * @returns {Promise<{ batches: Array<object>, total: number }>}
 */
export async function getBatches(params = {}, options = {}) {
  const query = new URLSearchParams()
  if (params.productId) query.set('productId', params.productId)
  if (params.status) query.set('status', params.status)
  if (params.search) query.set('search', params.search)
  if (params.limit) query.set('limit', String(params.limit))
  if (params.offset) query.set('offset', String(params.offset))

  const queryString = query.toString()
  const endpoint = `/v1/manufacturer/batches${queryString ? `?${queryString}` : ''}`
  const response = await api.get(endpoint, options)
  const data = response.data || response
  return {
    batches: Array.isArray(data) ? data : (data.batches || data.items || []),
    total: response.total ?? data.total ?? (Array.isArray(data) ? data.length : 0)
  }
}

/**
 * Retrieves details for a specific batch.
 *
 * @param {string} id
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function getBatch(id, options = {}) {
  const response = await api.get(`/v1/manufacturer/batches/${encodeURIComponent(id)}`, options)
  return response.data || response
}

/**
 * Creates a new production batch. Initial status is strictly 'Pending QA'.
 *
 * @param {object} batchData
 * @param {string} batchData.productId
 * @param {string} batchData.batchNo
 * @param {string} batchData.mfd - Manufacturing date (YYYY-MM-DD)
 * @param {string} batchData.exp - Expiry date (YYYY-MM-DD)
 * @param {number} batchData.quantity - Positive integer
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function createBatch(batchData, options = {}) {
  const payload = {
    productId: batchData.productId || batchData.product_id,
    batchNo: (batchData.batchNo || batchData.batch_no || batchData.no)?.trim()?.toUpperCase(),
    mfd: batchData.mfd,
    exp: batchData.exp,
    quantity: Number(batchData.quantity)
  }
  const response = await api.post('/v1/manufacturer/batches', payload, options)
  return response.data || response
}

/**
 * Releases a production batch following QA sign-off.
 *
 * @param {string} id - Batch ID
 * @param {object} [data={}]
 * @param {string} [data.notes]
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function releaseBatch(id, data = {}, options = {}) {
  const response = await api.post(`/v1/manufacturer/batches/${encodeURIComponent(id)}/qa-release`, data, options)
  return response.data || response
}

/**
 * Updates batch release status (e.g. Quarantined, Rejected).
 *
 * @param {string} id - Batch ID
 * @param {string} status - 'Pending QA' | 'Released' | 'Quarantined' | 'Rejected'
 * @param {object} [data={}]
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function updateBatchReleaseStatus(id, status, data = {}, options = {}) {
  const payload = { status, ...data }
  const response = await api.patch(`/v1/manufacturer/batches/${encodeURIComponent(id)}/release-status`, payload, options)
  return response.data || response
}

/**
 * Serializes packages for a released batch.
 *
 * @param {string} batchId
 * @param {object} data
 * @param {number} data.quantity
 * @param {string} [data.allocationType='COMMERCIAL']
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function serializeBatch(batchId, data = {}, options = {}) {
  const payload = {
    quantity: Number(data.quantity),
    allocationType: data.allocationType || 'COMMERCIAL'
  }
  const response = await api.post(`/v1/manufacturer/batches/${encodeURIComponent(batchId)}/serialize`, payload, options)
  return response.data || response
}
