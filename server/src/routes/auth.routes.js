// PharmaTrace AI — Authentication Routes
// Conforms to Revision 3.2 §4.1 & §4.2 specifications
import { Router } from 'express'
import {
  login,
  logout,
  logoutAll,
  getMe,
  verifyActivationToken,
  activateAccount
} from '../controllers/auth.controller.js'
import { authenticateToken } from '../middleware/auth.js'
import { csrfProtection } from '../middleware/csrf.js'
import { loginRateLimiter, activationRateLimiter } from '../middleware/rateLimiter.js'
import { rejectInsecureTokenQuery } from '../middleware/tokenTransport.js'

const router = Router()

// Public Activation Endpoints
router.get('/activate/verify', rejectInsecureTokenQuery, verifyActivationToken)
router.post('/activate', activationRateLimiter, csrfProtection, activateAccount)

// Public Authentication Endpoints
router.post('/login', loginRateLimiter, csrfProtection, login)
router.post('/logout', csrfProtection, logout)

// Authenticated Session Endpoints
router.get('/me', authenticateToken, getMe)
router.post('/logout-all', authenticateToken, csrfProtection, logoutAll)

export default router
