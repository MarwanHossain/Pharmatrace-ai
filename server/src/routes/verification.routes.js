// PharmaTrace AI — Public Package Verification Routes
import { Router } from 'express'
import { verifyPackage } from '../controllers/verification.controller.js'

const router = Router()

// Public verification does NOT require authentication
router.get('/', verifyPackage)
router.post('/', verifyPackage)

export default router
