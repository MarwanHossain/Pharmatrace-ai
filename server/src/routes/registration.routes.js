// PharmaTrace AI — Registration Routes
// Implements Phase 3 Milestone 1: Dynamic Capacity Engine & Public Registration Intake
import { Router } from 'express'
import {
  getCategoriesAvailability,
  createRegistration
} from '../controllers/registration.controller.js'
import { csrfProtection } from '../middleware/csrf.js'
import { registrationRateLimiter } from '../middleware/rateLimiter.js'
import { handleDocumentUpload } from '../middleware/upload.js'

const router = Router()

// Dynamic Category Availability Endpoints
router.get('/categories/availability', getCategoriesAvailability)
router.get('/categories', getCategoriesAvailability)

// Public Organization Registration Intake
router.post(
  '/',
  registrationRateLimiter,
  csrfProtection,
  handleDocumentUpload,
  createRegistration
)

export default router
