// PharmaTrace AI — Administrator Organization API Service
// Connects administrator portal to database-backed organization endpoints

import { api, downloadFile } from './api.js'

export const ORG_TYPES = Object.freeze([
  'manufacturer',
  'distributor',
  'wholesaler',
  'pharmacy'
])

export const ORG_STATUSES = Object.freeze([
  'active',
  'suspended',
  'decommissioned'
])

/**
 * Lists paginated organizations from MariaDB with filtering, search, and sorting.
 *
 * @param {object} [params={}]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {string} [params.type]
 * @param {string} [params.status]
 * @param {string} [params.search]
 * @param {string} [params.sortBy='created_at']
 * @param {'ASC'|'DESC'} [params.sortOrder='DESC']
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function listOrganizations(params = {}, options = {}) {
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  if (params.type) query.set('type', String(params.type).trim().toLowerCase())
  if (params.status) query.set('status', String(params.status).trim().toLowerCase())
  if (params.search && String(params.search).trim()) query.set('search', String(params.search).trim())
  if (params.sortBy) query.set('sortBy', String(params.sortBy).trim())
  if (params.sortOrder) query.set('sortOrder', String(params.sortOrder).trim().toUpperCase())

  const queryString = query.toString()
  const endpoint = `/v1/admin/organizations${queryString ? `?${queryString}` : ''}`
  const response = await api.get(endpoint, options)
  return response.data || response
}

/**
 * Retrieves full details for a specific organization, including linked users and approved documents.
 *
 * @param {string} id - Organization ID
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function getOrganizationDetail(id, options = {}) {
  if (!id) throw new Error('Organization ID is required.')
  const response = await api.get(`/v1/admin/organizations/${encodeURIComponent(id)}`, options)
  const data = response.data || response
  return data.organization || data
}

/**
 * Updates organization status (e.g. active, suspended, decommissioned) with an audit reason.
 *
 * @param {string} id - Organization ID
 * @param {object} payload
 * @param {string} payload.status - Target status
 * @param {string} payload.reason - Audit explanation
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function updateOrganizationStatus(id, { status, reason }, options = {}) {
  if (!id) throw new Error('Organization ID is required.')
  const response = await api.patch(
    `/v1/admin/organizations/${encodeURIComponent(id)}/status`,
    { status, reason },
    options
  )
  return response.data || response
}

/**
 * Downloads an approved regulatory document for an organization.
 *
 * @param {string} orgId - Organization ID
 * @param {string} docId - Document ID
 * @param {string} [filename='document.bin'] - Target download filename
 * @returns {Promise<void>}
 */
export async function downloadOrganizationDocument(orgId, docId, filename = 'document.bin') {
  if (!orgId || !docId) throw new Error('Organization ID and Document ID are required.')
  const endpoint = `/v1/admin/organizations/${encodeURIComponent(orgId)}/documents/${encodeURIComponent(docId)}/download`
  await downloadFile(endpoint, filename)
}

/**
 * Fetches an approved document as an authenticated Blob for inline preview.
 *
 * @param {string} orgId - Organization ID
 * @param {string} docId - Document ID
 * @param {object} [options={}]
 * @returns {Promise<Blob>}
 */
export async function fetchOrganizationDocumentBlob(orgId, docId, options = {}) {
  if (!orgId || !docId) throw new Error('Organization ID and Document ID are required.')
  const endpoint = `/v1/admin/organizations/${encodeURIComponent(orgId)}/documents/${encodeURIComponent(docId)}/preview`
  return await api.blob(endpoint, options)
}
