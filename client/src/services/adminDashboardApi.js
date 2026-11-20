// PharmaTrace AI — Administrator Dashboard API Service
// Connects administrator dashboard to live MariaDB metrics and chronological audit logs

import { api } from './api.js'

/**
 * Retrieves platform-wide live summary metrics across registrations, organizations, and users.
 *
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function getDashboardSummary(options = {}) {
  const response = await api.get('/v1/admin/dashboard/summary', options)
  const data = response.data || response
  return data.summary || data
}

/**
 * Retrieves chronological system audit activity from MariaDB.
 *
 * @param {object} [params={}]
 * @param {number} [params.limit=10]
 * @param {number} [params.days]
 * @param {object} [options={}]
 * @returns {Promise<Array<object>>}
 */
export async function getDashboardActivity(params = {}, options = {}) {
  const query = new URLSearchParams()
  if (params.limit) query.set('limit', String(params.limit))
  if (params.days) query.set('days', String(params.days))

  const queryString = query.toString()
  const endpoint = `/v1/admin/dashboard/activity${queryString ? `?${queryString}` : ''}`
  const response = await api.get(endpoint, options)
  const data = response.data || response
  return data.items || []
}
