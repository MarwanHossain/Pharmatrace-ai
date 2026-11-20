// PharmaTrace AI — Regulatory Investigation & Enforcement Routes
// Milestone M8 Implementation
import { Router } from 'express'
import * as investigatorController from '../controllers/investigator.controller.js'
import { authenticateToken, requireRoles } from '../middleware/auth.js'
import { csrfProtection } from '../middleware/csrf.js'

const router = Router()

// All routes require authenticated session with investigator or admin role
router.use(authenticateToken)
router.use(requireRoles('investigator', 'admin'))

// Dashboard
router.get('/dashboard', investigatorController.getDashboard)
router.get('/activity', investigatorController.getActivity)
router.get('/dashboard/activity', investigatorController.getActivity)

// Alerts & Automated Regulatory Detection
router.get('/alerts', investigatorController.getAlerts)
router.get('/alerts/:id', investigatorController.getAlert)
router.patch('/alerts/:id/status', csrfProtection, investigatorController.updateAlertStatus)
router.post('/alerts/scan', csrfProtection, investigatorController.runAlertScan)

// Traceability Search & Detailed Package Investigation
router.get('/search', investigatorController.searchTraceability)
router.get('/packages/:serial', investigatorController.getPackageDetails)

// Case Management & Evidence
router.get('/cases', investigatorController.getCases)
router.post('/cases', csrfProtection, investigatorController.createCase)
router.get('/cases/:id', investigatorController.getCase)
router.patch('/cases/:id', csrfProtection, investigatorController.updateCase)
router.post('/cases/:id/evidence', csrfProtection, investigatorController.addCaseEvidence)

// Officers Directory
router.get('/officers', investigatorController.getOfficers)

export default router
