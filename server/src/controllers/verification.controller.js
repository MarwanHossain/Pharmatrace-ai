// PharmaTrace AI — Public Verification Controller
// Implements public verification lookup and telemetry recording
import * as verificationService from '../services/verification.service.js'
import { logger } from '../utils/logger.js'

/**
 * GET /api/v1/verify
 * Public verification endpoint for checking package journey and authenticity disclaimer.
 * Supports query: ?serial=...&record=true
 */
export async function verifyPackage(req, res) {
  try {
    const rawSerial = req.query.serial || req.body?.serial
    const shouldRecord = req.query.record === 'true' || req.query.record === '1' || req.method === 'POST'
    const appBaseUrl = `${req.protocol}://${req.get('host')}`

    const result = await verificationService.verifyPackage(rawSerial, {
      record: shouldRecord,
      appBaseUrl
    })

    const httpStatus = result.valid ? 200 : 404
    return res.status(httpStatus).json({
      success: result.valid,
      data: result
    })
  } catch (error) {
    logger.error('Verification request failed', { error: error.message, serial: req.query?.serial })
    return res.status(500).json({
      success: false,
      error: { code: 'VERIFICATION_ERROR', message: 'Unable to process verification request.' }
    })
  }
}
