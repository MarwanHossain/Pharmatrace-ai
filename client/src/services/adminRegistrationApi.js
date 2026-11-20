// PharmaTrace AI — Administrator Registration API Service
// Connects the administrator frontend to administrative registration review endpoints

import { api, downloadFile } from './api.js'

export const REGISTRATION_STATUSES = Object.freeze([
  'SUBMITTED',
  'UNDER_REVIEW',
  'INFORMATION_REQUESTED',
  'APPROVED',
  'REJECTED'
])

export const ALLOWED_CATEGORIES = Object.freeze([
  'manufacturer',
  'distributor',
  'wholesaler',
  'pharmacy'
])

export const ALLOWED_SORT_COLUMNS = Object.freeze([
  'created_at',
  'updated_at',
  'org_name',
  'reference_number',
  'category',
  'status'
])

/**
 * Lists paginated registrations with filtering, search, and sorting.
 *
 * @param {object} [params={}]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=20]
 * @param {string} [params.status]
 * @param {string} [params.category]
 * @param {string} [params.search]
 * @param {string} [params.sortBy='created_at']
 * @param {'ASC'|'DESC'} [params.sortOrder='DESC']
 * @param {object} [options={}]
 * @returns {Promise<{ items: Array<object>, pagination: { page: number, limit: number, totalItems: number, totalPages: number } }>}
 */
export async function listRegistrations(params = {}, options = {}) {
  const query = new URLSearchParams()
  if (params.page !== undefined && params.page !== null) query.set('page', String(params.page))
  if (params.limit !== undefined && params.limit !== null) query.set('limit', String(params.limit))
  if (params.status) query.set('status', String(params.status).trim())
  if (params.category) query.set('category', String(params.category).trim())
  if (params.search && String(params.search).trim()) query.set('search', String(params.search).trim())
  if (params.sortBy) query.set('sortBy', String(params.sortBy).trim())
  if (params.sortOrder) query.set('sortOrder', String(params.sortOrder).trim().toUpperCase())

  const queryString = query.toString()
  const endpoint = `/v1/admin/registrations${queryString ? `?${queryString}` : ''}`
  const response = await api.get(endpoint, options)
  return response.data || response
}

/**
 * Retrieves full application dossier, submission version history, document metadata, and regulatory audit log.
 *
 * @param {string} id - Registration UUID
 * @param {object} [options={}]
 * @returns {Promise<{ registration: object, submissions: Array<object>, documents: Array<object>, auditLog: Array<object> }>}
 */
export async function getRegistrationDetail(id, options = {}) {
  if (!id) throw new Error('Registration ID is required.')
  const response = await api.get(`/v1/admin/registrations/${encodeURIComponent(id)}`, options)
  return response.data || response
}

/**
 * Downloads a verification document safely as a binary file.
 *
 * @param {string} registrationId
 * @param {string} documentId
 * @param {string} [fallbackFilename='document.bin']
 * @param {object} [options={}]
 * @returns {Promise<void>}
 */
export async function downloadRegistrationDocument(registrationId, documentId, fallbackFilename = 'document.bin', options = {}) {
  if (!registrationId || !documentId) {
    throw new Error('Registration ID and Document ID are required.')
  }
  const endpoint = `/v1/admin/registrations/${encodeURIComponent(registrationId)}/documents/${encodeURIComponent(documentId)}/download`
  return downloadFile(endpoint, fallbackFilename, options)
}

/**
 * Fetches an uploaded registration verification document as an authenticated Blob for inline preview.
 *
 * @param {string} registrationId
 * @param {string} documentId
 * @param {object} [options={}]
 * @returns {Promise<Blob>}
 */
export async function fetchRegistrationDocumentBlob(registrationId, documentId, options = {}) {
  if (!registrationId || !documentId) {
    throw new Error('Registration ID and Document ID are required.')
  }
  const endpoint = `/v1/admin/registrations/${encodeURIComponent(registrationId)}/documents/${encodeURIComponent(documentId)}/preview`
  return await api.blob(endpoint, options)
}

/**
 * Initiates review on a SUBMITTED registration, transitioning it to UNDER_REVIEW.
 *
 * @param {string} id
 * @param {object} [payload={}]
 * @param {string} [payload.reviewNotes]
 * @param {object} [options={}]
 * @returns {Promise<{ id: string, referenceNumber: string, status: string }>}
 */
export async function startReview(id, payload = {}, options = {}) {
  if (!id) throw new Error('Registration ID is required.')
  const response = await api.post(
    `/v1/admin/registrations/${encodeURIComponent(id)}/review`,
    { reviewNotes: payload.reviewNotes || undefined },
    options
  )
  return response.data || response
}

/**
 * Requests additional information/documentation from applicant.
 * Transitions UNDER_REVIEW -> INFORMATION_REQUESTED and issues single-use access link.
 *
 * @param {string} id
 * @param {object} payload
 * @param {string} payload.reason - Mandatory reason (>= 10 characters)
 * @param {number} [payload.cureDays=7] - Integer between 1 and 30
 * @param {object} [options={}]
 * @returns {Promise<{ id: string, referenceNumber: string, status: string, expiresAt: string, notificationStatus: string }>}
 */
export async function requestInformation(id, payload = {}, options = {}) {
  if (!id) throw new Error('Registration ID is required.')
  if (!payload.reason || String(payload.reason).trim().length < 10) {
    const err = new Error('Reason for requesting information must be at least 10 characters.')
    err.code = 'INVALID_INPUT'
    throw err
  }
  const cureDays = Math.min(30, Math.max(1, parseInt(payload.cureDays, 10) || 7))
  const response = await api.post(
    `/v1/admin/registrations/${encodeURIComponent(id)}/request-info`,
    {
      reason: String(payload.reason).trim(),
      cureDays
    },
    options
  )
  return response.data || response
}

/**
 * Reissues an information request link for an application in INFORMATION_REQUESTED status.
 *
 * @param {string} id
 * @param {object} [payload={}]
 * @param {number} [payload.cureDays=7]
 * @param {object} [options={}]
 * @returns {Promise<{ id: string, referenceNumber: string, status: string, expiresAt: string, notificationStatus: string }>}
 */
export async function resendInformationLink(id, payload = {}, options = {}) {
  if (!id) throw new Error('Registration ID is required.')
  const cureDays = payload.cureDays !== undefined
    ? Math.min(30, Math.max(1, parseInt(payload.cureDays, 10) || 7))
    : 7
  const response = await api.post(
    `/v1/admin/registrations/${encodeURIComponent(id)}/resend-information-link`,
    { cureDays },
    options
  )
  return response.data || response
}

/**
 * Atomically approves registration, validates category quota under mutex, provisions
 * production organization and initial user, and generates activation token.
 *
 * @param {string} id
 * @param {object} [payload={}]
 * @param {string} [payload.reviewNotes]
 * @param {boolean} [payload.dghsVerified=false]
 * @param {object} [options={}]
 * @returns {Promise<{ registrationId: string, referenceNumber: string, organizationId: string, userId: string, status: string, notificationStatus: string }>}
 */
export async function approveRegistration(id, payload = {}, options = {}) {
  if (!id) throw new Error('Registration ID is required.')
  const response = await api.post(
    `/v1/admin/registrations/${encodeURIComponent(id)}/approve`,
    {
      reviewNotes: payload.reviewNotes || undefined,
      dghsVerified: Boolean(payload.dghsVerified)
    },
    options
  )
  return response.data || response
}

/**
 * Formally rejects registration with statutory reason and explanation.
 *
 * @param {string} id
 * @param {object} payload
 * @param {string} payload.rejectionReason - Mandatory reason (>= 3 characters)
 * @param {string} payload.rejectionExplanation - Mandatory explanation (>= 10 characters)
 * @param {object} [options={}]
 * @returns {Promise<{ id: string, referenceNumber: string, status: string }>}
 */
export async function rejectRegistration(id, payload = {}, options = {}) {
  if (!id) throw new Error('Registration ID is required.')
  if (!payload.rejectionReason || String(payload.rejectionReason).trim().length < 3) {
    const err = new Error('Rejection reason must be at least 3 characters.')
    err.code = 'INVALID_INPUT'
    throw err
  }
  if (!payload.rejectionExplanation || String(payload.rejectionExplanation).trim().length < 10) {
    const err = new Error('Rejection explanation must be at least 10 characters.')
    err.code = 'INVALID_INPUT'
    throw err
  }
  const response = await api.post(
    `/v1/admin/registrations/${encodeURIComponent(id)}/reject`,
    {
      rejectionReason: String(payload.rejectionReason).trim(),
      rejectionExplanation: String(payload.rejectionExplanation).trim()
    },
    options
  )
  return response.data || response
}

/**
 * Reissues an account activation token for an approved registration.
 *
 * @param {string} id
 * @param {object} [options={}]
 * @returns {Promise<{ registrationId: string, organizationId: string, userId: string, notificationStatus: string }>}
 */
export async function resendActivation(id, options = {}) {
  if (!id) throw new Error('Registration ID is required.')
  const response = await api.post(
    `/v1/admin/registrations/${encodeURIComponent(id)}/resend-activation`,
    {},
    options
  )
  return response.data || response
}

/**
 * Retrieves authoritative summary metrics across all registration statuses.
 * Dispatches concurrent lightweight count queries using limit=1.
 *
 * @param {object} [options={}]
 * @returns {Promise<{ total: number|null, submitted: number|null, underReview: number|null, infoRequested: number|null, approved: number|null, rejected: number|null, hasErrors: boolean }>}
 */
export async function getRegistrationMetrics(options = {}) {
  const queries = [
    listRegistrations({ limit: 1 }, options),
    listRegistrations({ limit: 1, status: 'SUBMITTED' }, options),
    listRegistrations({ limit: 1, status: 'UNDER_REVIEW' }, options),
    listRegistrations({ limit: 1, status: 'INFORMATION_REQUESTED' }, options),
    listRegistrations({ limit: 1, status: 'APPROVED' }, options),
    listRegistrations({ limit: 1, status: 'REJECTED' }, options)
  ]

  const results = await Promise.allSettled(queries)

  const extractCount = (res) => {
    if (res.status === 'fulfilled' && res.value?.pagination?.totalItems !== undefined) {
      return Number(res.value.pagination.totalItems)
    }
    return null
  }

  const [totRes, subRes, revRes, infRes, appRes, rejRes] = results
  const hasErrors = results.some(r => r.status === 'rejected')

  return {
    total: extractCount(totRes),
    submitted: extractCount(subRes),
    underReview: extractCount(revRes),
    infoRequested: extractCount(infRes),
    approved: extractCount(appRes),
    rejected: extractCount(rejRes),
    hasErrors
  }
}
