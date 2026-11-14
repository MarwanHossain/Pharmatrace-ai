// PharmaTrace AI — 404 Route Not Found Handler
import { sanitizeLogUrl } from './requestLogger.js'

export function notFoundHandler(req, res) {
  const safePath = sanitizeLogUrl(req.originalUrl || req.url)
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Cannot ${req.method} ${safePath}`,
    path: safePath
  })
}
