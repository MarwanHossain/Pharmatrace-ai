// PharmaTrace AI — Registration Controller
// Handles Category Availability & Public Registration Intake
import {
  getCategoryAvailability,
  submitRegistration
} from '../services/registration.service.js'
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
