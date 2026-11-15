// PharmaTrace AI — Registration API Service
// Bridges the frontend registration journey to backend registration endpoints

import { api } from './api.js'

export const DOCUMENT_TYPES = [
  { value: 'DRUG_LICENSE', label: 'Drug License' },
  { value: 'TRADE_LICENSE', label: 'Trade License' },
  { value: 'MANUFACTURING_LICENSE', label: 'Manufacturing License' },
  { value: 'WHOLESALE_LICENSE', label: 'Wholesale License' },
  { value: 'INCORPORATION_CERTIFICATE', label: 'Certificate of Incorporation' },
  { value: 'GMP_CERTIFICATE', label: 'Good Manufacturing Practice (GMP) Certificate' },
  { value: 'DGHS_FACILITY_GAZETTE', label: 'DGHS Facility Gazette / Government Order' },
  { value: 'OTHER', label: 'Other Regulatory Document' }
]

export const ALLOWED_FILE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png']
export const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB
export const MAX_FILES_PER_SUBMISSION = 10

/**
 * Derives badge state and user-friendly regulatory messaging from a category policy.
 *
 * @param {object} policy
 * @param {boolean} [policy.isAvailable]
 * @param {boolean} [policy.isRegistrationAllowed]
 * @param {number|null} [policy.remainingSlots]
 * @param {number|null} [policy.maxActiveInstances]
 * @param {number} [policy.activeInstances]
 * @returns {{ state: 'available'|'full'|'closed', label: string, hint: string, tone: string }}
 */
export function getCategoryBadgeInfo(policy = {}) {
  if (!policy.isRegistrationAllowed) {
    return {
      state: 'closed',
      label: 'Registrations Closed',
      hint: 'New applications for this category are administratively paused by DGDA policy.',
      tone: 'bg-slate-100 text-slate-700 border-slate-300'
    }
  }

  if (!policy.isAvailable) {
    return {
      state: 'full',
      label: 'Capacity Reached',
      hint: 'The regulatory quota for active organizations in this category is currently full.',
      tone: 'bg-amber-soft text-amber-ink border-amber-line'
    }
  }

  const slotText = policy.remainingSlots !== null && policy.remainingSlots !== undefined
    ? ` (${policy.remainingSlots} slot${policy.remainingSlots === 1 ? '' : 's'} remaining)`
    : ''

  return {
    state: 'available',
    label: `Available${slotText}`,
    hint: 'Applications open for licensed entities.',
    tone: 'bg-clinical-soft text-emerald-800 border-emerald-300'
  }
}

/**
 * Retrieves real-time category availability and remaining capacity limits.
 *
 * @param {object} [options]
 * @returns {Promise<{ categories: Array<object> }>}
 */
export async function getCategoriesAvailability(options = {}) {
  const response = await api.get('/v1/registrations/categories/availability', options)
  return response.data || { categories: [] }
}

/**
 * Submits an initial public organization registration application.
 *
 * @param {FormData} formData
 * @param {object} [options]
 * @returns {Promise<{ registrationId: string, referenceNumber: string, trackingPin: string, ... }>}
 */
export async function submitRegistration(formData, options = {}) {
  if (!(formData instanceof FormData)) {
    throw new Error('Registration submission requires a FormData payload.')
  }
  const response = await api.post('/v1/registrations', formData, options)
  return response.data
}

/**
 * Queries the current status and review notes for a submitted registration.
 *
 * @param {{ referenceNumber: string, trackingPin: string }} credentials
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function trackRegistration({ referenceNumber, trackingPin }, options = {}) {
  if (!referenceNumber || !trackingPin) {
    const err = new Error('Both reference number and tracking PIN are required to track status.')
    err.code = 'INVALID_CREDENTIALS'
    err.statusCode = 400
    throw err
  }

  const response = await api.post(
    '/v1/registrations/track',
    {
      referenceNumber: String(referenceNumber).trim(),
      trackingPin: String(trackingPin).trim()
    },
    options
  )
  return response.data
}

/**
 * Verifies a single-use access token received via secure email link.
 * Strictly uses Authorization: Bearer token transport.
 *
 * @param {string} token - 64-character hexadecimal access token
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function verifyAccessToken(token, options = {}) {
  if (!token || typeof token !== 'string' || !/^[0-9a-fA-F]{64}$/.test(token.trim())) {
    const err = new Error('A valid 64-character hexadecimal access token is required.')
    err.code = 'INVALID_TOKEN_FORMAT'
    err.statusCode = 400
    throw err
  }

  const cleanToken = token.trim()
  const headers = {
    Authorization: `Bearer ${cleanToken}`,
    ...(options.headers || {})
  }

  const response = await api.get('/v1/registrations/access/verify', {
    ...options,
    headers,
    cache: 'no-store'
  })
  return response.data
}

/**
 * Resubmits revised registration information and documents for an application in INFORMATION_REQUESTED status.
 * Enforces mutual exclusivity between Bearer token authentication and Reference + PIN authentication.
 *
 * @param {object} params
 * @param {object} params.auth - Either { token } OR { referenceNumber, trackingPin }
 * @param {FormData} params.formData - Mutable registration fields and optional revised files
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function resubmitRegistration({ auth = {}, formData }, options = {}) {
  if (!(formData instanceof FormData)) {
    throw new Error('Resubmission requires a FormData payload.')
  }

  const hasToken = Boolean(auth.token)
  const hasPin = Boolean(auth.referenceNumber && auth.trackingPin)

  if (!hasToken && !hasPin) {
    const err = new Error('Authentication required: provide either an access token or reference number with tracking PIN.')
    err.code = 'AUTHENTICATION_REQUIRED'
    err.statusCode = 401
    throw err
  }

  if (hasToken && hasPin) {
    const err = new Error('Ambiguous authentication: provide either an access token or reference number with tracking PIN, not both.')
    err.code = 'AMBIGUOUS_AUTHENTICATION'
    err.statusCode = 400
    throw err
  }

  const headers = { ...(options.headers || {}) }

  if (hasToken) {
    const cleanToken = String(auth.token).trim()
    headers.Authorization = `Bearer ${cleanToken}`
  } else if (hasPin) {
    // Append credentials to formData if not already present
    if (!formData.has('referenceNumber') && !formData.has('reference_number')) {
      formData.append('referenceNumber', String(auth.referenceNumber).trim())
    }
    if (!formData.has('trackingPin') && !formData.has('tracking_pin')) {
      formData.append('trackingPin', String(auth.trackingPin).trim())
    }
  }

  const response = await api.post('/v1/registrations/resubmit', formData, {
    ...options,
    headers
  })
  return response.data
}

export const registrationApi = {
  getCategoriesAvailability,
  submitRegistration,
  trackRegistration,
  verifyAccessToken,
  resubmitRegistration,
  getCategoryBadgeInfo
}

export default registrationApi
