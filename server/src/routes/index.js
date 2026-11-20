// PharmaTrace AI — Root API Router
import { Router } from 'express'
import healthRoutes from './health.routes.js'
import authRoutes from './auth.routes.js'
import registrationRoutes from './registration.routes.js'
import adminRegistrationRoutes from './admin.registration.routes.js'
import adminOrganizationRoutes from './admin.organization.routes.js'
import adminUserRoutes from './admin.user.routes.js'
import adminDashboardRoutes from './admin.dashboard.routes.js'
import manufacturerProductRoutes from './manufacturer.product.routes.js'
import manufacturerBatchRoutes from './manufacturer.batch.routes.js'
import manufacturerPackageRoutes from './manufacturer.package.routes.js'
import shipmentRoutes from './shipment.routes.js'
import verificationRoutes from './verification.routes.js'
import investigatorRoutes from './investigator.routes.js'

const apiRouter = Router()

// Mount sub-routers with versioned and root paths
apiRouter.use('/health', healthRoutes)
apiRouter.use('/v1/health', healthRoutes)

apiRouter.use('/auth', authRoutes)
apiRouter.use('/v1/auth', authRoutes)

apiRouter.use('/registrations', registrationRoutes)
apiRouter.use('/v1/registrations', registrationRoutes)

apiRouter.use('/admin/registrations', adminRegistrationRoutes)
apiRouter.use('/v1/admin/registrations', adminRegistrationRoutes)

apiRouter.use('/admin/organizations', adminOrganizationRoutes)
apiRouter.use('/v1/admin/organizations', adminOrganizationRoutes)

apiRouter.use('/admin/users', adminUserRoutes)
apiRouter.use('/v1/admin/users', adminUserRoutes)

apiRouter.use('/admin/dashboard', adminDashboardRoutes)
apiRouter.use('/v1/admin/dashboard', adminDashboardRoutes)

apiRouter.use('/manufacturer/products', manufacturerProductRoutes)
apiRouter.use('/v1/manufacturer/products', manufacturerProductRoutes)

apiRouter.use('/manufacturer/batches', manufacturerBatchRoutes)
apiRouter.use('/v1/manufacturer/batches', manufacturerBatchRoutes)

apiRouter.use('/manufacturer/packages', manufacturerPackageRoutes)
apiRouter.use('/v1/manufacturer/packages', manufacturerPackageRoutes)

apiRouter.use('/shipments', shipmentRoutes)
apiRouter.use('/v1/shipments', shipmentRoutes)

apiRouter.use('/verify', verificationRoutes)
apiRouter.use('/v1/verify', verificationRoutes)

apiRouter.use('/investigator', investigatorRoutes)
apiRouter.use('/v1/investigator', investigatorRoutes)

export default apiRouter
