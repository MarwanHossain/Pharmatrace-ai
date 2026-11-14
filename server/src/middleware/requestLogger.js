// PharmaTrace AI — HTTP Request Logger Middleware
import { logger } from '../utils/logger.js'

export function requestLogger(req, res, next) {
  const start = Date.now()

  res.on('finish', () => {
    const durationMs = Date.now() - start
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'

    logger[level](`${req.method} ${req.originalUrl || req.url} ${res.statusCode} (${durationMs}ms)`, {
      ip: req.ip,
      statusCode: res.statusCode,
      durationMs
    })
  })

  next()
}
