// PharmaTrace AI — Administrative Organization Routes
import { Router } from 'express'
import {
  listOrganizations,
  getOrganizationDetail,
  updateOrganizationStatus,
  downloadOrganizationDocument,
  previewOrganizationDocument
} from '../controllers/admin.organization.controller.js'
import { authenticateToken, requireRoles } from '../middleware/auth.js'
import { csrfProtection } from '../middleware/csrf.js'

const router = Router()

// All administrative routes require active admin authentication
router.use(authenticateToken)
router.use(requireRoles('admin'))

// Queue & Detail Endpoints
router.get('/', listOrganizations)
router.get('/:id', getOrganizationDetail)

// Status Lifecycle Mutations (Protected by CSRF)
router.patch('/:id/status', csrfProtection, updateOrganizationStatus)

// Document Management Endpoints
router.get('/:id/documents/:docId/download', downloadOrganizationDocument)
router.get('/:id/documents/:docId/preview', previewOrganizationDocument)

export default router
