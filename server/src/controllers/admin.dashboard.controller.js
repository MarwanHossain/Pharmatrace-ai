// PharmaTrace AI — Administrative Dashboard Controller
import * as dashboardService from '../services/admin.dashboard.service.js'
import { logger } from '../utils/logger.js'

/**
 * Retrieves platform-wide live summary metrics.
 * GET /api/v1/admin/dashboard/summary
 */
export async function getDashboardSummary(req, res) {
  try {
    const summary = await dashboardService.getDashboardSummary()
    return res.status(200).json({
      success: true,
      summary
    })
  } catch (error) {
    logger.error('Failed to get dashboard summary', { error: error.message })
    return res.status(500).json({
      success: false,
      error: { code: 'DASHBOARD_METRICS_ERROR', message: error.message }
    })
  }
}

/**
 * Retrieves recent chronological system audit activity.
 * GET /api/v1/admin/dashboard/activity
 */
export async function getDashboardActivity(req, res) {
  try {
    const { limit, days } = req.query
    const result = await dashboardService.getDashboardActivity({ limit, days })
    return res.status(200).json({
      success: true,
      ...result
    })
  } catch (error) {
    logger.error('Failed to get dashboard activity', { error: error.message })
    return res.status(500).json({
      success: false,
      error: { code: 'DASHBOARD_ACTIVITY_ERROR', message: error.message }
    })
  }
}
