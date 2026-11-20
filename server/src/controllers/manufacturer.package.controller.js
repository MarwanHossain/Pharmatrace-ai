// PharmaTrace AI — Manufacturer Package Controller
// Exposes endpoints for batch serialization, package listing, and label retrieval
import * as packageService from '../services/manufacturer.package.service.js'
import { logger } from '../utils/logger.js'

/**
 * POST /api/v1/manufacturer/batches/:id/serialize
 * OR POST /api/v1/manufacturer/packages/serialize
 * Serializes packages for a released production batch.
 */
export async function serializeBatch(req, res) {
  try {
    const orgId = req.user.orgId
    const batchId = req.params.id || req.body.batchId || req.body.batch_id

    if (!batchId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_BATCH_ID', message: 'Batch ID is required for serialization.' }
      })
    }

    const appBaseUrl = `${req.protocol}://${req.get('host')}`
    const result = await packageService.serializeBatch(orgId, batchId, {
      quantity: req.body.quantity,
      allocationType: req.body.allocationType,
      user: req.user,
      appBaseUrl
    })

    return res.status(201).json({
      success: true,
      message: `Successfully serialized ${result.packages.length} packages for batch ${result.batchNo}.`,
      data: result
    })
  } catch (error) {
    logger.warn('Package serialization failed', {
      error: error.message,
      code: error.code,
      batchId: req.params.id || req.body?.batchId,
      orgId: req.user?.orgId
    })
    return res.status(error.statusCode || 400).json({
      success: false,
      error: { code: error.code || 'SERIALIZATION_FAILED', message: error.message }
    })
  }
}

/**
 * GET /api/v1/manufacturer/packages
 * Lists serialized packages for the authenticated manufacturer.
 */
export async function listPackages(req, res) {
  try {
    const orgId = req.user.orgId
    const appBaseUrl = `${req.protocol}://${req.get('host')}`
    const result = await packageService.listPackages(orgId, {
      ...req.query,
      appBaseUrl
    })

    return res.status(200).json({
      success: true,
      data: result.packages,
      total: result.total
    })
  } catch (error) {
    logger.error('Failed to list manufacturer packages', { error: error.message, orgId: req.user?.orgId })
    return res.status(error.statusCode || 500).json({
      success: false,
      error: { code: error.code || 'INTERNAL_ERROR', message: error.message }
    })
  }
}

/**
 * GET /api/v1/manufacturer/packages/:serial
 * Retrieves package details including GS1 DataMatrix, QR code, and traceability journey.
 */
export async function getPackage(req, res) {
  try {
    const orgId = req.user.orgId
    const appBaseUrl = `${req.protocol}://${req.get('host')}`
    const pkg = await packageService.getPackageBySerial(orgId, req.params.serial, { appBaseUrl })

    if (!pkg) {
      return res.status(404).json({
        success: false,
        error: { code: 'PACKAGE_NOT_FOUND', message: 'Package not found or access denied.' }
      })
    }

    return res.status(200).json({
      success: true,
      data: pkg
    })
  } catch (error) {
    logger.error('Failed to get package details', { error: error.message, serial: req.params.serial })
    return res.status(error.statusCode || 500).json({
      success: false,
      error: { code: error.code || 'INTERNAL_ERROR', message: error.message }
    })
  }
}
