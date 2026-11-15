// PharmaTrace AI — Central HTTP Client
// Implements secure CSRF headers, FormData handling, and error normalization

/**
 * Resolves the configured API base URL from Vite environment or Node process environment.
 * Defaults to '/api' for same-origin or proxied API requests.
 */
export function getApiBaseUrl() {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL
  }
  if (typeof process !== 'undefined' && process.env && process.env.VITE_API_BASE_URL) {
    return process.env.VITE_API_BASE_URL
  }
  return '/api'
}

/**
 * Normalizes an API error from a failed response or network error.
 *
 * @param {Response|null} response - Fetch response object if available
 * @param {any} body - Parsed JSON body or text from response
 * @param {Error|null} originalError - Original network or execution error
 * @returns {Error & { statusCode: number, code: string, data: any }}
 */
export function normalizeApiError(response, body, originalError) {
  let statusCode = response ? response.status : 0
  let code = 'NETWORK_ERROR'
  let message = 'Unable to connect to the server. Please verify your connection.'

  if (response) {
    if (body && typeof body === 'object') {
      if (body.error && typeof body.error === 'object') {
        code = body.error.code || `HTTP_${statusCode}`
        message = body.error.message || `Request failed with status ${statusCode}`
      } else if (body.message) {
        code = body.code || `HTTP_${statusCode}`
        message = body.message
      }
    } else if (typeof body === 'string' && body.trim().length > 0) {
      message = body.trim()
      code = `HTTP_${statusCode}`
    } else {
      code = `HTTP_${statusCode}`
      message = response.statusText || `Request failed with status ${statusCode}`
    }
  } else if (originalError) {
    if (originalError.name === 'AbortError') {
      code = 'REQUEST_ABORTED'
      message = 'Request was cancelled.'
    } else if (originalError.message) {
      message = originalError.message
    }
  }

  const err = new Error(message)
  err.name = 'ApiError'
  err.statusCode = statusCode
  err.code = code
  err.data = body
  return err
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Dispatches an HTTP request with automatic CSRF header injection and structured error handling.
 *
 * @param {string} endpoint - Relative API endpoint path (e.g. '/v1/registrations')
 * @param {RequestInit & { baseUrl?: string, skipCsrf?: boolean }} options
 * @returns {Promise<any>}
 */
export async function apiRequest(endpoint, options = {}) {
  const {
    baseUrl = getApiBaseUrl(),
    method = 'GET',
    headers: customHeaders = {},
    body,
    signal,
    cache,
    ...restOptions
  } = options

  const upperMethod = method.toUpperCase()
  const cleanBase = baseUrl.replace(/\/+$/, '')
  const cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  const url = `${cleanBase}${cleanPath}`

  const headers = new Headers(customHeaders)

  // Attach Triple-Lock CSRF header on mutating requests
  if (MUTATING_METHODS.has(upperMethod) && !options.skipCsrf) {
    headers.set('X-Requested-With', 'XMLHttpRequest')
  }

  let processedBody = body
  // Check if body is FormData
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData

  if (!isFormData && body && typeof body === 'object' && !(body instanceof Blob) && !(body instanceof ArrayBuffer)) {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    processedBody = JSON.stringify(body)
  }

  // If FormData, explicitly delete Content-Type to allow fetch to supply boundary
  if (isFormData && headers.has('Content-Type')) {
    headers.delete('Content-Type')
  }

  try {
    const response = await fetch(url, {
      method: upperMethod,
      headers,
      body: processedBody,
      signal,
      cache,
      ...restOptions
    })

    const contentType = response.headers.get('content-type') || ''
    let parsedData = null
    if (contentType.includes('application/json')) {
      try {
        parsedData = await response.json()
      } catch {
        parsedData = null
      }
    } else {
      try {
        parsedData = await response.text()
      } catch {
        parsedData = null
      }
    }

    if (!response.ok) {
      throw normalizeApiError(response, parsedData, null)
    }

    return parsedData
  } catch (err) {
    if (err.name === 'ApiError') {
      throw err
    }
    throw normalizeApiError(null, null, err)
  }
}

export const api = {
  get: (endpoint, options = {}) => apiRequest(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options = {}) => apiRequest(endpoint, { ...options, method: 'POST', body }),
  put: (endpoint, body, options = {}) => apiRequest(endpoint, { ...options, method: 'PUT', body }),
  patch: (endpoint, body, options = {}) => apiRequest(endpoint, { ...options, method: 'PATCH', body }),
  delete: (endpoint, options = {}) => apiRequest(endpoint, { ...options, method: 'DELETE' })
}

export default api
