// PharmaTrace AI — Manufacturer Batch Controller
// Exposes authenticated production batch endpoints with strict tenant scoping

import * as batchService from '../services/manufacturer.batch.service.js'
import { logger } from '../utils/logger.js'

/**
 * GET /api/v1/manufacturer/batches
 * Lists all batches for the authenticated manufacturer.
 */
export async function listBatches(req, res) {
  try {
    const orgId = req.user.orgId
    const result = await batchService.listBatches(orgId, req.query)
    return res.status(200).json({
      success: true,
      data: result.batches,
      total: result.total
    })
  } catch (error) {
    logger.error('Failed to list manufacturer batches', { error: error.message, userId: req.user?.id })
    return res.status(error.statusCode || 500).json({
      success: false,
      error: { code: error.code || 'INTERNAL_ERROR', message: error.message }
    })
  }
}

/**
 * GET /api/v1/manufacturer/batches/:id
 * Retrieves details of a specific batch.
 */
export async function getBatch(req, res) {
  try {
    const orgId = req.user.orgId
    const batch = await batchService.getBatchById(orgId, req.params.id)
    if (!batch) {
      return res.status(404).json({
        success: false,
        error: { code: 'BATCH_NOT_FOUND', message: 'Batch not found or access denied.' }
      })
    }
    return res.status(200).json({
      success: true,
      data: batch
    })
  } catch (error) {
    logger.error('Failed to get batch', { error: error.message, batchId: req.params.id })
    return res.status(error.statusCode || 500).json({
      success: false,
      error: { code: error.code || 'INTERNAL_ERROR', message: error.message }
    })
  }
}

/**
 * POST /api/v1/manufacturer/batches
 * Creates a new production batch in 'Pending QA' status.
 */
export async function createBatch(req, res) {
  try {
    const orgId = req.user.orgId
    const batch = await batchService.createBatch(orgId, req.body)
    return res.status(201).json({
      success: true,
      data: batch,
      message: 'Production batch created successfully (Pending QA).'
    })
  } catch (error) {
    logger.warn('Batch creation failed', { error: error.message, code: error.code })
    return res.status(error.statusCode || 400).json({
      success: false,
      error: { code: error.code || 'INVALID_INPUT', message: error.message }
    })
  }
}

/**
 * POST /api/v1/manufacturer/batches/:id/qa-release
 * Approves a production batch for QA release.
 */
export async function releaseBatch(req, res) {
  try {
    const orgId = req.user.orgId
    const batch = await batchService.releaseBatch(orgId, req.params.id, {
      user: req.user,
      notes: req.body.notes
    })
    return res.status(200).json({
      success: true,
      message: `Production batch ${batch.batch_no} approved for QA release.`,
      data: batch
    })
  } catch (error) {
    logger.warn('Batch QA release failed', { error: error.message, code: error.code, batchId: req.params.id })
    return res.status(error.statusCode || 400).json({
      success: false,
      error: { code: error.code || 'QA_RELEASE_FAILED', message: error.message }
    })
  }
}

/**
 * PATCH /api/v1/manufacturer/batches/:id/release-status
 * Updates batch release status (Released, Quarantined, Rejected).
 */
export async function updateReleaseStatus(req, res) {
  try {
    const orgId = req.user.orgId
    const batch = await batchService.updateBatchReleaseStatus(orgId, req.params.id, req.body, {
      user: req.user
    })
    return res.status(200).json({
      success: true,
      message: `Production batch release status updated to "${batch.release_status}".`,
      data: batch
    })
  } catch (error) {
    logger.warn('Batch status update failed', { error: error.message, code: error.code, batchId: req.params.id })
    return res.status(error.statusCode || 400).json({
      success: false,
      error: { code: error.code || 'STATUS_UPDATE_FAILED', message: error.message }
    })
  }
}
