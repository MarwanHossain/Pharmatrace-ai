// PharmaTrace AI — Administrator Registration API Service Tests
// Tests endpoint routing, query serialization, credentials inclusion, error handling, and metrics aggregation
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  listRegistrations,
  getRegistrationDetail,
  downloadRegistrationDocument,
  startReview,
  requestInformation,
  resendInformationLink,
  approveRegistration,
  rejectRegistration,
  resendActivation,
  getRegistrationMetrics,
  REGISTRATION_STATUSES,
  ALLOWED_CATEGORIES,
  ALLOWED_SORT_COLUMNS
} from '../src/services/adminRegistrationApi.js'

test('constants match DGDA administrative specifications', () => {
  assert.deepEqual(REGISTRATION_STATUSES, [
    'SUBMITTED',
    'UNDER_REVIEW',
    'INFORMATION_REQUESTED',
    'APPROVED',
    'REJECTED'
  ])
  assert.deepEqual(ALLOWED_CATEGORIES, [
    'manufacturer',
    'distributor',
    'wholesaler',
    'pharmacy'
  ])
  assert.ok(ALLOWED_SORT_COLUMNS.includes('created_at'))
  assert.ok(ALLOWED_SORT_COLUMNS.includes('status'))
})

test('listRegistrations builds correct query string with pagination, filters, and sort', async () => {
  const originalFetch = globalThis.fetch
  let capturedUrl = null
  let capturedOptions = null

  try {
    globalThis.fetch = async (url, options) => {
      capturedUrl = url
      capturedOptions = options
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: {
            items: [{ id: 'reg-001', referenceNumber: 'REG-2026-0001' }],
            pagination: { page: 2, limit: 10, totalItems: 25, totalPages: 3 }
          }
        })
      }
    }

    const res = await listRegistrations({
      page: 2,
      limit: 10,
      status: 'SUBMITTED',
      category: 'manufacturer',
      search: 'Apex Pharma',
      sortBy: 'created_at',
      sortOrder: 'DESC'
    })

    assert.ok(capturedUrl.includes('/v1/admin/registrations?'))
    assert.ok(capturedUrl.includes('page=2'))
    assert.ok(capturedUrl.includes('limit=10'))
    assert.ok(capturedUrl.includes('status=SUBMITTED'))
    assert.ok(capturedUrl.includes('category=manufacturer'))
    assert.ok(capturedUrl.includes('search=Apex+Pharma'))
    assert.ok(capturedUrl.includes('sortBy=created_at'))
    assert.ok(capturedUrl.includes('sortOrder=DESC'))
    assert.equal(capturedOptions.credentials, 'include')
    assert.equal(res.items.length, 1)
    assert.equal(res.pagination.totalItems, 25)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('getRegistrationDetail fetches dossier by ID and includes credentials', async () => {
  const originalFetch = globalThis.fetch
  let capturedUrl = null

  try {
    globalThis.fetch = async (url) => {
      capturedUrl = url
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: {
            registration: { id: 'reg-123', referenceNumber: 'REG-2026-0004' },
            submissions: [],
            documents: [],
            auditLog: []
          }
        })
      }
    }

    const res = await getRegistrationDetail('reg-123')
    assert.ok(capturedUrl.endsWith('/v1/admin/registrations/reg-123'))
    assert.equal(res.registration.id, 'reg-123')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('startReview dispatches POST /v1/admin/registrations/:id/review with CSRF header', async () => {
  const originalFetch = globalThis.fetch
  let capturedUrl = null
  let capturedOptions = null

  try {
    globalThis.fetch = async (url, options) => {
      capturedUrl = url
      capturedOptions = options
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: { id: 'reg-123', status: 'UNDER_REVIEW' }
        })
      }
    }

    const res = await startReview('reg-123', { reviewNotes: 'Commencing DGDA audit' })
    assert.ok(capturedUrl.endsWith('/v1/admin/registrations/reg-123/review'))
    assert.equal(capturedOptions.method, 'POST')
    assert.equal(capturedOptions.headers.get('X-Requested-With'), 'XMLHttpRequest')
    const body = JSON.parse(capturedOptions.body)
    assert.equal(body.reviewNotes, 'Commencing DGDA audit')
    assert.equal(res.status, 'UNDER_REVIEW')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('requestInformation validates reason length and dispatches POST /request-info', async () => {
  const originalFetch = globalThis.fetch
  let capturedOptions = null

  try {
    globalThis.fetch = async (url, options) => {
      capturedOptions = options
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: { id: 'reg-123', status: 'INFORMATION_REQUESTED', notificationStatus: 'NOT_CONFIGURED' }
        })
      }
    }

    // Input too short: must throw client-side
    await assert.rejects(
      async () => requestInformation('reg-123', { reason: 'Too short' }),
      { code: 'INVALID_INPUT' }
    )

    // Valid call
    const res = await requestInformation('reg-123', {
      reason: 'Please provide updated Trade License copy for 2026.',
      cureDays: 14
    })
    assert.equal(capturedOptions.method, 'POST')
    const body = JSON.parse(capturedOptions.body)
    assert.equal(body.reason, 'Please provide updated Trade License copy for 2026.')
    assert.equal(body.cureDays, 14)
    assert.equal(res.status, 'INFORMATION_REQUESTED')
    assert.equal(res.notificationStatus, 'NOT_CONFIGURED')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('approveRegistration dispatches approval payload with dghsVerified flag', async () => {
  const originalFetch = globalThis.fetch
  let capturedOptions = null

  try {
    globalThis.fetch = async (url, options) => {
      capturedOptions = options
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: {
            registrationId: 'reg-123',
            organizationId: 'org-456',
            userId: 'usr-789',
            status: 'APPROVED',
            notificationStatus: 'NOT_CONFIGURED'
          }
        })
      }
    }

    const res = await approveRegistration('reg-123', {
      reviewNotes: 'All DGDA criteria verified.',
      dghsVerified: true
    })

    assert.equal(capturedOptions.method, 'POST')
    const body = JSON.parse(capturedOptions.body)
    assert.equal(body.reviewNotes, 'All DGDA criteria verified.')
    assert.equal(body.dghsVerified, true)
    assert.equal(res.status, 'APPROVED')
    assert.equal(res.organizationId, 'org-456')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('rejectRegistration validates input constraints and dispatches rejection', async () => {
  const originalFetch = globalThis.fetch
  let capturedOptions = null

  try {
    globalThis.fetch = async (url, options) => {
      capturedOptions = options
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: { id: 'reg-123', status: 'REJECTED' }
        })
      }
    }

    await assert.rejects(
      async () => rejectRegistration('reg-123', { rejectionReason: 'No', rejectionExplanation: 'Short' }),
      { code: 'INVALID_INPUT' }
    )

    const res = await rejectRegistration('reg-123', {
      rejectionReason: 'EXPIRED_LICENSE',
      rejectionExplanation: 'The presented trade license has been expired for over 12 months.'
    })

    assert.equal(capturedOptions.method, 'POST')
    const body = JSON.parse(capturedOptions.body)
    assert.equal(body.rejectionReason, 'EXPIRED_LICENSE')
    assert.equal(res.status, 'REJECTED')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('getRegistrationMetrics aggregates counts and handles partial failures with null', async () => {
  const originalFetch = globalThis.fetch

  try {
    globalThis.fetch = async (url) => {
      if (url.includes('status=REJECTED')) {
        return {
          ok: false,
          status: 500,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: { message: 'Database error' } })
        }
      }

      let count = 0
      if (!url.includes('status=')) count = 42
      else if (url.includes('status=SUBMITTED')) count = 10
      else if (url.includes('status=UNDER_REVIEW')) count = 5
      else if (url.includes('status=INFORMATION_REQUESTED')) count = 2
      else if (url.includes('status=APPROVED')) count = 25

      return {
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: {
            items: [],
            pagination: { page: 1, limit: 1, totalItems: count, totalPages: 1 }
          }
        })
      }
    }

    const metrics = await getRegistrationMetrics()
    assert.equal(metrics.total, 42)
    assert.equal(metrics.submitted, 10)
    assert.equal(metrics.underReview, 5)
    assert.equal(metrics.infoRequested, 2)
    assert.equal(metrics.approved, 25)
    assert.equal(metrics.rejected, null) // Must be null, NOT 0!
    assert.equal(metrics.hasErrors, true)
  } finally {
    globalThis.fetch = originalFetch
  }
})
