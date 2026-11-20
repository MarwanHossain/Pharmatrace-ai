// PharmaTrace AI — Shipment & Custody Transfer Controller
// Exposes authenticated shipment creation, itemized receiving, and custody inventory endpoints
import * as shipmentService from '../services/shipment.service.js'
import { logger } from '../utils/logger.js'

/**
 * GET /api/v1/shipments/incoming
 */
export async function listIncoming(req, res) {
  try {
    const orgId = req.user.orgId
    const role = req.user.role
    const result = await shipmentService.listShipments(orgId, role, {
      ...req.query,
      direction: 'incoming'
    })
    return res.status(200).json({
      success: true,
      data: result.shipments,
      total: result.total
    })
  } catch (err) {
    logger.error('Failed to list incoming shipments', { error: err.message, userId: req.user?.id })
    return res.status(err.statusCode || 500).json({
      success: false,
      error: { code: err.code || 'INTERNAL_ERROR', message: err.message }
    })
  }
}

/**
 * GET /api/v1/shipments/outgoing
 */
export async function listOutgoing(req, res) {
  try {
    const orgId = req.user.orgId
    const role = req.user.role
    const result = await shipmentService.listShipments(orgId, role, {
      ...req.query,
      direction: 'outgoing'
    })
    return res.status(200).json({
      success: true,
      data: result.shipments,
      total: result.total
    })
  } catch (err) {
    logger.error('Failed to list outgoing shipments', { error: err.message, userId: req.user?.id })
    return res.status(err.statusCode || 500).json({
      success: false,
      error: { code: err.code || 'INTERNAL_ERROR', message: err.message }
    })
  }
}

/**
 * GET /api/v1/shipments/:ref
 */
export async function getShipment(req, res) {
  try {
    const orgId = req.user.orgId
    const role = req.user.role
    const shipment = await shipmentService.getShipmentByRef(orgId, role, req.params.ref)
    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: { code: 'SHIPMENT_NOT_FOUND', message: `Shipment ${req.params.ref} not found.` }
      })
    }
    return res.status(200).json({
      success: true,
      data: shipment
    })
  } catch (err) {
    logger.warn('Failed to get shipment details', { error: err.message, ref: req.params.ref })
    return res.status(err.statusCode || 500).json({
      success: false,
      error: { code: err.code || 'INTERNAL_ERROR', message: err.message }
    })
  }
}

/**
 * POST /api/v1/shipments
 * Creates and dispatches a shipment.
 */
export async function createShipment(req, res) {
  try {
    const fromOrgId = req.user.orgId
    const result = await shipmentService.createAndDispatchShipment(fromOrgId, req.user, req.body)
    return res.status(201).json({
      success: true,
      message: `Shipment ${result.ref} successfully dispatched with ${result.packageCount} package(s).`,
      data: result
    })
  } catch (err) {
    logger.warn('Shipment dispatch failed', { error: err.message, code: err.code, userId: req.user?.id })
    return res.status(err.statusCode || 400).json({
      success: false,
      error: { code: err.code || 'DISPATCH_FAILED', message: err.message }
    })
  }
}

/**
 * POST /api/v1/shipments/:ref/receive
 * Itemized receiving session.
 */
export async function receiveShipment(req, res) {
  try {
    const toOrgId = req.user.orgId
    const result = await shipmentService.receiveShipment(toOrgId, req.user, req.params.ref, req.body)
    return res.status(200).json({
      success: true,
      message: `Receiving recorded for shipment ${result.ref}. Current status: "${result.status}".`,
      data: result
    })
  } catch (err) {
    logger.warn('Shipment receiving failed', { error: err.message, code: err.code, ref: req.params.ref })
    return res.status(err.statusCode || 400).json({
      success: false,
      error: { code: err.code || 'RECEIVING_FAILED', message: err.message }
    })
  }
}

/**
 * POST /api/v1/shipments/:ref/close-reconciliation
 */
export async function closeReconciliation(req, res) {
  try {
    const toOrgId = req.user.orgId
    const result = await shipmentService.closeReconciliation(toOrgId, req.user, req.params.ref, req.body)
    return res.status(200).json({
      success: true,
      message: `Reconciliation closed for shipment ${result.ref}.`,
      data: result
    })
  } catch (err) {
    logger.warn('Closure failed', { error: err.message, code: err.code, ref: req.params.ref })
    return res.status(err.statusCode || 400).json({
      success: false,
      error: { code: err.code || 'CLOSURE_FAILED', message: err.message }
    })
  }
}

/**
 * POST /api/v1/shipments/:ref/rejected-handover
 */
export async function recordRejectedHandover(req, res) {
  try {
    const toOrgId = req.user.orgId
    const result = await shipmentService.recordRejectedHandover(toOrgId, req.user, req.params.ref, req.body)
    return res.status(200).json({
      success: true,
      message: `Rejected physical handover recorded for serial ${result.serial}.`,
      data: result
    })
  } catch (err) {
    logger.warn('Handover failed', { error: err.message, code: err.code, ref: req.params.ref })
    return res.status(err.statusCode || 400).json({
      success: false,
      error: { code: err.code || 'HANDOVER_FAILED', message: err.message }
    })
  }
}

/**
 * GET /api/v1/shipments/eligible-packages
 */
export async function getEligiblePackages(req, res) {
  try {
    const orgId = req.user.orgId
    const role = req.user.role
    const packages = await shipmentService.getEligiblePackages(orgId, role)
    return res.status(200).json({
      success: true,
      data: packages
    })
  } catch (err) {
    logger.error('Failed to get eligible packages', { error: err.message })
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: err.message }
    })
  }
}

/**
 * GET /api/v1/shipments/destinations
 */
export async function getEligibleDestinations(req, res) {
  try {
    const orgId = req.user.orgId
    const role = req.user.role
    const destinations = await shipmentService.getEligibleDestinations(orgId, role)
    return res.status(200).json({
      success: true,
      data: destinations
    })
  } catch (err) {
    logger.error('Failed to get destinations', { error: err.message })
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: err.message }
    })
  }
}

/**
 * GET /api/v1/shipments/inventory
 */
export async function getCustodyInventory(req, res) {
  try {
    const orgId = req.user.orgId
    const result = await shipmentService.getCustodyInventory(orgId, req.query)
    return res.status(200).json({
      success: true,
      data: result.inventory,
      total: result.total
    })
  } catch (err) {
    logger.error('Failed to get inventory', { error: err.message })
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: err.message }
    })
  }
}
