// PharmaTrace AI — Administrative Organization Management Controller
// Handles organization listing, details, status lifecycle updates, and secure document access
import * as adminOrgService from '../services/admin.organization.service.js'
import { logger } from '../utils/logger.js'

const PREVIEWABLE_MIME_TYPES = Object.freeze([
  'application/pdf',
  'image/jpeg',
  'image/png'
])

/**
 * Lists organizations with pagination and filters.
 * GET /api/v1/admin/organizations
 */
export async function listOrganizations(req, res) {
  try {
    const result = await adminOrgService.listOrganizations(req.query)
    return res.status(200).json({
      success: true,
      ...result
    })
  } catch (error) {
    logger.error('Failed to list organizations', { error: error.message })
    return res.status(error.statusCode || 500).json({
      success: false,
      error: { code: error.code || 'INTERNAL_ERROR', message: error.message }
    })
  }
}

/**
 * Retrieves details for a specific organization.
 * GET /api/v1/admin/organizations/:id
 */
export async function getOrganizationDetail(req, res) {
  try {
    const organization = await adminOrgService.getOrganizationDetail(req.params.id)
    if (!organization) {
      return res.status(404).json({
        success: false,
        error: { code: 'ORGANIZATION_NOT_FOUND', message: 'Organization not found.' }
      })
    }
    return res.status(200).json({
      success: true,
      organization
    })
  } catch (error) {
    logger.error('Failed to get organization detail', { id: req.params.id, error: error.message })
    return res.status(error.statusCode || 500).json({
      success: false,
      error: { code: error.code || 'INTERNAL_ERROR', message: error.message }
    })
  }
}

/**
 * Updates organization status (e.g. active, suspended, decommissioned).
 * PATCH /api/v1/admin/organizations/:id/status
 */
export async function updateOrganizationStatus(req, res) {
  try {
    const { status, reason } = req.body || {}
    const result = await adminOrgService.updateOrganizationStatus(
      req.params.id,
      status,
      reason,
      req.user?.id
    )
    return res.status(200).json({
      success: true,
      ...result
    })
  } catch (error) {
    const statusCode = error.statusCode || 500
    if (statusCode < 500) {
      logger.warn('Organization status update rejected', {
        id: req.params.id,
        code: error.code,
        message: error.message
      })
    } else {
      logger.error('Organization status update failed', { id: req.params.id, error: error.message })
    }
    return res.status(statusCode).json({
      success: false,
      error: { code: error.code || 'INTERNAL_ERROR', message: error.message }
    })
  }
}

/**
 * Streams an approved organization's document for download.
 * GET /api/v1/admin/organizations/:id/documents/:docId/download
 */
export async function downloadOrganizationDocument(req, res) {
  try {
    const { id, docId } = req.params
    const doc = await adminOrgService.getOrganizationDocument(id, docId)

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
    return res.status(statusCode).json({
      success: false,
      error: { code: error.code || 'INTERNAL_ERROR', message: error.message }
    })
  }
}

/**
 * Streams an approved organization's document for inline preview.
 * GET /api/v1/admin/organizations/:id/documents/:docId/preview
 */
export async function previewOrganizationDocument(req, res) {
  try {
    const { id, docId } = req.params
    const doc = await adminOrgService.getOrganizationDocument(id, docId)

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
    return res.status(statusCode).json({
      success: false,
      error: { code: error.code || 'INTERNAL_ERROR', message: error.message }
    })
  }
}
