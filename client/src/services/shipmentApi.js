// PharmaTrace AI — Shipment & Custody Transfer API Client
// Connects supply chain portal frontends to MariaDB-backed shipment and receiving endpoints
import { api } from './api.js'

/**
 * Retrieves incoming shipments destined for caller's organization.
 *
 * @param {object} [params={}]
 * @param {string} [params.status]
 * @param {string} [params.search]
 * @param {number} [params.limit=50]
 * @param {number} [params.offset=0]
 * @param {object} [options={}]
 * @returns {Promise<{ shipments: Array<object>, total: number }>}
 */
export async function getIncomingShipments(params = {}, options = {}) {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.search) query.set('search', params.search)
  if (params.limit) query.set('limit', String(params.limit))
  if (params.offset) query.set('offset', String(params.offset))

  const queryString = query.toString()
  const endpoint = `/v1/shipments/incoming${queryString ? `?${queryString}` : ''}`
  const response = await api.get(endpoint, options)
  const data = response.data || response
  return {
    shipments: Array.isArray(data) ? data : (data.shipments || []),
    total: response.total ?? data.total ?? (Array.isArray(data) ? data.length : 0)
  }
}

/**
 * Retrieves outgoing shipments dispatched from caller's organization.
 *
 * @param {object} [params={}]
 * @param {string} [params.status]
 * @param {string} [params.search]
 * @param {number} [params.limit=50]
 * @param {number} [params.offset=0]
 * @param {object} [options={}]
 * @returns {Promise<{ shipments: Array<object>, total: number }>}
 */
export async function getOutgoingShipments(params = {}, options = {}) {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.search) query.set('search', params.search)
  if (params.limit) query.set('limit', String(params.limit))
  if (params.offset) query.set('offset', String(params.offset))

  const queryString = query.toString()
  const endpoint = `/v1/shipments/outgoing${queryString ? `?${queryString}` : ''}`
  const response = await api.get(endpoint, options)
  const data = response.data || response
  return {
    shipments: Array.isArray(data) ? data : (data.shipments || []),
    total: response.total ?? data.total ?? (Array.isArray(data) ? data.length : 0)
  }
}

/**
 * Retrieves full details for a shipment including its manifest packages.
 *
 * @param {string} ref
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function getShipment(ref, options = {}) {
  const response = await api.get(`/v1/shipments/${encodeURIComponent(ref)}`, options)
  return response.data || response
}

/**
 * Creates and dispatches a shipment with selected serialized packages.
 *
 * @param {object} payload
 * @param {string} payload.toOrgId
 * @param {Array<string>} payload.packageSerials
 * @param {string} [payload.allocationScope='COMMERCIAL']
 * @param {string} [payload.notes]
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function createShipment(payload, options = {}) {
  const response = await api.post('/v1/shipments', payload, options)
  return response.data || response
}

/**
 * Records receiving dispositions for an incoming shipment.
 *
 * @param {string} ref
 * @param {object} payload
 * @param {string} [payload.receivingDisposition='accepted'] - 'accepted', 'damaged', 'partial', 'rejected'
 * @param {Array<string>} [payload.missingSerials=[]]
 * @param {string} [payload.damageNotes]
 * @param {Array<string>} [payload.rejectedSerials=[]]
 * @param {object} [payload.rejectionReasons={}]
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function receiveShipment(ref, payload, options = {}) {
  const response = await api.post(`/v1/shipments/${encodeURIComponent(ref)}/receive`, payload, options)
  return response.data || response
}

/**
 * Closes reconciliation for a shipment after all issues are resolved.
 *
 * @param {string} ref
 * @param {object} [payload={}]
 * @param {string} [payload.resolutionNotes]
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function closeReconciliation(ref, payload = {}, options = {}) {
  const response = await api.post(`/v1/shipments/${encodeURIComponent(ref)}/close-reconciliation`, payload, options)
  return response.data || response
}

/**
 * Records physical handover rejection for a package.
 *
 * @param {string} ref
 * @param {object} payload
 * @param {string} payload.packageSerial
 * @param {string} [payload.reason]
 * @param {string} [payload.notes]
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function recordRejectedHandover(ref, payload, options = {}) {
  const response = await api.post(`/v1/shipments/${encodeURIComponent(ref)}/rejected-handover`, payload, options)
  return response.data || response
}

/**
 * Retrieves packages in caller's custody eligible to be dispatched.
 *
 * @param {object} [options={}]
 * @returns {Promise<Array<object>>}
 */
export async function getEligiblePackages(options = {}) {
  const response = await api.get('/v1/shipments/eligible-packages', options)
  return response.data || []
}

/**
 * Retrieves valid downstream destination organizations for caller's tier.
 *
 * @param {object} [options={}]
 * @returns {Promise<Array<object>>}
 */
export async function getEligibleDestinations(options = {}) {
  const response = await api.get('/v1/shipments/destinations', options)
  return response.data || []
}

/**
 * Retrieves inventory packages currently in custody of caller's organization.
 *
 * @param {object} [params={}]
 * @param {string} [params.status]
 * @param {string} [params.search]
 * @param {number} [params.limit=100]
 * @param {number} [params.offset=0]
 * @param {object} [options={}]
 * @returns {Promise<{ inventory: Array<object>, total: number }>}
 */
export async function getCustodyInventory(params = {}, options = {}) {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.search) query.set('search', params.search)
  if (params.limit) query.set('limit', String(params.limit))
  if (params.offset) query.set('offset', String(params.offset))

  const queryString = query.toString()
  const endpoint = `/v1/shipments/inventory${queryString ? `?${queryString}` : ''}`
  const response = await api.get(endpoint, options)
  const data = response.data || response
  return {
    inventory: Array.isArray(data) ? data : (data.inventory || []),
    total: response.total ?? data.total ?? (Array.isArray(data) ? data.length : 0)
  }
}
