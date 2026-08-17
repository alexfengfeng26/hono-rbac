import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from './lib/db/schema'
import type { User } from './lib/db/schema'
import type { PermissionMap } from './lib/rbac/permissions'

type AppVariables = {
  db: BetterSQLite3Database<typeof schema>
  user?: User
  /** 权限名集合；存在某权限名 = 拥有该动作权限 */
  permissions?: PermissionMap
}

declare module 'hono' {
  interface Env {
    Variables: AppVariables
    Bindings: {}
  }
}
