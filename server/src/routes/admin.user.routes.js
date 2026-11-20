// PharmaTrace AI — Administrative User Management Routes
import { Router } from 'express'
import {
  listUsers,
  getUserDetail,
  updateUserStatus,
  unlockUser
} from '../controllers/admin.user.controller.js'
import { authenticateToken, requireRoles } from '../middleware/auth.js'
import { csrfProtection } from '../middleware/csrf.js'

const router = Router()

// All administrative user routes require active admin authentication
router.use(authenticateToken)
router.use(requireRoles('admin'))

// Queue & Detail Endpoints
router.get('/', listUsers)
router.get('/:id', getUserDetail)

// Status Lifecycle Mutations (Protected by CSRF)
router.patch('/:id/status', csrfProtection, updateUserStatus)
router.post('/:id/unlock', csrfProtection, unlockUser)

export default router
