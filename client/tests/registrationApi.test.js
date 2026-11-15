// PharmaTrace AI — Registration API Service Tests
// Verifies HTTP client, CSRF injection, FormData handling, Bearer transport, and error normalization
import test from 'node:test'
import assert from 'node:assert/strict'

import { api, apiRequest, normalizeApiError, getApiBaseUrl } from '../src/services/api.js'
import {
  getCategoriesAvailability,
  submitRegistration,
  trackRegistration,
  verifyAccessToken,
  resubmitRegistration,
  DOCUMENT_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_PER_SUBMISSION
} from '../src/services/registrationApi.js'

test('getApiBaseUrl resolves default /api when no env is set', () => {
  const base = getApiBaseUrl()
  assert.ok(typeof base === 'string')
  assert.ok(base.length > 0)
})

test('normalizeApiError standardizes structured backend errors', () => {
  const fakeResponse = { status: 400, statusText: 'Bad Request' }
  const fakeBody = {
    success: false,
    error: {
      code: 'DOCUMENTS_REQUIRED',
      message: 'At least one document is required.'
    }
  }

  const err = normalizeApiError(fakeResponse, fakeBody, null)
  assert.equal(err.name, 'ApiError')
  assert.equal(err.statusCode, 400)
  assert.equal(err.code, 'DOCUMENTS_REQUIRED')
  assert.equal(err.message, 'At least one document is required.')
})

test('normalizeApiError standardizes network failures and abort errors', () => {
  const abortErr = new Error('The operation was aborted')
  abortErr.name = 'AbortError'
  const normalizedAbort = normalizeApiError(null, null, abortErr)
  assert.equal(normalizedAbort.code, 'REQUEST_ABORTED')
  assert.equal(normalizedAbort.statusCode, 0)

  const netErr = new Error('fetch failed')
  const normalizedNet = normalizeApiError(null, null, netErr)
  assert.equal(normalizedNet.code, 'NETWORK_ERROR')
  assert.equal(normalizedNet.statusCode, 0)
})

test('api.get dispatches GET with no CSRF header', async () => {
  const originalFetch = globalThis.fetch
  let capturedUrl = null
  let capturedOptions = null

  try {
    globalThis.fetch = async (url, options) => {
      capturedUrl = url
      capturedOptions = options
      return new Response(JSON.stringify({ success: true, data: { ok: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const res = await api.get('/v1/test')
    assert.equal(res.success, true)
    assert.ok(capturedUrl.endsWith('/v1/test'))
    assert.equal(capturedOptions.method, 'GET')
    assert.equal(capturedOptions.headers.get('X-Requested-With'), null)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('api.post with JSON body serializes payload and injects X-Requested-With header', async () => {
  const originalFetch = globalThis.fetch
  let capturedOptions = null

  try {
    globalThis.fetch = async (url, options) => {
      capturedOptions = options
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const payload = { referenceNumber: 'REG-2026-0001', trackingPin: '123456' }
    await api.post('/v1/test', payload)

    assert.equal(capturedOptions.method, 'POST')
    assert.equal(capturedOptions.headers.get('X-Requested-With'), 'XMLHttpRequest')
    assert.equal(capturedOptions.headers.get('Content-Type'), 'application/json')
    assert.equal(capturedOptions.body, JSON.stringify(payload))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('api.post with FormData retains multipart boundary without manual Content-Type override', async () => {
  const originalFetch = globalThis.fetch
  let capturedOptions = null

  try {
    globalThis.fetch = async (url, options) => {
      capturedOptions = options
      return new Response(JSON.stringify({ success: true, data: { id: '123' } }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const fd = new FormData()
    fd.append('category', 'manufacturer')
    fd.append('org_name', 'Acme Labs')

    await api.post('/v1/registrations', fd)

    assert.equal(capturedOptions.method, 'POST')
    assert.equal(capturedOptions.headers.get('X-Requested-With'), 'XMLHttpRequest')
    // Browser / Fetch must generate boundary; Content-Type must not be manually forced
    assert.equal(capturedOptions.headers.get('Content-Type'), null)
    assert.ok(capturedOptions.body instanceof FormData)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('getCategoriesAvailability dispatches to /v1/registrations/categories/availability', async () => {
  const originalFetch = globalThis.fetch
  let capturedUrl = null

  try {
    globalThis.fetch = async (url) => {
      capturedUrl = url
      return new Response(JSON.stringify({
        success: true,
        data: {
          categories: [
            { category: 'manufacturer', isAvailable: true, remainingSlots: null }
          ]
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const data = await getCategoriesAvailability()
    assert.ok(capturedUrl.includes('/v1/registrations/categories/availability'))
    assert.equal(data.categories.length, 1)
    assert.equal(data.categories[0].category, 'manufacturer')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('submitRegistration rejects non-FormData input and dispatches POST /v1/registrations', async () => {
  await assert.rejects(
    async () => submitRegistration({ category: 'distributor' }),
    /requires a FormData payload/
  )

  const originalFetch = globalThis.fetch
  let capturedUrl = null
  let capturedOptions = null

  try {
    globalThis.fetch = async (url, options) => {
      capturedUrl = url
      capturedOptions = options
      return new Response(JSON.stringify({
        success: true,
        data: { referenceNumber: 'REG-2026-0004', trackingPin: '948210' }
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const fd = new FormData()
    fd.append('category', 'manufacturer')
    const res = await submitRegistration(fd)

    assert.ok(capturedUrl.includes('/v1/registrations'))
    assert.equal(capturedOptions.method, 'POST')
    assert.equal(capturedOptions.headers.get('X-Requested-With'), 'XMLHttpRequest')
    assert.equal(res.referenceNumber, 'REG-2026-0004')
    assert.equal(res.trackingPin, '948210')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('trackRegistration validates input credentials and dispatches POST /v1/registrations/track', async () => {
  await assert.rejects(
    async () => trackRegistration({ referenceNumber: '', trackingPin: '' }),
    /Both reference number and tracking PIN are required/
  )

  const originalFetch = globalThis.fetch
  let capturedUrl = null
  let capturedBody = null

  try {
    globalThis.fetch = async (url, options) => {
      capturedUrl = url
      capturedBody = JSON.parse(options.body)
      return new Response(JSON.stringify({
        success: true,
        data: {
          referenceNumber: 'REG-2026-0004',
          status: 'UNDER_REVIEW'
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const result = await trackRegistration({
      referenceNumber: 'REG-2026-0004',
      trackingPin: '849201'
    })

    assert.ok(capturedUrl.includes('/v1/registrations/track'))
    assert.equal(capturedBody.referenceNumber, 'REG-2026-0004')
    assert.equal(capturedBody.trackingPin, '849201')
    assert.equal(result.status, 'UNDER_REVIEW')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('verifyAccessToken validates 64-hex format and strictly transmits via Bearer header with cache no-store', async () => {
  // Rejects invalid token formats
  await assert.rejects(
    async () => verifyAccessToken('short-token'),
    /valid 64-character hexadecimal access token/
  )
  await assert.rejects(
    async () => verifyAccessToken('not-a-hex-token-000000000000000000000000000000000000000000000000000000'),
    /valid 64-character hexadecimal access token/
  )

  const validToken = 'a'.repeat(64)
  const originalFetch = globalThis.fetch
  let capturedUrl = null
  let capturedOptions = null

  try {
    globalThis.fetch = async (url, options) => {
      capturedUrl = url
      capturedOptions = options
      return new Response(JSON.stringify({
        success: true,
        data: {
          valid: true,
          referenceNumber: 'REG-2026-0004',
          status: 'INFORMATION_REQUESTED'
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const result = await verifyAccessToken(validToken)
    assert.ok(capturedUrl.includes('/v1/registrations/access/verify'))
    // Must NOT contain query parameter
    assert.equal(capturedUrl.includes('token='), false)
    assert.equal(capturedOptions.headers.get('Authorization'), `Bearer ${validToken}`)
    assert.equal(capturedOptions.cache, 'no-store')
    assert.equal(result.valid, true)
    assert.equal(result.status, 'INFORMATION_REQUESTED')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('resubmitRegistration enforces mutual exclusivity between Bearer token and Reference+PIN', async () => {
  const fd = new FormData()

  // Neither provided
  await assert.rejects(
    async () => resubmitRegistration({ auth: {}, formData: fd }),
    /Authentication required/
  )

  // Both provided
  await assert.rejects(
    async () => resubmitRegistration({
      auth: {
        token: 'a'.repeat(64),
        referenceNumber: 'REG-2026-0004',
        trackingPin: '123456'
      },
      formData: fd
    }),
    /Ambiguous authentication/
  )
})

test('resubmitRegistration with Bearer token dispatches Authorization header and no credentials in body', async () => {
  const validToken = 'b'.repeat(64)
  const originalFetch = globalThis.fetch
  let capturedOptions = null

  try {
    globalThis.fetch = async (url, options) => {
      capturedOptions = options
      return new Response(JSON.stringify({
        success: true,
        data: {
          referenceNumber: 'REG-2026-0004',
          status: 'UNDER_REVIEW',
          version: 2
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const fd = new FormData()
    fd.append('org_name', 'Acme Updated Ltd')

    const res = await resubmitRegistration({
      auth: { token: validToken },
      formData: fd
    })

    assert.equal(capturedOptions.headers.get('Authorization'), `Bearer ${validToken}`)
    assert.equal(capturedOptions.headers.get('X-Requested-With'), 'XMLHttpRequest')
    assert.equal(fd.has('trackingPin'), false)
    assert.equal(res.status, 'UNDER_REVIEW')
    assert.equal(res.version, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('resubmitRegistration with Reference + PIN appends credentials to FormData without Bearer header', async () => {
  const originalFetch = globalThis.fetch
  let capturedOptions = null

  try {
    globalThis.fetch = async (url, options) => {
      capturedOptions = options
      return new Response(JSON.stringify({
        success: true,
        data: {
          referenceNumber: 'REG-2026-0004',
          status: 'UNDER_REVIEW',
          version: 2
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const fd = new FormData()
    fd.append('org_name', 'Acme Updated Ltd')

    const res = await resubmitRegistration({
      auth: { referenceNumber: 'REG-2026-0004', trackingPin: '998877' },
      formData: fd
    })

    assert.equal(capturedOptions.headers.get('Authorization'), null)
    assert.equal(capturedOptions.headers.get('X-Requested-With'), 'XMLHttpRequest')
    assert.equal(fd.get('referenceNumber'), 'REG-2026-0004')
    assert.equal(fd.get('trackingPin'), '998877')
    assert.equal(res.version, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('constants match DGDA regulatory specifications', () => {
  assert.equal(MAX_FILE_SIZE_BYTES, 10 * 1024 * 1024)
  assert.equal(MAX_FILES_PER_SUBMISSION, 10)
  assert.ok(DOCUMENT_TYPES.some(d => d.value === 'MANUFACTURING_LICENSE'))
  assert.ok(DOCUMENT_TYPES.some(d => d.value === 'DRUG_LICENSE'))
  assert.ok(DOCUMENT_TYPES.some(d => d.value === 'WHOLESALE_LICENSE'))
  assert.ok(DOCUMENT_TYPES.some(d => d.value === 'DGHS_FACILITY_GAZETTE'))
})
