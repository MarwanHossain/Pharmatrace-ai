// PharmaTrace AI — Server Entry Point & Process Lifecycle Manager
import http from 'http'
import { app } from './app.js'
import { env, validateAuthConfig } from './config/env.js'
import { getPool, closeDatabasePool, checkDatabaseHealth } from './config/database.js'
import { logger } from './utils/logger.js'

let server = null
let isShuttingDown = false

export async function startServer(port = env.PORT) {
  // Validate mandatory authentication and security configuration
  validateAuthConfig()

  const httpServer = http.createServer(app)

  return new Promise((resolve, reject) => {
    httpServer.on('error', err => {
      logger.error('Fatal server startup error', { message: err.message, code: err.code })
      reject(err)
    })

    httpServer.listen(port, async () => {
      server = httpServer
      logger.info(`PharmaTrace AI Backend listening on port ${port}`, {
        environment: env.NODE_ENV,
        healthEndpoint: `http://localhost:${port}/api/health`,
        dbHealthEndpoint: `http://localhost:${port}/api/health/db`
      })

      // Non-blocking initial connectivity check on startup
      const dbStatus = await checkDatabaseHealth()
      if (dbStatus.ok) {
        logger.info(`MariaDB connection established successfully (${dbStatus.version}, ${dbStatus.latencyMs}ms)`)
      } else {
        logger.warn(`MariaDB initial check: ${dbStatus.message} (status: ${dbStatus.status}). Server will retry on demand.`)
      }

      resolve(httpServer)
    })
  })
}

export async function stopServer() {
  if (isShuttingDown) return
  isShuttingDown = true
  logger.info('Initiating graceful backend shutdown...')

  return new Promise(resolve => {
    if (server) {
      server.close(async err => {
        if (err) {
          logger.error('Error closing HTTP server', { message: err.message })
        } else {
          logger.info('HTTP server closed.')
        }

        // Cleanup database pool
        await closeDatabasePool()
        logger.info('Backend shutdown completed cleanly.')
        resolve()
      })
    } else {
      closeDatabasePool().then(resolve)
    }
  })
}

// Attach OS process signal handlers when run as main module
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  const handleSignal = async signal => {
    logger.info(`Received ${signal}. Starting shutdown sequence.`)
    await stopServer()
    process.exit(0)
  }

  process.on('SIGINT', () => handleSignal('SIGINT'))
  process.on('SIGTERM', () => handleSignal('SIGTERM'))

  process.on('uncaughtException', async err => {
    logger.error('Uncaught Exception detected!', { message: err.message, stack: err.stack })
    await stopServer()
    process.exit(1)
  })

  process.on('unhandledRejection', async reason => {
    logger.error('Unhandled Promise Rejection detected!', { reason: String(reason) })
  })

  startServer().catch(err => {
    logger.error('Failed to start server:', { message: err.message })
    process.exit(1)
  })
}
