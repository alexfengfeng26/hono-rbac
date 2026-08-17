import { createRoute } from 'honox/factory'
import { destroySession } from '../lib/auth/session'

export default createRoute(async (c) => {
  await destroySession(c)
  return c.redirect('/login')
})

export const POST = createRoute(async (c) => {
  await destroySession(c)
  return c.redirect('/login')
})
