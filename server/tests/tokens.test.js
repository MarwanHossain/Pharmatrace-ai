// PharmaTrace AI — JWT & Token Utilities Test Suite
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import {
  signAccessToken,
  verifyAccessToken,
  getAuthCookieOptions,
  AUTH_COOKIE_NAME,
  generateActivationToken,
  hashToken,
  JWT_EXPIRY_MS
} from '../src/utils/tokens.js'
import { env } from '../src/config/env.js'

describe('JWT & Session Token Utilities (Revision 3.2 §4.2)', () => {
  test('Signs and verifies valid 15-minute JWT access token', () => {
    const user = {
      id: 'usr-test-123',
      email: 'test@example.com',
      role: 'manufacturer',
      orgId: 'org-test-456',
      tokenVersion: 1
    }

    const token = signAccessToken(user)
    assert.ok(typeof token === 'string')

    const decoded = verifyAccessToken(token)
    assert.equal(decoded.sub, user.id)
    assert.equal(decoded.email, user.email)
    assert.equal(decoded.role, user.role)
    assert.equal(decoded.orgId, user.orgId)
    assert.equal(decoded.tokenVersion, 1)

    // Expiration check: exp - iat should be 900 seconds (15 minutes)
    const lifetimeSeconds = decoded.exp - decoded.iat
    assert.equal(lifetimeSeconds, 900)
  })

  test('Rejects expired or tampered JWT access token', () => {
    // Tampered signature
    const validToken = signAccessToken({ id: 'usr-1', email: 'a@b.com', role: 'admin', tokenVersion: 1 })
    const tampered = validToken.slice(0, -5) + 'abcde'
    assert.throws(() => verifyAccessToken(tampered), /invalid signature/i)

    // Expired token
    const expiredToken = jwt.sign(
      { sub: 'usr-expired', email: 'exp@test.com', role: 'pharmacy', tokenVersion: 1 },
      env.JWT_SECRET,
      { expiresIn: '-1s' }
    )
    assert.throws(() => verifyAccessToken(expiredToken), /jwt expired/i)
  })

  test('Cookie options enforce HttpOnly, Path=/, and environment-specific SameSite & Secure', () => {
    const cookieOpts = getAuthCookieOptions()
    assert.equal(AUTH_COOKIE_NAME, 'pt_access_token')
    assert.equal(cookieOpts.httpOnly, true)
    assert.equal(cookieOpts.path, '/')
    assert.equal(cookieOpts.maxAge, JWT_EXPIRY_MS)

    if (env.NODE_ENV === 'production') {
      assert.equal(cookieOpts.secure, true)
      assert.equal(cookieOpts.sameSite, 'strict')
    } else {
      assert.equal(cookieOpts.secure, false)
      assert.equal(cookieOpts.sameSite, 'lax')
    }
  })

  test('Generates 256-bit cryptographically random activation token with SHA-256 hash', () => {
    const token = generateActivationToken()
    // 32 bytes in hex = 64 characters = 256 bits of entropy
    assert.equal(token.length, 64)
    assert.match(token, /^[0-9a-f]{64}$/i)

    const hash = hashToken(token)
    assert.equal(hash.length, 64)
    assert.match(hash, /^[0-9a-f]{64}$/i)

    // Distinct tokens generate distinct hashes
    const token2 = generateActivationToken()
    assert.notEqual(token, token2)
    assert.notEqual(hash, hashToken(token2))
  })
})
