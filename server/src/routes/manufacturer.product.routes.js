// PharmaTrace AI — Manufacturer Product Routes
import { Router } from 'express'
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  updateProductStatus
} from '../controllers/manufacturer.product.controller.js'
import { authenticateToken, requireRoles } from '../middleware/auth.js'
import { csrfProtection } from '../middleware/csrf.js'

const router = Router()

// All manufacturer routes require authentication and manufacturer role
router.use(authenticateToken)
router.use(requireRoles('manufacturer'))

// Read endpoints
router.get('/', listProducts)
router.get('/:id', getProduct)

// Write / Mutation endpoints (Protected by CSRF)
router.post('/', csrfProtection, createProduct)
router.put('/:id', csrfProtection, updateProduct)
router.patch('/:id/status', csrfProtection, updateProductStatus)

export default router
