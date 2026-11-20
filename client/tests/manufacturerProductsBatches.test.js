// PharmaTrace AI — Frontend Manufacturer Products & Batches Test Suite
// Verifies API client modules, GTIN formatting, and component integrity

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  updateProductStatus
} from '../src/services/manufacturerProductApi.js'
import {
  getBatches,
  getBatch,
  createBatch
} from '../src/services/manufacturerBatchApi.js'
import { api } from '../src/services/api.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('M7.1 Manufacturer Products & Batches — Frontend Service & Component Integrity', () => {
  describe('1. API Service Signatures and Exports', () => {
    test('manufacturerProductApi exports all required lifecycle functions', () => {
      assert.equal(typeof getProducts, 'function')
      assert.equal(typeof getProduct, 'function')
      assert.equal(typeof createProduct, 'function')
      assert.equal(typeof updateProduct, 'function')
      assert.equal(typeof updateProductStatus, 'function')
    })

    test('manufacturerBatchApi exports all required lifecycle functions', () => {
      assert.equal(typeof getBatches, 'function')
      assert.equal(typeof getBatch, 'function')
      assert.equal(typeof createBatch, 'function')
    })
  })

  describe('2. API Parameter Normalization and Endpoint Construction', () => {
    test('getProducts constructs proper query strings', async () => {
      const origGet = api.get
      let calledUrl = ''
      api.get = async url => {
        calledUrl = url
        return { data: [], total: 0 }
      }

      try {
        await getProducts({ status: 'active', search: 'Napa', limit: 25, offset: 50 })
        assert.ok(calledUrl.includes('/v1/manufacturer/products'))
        assert.ok(calledUrl.includes('status=active'))
        assert.ok(calledUrl.includes('search=Napa'))
        assert.ok(calledUrl.includes('limit=25'))
        assert.ok(calledUrl.includes('offset=50'))
      } finally {
        api.get = origGet
      }
    })

    test('createProduct trims inputs and formats payload', async () => {
      const origPost = api.post
      let sentPayload = null
      api.post = async (url, payload) => {
        sentPayload = payload
        return { data: { id: 'prod-test', ...payload } }
      }

      try {
        await createProduct({
          name: '  Metformin  ',
          generic_name: '  Metformin HCl  ',
          strength: '  500 mg  ',
          dosage_form: 'Tablet',
          pack_size: '  10 x 10  ',
          gtin: '  06291041500213  '
        })

        assert.equal(sentPayload.name, 'Metformin')
        assert.equal(sentPayload.generic_name, 'Metformin HCl')
        assert.equal(sentPayload.strength, '500 mg')
        assert.equal(sentPayload.pack_size, '10 x 10')
        assert.equal(sentPayload.gtin, '06291041500213')
      } finally {
        api.post = origPost
      }
    })

    test('updateProductStatus sends valid PATCH payload', async () => {
      const origPatch = api.patch
      let calledUrl = ''
      let sentPayload = null
      api.patch = async (url, payload) => {
        calledUrl = url
        sentPayload = payload
        return { data: { id: 'prod-1', status: payload.status } }
      }

      try {
        await updateProductStatus('prod-1', 'discontinued')
        assert.equal(calledUrl, '/v1/manufacturer/products/prod-1/status')
        assert.equal(sentPayload.status, 'discontinued')
      } finally {
        api.patch = origPatch
      }
    })

    test('createBatch constructs and normalizes batch creation payload', async () => {
      const origPost = api.post
      let sentPayload = null
      api.post = async (url, payload) => {
        sentPayload = payload
        return { data: { id: 'batch-test', ...payload } }
      }

      try {
        await createBatch({
          productId: 'prod-100',
          batchNo: '  pcm-2611  ',
          mfd: '2026-11-01',
          exp: '2028-11-01',
          quantity: '500'
        })

        assert.equal(sentPayload.productId, 'prod-100')
        assert.equal(sentPayload.batchNo, 'PCM-2611')
        assert.equal(sentPayload.mfd, '2026-11-01')
        assert.equal(sentPayload.exp, '2028-11-01')
        assert.equal(sentPayload.quantity, 500)
      } finally {
        api.post = origPost
      }
    })
  })

  describe('3. Component Source Code & Live API Integration', () => {
    test('ProductsBatches.jsx contains live API bindings and zero DemoData imports', () => {
      const componentPath = path.resolve(__dirname, '../src/features/manufacturer/products-batches/ProductsBatches.jsx')
      const source = fs.readFileSync(componentPath, 'utf8')

      // Must import and call real API services
      assert.ok(source.includes("from '../../../services/manufacturerProductApi'"))
      assert.ok(source.includes("from '../../../services/manufacturerBatchApi'"))
      assert.ok(source.includes('getProducts'))
      assert.ok(source.includes('createProduct'))
      assert.ok(source.includes('updateProductStatus'))
      assert.ok(source.includes('getBatches'))
      assert.ok(source.includes('createBatch'))

      // Must NOT import useDemoData or useDemoSession in ProductsBatches.jsx
      assert.equal(source.includes('useDemoData'), false)
      assert.equal(source.includes('useDemoSession'), false)

      // Must include mandatory generic_name input
      assert.ok(source.includes('Generic name'))
      assert.ok(source.includes('generic_name'))

      // Must include GTIN input
      assert.ok(source.includes('GTIN'))

      // Must handle active/discontinued status
      assert.ok(source.includes('discontinued'))
    })

    test('AppShell.jsx enforces live authentication for manufacturer role', () => {
      const shellPath = path.resolve(__dirname, '../src/layouts/AppShell.jsx')
      const source = fs.readFileSync(shellPath, 'utf8')

      // Must enforce real authentication for manufacturer
      assert.ok(source.includes("role === 'manufacturer'"))
      assert.ok(source.includes('currentUser?.role === role'))
      assert.ok(source.includes('Live Session') || source.includes('Live Authenticated Session'))
    })
  })
})
