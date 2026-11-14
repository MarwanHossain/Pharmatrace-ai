// PharmaTrace AI — Root API Router
import { Router } from 'express'
import healthRoutes from './health.routes.js'
import authRoutes from './auth.routes.js'
import registrationRoutes from './registration.routes.js'

const apiRouter = Router()

// Mount sub-routers with versioned and root paths
apiRouter.use('/health', healthRoutes)
apiRouter.use('/v1/health', healthRoutes)

apiRouter.use('/auth', authRoutes)
apiRouter.use('/v1/auth', authRoutes)

apiRouter.use('/registrations', registrationRoutes)
apiRouter.use('/v1/registrations', registrationRoutes)

export default apiRouter
