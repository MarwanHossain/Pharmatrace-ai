// PharmaTrace AI — Registration Routes
// Implements Phase 3 Milestone 1 & 2: Dynamic Capacity Engine, Public Intake, Tracking & Resubmission
import { Router } from 'express'
import {
  getCategoriesAvailability,
  createRegistration,
  trackRegistration,
  verifyAccessToken,
  resubmitRegistration
} from '../controllers/registration.controller.js'
import { csrfProtection } from '../middleware/csrf.js'
import {
  registrationRateLimiter,
  trackingRateLimiter
} from '../middleware/rateLimiter.js'
import { rejectInsecureTokenQuery } from '../middleware/tokenTransport.js'
import { handleDocumentUpload } from '../middleware/upload.js'

const router = Router()

// Dynamic Category Availability Endpoints
router.get('/categories/availability', getCategoriesAvailability)
router.get('/categories', getCategoriesAvailability)

// Public Application Status Tracking
router.post(
  '/track',
  trackingRateLimiter,
  csrfProtection,
  trackRegistration
)

// Single-Use Access Token Verification
router.get(
  '/access/verify',
  rejectInsecureTokenQuery,
  verifyAccessToken
)

// Applicant Resubmission for Applications in INFORMATION_REQUESTED status
// Middleware order: Rate Limiter -> CSRF -> Insecure Token Guard -> Multer Upload -> Controller
router.post(
  '/resubmit',
  registrationRateLimiter,
  csrfProtection,
  rejectInsecureTokenQuery,
  handleDocumentUpload,
  resubmitRegistration
)

// Public Organization Registration Intake
router.post(
  '/',
  registrationRateLimiter,
  csrfProtection,
  handleDocumentUpload,
  createRegistration
)

export default router
