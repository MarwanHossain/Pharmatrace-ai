// PharmaTrace AI — Administrative User Management Controller
import * as adminUserService from '../services/admin.user.service.js'
import { logger } from '../utils/logger.js'

/**
 * Lists users with server-side pagination, search, and filters.
 * GET /api/v1/admin/users
 */
export async function listUsers(req, res) {
  try {
    const result = await adminUserService.listUsers(req.query)
    return res.status(200).json({
      success: true,
      ...result
    })
  } catch (error) {
    logger.error('Failed to list users', { error: error.message })
    return res.status(error.statusCode || 500).json({
      success: false,
      error: { code: error.code || 'INTERNAL_ERROR', message: error.message }
    })
  }
}

/**
 * Retrieves specific user details.
 * GET /api/v1/admin/users/:id
 */
export async function getUserDetail(req, res) {
  try {
    const user = await adminUserService.getUserDetail(req.params.id)
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found.' }
      })
    }
    return res.status(200).json({
      success: true,
      user
    })
  } catch (error) {
    logger.error('Failed to get user detail', { id: req.params.id, error: error.message })
    return res.status(error.statusCode || 500).json({
      success: false,
      error: { code: error.code || 'INTERNAL_ERROR', message: error.message }
    })
  }
}

/**
 * Updates a user's account status (active, inactive, locked).
 * PATCH /api/v1/admin/users/:id/status
 */
export async function updateUserStatus(req, res) {
  try {
    const { status, reason } = req.body || {}
    const result = await adminUserService.updateUserStatus(
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
      logger.warn('User status update rejected', {
        id: req.params.id,
        code: error.code,
        message: error.message
      })
    } else {
      logger.error('User status update failed', { id: req.params.id, error: error.message })
    }
    return res.status(statusCode).json({
      success: false,
      error: { code: error.code || 'INTERNAL_ERROR', message: error.message }
    })
  }
}

/**
 * Unlocks a locked user account.
 * POST /api/v1/admin/users/:id/unlock
 */
export async function unlockUser(req, res) {
  try {
    const { reason } = req.body || {}
    const result = await adminUserService.unlockUser(
      req.params.id,
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
      logger.warn('User unlock rejected', {
        id: req.params.id,
        code: error.code,
        message: error.message
      })
    } else {
      logger.error('User unlock failed', { id: req.params.id, error: error.message })
    }
    return res.status(statusCode).json({
      success: false,
      error: { code: error.code || 'INTERNAL_ERROR', message: error.message }
    })
  }
}
