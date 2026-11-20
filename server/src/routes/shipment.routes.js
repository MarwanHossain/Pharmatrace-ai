// PharmaTrace AI — Shipment & Custody Transfer Routes
import { Router } from 'express'
import {
  listIncoming,
  listOutgoing,
  getShipment,
  createShipment,
  receiveShipment,
  closeReconciliation,
  recordRejectedHandover,
  getEligiblePackages,
  getEligibleDestinations,
  getCustodyInventory
} from '../controllers/shipment.controller.js'
import { authenticateToken, requireRoles } from '../middleware/auth.js'
import { csrfProtection } from '../middleware/csrf.js'

const router = Router()

// All shipment operations require valid authenticated session across supply-chain stakeholders
router.use(authenticateToken)
router.use(requireRoles('manufacturer', 'distributor', 'wholesaler', 'pharmacy', 'admin', 'investigator'))

// Query Endpoints
router.get('/incoming', listIncoming)
router.get('/outgoing', listOutgoing)
router.get('/eligible-packages', getEligiblePackages)
router.get('/destinations', getEligibleDestinations)
router.get('/inventory', getCustodyInventory)
router.get('/:ref', getShipment)

// Mutation Endpoints (Protected by CSRF and Tier-Specific RBAC)
router.post(
  '/',
  requireRoles('manufacturer', 'distributor', 'wholesaler'),
  csrfProtection,
  createShipment
)

router.post(
  '/:ref/receive',
  requireRoles('distributor', 'wholesaler', 'pharmacy'),
  csrfProtection,
  receiveShipment
)

router.post(
  '/:ref/close-reconciliation',
  requireRoles('distributor', 'wholesaler', 'pharmacy'),
  csrfProtection,
  closeReconciliation
)

router.post(
  '/:ref/rejected-handover',
  requireRoles('distributor', 'wholesaler', 'pharmacy'),
  csrfProtection,
  recordRejectedHandover
)

export default router
