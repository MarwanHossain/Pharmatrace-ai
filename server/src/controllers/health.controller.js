// PharmaTrace AI — Health Check Controllers
import { checkDatabaseHealth } from '../config/database.js'

/**
 * Basic server health check endpoint.
 * GET /api/health
 */
export function getSystemHealth(req, res) {
  res.status(200).json({
    status: 'healthy',
    service: 'pharmatrace-api',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  })
}

/**
 * Database connectivity health check endpoint.
 * Tests live connection against XAMPP MariaDB 10.11.16 via `SELECT 1`.
 * Returns generic status without exposing database host, user, credentials, or internal schema.
 * GET /api/health/db
 */
export async function getDatabaseHealth(req, res) {
  const result = await checkDatabaseHealth()

  if (result.ok) {
    return res.status(200).json({
      status: 'healthy',
      database: {
        connected: true,
        status: 'ready'
      },
      timestamp: new Date().toISOString()
    })
  }

  // The backend must not claim database connectivity when the connection test fails.
  return res.status(503).json({
    status: 'unhealthy',
    database: {
      connected: false,
      status: 'disconnected'
    },
    message: 'Database service is unavailable',
    timestamp: new Date().toISOString()
  })
}
