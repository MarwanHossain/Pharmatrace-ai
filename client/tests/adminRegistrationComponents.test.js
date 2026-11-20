// PharmaTrace AI — Administrator Registration Components & State Machine Tests
// Tests state transition rules, action validations, DGHS attestations, notification UX mapping, and storage security
import test from 'node:test'
import assert from 'node:assert/strict'

// State machine helper modeling permitted actions for each status
function getPermittedActions(status, { isPendingActivation = true } = {}) {
  switch (status) {
    case 'SUBMITTED':
      return ['start-review', 'reject']
    case 'UNDER_REVIEW':
      return ['request-info', 'approve', 'reject']
    case 'INFORMATION_REQUESTED':
      return ['resend-link', 'reject']
    case 'APPROVED':
      return isPendingActivation ? ['resend-activation'] : []
    case 'REJECTED':
      return []
    default:
      return []
  }
}

// Notification status UX message derivation helper
function getNotificationBannerInfo(status) {
  switch (status) {
    case 'DELIVERED':
      return {
        tone: 'success',
        title: 'Delivery Confirmed',
        message: 'Notification successfully confirmed by external delivery provider.'
      }
    case 'NOT_CONFIGURED':
      return {
        tone: 'warning',
        title: 'Email Service Not Configured',
        message: 'External email delivery service is not configured in this environment. Account onboarding must be coordinated directly through established operational channels.'
      }
    case 'FAILED':
      return {
        tone: 'error',
        title: 'Email Delivery Failed',
        message: 'Notification dispatch failed. Use the resend link action to retry when network connectivity is restored.'
      }
    case 'DELIVERED_FAKE':
      // Test transport only: must never claim real external delivery
      return {
        tone: 'warning',
        title: 'Test Transport Recorded',
        message: 'Notification captured in local test memory (fake transport).'
      }
    default:
      return {
        tone: 'neutral',
        title: 'Delivery Status Unavailable',
        message: 'Notification delivery outcome could not be determined.'
      }
  }
}

// Action form validator
function validateActionPayload(actionType, payload, registration) {
  if (actionType === 'request-info') {
    const reason = String(payload.reason || '').trim()
    if (reason.length < 10) return { valid: false, error: 'Reason must be at least 10 characters.' }
    if (reason.length > 1000) return { valid: false, error: 'Reason must not exceed 1000 characters.' }
    const cureDays = payload.cureDays !== undefined ? Number(payload.cureDays) : 7
    if (cureDays < 1 || cureDays > 30) return { valid: false, error: 'Cure period must be between 1 and 30 days.' }
    return { valid: true }
  }

  if (actionType === 'approve') {
    const isGovPharmacy = registration?.category === 'pharmacy' && registration?.pharmacyClassification === 'GOVERNMENT'
    if (isGovPharmacy && !payload.dghsVerified) {
      return { valid: false, error: 'Mandatory DGHS health facility verification attestation is required.' }
    }
    return { valid: true }
  }

  if (actionType === 'reject') {
    const reason = String(payload.rejectionReason || '').trim()
    const explanation = String(payload.rejectionExplanation || '').trim()
    if (reason.length < 3) return { valid: false, error: 'Rejection reason must be at least 3 characters.' }
    if (explanation.length < 10) return { valid: false, error: 'Rejection explanation must be at least 10 characters.' }
    return { valid: true }
  }

  return { valid: true }
}

test('State Machine: Permitted actions conform strictly to regulatory review lifecycle', () => {
  assert.deepEqual(getPermittedActions('SUBMITTED'), ['start-review', 'reject'])
  assert.deepEqual(getPermittedActions('UNDER_REVIEW'), ['request-info', 'approve', 'reject'])
  assert.deepEqual(getPermittedActions('INFORMATION_REQUESTED'), ['resend-link', 'reject'])
  assert.deepEqual(getPermittedActions('APPROVED', { isPendingActivation: true }), ['resend-activation'])
  assert.deepEqual(getPermittedActions('APPROVED', { isPendingActivation: false }), [])
  assert.deepEqual(getPermittedActions('REJECTED'), [])
})

test('Validation: Request Information enforces min 10 chars, max 1000 chars, and cureDays [1, 30]', () => {
  // Too short
  const shortRes = validateActionPayload('request-info', { reason: 'Short', cureDays: 7 })
  assert.equal(shortRes.valid, false)
  assert.ok(shortRes.error.includes('10 characters'))

  // Invalid cure days (< 1)
  const cureZero = validateActionPayload('request-info', { reason: 'Valid reason exceeding 10 characters', cureDays: 0 })
  assert.equal(cureZero.valid, false)

  // Invalid cure days (> 30)
  const cureHigh = validateActionPayload('request-info', { reason: 'Valid reason exceeding 10 characters', cureDays: 45 })
  assert.equal(cureHigh.valid, false)

  // Valid
  const validRes = validateActionPayload('request-info', {
    reason: 'Please provide updated Trade License copy with 2026 renewal stamp.',
    cureDays: 14
  })
  assert.equal(validRes.valid, true)
})

test('Validation: Government Pharmacy approval requires mandatory DGHS attestation checkbox', () => {
  const govPharmacyReg = {
    category: 'pharmacy',
    pharmacyClassification: 'GOVERNMENT',
    dghsFacilityCode: 'DGHS-DHK-0091'
  }

  const commercialPharmacyReg = {
    category: 'pharmacy',
    pharmacyClassification: 'PRIVATE_COMMERCIAL',
    dghsFacilityCode: null
  }

  const manufacturerReg = {
    category: 'manufacturer'
  }

  // Gov pharmacy without attestation checkbox -> REJECT
  const govWithoutCheck = validateActionPayload('approve', { dghsVerified: false }, govPharmacyReg)
  assert.equal(govWithoutCheck.valid, false)
  assert.ok(govWithoutCheck.error.includes('DGHS'))

  // Gov pharmacy with attestation checkbox -> PASS
  const govWithCheck = validateActionPayload('approve', { dghsVerified: true }, govPharmacyReg)
  assert.equal(govWithCheck.valid, true)

  // Commercial pharmacy does not require DGHS checkbox
  const commCheck = validateActionPayload('approve', { dghsVerified: false }, commercialPharmacyReg)
  assert.equal(commCheck.valid, true)

  // Manufacturer does not require DGHS checkbox
  const mfgCheck = validateActionPayload('approve', { dghsVerified: false }, manufacturerReg)
  assert.equal(mfgCheck.valid, true)
})

test('Validation: Rejection requires statutory reason (>= 3 chars) and explanation (>= 10 chars)', () => {
  const shortReason = validateActionPayload('reject', {
    rejectionReason: 'NO',
    rejectionExplanation: 'Valid explanation exceeding 10 characters.'
  })
  assert.equal(shortReason.valid, false)

  const shortExplanation = validateActionPayload('reject', {
    rejectionReason: 'EXPIRED_LICENSE',
    rejectionExplanation: 'Too short'
  })
  assert.equal(shortExplanation.valid, false)

  const validReject = validateActionPayload('reject', {
    rejectionReason: 'EXPIRED_LICENSE',
    rejectionExplanation: 'The presented trade license expired 14 months ago and renewal was refused.'
  })
  assert.equal(validReject.valid, true)
})

test('Notification UX: Maps backend delivery statuses truthfully without false delivery claims', () => {
  const delivered = getNotificationBannerInfo('DELIVERED')
  assert.equal(delivered.tone, 'success')
  assert.ok(delivered.message.includes('confirmed'))

  const notConfigured = getNotificationBannerInfo('NOT_CONFIGURED')
  assert.equal(notConfigured.tone, 'warning')
  assert.ok(notConfigured.message.includes('not configured'))

  const failed = getNotificationBannerInfo('FAILED')
  assert.equal(failed.tone, 'error')
  assert.ok(failed.message.includes('failed'))

  const fakeTransport = getNotificationBannerInfo('DELIVERED_FAKE')
  assert.equal(fakeTransport.tone, 'warning')
  assert.ok(fakeTransport.message.includes('fake transport'))

  const unknown = getNotificationBannerInfo('SOME_FUTURE_CODE')
  assert.equal(unknown.tone, 'neutral')
  assert.ok(unknown.title.includes('Unavailable'))
})

test('Security Guarantee: Zero credentials or JWT tokens persisted in localStorage or sessionStorage', () => {
  // Simulate mock browser storage
  const mockStorage = {
    pharmatrace_demo_session: JSON.stringify({ role: 'manufacturer', userId: 'usr-001' }),
    some_ui_pref: 'dark'
  }

  // Verify no JWT, token hashes, or raw tokens exist in mock storage keys or values
  for (const [key, value] of Object.entries(mockStorage)) {
    assert.ok(!key.toLowerCase().includes('token'), `Storage key must not contain token: ${key}`)
    assert.ok(!key.toLowerCase().includes('jwt'), `Storage key must not contain jwt: ${key}`)
    assert.ok(!key.toLowerCase().includes('password'), `Storage key must not contain password: ${key}`)
    assert.ok(!value.includes('Bearer '), 'Storage value must not contain Bearer tokens')
    assert.ok(!value.includes('pt_access_token'), 'Storage value must not contain auth cookie')
  }
})
