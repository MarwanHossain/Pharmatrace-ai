import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validatePasswordComplexity } from '../src/services/passwordValidation.js'
import { changePassword, api } from '../src/services/api.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('Change Password Feature — Frontend Validation & Component Integrity', () => {
  describe('Password Complexity Validator (Revision 3.2 §1.2 & §4.1)', () => {
    test('Rejects passwords shorter than 10 characters', () => {
      const res = validatePasswordComplexity('Short1!Aa')
      assert.equal(res.hasMinLength, false)
      assert.equal(res.isValid, false)
    })

    test('Rejects passwords without uppercase letter', () => {
      const res = validatePasswordComplexity('validpass123!#')
      assert.equal(res.hasUppercase, false)
      assert.equal(res.isValid, false)
    })

    test('Rejects passwords without lowercase letter', () => {
      const res = validatePasswordComplexity('VALIDPASS123!#')
      assert.equal(res.hasLowercase, false)
      assert.equal(res.isValid, false)
    })

    test('Rejects passwords without digit', () => {
      const res = validatePasswordComplexity('ValidPassword!#')
      assert.equal(res.hasDigit, false)
      assert.equal(res.isValid, false)
    })

    test('Rejects passwords without special symbol', () => {
      const res = validatePasswordComplexity('ValidPass1234')
      assert.equal(res.hasSymbol, false)
      assert.equal(res.isValid, false)
    })

    test('Rejects passwords exceeding 72 UTF-8 bytes', () => {
      // 73 ASCII characters
      const longPass = 'A1!a' + 'x'.repeat(70)
      const res = validatePasswordComplexity(longPass)
      assert.equal(res.hasMaxLength, false)
      assert.equal(res.isValid, false)
    })

    test('Accepts compliant password meeting all Revision 3.2 criteria', () => {
      const res = validatePasswordComplexity('ValidPass123!#')
      assert.equal(res.hasMinLength, true)
      assert.equal(res.hasMaxLength, true)
      assert.equal(res.hasUppercase, true)
      assert.equal(res.hasLowercase, true)
      assert.equal(res.hasDigit, true)
      assert.equal(res.hasSymbol, true)
      assert.equal(res.isValid, true)
    })
  })

  describe('API Client changePassword Dispatcher', () => {
    test('changePassword dispatches POST to /v1/auth/change-password with payload', async () => {
      let dispatchedEndpoint = null
      let dispatchedBody = null

      const originalPost = api.post
      api.post = async (endpoint, body) => {
        dispatchedEndpoint = endpoint
        dispatchedBody = body
        return { success: true, message: 'Password successfully changed.' }
      }

      try {
        const result = await changePassword('OldPassword123!#', 'NewPassword456!#')
        assert.equal(dispatchedEndpoint, '/v1/auth/change-password')
        assert.deepEqual(dispatchedBody, {
          currentPassword: 'OldPassword123!#',
          newPassword: 'NewPassword456!#'
        })
        assert.equal(result.success, true)
      } finally {
        api.post = originalPost
      }
    })
  })

  describe('ChangePasswordModal Component Source Audit', () => {
    test('ChangePasswordModal.jsx implements accessible dialog and visibility toggles', () => {
      const modalPath = path.join(__dirname, '../src/components/auth/ChangePasswordModal.jsx')
      assert.ok(fs.existsSync(modalPath), 'ChangePasswordModal.jsx must exist')
      const source = fs.readFileSync(modalPath, 'utf8')

      // Dialog accessibility
      assert.ok(source.includes('role="dialog"'), 'Must have role="dialog"')
      assert.ok(source.includes('aria-modal="true"'), 'Must have aria-modal="true"')
      assert.ok(source.includes('aria-labelledby="change-password-title"'), 'Must have aria-labelledby')

      // Password fields
      assert.ok(source.includes('id="change-pwd-current"'), 'Must have current password input')
      assert.ok(source.includes('id="change-pwd-new"'), 'Must have new password input')
      assert.ok(source.includes('id="change-pwd-confirm"'), 'Must have confirm password input')

      // Eye visibility toggles
      assert.ok(source.includes('showCurrent'), 'Must support current password visibility toggle')
      assert.ok(source.includes('showNew'), 'Must support new password visibility toggle')
      assert.ok(source.includes('showConfirm'), 'Must support confirm password visibility toggle')

      // Complexity checklist
      assert.ok(source.includes('complexity.hasMinLength'), 'Checklist requires length')
      assert.ok(source.includes('complexity.hasUppercase'), 'Checklist requires uppercase')
      assert.ok(source.includes('complexity.hasLowercase'), 'Checklist requires lowercase')
      assert.ok(source.includes('complexity.hasDigit'), 'Checklist requires digit')
      assert.ok(source.includes('complexity.hasSymbol'), 'Checklist requires symbol')

      // Disallow identical password
      assert.ok(source.includes('isIdentical'), 'Must reject new password identical to current')
      // Session termination notification
      assert.ok(source.includes('All previous active sessions'), 'Must inform user sessions are revoked')
    })

    test('AppShell.jsx integrates ChangePasswordModal across all 6 roles', () => {
      const shellPath = path.join(__dirname, '../src/layouts/AppShell.jsx')
      const source = fs.readFileSync(shellPath, 'utf8')

      assert.ok(source.includes('ChangePasswordModal'), 'AppShell must import ChangePasswordModal')
      assert.ok(source.includes('isChangePasswordOpen'), 'AppShell must maintain modal open state')
      assert.ok(source.includes('KeyRound'), 'AppShell must render KeyRound icon')
      assert.ok(source.includes('userEmailForModal'), 'AppShell must pass user email context')
      assert.ok(source.includes('userRole={role}'), 'AppShell must pass user role context')
      assert.ok(source.includes('handlePasswordChangeSuccess'), 'AppShell must handle session revocation cleanup')
    })
  })
})
