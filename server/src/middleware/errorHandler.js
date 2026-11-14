// PharmaTrace AI — Centralized Error Handling Middleware
import { logger } from '../utils/logger.js'
import { env } from '../config/env.js'
import { sanitizeLogUrl } from './requestLogger.js'

export function errorHandler(err, req, res, _next) {
  // Capture status code from error or default to 500
  const statusCode = Number.isInteger(err.status) && err.status >= 400 && err.status < 600
    ? err.status
    : Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 600
      ? err.statusCode
      : 500

  // Log error internally with sanitized metadata (strictly pathname only, never query strings)
  logger.error('Unhandled application error', {
    message: err.message,
    code: err.code,
    statusCode,
    url: sanitizeLogUrl(req.originalUrl || req.url),
    method: req.method
  })

  // Handle specific well-known error categories
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'BAD_REQUEST',
      message: 'Malformed JSON payload in request body.'
    })
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'PAYLOAD_TOO_LARGE',
      message: 'Request payload exceeds the configured size limit.'
    })
  }

  if (statusCode === 403) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: err.message || 'Access forbidden.'
    })
  }

  // Generic 500 response: never leak internal stack traces or database connection details to public clients
  const response = {
    error: statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_FAILED',
    message: statusCode >= 500
      ? env.NODE_ENV === 'development'
        ? err.message || 'An unexpected internal error occurred.'
        : 'An unexpected internal error occurred.'
      : err.message || 'Request could not be processed.'
  }

  return res.status(statusCode).json(response)
}
