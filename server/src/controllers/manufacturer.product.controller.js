// PharmaTrace AI — Manufacturer Product Controller
// Exposes authenticated product endpoints with strict tenant scoping

import * as productService from '../services/manufacturer.product.service.js'
import { logger } from '../utils/logger.js'

/**
 * GET /api/v1/manufacturer/products
 * Lists all products for the authenticated manufacturer.
 */
export async function listProducts(req, res) {
  try {
    const orgId = req.user.orgId
    const result = await productService.listProducts(orgId, req.query)
    return res.status(200).json({
      success: true,
      data: result.products,
      total: result.total
    })
  } catch (error) {
    logger.error('Failed to list manufacturer products', { error: error.message, userId: req.user?.id })
    return res.status(error.statusCode || 500).json({
      success: false,
      error: { code: error.code || 'INTERNAL_ERROR', message: error.message }
    })
  }
}

/**
 * GET /api/v1/manufacturer/products/:id
 * Retrieves details of a specific product.
 */
export async function getProduct(req, res) {
  try {
    const orgId = req.user.orgId
    const product = await productService.getProductById(orgId, req.params.id)
    if (!product) {
      return res.status(404).json({
        success: false,
        error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found or access denied.' }
      })
    }
    return res.status(200).json({
      success: true,
      data: product
    })
  } catch (error) {
    logger.error('Failed to get product', { error: error.message, productId: req.params.id })
    return res.status(error.statusCode || 500).json({
      success: false,
      error: { code: error.code || 'INTERNAL_ERROR', message: error.message }
    })
  }
}

/**
 * POST /api/v1/manufacturer/products
 * Registers a new pharmaceutical product.
 */
export async function createProduct(req, res) {
  try {
    const orgId = req.user.orgId
    const product = await productService.createProduct(orgId, req.body)
    return res.status(201).json({
      success: true,
      data: product,
      message: 'Product registered successfully.'
    })
  } catch (error) {
    logger.warn('Product registration failed', { error: error.message, code: error.code })
    return res.status(error.statusCode || 400).json({
      success: false,
      error: { code: error.code || 'INVALID_INPUT', message: error.message }
    })
  }
}

/**
 * PUT /api/v1/manufacturer/products/:id
 * Updates product details.
 */
export async function updateProduct(req, res) {
  try {
    const orgId = req.user.orgId
    const product = await productService.updateProduct(orgId, req.params.id, req.body)
    return res.status(200).json({
      success: true,
      data: product,
      message: 'Product updated successfully.'
    })
  } catch (error) {
    logger.warn('Product update failed', { error: error.message, code: error.code, productId: req.params.id })
    return res.status(error.statusCode || 400).json({
      success: false,
      error: { code: error.code || 'INVALID_INPUT', message: error.message }
    })
  }
}

/**
 * PATCH /api/v1/manufacturer/products/:id/status
 * Updates product lifecycle status (e.g. active <-> discontinued).
 */
export async function updateProductStatus(req, res) {
  try {
    const orgId = req.user.orgId
    const status = req.body.status
    const product = await productService.updateProductStatus(orgId, req.params.id, status)
    return res.status(200).json({
      success: true,
      data: product,
      message: `Product status updated to "${status}".`
    })
  } catch (error) {
    logger.warn('Product status update failed', { error: error.message, code: error.code, productId: req.params.id })
    return res.status(error.statusCode || 400).json({
      success: false,
      error: { code: error.code || 'INVALID_INPUT', message: error.message }
    })
  }
}
