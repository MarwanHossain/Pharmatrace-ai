// PharmaTrace AI — Manufacturer Package Routes
import { Router } from 'express'
import {
  listPackages,
  getPackage,
  serializeBatch
} from '../controllers/manufacturer.package.controller.js'
import { authenticateToken, requireRoles } from '../middleware/auth.js'
import { csrfProtection } from '../middleware/csrf.js'

const router = Router()

// All package routes require authentication and manufacturer role
router.use(authenticateToken)
router.use(requireRoles('manufacturer'))

// Read endpoints
router.get('/', listPackages)
router.get('/:serial', getPackage)

// Mutation endpoints (Protected by CSRF)
router.post('/serialize', csrfProtection, serializeBatch)

export default router
