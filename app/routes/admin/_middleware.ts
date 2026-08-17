import { createRoute } from 'honox/factory'
import { requireAuth } from '../../lib/auth/guard'

export default createRoute(requireAuth)
