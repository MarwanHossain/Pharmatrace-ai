// PharmaTrace AI — Phase 4 Milestone 6 Client Corrections Test Suite
// Verifies:
// 1. unlockUser sends justification payload
// 2. Users.jsx reflects Bcrypt Cost 12 telemetry and no Argon2id
// 3. DocumentPreviewModal supports both canonical props and alias fallbacks
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { unlockUser, updateUserStatus, listUsers, getUserDetail } from '../src/services/adminUserApi.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test('adminUserApi: unlockUser sends justification payload in POST request', async () => {
  const originalFetch = globalThis.fetch
  let capturedUrl = null
  let capturedOptions = null

  try {
    globalThis.fetch = async (url, options) => {
      capturedUrl = url
      capturedOptions = options
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          status: 'active',
          failedLoginAttempts: 0,
          lockedUntil: null
        })
      }
    }

    // 1. With object payload
    const res1 = await unlockUser('usr-test-123', { reason: 'Admin in-person biometric verification' })
    assert.equal(res1.status, 'active')
    assert.ok(capturedUrl.includes('/v1/admin/users/usr-test-123/unlock'))
    assert.equal(capturedOptions.method, 'POST')
    const xRequestedWith = capturedOptions.headers.get ? capturedOptions.headers.get('X-Requested-With') : capturedOptions.headers['X-Requested-With']
    assert.equal(xRequestedWith, 'XMLHttpRequest')
    const sentBody1 = JSON.parse(capturedOptions.body)
    assert.equal(sentBody1.reason, 'Admin in-person biometric verification')

    // 2. With string payload
    const res2 = await unlockUser('usr-test-123', 'Identity verified by supervisor')
    assert.equal(res2.status, 'active')
    const sentBody2 = JSON.parse(capturedOptions.body)
    assert.equal(sentBody2.reason, 'Identity verified by supervisor')

    // 3. Rejects missing ID
    await assert.rejects(() => unlockUser(''), /User ID is required/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('adminUserApi: updateUserStatus dispatches PATCH with status and reason', async () => {
  const originalFetch = globalThis.fetch
  let capturedUrl = null
  let capturedOptions = null

  try {
    globalThis.fetch = async (url, options) => {
      capturedUrl = url
      capturedOptions = options
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          status: 'inactive'
        })
      }
    }

    const res = await updateUserStatus('usr-test-456', { status: 'inactive', reason: 'Temporary suspension' })
    assert.equal(res.status, 'inactive')
    assert.ok(capturedUrl.includes('/v1/admin/users/usr-test-456/status'))
    assert.equal(capturedOptions.method, 'PATCH')
    const body = JSON.parse(capturedOptions.body)
    assert.equal(body.status, 'inactive')
    assert.equal(body.reason, 'Temporary suspension')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Users.jsx: Telemetry renders Bcrypt Cost 12 and strictly omits Argon2id', () => {
  const usersPath = path.resolve(__dirname, '../src/features/admin/users/Users.jsx')
  const content = fs.readFileSync(usersPath, 'utf-8')

  // Must NOT claim Argon2id
  assert.equal(content.includes('Argon2id'), false, 'Users.jsx must not contain Argon2id telemetry')

  // Must display Bcrypt Cost 12 (Per-Hash Salt)
  assert.ok(content.includes('Bcrypt Cost 12 (Per-Hash Salt)'), 'Users.jsx must display Bcrypt Cost 12 telemetry')

  // Must contain Administrative Audit Trail section
  assert.ok(content.includes('Administrative Audit Trail'), 'Users.jsx must render Administrative Audit Trail')
})

test('DocumentPreviewModal.jsx: Supports canonical props and alias fallbacks', () => {
  const modalPath = path.resolve(__dirname, '../src/components/ui/DocumentPreviewModal.jsx')
  const content = fs.readFileSync(modalPath, 'utf-8')

  // Must support open / isOpen fallback
  assert.ok(content.includes('open ?? isOpen'), 'Must support open/isOpen fallback')

  // Must support fetchBlob / onFetchBlob fallback
  assert.ok(content.includes('fetchBlob ?? onFetchBlob'), 'Must support fetchBlob/onFetchBlob fallback')

  // Must support title / documentTitle fallback
  assert.ok(content.includes('documentTitle'), 'Must support title/documentTitle fallback')
})

test('RegistrationDossier and Organizations: Pass canonical props to DocumentPreviewModal', () => {
  const dossierPath = path.resolve(__dirname, '../src/features/admin/registrations/RegistrationDossier.jsx')
  const dossierContent = fs.readFileSync(dossierPath, 'utf-8')
  assert.ok(dossierContent.includes('fetchBlob='), 'RegistrationDossier must pass canonical fetchBlob')

  const orgPath = path.resolve(__dirname, '../src/features/admin/organizations/Organizations.jsx')
  const orgContent = fs.readFileSync(orgPath, 'utf-8')
  assert.ok(orgContent.includes('fetchBlob='), 'Organizations must pass canonical fetchBlob')
})
