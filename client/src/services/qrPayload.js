const SERIAL_TOKEN_REGEX = /^[A-Z0-9][A-Z0-9._-]{2,80}$/
const RAW_URL_PREFIX_REGEX = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|\/\/)/

function readEnv(key) {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && key in import.meta.env) {
      return String(import.meta.env[key] ?? '').trim()
    }
  } catch {
    // Ignore outside Vite bundler
  }
  return ''
}

export function getAppBasePath() {
  const baseUrl = readEnv('BASE_URL')
  if (!baseUrl || baseUrl === '/') return ''
  const withLeading = baseUrl.startsWith('/') ? baseUrl : `/${baseUrl}`
  return withLeading.replace(/\/+$/, '')
}

export function getDefaultPublicOrigin() {
  const configured = readEnv('VITE_PUBLIC_APP_URL')
  if (configured) {
    return configured.replace(/\/+$/, '')
  }
  try {
    if (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null') {
      return window.location.origin.replace(/\/+$/, '')
    }
  } catch {
    // Ignore non-browser runtime
  }
  return ''
}

export function normalizeSerialToken(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  const normalized = String(raw).trim().toUpperCase()
  if (!normalized || !SERIAL_TOKEN_REGEX.test(normalized)) return null
  return normalized
}

export function isValidSerialFormat(raw) {
  return Boolean(normalizeSerialToken(raw))
}

function safeDecode(value) {
  try {
    return { ok: true, value: decodeURIComponent(value) }
  } catch {
    return { ok: false, reason: 'Malformed percent-encoding in QR payload.' }
  }
}

export function buildVerificationUrl(serial, origin) {
  const canonical = normalizeSerialToken(serial)
  if (!canonical) {
    throw new TypeError(`Invalid package serial "${String(serial ?? '')}".`)
  }

  const basePath = getAppBasePath()
  const base =
    origin !== undefined
      ? String(origin ?? '').trim().replace(/\/+$/, '')
      : getDefaultPublicOrigin()

  const encodedSerial = encodeURIComponent(canonical)

  if (!base) {
    return `${basePath}/verify?serial=${encodedSerial}`
  }

  // If explicit origin already includes a path matching or custom-mounting the app, do not double-append basePath
  try {
    const parsedBase = new URL(base)
    const cleanBasePath = parsedBase.pathname.replace(/\/+$/, '')
    const pathPrefix = cleanBasePath && cleanBasePath !== '/' ? '' : basePath
    return `${base.replace(/\/+$/, '')}${pathPrefix}/verify?serial=${encodedSerial}`
  } catch {
    return `${base}${basePath}/verify?serial=${encodedSerial}`
  }
}

function getDefaultAllowedOrigins() {
  const allowed = new Set()
  const configured = readEnv('VITE_PUBLIC_APP_URL')
  if (configured) {
    try {
      allowed.add(new URL(configured).origin)
    } catch {
      // Ignore malformed env var
    }
  }
  try {
    if (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null') {
      allowed.add(window.location.origin)
    }
  } catch {
    // Ignore non-browser runtime
  }
  return allowed.size > 0 ? [...allowed] : null
}

function extractFromRouteAndSearch(pathname, search, { hasExplicitOrigin, isHashRoute }) {
  const basePath = getAppBasePath()
  let normalizedPath = pathname || '/'

  if (basePath && (normalizedPath === basePath || normalizedPath.startsWith(`${basePath}/`))) {
    normalizedPath = normalizedPath.slice(basePath.length) || '/'
  }

  // Accept optional app mount prefixes when pathname ends in /verify or /verify/results/:serial,
  // while strictly rejecting /report and non-verification routes.
  const trimmedPath = normalizedPath.replace(/\/+$/, '') || '/'

  if (trimmedPath === '/report' || trimmedPath.endsWith('/report')) {
    return { ok: false, reason: 'Report routes are not canonical verification QR URLs.' }
  }

  if (trimmedPath === '/verify' || trimmedPath.endsWith('/verify')) {
    const params = new URLSearchParams(search || '')
    const allSerials = params.getAll('serial')
    if (allSerials.length === 0) {
      return { ok: false, reason: 'Verification URL does not contain a serial query parameter.' }
    }
    if (allSerials.length > 1) {
      return { ok: false, reason: 'Verification URL contains multiple serial parameters.' }
    }
    const serial = normalizeSerialToken(allSerials[0])
    if (!serial) {
      return { ok: false, reason: 'Verification URL contains an invalid package serial.' }
    }
    return {
      ok: true,
      serial,
      sourceType: isHashRoute
        ? 'hash_verification_url'
        : hasExplicitOrigin
          ? 'verification_url'
          : 'relative_verification_url'
    }
  }

  const resultsMatch = trimmedPath.match(/(?:^|\/)verify\/results\/([^/?#]+)$/)
  if (resultsMatch) {
    const decoded = safeDecode(resultsMatch[1])
    if (!decoded.ok) {
      return { ok: false, reason: decoded.reason }
    }
    const serial = normalizeSerialToken(decoded.value)
    if (!serial) {
      return { ok: false, reason: 'Verification results URL contains an invalid package serial.' }
    }
    return {
      ok: true,
      serial,
      sourceType: isHashRoute ? 'hash_results_url' : 'results_url'
    }
  }

  return {
    ok: false,
    reason: 'QR URL path is not a supported PharmaTrace verification route.'
  }
}

export function parseQrPayload(raw, options = {}) {
  if (raw === null || raw === undefined || typeof raw !== 'string') {
    return { ok: false, reason: 'Scan or enter a valid package QR code or serial number.' }
  }

  const trimmed = raw.trim()
  if (!trimmed) {
    return { ok: false, reason: 'Scan or enter a valid package QR code or serial number.' }
  }

  // Fast path: plain package serial identifier (no URL punctuation)
  if (!/[/?#:=\s\\]/.test(trimmed)) {
    const plain = normalizeSerialToken(trimmed)
    if (plain) {
      return { ok: true, serial: plain, sourceType: 'plain_serial' }
    }
    return { ok: false, reason: 'Serial number format is invalid.' }
  }

  // Explicit hash-only SPA routes: "#/verify?serial=..." or "#/verify/results/..."
  if (trimmed.startsWith('#/')) {
    const hashInner = trimmed.slice(1)
    try {
      const parsed = new URL(hashInner, 'https://pharmatrace.local')
      return extractFromRouteAndSearch(parsed.pathname, parsed.search, {
        hasExplicitOrigin: false,
        isHashRoute: true
      })
    } catch {
      return { ok: false, reason: 'Malformed hash verification URL.' }
    }
  }

  // Relative routes: "/verify?serial=...", "verify?serial=...", "/verify/results/..."
  const looksRelativeRoute =
    trimmed.startsWith('/') && !trimmed.startsWith('//') ||
    trimmed.startsWith('verify?') ||
    trimmed.startsWith('verify/results/') ||
    trimmed.startsWith('report?')

  if (looksRelativeRoute && !RAW_URL_PREFIX_REGEX.test(trimmed)) {
    const candidate = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
    try {
      const parsed = new URL(candidate, 'https://pharmatrace.local')
      return extractFromRouteAndSearch(parsed.pathname, parsed.search, {
        hasExplicitOrigin: false,
        isHashRoute: false
      })
    } catch {
      return { ok: false, reason: 'Malformed relative verification URL.' }
    }
  }

  // Protocol-relative "//host/..." or non-HTTP(S) schemes must be rejected cleanly
  if (trimmed.startsWith('//')) {
    return { ok: false, reason: 'Protocol-relative URLs are not supported in QR codes.' }
  }

  let parsedUrl
  try {
    parsedUrl = new URL(trimmed)
  } catch {
    return { ok: false, reason: 'Unrecognized QR format. Expected a PharmaTrace verification URL or package serial.' }
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return { ok: false, reason: `Unsupported QR URL scheme "${parsedUrl.protocol}".` }
  }

  const allowedOrigins =
    options.allowedOrigins !== undefined
      ? options.allowedOrigins
      : getDefaultAllowedOrigins()

  if (Array.isArray(allowedOrigins) && allowedOrigins.length > 0) {
    const normalizedAllowed = allowedOrigins
      .map(o => {
        try {
          return new URL(o).origin
        } catch {
          return String(o ?? '').replace(/\/+$/, '')
        }
      })
      .filter(Boolean)
    if (normalizedAllowed.length > 0 && !normalizedAllowed.includes(parsedUrl.origin)) {
      return {
        ok: false,
        reason: `External URL origin "${parsedUrl.origin}" does not match this PharmaTrace verification host.`
      }
    }
  }

  if (parsedUrl.hash && parsedUrl.hash.startsWith('#/')) {
    try {
      const hashInner = parsedUrl.hash.slice(1)
      const hashParsed = new URL(hashInner, 'https://pharmatrace.local')
      return extractFromRouteAndSearch(hashParsed.pathname, hashParsed.search, {
        hasExplicitOrigin: true,
        isHashRoute: true
      })
    } catch {
      return { ok: false, reason: 'Malformed hash verification URL.' }
    }
  }

  return extractFromRouteAndSearch(parsedUrl.pathname, parsedUrl.search, {
    hasExplicitOrigin: true,
    isHashRoute: false
  })
}

export function extractSerialFromInput(raw, options = {}) {
  const parsed = parseQrPayload(raw, options)
  if (parsed.ok) return parsed.serial
  return ''
}
