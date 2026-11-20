// PharmaTrace AI — Public Verification API Client
// Connects UI to live MariaDB verification endpoint
import { api } from './api.js'

/**
 * Verifies a package serial against the live MariaDB registry.
 *
 * @param {string} serial
 * @param {object} [options={}]
 * @param {boolean} [options.record=false] - Whether to increment verification counter
 * @returns {Promise<object>} Verification result payload
 */
export async function verifyPackage(serial, options = {}) {
  const cleanSerial = String(serial || '').trim().toUpperCase()
  const recordParam = options.record ? '&record=true' : ''
  const endpoint = `/v1/verify?serial=${encodeURIComponent(cleanSerial)}${recordParam}`

  try {
    const response = await api.get(endpoint, options)
    return response.data || response
  } catch (error) {
    if (error.statusCode === 404 && error.data?.data) {
      return error.data.data
    }
    throw error
  }
}
