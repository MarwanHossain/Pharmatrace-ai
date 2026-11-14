// PharmaTrace AI — CSRF Protection Middleware
// Conforms to Revision 3.2 Triple-Lock CSRF Defense Specification
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { sanitizeLogUrl } from './requestLogger.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Extracts and validates the request origin against allowed CORS origins.
 * Falls back to Referer origin if Origin header is not present.
 *
 * @param {string|undefined} originHeader
 * @param {string|undefined} refererHeader
 * @returns {boolean}
 */
function isOriginAllowed(originHeader, refererHeader) {
  let candidateOrigin = originHeader

  if (!candidateOrigin && refererHeader) {
    try {
      const parsed = new URL(refererHeader)
      candidateOrigin = parsed.origin
    } catch {
      return false
    }
  }

  if (!candidateOrigin) {
    return false
  }

  return env.CORS_ORIGIN.includes(candidateOrigin)
}

/**
 * CSRF Protection Middleware for mutating endpoints (POST, PUT, PATCH, DELETE).
 * Enforces:
 * 1. Mandatory X-Requested-With: XMLHttpRequest header.
 * 2. Origin / Referer validation against configured env.CORS_ORIGIN.
 */
export function csrfProtection(req, res, next) {
  // Safe read-only HTTP methods are exempt from CSRF checks
  if (SAFE_METHODS.has(req.method)) {
    return next()
  }

  // 1. Check custom X-Requested-With header
  const requestedWith = req.headers['x-requested-with']
  if (!requestedWith || requestedWith.toLowerCase() !== 'xmlhttprequest') {
    logger.warn('CSRF rejected: missing or invalid X-Requested-With header', {
      method: req.method,
      path: sanitizeLogUrl(req.originalUrl || req.url),
      ip: req.ip
    })
    return res.status(403).json({
      success: false,
      error: {
        code: 'CSRF_INVALID_HEADER',
        message: 'Mutating requests require a valid X-Requested-With header.'
      }
    })
  }

  // 2. Validate Origin / Referer
  const origin = req.headers.origin
  const referer = req.headers.referer

  if (!isOriginAllowed(origin, referer)) {
    logger.warn('CSRF rejected: untrusted origin/referer', {
      method: req.method,
      path: sanitizeLogUrl(req.originalUrl || req.url),
      origin,
      referer,
      allowed: env.CORS_ORIGIN
    })
    return res.status(403).json({
      success: false,
      error: {
        code: 'CSRF_UNTRUSTED_ORIGIN',
        message: 'Request origin or referer is not authorized.'
      }
    })
  }

  next()
}
