// PharmaTrace AI — Administrative Registration Routes
// Implements Revision 3.2 §2, §3, §4 & Phase 3 Milestone 3 specifications
import { Router } from 'express'
import {
  listRegistrations,
  getRegistrationDetail,
  downloadDocument,
  previewDocument,
  startReview,
  requestInfo,
  resendInformationLink,
  approve,
  reject,
  resendActivation
} from '../controllers/admin.registration.controller.js'
import { authenticateToken, requireRoles } from '../middleware/auth.js'
import { csrfProtection } from '../middleware/csrf.js'

const router = Router()

// All administrative routes strictly require active admin authentication
router.use(authenticateToken)
router.use(requireRoles('admin'))

// Queue & Dossier Endpoints
router.get('/', listRegistrations)
router.get('/:id', getRegistrationDetail)
router.get('/:id/documents/:docId/download', downloadDocument)
router.get('/:id/documents/:docId/preview', previewDocument)

// State Transition Endpoints (Protected by CSRF)
router.post('/:id/review', csrfProtection, startReview)
router.post('/:id/request-info', csrfProtection, requestInfo)
router.post('/:id/resend-information-link', csrfProtection, resendInformationLink)
router.post('/:id/approve', csrfProtection, approve)
router.post('/:id/reject', csrfProtection, reject)
router.post('/:id/resend-activation', csrfProtection, resendActivation)

export default router
