// PharmaTrace AI — Administrative Dashboard Routes
import { Router } from 'express'
import {
  getDashboardSummary,
  getDashboardActivity
} from '../controllers/admin.dashboard.controller.js'
import { authenticateToken, requireRoles } from '../middleware/auth.js'

const router = Router()

// All administrative dashboard routes require active admin authentication
router.use(authenticateToken)
router.use(requireRoles('admin'))

router.get('/summary', getDashboardSummary)
router.get('/activity', getDashboardActivity)

export default router
