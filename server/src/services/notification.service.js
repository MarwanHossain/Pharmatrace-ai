// PharmaTrace AI — Notification & Email Delivery Service Abstraction
// Conforms to Revision 3.2 §4.1 & Phase 3 Milestone 3 specifications
import net from 'node:net'
import { logger } from '../utils/logger.js'

let fakeTransport = null
const capturedNotifications = []

/**
 * Injects a fake mail transport for testing purposes.
 * Allows test suites to inspect captured messages in test memory without logging secrets.
 *
 * @param {Function|null} transportFn
 */
export function setFakeTransport(transportFn) {
  fakeTransport = transportFn
}

/**
 * Clears any active fake transport.
 */
export function clearFakeTransport() {
  fakeTransport = null
}

/**
 * Returns a shallow copy of captured notifications from memory.
 *
 * @returns {Array<object>}
 */
export function getCapturedNotifications() {
  return [...capturedNotifications]
}

/**
 * Clears captured notifications from memory.
 */
export function clearCapturedNotifications() {
  capturedNotifications.length = 0
}

/**
 * Parses and expands any valid IPv6 address into an array of 8 integers (0 to 0xffff).
 * Handles compressed (::), expanded, and IPv4-mapped (::ffff:a.b.c.d) representations.
 *
 * @param {string} ip
 * @returns {Array<number>}
 */
function parseIpv6Hextets(ip) {
  let clean = ip.toLowerCase()
  if (clean.includes('.')) {
    const lastColon = clean.lastIndexOf(':')
    const ipv4Str = clean.slice(lastColon + 1)
    const prefix = clean.slice(0, lastColon)
    const v4Parts = ipv4Str.split('.').map(Number)
    const hex1 = ((v4Parts[0] << 8) | v4Parts[1]).toString(16)
    const hex2 = ((v4Parts[2] << 8) | v4Parts[3]).toString(16)
    clean = prefix + ':' + hex1 + ':' + hex2
  }

  if (clean.includes('::')) {
    const [left, right] = clean.split('::')
    const leftHextets = left ? left.split(':') : []
    const rightHextets = right ? right.split(':') : []
    const missing = 8 - (leftHextets.length + rightHextets.length)
    return [...leftHextets, ...Array(missing).fill('0'), ...rightHextets].map(h => parseInt(h, 16))
  }
  return clean.split(':').map(h => parseInt(h, 16))
}

/**
 * Classifies an IP address into LOOPBACK, PRIVATE, LINK_LOCAL, INTERNAL, or PUBLIC.
 * Returns null if the hostname is not an IP address (e.g. an FQDN).
 *
 * @param {string} hostname
 * @returns {'LOOPBACK'|'PRIVATE'|'LINK_LOCAL'|'INTERNAL'|'PUBLIC'|null}
 */
export function classifyIp(hostname) {
  if (!hostname || typeof hostname !== 'string') return null
  const clean = hostname.replace(/^\[|\]$/g, '').toLowerCase().trim()
  const ipType = net.isIP(clean)
  if (!ipType) return null

  if (ipType === 4) {
    const [o0, o1] = clean.split('.').map(Number)
    // 0.0.0.0/8 (unspecified) or 127.0.0.0/8 (loopback)
    if (o0 === 127 || o0 === 0) return 'LOOPBACK'
    // 10.0.0.0/8 (RFC 1918)
    if (o0 === 10) return 'PRIVATE'
    // 172.16.0.0/12 (RFC 1918)
    if (o0 === 172 && (o1 >= 16 && o1 <= 31)) return 'PRIVATE'
    // 192.168.0.0/16 (RFC 1918)
    if (o0 === 192 && o1 === 168) return 'PRIVATE'
    // 169.254.0.0/16 (RFC 3927 link-local)
    if (o0 === 169 && o1 === 254) return 'LINK_LOCAL'
    // Multicast (224.0.0.0/4), Reserved (240.0.0.0/4), Broadcast
    if (o0 >= 224) return 'INTERNAL'
    return 'PUBLIC'
  }

  if (ipType === 6) {
    const hextets = parseIpv6Hextets(clean)
    // ::1 (loopback)
    if (hextets.slice(0, 7).every(h => h === 0) && hextets[7] === 1) return 'LOOPBACK'
    // :: (unspecified)
    if (hextets.every(h => h === 0)) return 'LOOPBACK'
    // fc00::/7 (unique-local, RFC 4193)
    if ((hextets[0] & 0xfe00) === 0xfc00) return 'PRIVATE'
    // fe80::/10 (link-local, RFC 4291) or fec0::/10 (deprecated site-local)
    if ((hextets[0] & 0xffc0) === 0xfe80 || (hextets[0] & 0xffc0) === 0xfec0) return 'LINK_LOCAL'
    // ::ffff:0:0/96 (IPv4-mapped IPv6)
    if (hextets.slice(0, 5).every(h => h === 0) && hextets[5] === 0xffff) {
      const o0 = (hextets[6] >> 8) & 0xff
      const o1 = hextets[6] & 0xff
      if (o0 === 127 || o0 === 0) return 'LOOPBACK'
      if (o0 === 10) return 'PRIVATE'
      if (o0 === 172 && (o1 >= 16 && o1 <= 31)) return 'PRIVATE'
      if (o0 === 192 && o1 === 168) return 'PRIVATE'
      if (o0 === 169 && o1 === 254) return 'LINK_LOCAL'
      if (o0 >= 224) return 'INTERNAL'
      return 'PUBLIC'
    }
    return 'PUBLIC'
  }

  return null
}

/**
 * Checks whether a given hostname is localhost, a loopback IP, or an unspecified address.
 *
 * @param {string} hostname
 * @returns {boolean}
 */
export function isLocalhostOrLoopback(hostname) {
  if (!hostname || typeof hostname !== 'string') return false
  const clean = hostname.replace(/^\[|\]$/g, '').toLowerCase().trim()
  if (clean === 'localhost' || clean.endsWith('.localhost')) return true
  const classification = classifyIp(clean)
  return classification === 'LOOPBACK'
}

/**
 * Checks whether a given hostname is a private or internal IP address.
 * Matches RFC 1918 private IPv4, RFC 3927 link-local IPv4, RFC 4193 unique-local IPv6,
 * RFC 4291 link-local IPv6, and internal IPv4-mapped IPv6 variants.
 *
 * @param {string} hostname
 * @returns {boolean}
 */
export function isPrivateOrInternalIP(hostname) {
  if (!hostname || typeof hostname !== 'string') return false
  const clean = hostname.replace(/^\[|\]$/g, '').toLowerCase().trim()
  const classification = classifyIp(clean)
  return classification === 'PRIVATE' || classification === 'LINK_LOCAL' || classification === 'INTERNAL'
}

/**
 * Resolves and validates the frontend application origin for notification URLs.
 *
 * Rules:
 * 1. In development and test environments, defaults to 'http://localhost:5173' if APP_HOST is unset.
 * 2. In production, APP_HOST is mandatory, must not be empty, and cannot point to localhost/loopback.
 * 3. In production, APP_HOST must use HTTPS (rejecting explicit http://).
 * 4. In production, single-label or non-FQDN hostnames and invalid URLs are rejected.
 *
 * @param {string} [nodeEnv=process.env.NODE_ENV]
 * @param {string} [rawHost=process.env.APP_HOST]
 * @returns {string} Fully qualified origin without trailing slash (e.g. 'https://portal.pharmatrace.gov.bd')
 */
export function resolveAppOrigin(nodeEnv = process.env.NODE_ENV, rawHost = process.env.APP_HOST) {
  const isProduction = (nodeEnv || '').toLowerCase() === 'production'
  const hostCandidate = (rawHost || '').trim()

  if (!hostCandidate) {
    if (isProduction) {
      const err = new Error('Production APP_HOST is missing. A valid public HTTPS application host is required.')
      err.code = 'APP_HOST_MISSING'
      throw err
    }
    return 'http://localhost:5173'
  }

  // Explicitly reject insecure HTTP in production
  if (isProduction && hostCandidate.startsWith('http://')) {
    const err = new Error('Insecure HTTP application host is not permitted in production. Must use HTTPS.')
    err.code = 'INSECURE_APP_HOST'
    throw err
  }

  // Prepend scheme if omitted and normalize unbracketed IPv6 literals
  let scheme = ''
  let hostPart = hostCandidate
  if (hostPart.startsWith('http://')) {
    scheme = 'http://'
    hostPart = hostPart.slice(7)
  } else if (hostPart.startsWith('https://')) {
    scheme = 'https://'
    hostPart = hostPart.slice(8)
  } else {
    scheme = isProduction ? 'https://' : 'http://'
  }

  // Wrap unbracketed IPv6 literal in brackets so WHATWG URL parser accepts it
  if (net.isIPv6(hostPart)) {
    hostPart = `[${hostPart}]`
  }

  const urlString = scheme + hostPart

  let parsedUrl
  try {
    parsedUrl = new URL(urlString)
  } catch (parseErr) {
    const err = new Error(`Invalid application host URL: ${parseErr.message}`)
    err.code = 'INVALID_APP_HOST'
    throw err
  }

  // Explicitly reject embedded user credentials (username or password)
  if (parsedUrl.username || parsedUrl.password) {
    const err = new Error('Application host must not contain embedded user credentials.')
    err.code = 'INVALID_APP_HOST'
    throw err
  }

  if (isProduction && parsedUrl.protocol !== 'https:') {
    const err = new Error('Application host must use HTTPS protocol in production.')
    err.code = 'INSECURE_APP_HOST'
    throw err
  }

  if (isProduction && isLocalhostOrLoopback(parsedUrl.hostname)) {
    const err = new Error(`Localhost or loopback address (${parsedUrl.hostname}) is rejected in production.`)
    err.code = 'REJECTED_LOOPBACK_HOST'
    throw err
  }

  if (isProduction && isPrivateOrInternalIP(parsedUrl.hostname)) {
    const err = new Error(`Private or internal IP address (${parsedUrl.hostname}) is rejected in production.`)
    err.code = 'REJECTED_PRIVATE_HOST'
    throw err
  }

  if (isProduction && !parsedUrl.hostname.includes('.')) {
    const err = new Error(`Single-label or non-FQDN host (${parsedUrl.hostname}) is rejected in production.`)
    err.code = 'INVALID_APP_HOST'
    throw err
  }

  return parsedUrl.origin
}

/**
 * Derives application frontend base host.
 * Backward-compatible helper returning host (e.g. 'localhost:5173' or 'portal.pharmatrace.gov.bd').
 *
 * @param {string} [nodeEnv=process.env.NODE_ENV]
 * @param {string} [overrideHost=process.env.APP_HOST]
 * @returns {string}
 */
export function getAppHost(nodeEnv = process.env.NODE_ENV, overrideHost = process.env.APP_HOST) {
  const origin = resolveAppOrigin(nodeEnv, overrideHost)
  const u = new URL(origin)
  return u.host
}

/**
 * Builds secure account activation URL using a frontend URL fragment (#token=...).
 * Fragments are never transmitted in HTTP request query strings to servers.
 *
 * @param {string} rawToken - 256-bit hexadecimal activation token
 * @param {string} [nodeEnv=process.env.NODE_ENV]
 * @param {string} [overrideHost=process.env.APP_HOST]
 * @returns {string}
 */
export function buildActivationUrl(rawToken, nodeEnv = process.env.NODE_ENV, overrideHost = process.env.APP_HOST) {
  if (!rawToken) {
    throw new Error('Raw activation token is required to build activation URL.')
  }
  const origin = resolveAppOrigin(nodeEnv, overrideHost)
  return `${origin}/activate#token=${rawToken}`
}

/**
 * Builds secure applicant resubmission URL using a frontend URL fragment (#token=...).
 * Fragments are never transmitted in HTTP request query strings to servers.
 *
 * @param {string} rawToken - 256-bit hexadecimal registration access token
 * @param {string} [nodeEnv=process.env.NODE_ENV]
 * @param {string} [overrideHost=process.env.APP_HOST]
 * @returns {string}
 */
export function buildResubmissionUrl(rawToken, nodeEnv = process.env.NODE_ENV, overrideHost = process.env.APP_HOST) {
  if (!rawToken) {
    throw new Error('Raw access token is required to build resubmission URL.')
  }
  const origin = resolveAppOrigin(nodeEnv, overrideHost)
  return `${origin}/resubmit#token=${rawToken}`
}

/**
 * Dispatches account activation notification to the approved organization's primary contact.
 * Must only be invoked AFTER database transaction has committed.
 *
 * @param {object} params
 * @param {string} params.recipientEmail
 * @param {string} params.contactName
 * @param {string} params.orgName
 * @param {string} params.rawToken
 * @returns {Promise<{ delivered: boolean, status: string, provider: string|null, error?: string }>}
 */
export async function sendActivationNotification({
  recipientEmail,
  contactName,
  orgName,
  rawToken
}) {
  if (!recipientEmail || !rawToken) {
    throw new Error('Recipient email and activation token are required for activation notification.')
  }

  // 1. Resolve and validate activation URL under current environment rules
  let activationUrl
  try {
    activationUrl = buildActivationUrl(rawToken)
  } catch (hostErr) {
    logger.warn('Activation notification skipped: invalid or missing application host configuration', {
      type: 'ACTIVATION',
      recipient: recipientEmail,
      orgName,
      code: hostErr.code
    })
    return { delivered: false, status: 'NOT_CONFIGURED', provider: null, error: hostErr.code }
  }

  const payload = {
    type: 'ACTIVATION',
    recipientEmail,
    contactName: contactName || 'Authorized Representative',
    orgName: orgName || 'Registered Entity',
    rawToken,
    activationUrl,
    timestamp: Date.now()
  }

  // 2. If test transport is active, dispatch to memory
  if (typeof fakeTransport === 'function') {
    try {
      await fakeTransport(payload)
    } catch (err) {
      logger.warn('Fake transport error during activation dispatch', { error: err.message })
      return { delivered: false, status: 'FAILED', provider: 'fake-memory', error: err.message }
    }
    capturedNotifications.push(payload)
    return { delivered: true, status: 'DELIVERED_FAKE', provider: 'fake-memory' }
  }

  // 3. Real provider check (No external provider is authorized or configured in Milestone 3)
  const isRealProviderConfigured = Boolean(process.env.SMTP_HOST || process.env.SENDGRID_API_KEY)
  if (!isRealProviderConfigured) {
    logger.info('Activation notification recorded (provider NOT_CONFIGURED)', {
      recipient: recipientEmail,
      orgName,
      type: 'ACTIVATION'
    })
    return { delivered: false, status: 'NOT_CONFIGURED', provider: null }
  }

  // Future provider integration would execute here
  return { delivered: false, status: 'NOT_CONFIGURED', provider: null }
}

/**
 * Dispatches information request notification to applicant contact.
 * Must only be invoked AFTER database transaction has committed.
 *
 * @param {object} params
 * @param {string} params.recipientEmail
 * @param {string} params.contactName
 * @param {string} params.orgName
 * @param {string} params.reason
 * @param {string} params.rawToken
 * @param {number} params.cureDays
 * @param {Date|string} params.expiresAt
 * @returns {Promise<{ delivered: boolean, status: string, provider: string|null, error?: string }>}
 */
export async function sendInformationRequestNotification({
  recipientEmail,
  contactName,
  orgName,
  reason,
  rawToken,
  cureDays = 7,
  expiresAt
}) {
  if (!recipientEmail || !rawToken) {
    throw new Error('Recipient email and access token are required for information request notification.')
  }

  // 1. Resolve and validate resubmission URL under current environment rules
  let resubmissionUrl
  try {
    resubmissionUrl = buildResubmissionUrl(rawToken)
  } catch (hostErr) {
    logger.warn('Information request notification skipped: invalid or missing application host configuration', {
      type: 'INFORMATION_REQUEST',
      recipient: recipientEmail,
      orgName,
      code: hostErr.code
    })
    return { delivered: false, status: 'NOT_CONFIGURED', provider: null, error: hostErr.code }
  }

  const payload = {
    type: 'INFORMATION_REQUEST',
    recipientEmail,
    contactName: contactName || 'Applicant',
    orgName: orgName || 'Applicant Organization',
    reason,
    rawToken,
    resubmissionUrl,
    cureDays,
    expiresAt,
    timestamp: Date.now()
  }

  // 2. If test transport is active, dispatch to memory
  if (typeof fakeTransport === 'function') {
    try {
      await fakeTransport(payload)
    } catch (err) {
      logger.warn('Fake transport error during information request dispatch', { error: err.message })
      return { delivered: false, status: 'FAILED', provider: 'fake-memory', error: err.message }
    }
    capturedNotifications.push(payload)
    return { delivered: true, status: 'DELIVERED_FAKE', provider: 'fake-memory' }
  }

  // 3. Real provider check
  const isRealProviderConfigured = Boolean(process.env.SMTP_HOST || process.env.SENDGRID_API_KEY)
  if (!isRealProviderConfigured) {
    logger.info('Information request notification recorded (provider NOT_CONFIGURED)', {
      recipient: recipientEmail,
      orgName,
      type: 'INFORMATION_REQUEST',
      cureDays
    })
    return { delivered: false, status: 'NOT_CONFIGURED', provider: null }
  }

  return { delivered: false, status: 'NOT_CONFIGURED', provider: null }
}
