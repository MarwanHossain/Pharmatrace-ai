// PharmaTrace AI — Express Application Configuration
import express from 'express'
import { corsMiddleware } from './middleware/cors.js'
import { requestLogger } from './middleware/requestLogger.js'
import { notFoundHandler } from './middleware/notFoundHandler.js'
import { errorHandler } from './middleware/errorHandler.js'
import apiRouter from './routes/index.js'

export function createApp() {
  const app = express()

  // Security & Request Parsing Middleware
  app.disable('x-powered-by')
  app.use(corsMiddleware)
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true, limit: '10mb' }))
  app.use(requestLogger)

  // API Routes Mount
  app.use('/api', apiRouter)

  // Fallback & Error Handling Middleware
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}

export const app = createApp()
export default app
