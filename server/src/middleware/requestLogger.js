// PharmaTrace AI — HTTP Request Logger Middleware
import { logger } from '../utils/logger.js'

/**
 * Safely extracts only the request pathname from a URL or Express request.
 * Completely strips query strings, hash fragments, and credentials.
 * Never logs query strings, regardless of parameter names, capitalization, percent-encoding, or values.
 *
 * @param {string|object} input - Raw URL string or Express request object
 * @returns {string} Sanitized URL pathname safe for logging
 */
export function sanitizeLogUrl(input) {
  if (!input) return '/'
  const rawUrl = typeof input === 'string' ? input : (input.originalUrl || input.url || '/')
  if (typeof rawUrl !== 'string') return '/'

  const queryIndex = rawUrl.indexOf('?')
  const cleanUrl = queryIndex !== -1 ? rawUrl.slice(0, queryIndex) : rawUrl
  const hashIndex = cleanUrl.indexOf('#')
  const pathname = hashIndex !== -1 ? cleanUrl.slice(0, hashIndex) : cleanUrl

  return pathname || '/'
}

export function requestLogger(req, res, next) {
  const start = Date.now()

  res.on('finish', () => {
    const durationMs = Date.now() - start
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'
    const pathname = sanitizeLogUrl(req.originalUrl || req.url)

    logger[level](`${req.method} ${pathname} ${res.statusCode} (${durationMs}ms)`, {
      ip: req.ip,
      statusCode: res.statusCode,
      durationMs
    })
  })

  next()
}
