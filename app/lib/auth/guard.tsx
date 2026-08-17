import { createMiddleware } from 'hono/factory'
import { getPermissionsForUser } from '../rbac/permissions'
import { getSessionToken, validateSession } from './session'
import { Forbidden } from '../../components/forbidden'

/** 要求已登录：校验 session，注入 c.get('user') 与 c.get('permissions') */
export const requireAuth = createMiddleware(async (c, next) => {
  const token = getSessionToken(c)
  const user = token ? await validateSession(token) : null
  if (!user) {
    return c.redirect('/login')
  }
  c.set('user', user)
  c.set('permissions', await getPermissionsForUser(user.id))
  await next()
})

/** 要求拥有指定权限（动作级校验，需先经 requireAuth 注入 permissions） */
export function requirePermission(permission: string) {
  return createMiddleware(async (c, next) => {
    const perms = c.get('permissions')
    if (!perms?.has(permission)) {
      c.status(403)
      return c.render(<Forbidden permission={permission} />)
    }
    await next()
  })
}
