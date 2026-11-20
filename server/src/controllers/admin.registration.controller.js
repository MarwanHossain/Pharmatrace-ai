// PharmaTrace AI — Administrator Registration Controller
// Implements Revision 3.2 §2, §3, §4 & Phase 3 Milestone 3 Specifications
import * as adminService from '../services/admin.registration.service.js'
import { logger } from '../utils/logger.js'

/**
 * Lists paginated registrations with filtering and search.
 * GET /api/v1/admin/registrations
 */
export async function listRegistrations(req, res) {
  try {
    const { page, limit, status, category, search, sortBy, sortOrder } = req.query || {}

    const result = await adminService.listRegistrations({
      page,
      limit,
      status,
      category,
      search,
      sortBy,
      sortOrder
    })

    return res.status(200).json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('Admin list registrations error', { error: error.message })
    return res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'INTERNAL_SERVER_ERROR',
        message: error.message || 'Failed to list registrations.'
      }
    })
  }
}

/**
 * Retrieves full registration dossier, submission history, document metadata, and audit log.
 * GET /api/v1/admin/registrations/:id
 */
export async function getRegistrationDetail(req, res) {
  try {
    const { id } = req.params

    const result = await adminService.getRegistrationDetail(id)
    if (!result) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'REGISTRATION_NOT_FOUND',
          message: 'Registration application not found.'
        }
      })
    }

    return res.status(200).json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('Admin get registration detail error', { error: error.message, id: req.params.id })
    return res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'INTERNAL_SERVER_ERROR',
        message: error.message || 'Failed to retrieve registration details.'
      }
    })
  }
}

/**
 * Securely streams an uploaded verification document.
 * GET /api/v1/admin/registrations/:id/documents/:docId/download
 */
export async function downloadDocument(req, res) {
  try {
    const { id, docId } = req.params

    const doc = await adminService.getRegistrationDocument(id, docId)

    res.setHeader('Content-Type', doc.mimeType)
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(doc.originalFilename)}"`
    )
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate')
    res.setHeader('Pragma', 'no-cache')

    return res.sendFile(doc.resolvedPath)
  } catch (error) {
    const statusCode = error.statusCode || 500
    if (statusCode < 500) {
      logger.warn('Document download rejected', {
        id: req.params.id,
        docId: req.params.docId,
        code: error.code,
        message: error.message
      })
    } else {
      logger.error('Document download system error', {
        id: req.params.id,
        docId: req.params.docId,
        error: error.message
      })
    }

    return res.status(statusCode).json({
      success: false,
      error: {
        code: error.code || 'DOWNLOAD_FAILED',
        message: error.message || 'Failed to download document.'
      }
    })
  }
}

const PREVIEWABLE_MIME_TYPES = Object.freeze([
  'application/pdf',
  'image/jpeg',
  'image/png'
])

/**
 * Securely streams an uploaded verification document for inline preview.
 * GET /api/v1/admin/registrations/:id/documents/:docId/preview
 */
export async function previewDocument(req, res) {
  try {
    const { id, docId } = req.params

    const doc = await adminService.getRegistrationDocument(id, docId)

    if (!PREVIEWABLE_MIME_TYPES.includes(doc.mimeType)) {
      return res.status(415).json({
        success: false,
        error: {
          code: 'UNSUPPORTED_PREVIEW_FORMAT',
          message: `Inline preview is not supported for ${doc.mimeType}. Please download the document to view it.`
        }
      })
    }

    res.setHeader('Content-Type', doc.mimeType)
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(doc.originalFilename)}"`
    )
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate')
    res.setHeader('Pragma', 'no-cache')

    return res.sendFile(doc.resolvedPath)
  } catch (error) {
    const statusCode = error.statusCode || 500
    if (statusCode < 500) {
      logger.warn('Document preview rejected', {
        id: req.params.id,
        docId: req.params.docId,
        code: error.code,
        message: error.message
      })
    } else {
      logger.error('Document preview system error', {
        id: req.params.id,
        docId: req.params.docId,
        error: error.message
      })
    }

    return res.status(statusCode).json({
      success: false,
      error: {
        code: error.code || 'PREVIEW_FAILED',
        message: error.message || 'Failed to preview document.'
      }
    })
  }
}

/**
 * Transitions registration status from SUBMITTED to UNDER_REVIEW.
 * POST /api/v1/admin/registrations/:id/review
 */
export async function startReview(req, res) {
  try {
    const { id } = req.params
    const { reviewNotes } = req.body || {}

    const result = await adminService.startRegistrationReview(
      id,
      req.user,
      reviewNotes,
      req.ip
    )

    return res.status(200).json({
      success: true,
      message: 'Registration dossier is now under review.',
      data: result
    })
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'REVIEW_START_FAILED',
        message: error.message || 'Failed to initiate review.'
      }
    })
  }
}

/**
 * Transitions registration from UNDER_REVIEW to INFORMATION_REQUESTED and issues single-use access token.
 * POST /api/v1/admin/registrations/:id/request-info
 */
export async function requestInfo(req, res) {
  try {
    const { id } = req.params
    const { reason, cureDays } = req.body || {}

    const result = await adminService.requestAdditionalInformation(
      id,
      req.user,
      {
        reason,
        cureDays,
        ip: req.ip
      }
    )

    return res.status(200).json({
      success: true,
      message: 'Information request recorded and resubmission link issued to applicant.',
      data: result
    })
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'REQUEST_INFO_FAILED',
        message: error.message || 'Failed to request additional information.'
      }
    })
  }
}

/**
 * Reissues an information request link for an application in INFORMATION_REQUESTED status.
 * POST /api/v1/admin/registrations/:id/resend-information-link
 */
export async function resendInformationLink(req, res) {
  try {
    const { id } = req.params
    const { cureDays } = req.body || {}

    const result = await adminService.resendInformationRequestLink(
      id,
      req.user,
      {
        cureDays,
        ip: req.ip
      }
    )

    return res.status(200).json({
      success: true,
      message: 'Information request link reissued and dispatched.',
      data: result
    })
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'RESEND_LINK_FAILED',
        message: error.message || 'Failed to reissue information request link.'
      }
    })
  }
}

/**
 * Rejects registration dossier with formal statutory reason and explanation.
 * POST /api/v1/admin/registrations/:id/reject
 */
export async function reject(req, res) {
  try {
    const { id } = req.params
    const { rejectionReason, rejectionExplanation } = req.body || {}

    const result = await adminService.rejectRegistration(
      id,
      req.user,
      {
        rejectionReason,
        rejectionExplanation,
        ip: req.ip
      }
    )

    return res.status(200).json({
      success: true,
      message: 'Registration application has been formally rejected.',
      data: result
    })
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'REJECTION_FAILED',
        message: error.message || 'Failed to reject registration.'
      }
    })
  }
}

/**
 * Atomically approves registration, validates capacity, provisions organization & user,
 * and issues single-use activation token.
 * POST /api/v1/admin/registrations/:id/approve
 */
export async function approve(req, res) {
  try {
    const { id } = req.params
    const { reviewNotes, dghsVerified } = req.body || {}

    const result = await adminService.approveRegistration(
      id,
      req.user,
      {
        reviewNotes,
        dghsVerified,
        ip: req.ip
      }
    )

    return res.status(200).json({
      success: true,
      message: 'Registration approved and organization successfully provisioned.',
      data: result
    })
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'APPROVAL_FAILED',
        message: error.message || 'Failed to approve registration.'
      }
    })
  }
}

/**
 * Reissues activation token for an approved registration.
 * POST /api/v1/admin/registrations/:id/resend-activation
 */
export async function resendActivation(req, res) {
  try {
    const { id } = req.params

    const result = await adminService.resendActivationToken(
      id,
      req.user,
      {
        ip: req.ip
      }
    )

    return res.status(200).json({
      success: true,
      message: 'Account activation token reissued and dispatched.',
      data: result
    })
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'RESEND_ACTIVATION_FAILED',
        message: error.message || 'Failed to reissue activation token.'
      }
    })
  }
}
