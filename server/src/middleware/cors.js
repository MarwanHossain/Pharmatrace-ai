// PharmaTrace AI — CORS Configuration Middleware
// Restricts cross-origin requests to configured frontend development origins.
import cors from 'cors'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

export const corsMiddleware = cors({
  origin(origin, callback) {
    // Allow non-browser requests (e.g. curl, server-to-server, health probes)
    if (!origin) {
      return callback(null, true)
    }

    if (env.CORS_ORIGIN.includes(origin)) {
      return callback(null, true)
    }

    logger.warn('Blocked by CORS policy', { origin, allowed: env.CORS_ORIGIN })
    const err = new Error(`Origin ${origin} is not allowed by CORS policy.`)
    err.status = 403
    return callback(err)
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
})
