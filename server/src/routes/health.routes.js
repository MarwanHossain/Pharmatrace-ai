// PharmaTrace AI — Health Check Routes
import { Router } from 'express'
import { getSystemHealth, getDatabaseHealth } from '../controllers/health.controller.js'

const router = Router()

// GET /api/health — Server uptime & API health
router.get('/', getSystemHealth)

// GET /api/health/db — Live MariaDB connectivity test
router.get('/db', getDatabaseHealth)

export default router
