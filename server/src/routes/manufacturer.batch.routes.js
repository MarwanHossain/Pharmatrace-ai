// PharmaTrace AI — Manufacturer Production Batch Routes
import { Router } from 'express'
import {
  listBatches,
  getBatch,
  createBatch,
  releaseBatch,
  updateReleaseStatus
} from '../controllers/manufacturer.batch.controller.js'
import { serializeBatch } from '../controllers/manufacturer.package.controller.js'
import { authenticateToken, requireRoles } from '../middleware/auth.js'
import { csrfProtection } from '../middleware/csrf.js'

const router = Router()

// All manufacturer routes require authentication and manufacturer role
router.use(authenticateToken)
router.use(requireRoles('manufacturer'))

// Read endpoints
router.get('/', listBatches)
router.get('/:id', getBatch)

// Mutation endpoints (Protected by CSRF)
router.post('/', csrfProtection, createBatch)
router.post('/:id/qa-release', csrfProtection, releaseBatch)
router.patch('/:id/release-status', csrfProtection, updateReleaseStatus)
router.post('/:id/serialize', csrfProtection, serializeBatch)

export default router
