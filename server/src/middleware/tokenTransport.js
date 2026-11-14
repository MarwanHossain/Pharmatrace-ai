// PharmaTrace AI — Insecure Token Transport Rejection Middleware
// Conforms to Revision 3.2 Security Specification

/**
 * Rejects requests that pass access tokens via query parameters.
 * Must run before multipart body parsing / document upload middleware (e.g. Multer)
 * to prevent unauthorized file writes to disk.
 *
 * Detects literal, mixed-case, and percent-encoded parameter names
 * (e.g., ?token=..., ?%74oken=..., ?access_token=..., ?%61ccess_token=...).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function rejectInsecureTokenQuery(req, res, next) {
  let hasInsecureToken = false

  // 1. Inspect Express-parsed query parameters (case-insensitive)
  if (req.query && typeof req.query === 'object') {
    for (const key of Object.keys(req.query)) {
      const normalizedKey = key.trim().toLowerCase()
      if (normalizedKey === 'token' || normalizedKey === 'access_token' || normalizedKey === 'accesstoken') {
        hasInsecureToken = true
        break
      }
    }
  }

  // 2. Defensive raw URL query inspection for percent-encoded parameter names
  if (!hasInsecureToken && (req.originalUrl || req.url)) {
    const rawUrl = req.originalUrl || req.url
    const qIndex = rawUrl.indexOf('?')
    if (qIndex !== -1) {
      const queryString = rawUrl.slice(qIndex + 1).split('#')[0]
      const pairs = queryString.split('&')
      for (const pair of pairs) {
        const rawKey = pair.split('=')[0]
        try {
          const decodedKey = decodeURIComponent(rawKey).trim().toLowerCase()
          if (decodedKey === 'token' || decodedKey === 'access_token' || decodedKey === 'accesstoken') {
            hasInsecureToken = true
            break
          }
        } catch {
          // If percent-decoding fails, test normalized key directly against regex
          if (/^(?:%74|%54|t)(?:%6f|%4f|o)(?:%6b|%4b|k)(?:%65|%45|e)(?:%6e|%4e|n)$/i.test(rawKey)) {
            hasInsecureToken = true
            break
          }
        }
      }
    }
  }

  if (hasInsecureToken) {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Referrer-Policy': 'no-referrer'
    })
    return res.status(400).json({
      success: false,
      error: {
        code: 'INSECURE_TOKEN_TRANSPORT',
        message: 'Access tokens in query parameters are strictly forbidden. Transmit the token via the Authorization header using Bearer format.'
      }
    })
  }

  next()
}
