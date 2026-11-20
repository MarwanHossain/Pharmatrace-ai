// PharmaTrace AI — Administrator User Management API Service
// Connects administrator portal to database-backed user management endpoints

import { api } from './api.js'

export const USER_ROLES = Object.freeze([
  { value: 'admin', label: 'System Administrator' },
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'distributor', label: 'Distributor' },
  { value: 'wholesaler', label: 'Wholesaler' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'investigator', label: 'Investigation Officer' }
])

export const USER_STATUSES = Object.freeze([
  'pending_activation',
  'active',
  'inactive',
  'locked'
])

/**
 * Lists paginated users from MariaDB with filtering, search, and sorting.
 *
 * @param {object} [params={}]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {string} [params.role]
 * @param {string} [params.status]
 * @param {string} [params.orgId]
 * @param {string} [params.search]
 * @param {string} [params.sortBy='created_at']
 * @param {'ASC'|'DESC'} [params.sortOrder='DESC']
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function listUsers(params = {}, options = {}) {
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  if (params.role) query.set('role', String(params.role).trim().toLowerCase())
  if (params.status) query.set('status', String(params.status).trim().toLowerCase())
  if (params.orgId) query.set('orgId', String(params.orgId).trim())
  if (params.search && String(params.search).trim()) query.set('search', String(params.search).trim())
  if (params.sortBy) query.set('sortBy', String(params.sortBy).trim())
  if (params.sortOrder) query.set('sortOrder', String(params.sortOrder).trim().toUpperCase())

  const queryString = query.toString()
  const endpoint = `/v1/admin/users${queryString ? `?${queryString}` : ''}`
  const response = await api.get(endpoint, options)
  return response.data || response
}

/**
 * Retrieves details for a specific user.
 *
 * @param {string} id - User ID
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function getUserDetail(id, options = {}) {
  if (!id) throw new Error('User ID is required.')
  const response = await api.get(`/v1/admin/users/${encodeURIComponent(id)}`, options)
  const data = response.data || response
  return data.user || data
}

/**
 * Updates a user's account status (active, inactive, locked) with an administrative reason.
 *
 * @param {string} id - User ID
 * @param {object} payload
 * @param {string} payload.status - Target status
 * @param {string} payload.reason - Audit explanation
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function updateUserStatus(id, { status, reason }, options = {}) {
  if (!id) throw new Error('User ID is required.')
  const response = await api.patch(
    `/v1/admin/users/${encodeURIComponent(id)}/status`,
    { status, reason },
    options
  )
  return response.data || response
}

/**
 * Specifically unlocks a locked user account and clears failure counters.
 * Requires administrative justification reason.
 *
 * @param {string} id - User ID
 * @param {object|string} payload - { reason: string } or string reason
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function unlockUser(id, payload = {}, options = {}) {
  if (!id) throw new Error('User ID is required.')
  const body = typeof payload === 'string' ? { reason: payload } : payload
  const response = await api.post(
    `/v1/admin/users/${encodeURIComponent(id)}/unlock`,
    body,
    options
  )
  return response.data || response
}
