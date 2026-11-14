// PharmaTrace AI — Registration Controller
// Handles Category Availability, Public Registration Intake, Status Tracking & Resubmission
import {
  getCategoryAvailability,
  submitRegistration,
  trackRegistration as trackRegistrationService,
  verifyRegistrationAccessToken as verifyAccessTokenService,
  resubmitRegistration as resubmitRegistrationService
} from '../services/registration.service.js'
import { cleanupFiles } from '../middleware/upload.js'
import { logger } from '../utils/logger.js'

/**
 * Retrieves dynamic category availability and remaining capacity limits.
 * GET /api/v1/registrations/categories/availability
 */
export async function getCategoriesAvailability(_req, res, next) {
  try {
    const availability = await getCategoryAvailability()
    return res.status(200).json({
      success: true,
      data: availability
    })
  } catch (err) {
    logger.error('Failed to retrieve category availability', { error: err.message })
    next(err)
  }
}

/**
 * Handles public organization registration intake with document processing.
 * POST /api/v1/registrations
 */
export async function createRegistration(req, res, next) {
  try {
    const result = await submitRegistration({
      data: req.body || {},
      files: req.files || []
    })

    return res.status(201).json({
      success: true,
      data: result,
      message: 'Organization registration submitted successfully. Please save your reference number and tracking PIN securely. Your tracking PIN cannot be retrieved if lost.'
    })
  } catch (err) {
    if (err.statusCode && err.statusCode < 500) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'VALIDATION_ERROR',
          message: err.message
        }
      })
    }

    logger.error('Registration submission processing failed', {
      error: err.message,
      stack: err.stack
    })
    next(err)
  }
}

/**
 * Tracks application status via reference number and 6-digit tracking PIN.
 * POST /api/v1/registrations/track
 */
export async function trackRegistration(req, res, next) {
  try {
    const referenceNumber = req.body?.referenceNumber || req.body?.reference_number
    const trackingPin = req.body?.trackingPin || req.body?.tracking_pin

    const result = await trackRegistrationService({
      referenceNumber,
      trackingPin
    })

    return res.status(200).json({
      success: true,
      data: result
    })
  } catch (err) {
    if (err.statusCode && err.statusCode < 500) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'VALIDATION_ERROR',
          message: err.message
        }
      })
    }

    logger.error('Registration tracking failed', {
      error: err.message,
      stack: err.stack
    })
    next(err)
  }
}

/**
 * Validates a single-use registration access token without consuming it.
 * Accepts tokens strictly via Authorization: Bearer <token>.
 * Rejects query-parameter tokens with 400 INSECURE_TOKEN_TRANSPORT.
 * GET /api/v1/registrations/access/verify
 */
export async function verifyAccessToken(req, res, next) {
  // Apply strict security and anti-caching headers on all verification outcomes
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Referrer-Policy': 'no-referrer'
  })

  try {
    // 1. Strictly forbid query parameter token transport
    if (req.query && (req.query.token !== undefined || req.query.access_token !== undefined)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INSECURE_TOKEN_TRANSPORT',
          message: 'Access tokens in query parameters are strictly forbidden. Transmit the token via the Authorization header using Bearer format.'
        }
      })
    }

    // 2. Extract and validate Bearer token format
    let token = undefined
    const authHeader = req.headers['authorization']
    if (authHeader && typeof authHeader === 'string') {
      const match = authHeader.match(/^Bearer\s+([0-9a-fA-F]{64})$/i)
      if (match) {
        token = match[1]
      } else {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN_FORMAT',
            message: 'Authorization header must follow the format: Bearer <64-character-hex-token>.'
          }
        })
      }
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Access token is required in Authorization header (Bearer <token>).'
        }
      })
    }

    const result = await verifyAccessTokenService(token)

    return res.status(200).json({
      success: true,
      data: result
    })
  } catch (err) {
    if (err.statusCode && err.statusCode < 500) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'VALIDATION_ERROR',
          message: err.message
        }
      })
    }

    logger.error('Access token verification failed', {
      error: err.message,
      stack: err.stack
    })
    next(err)
  }
}

/**
 * Handles applicant resubmission for applications in INFORMATION_REQUESTED status.
 * POST /api/v1/registrations/resubmit
 */
export async function resubmitRegistration(req, res, next) {
  try {
    // Strictly forbid query parameter token transport (defensive safeguard)
    if (req.query && (req.query.token !== undefined || req.query.access_token !== undefined)) {
      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        await cleanupFiles(req.files)
      }
      return res.status(400).json({
        success: false,
        error: {
          code: 'INSECURE_TOKEN_TRANSPORT',
          message: 'Access tokens in query parameters are strictly forbidden. Transmit the token via the Authorization header using Bearer format.'
        }
      })
    }

    const authHeader = req.headers['authorization']
    let headerToken = undefined
    if (authHeader && typeof authHeader === 'string') {
      const match = authHeader.match(/^Bearer\s+([0-9a-fA-F]{64})$/i)
      if (match) {
        headerToken = match[1]
      }
    }

    const bodyToken = typeof req.body?.token === 'string' && req.body.token.trim().length > 0
      ? req.body.token.trim()
      : undefined

    const token = headerToken || bodyToken
    const referenceNumber = req.body?.referenceNumber || req.body?.reference_number
    const trackingPin = req.body?.trackingPin || req.body?.tracking_pin

    const auth = {
      referenceNumber,
      trackingPin,
      token
    }

    const result = await resubmitRegistrationService({
      auth,
      data: req.body || {},
      files: req.files || []
    })

    return res.status(200).json({
      success: true,
      data: result,
      message: 'Registration resubmitted successfully and is now under review.'
    })
  } catch (err) {
    if (err.statusCode && err.statusCode < 500) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'VALIDATION_ERROR',
          message: err.message
        }
      })
    }

    logger.error('Registration resubmission failed', {
      error: err.message,
      stack: err.stack
    })
    next(err)
  }
}
