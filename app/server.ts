import { showRoutes } from 'hono/dev'
import { createApp } from 'honox/server'
import { eq } from 'drizzle-orm'
import {
  ensureBuiltinPermissions,
  ensureBuiltinPermissionGroups,
  backfillPermissionGroups,
  ensureBuiltinDepartments,
  ensureBuiltinRolePermissions,
} from './lib/rbac/permissions'
import { ensureBuiltinMenus } from './lib/rbac/menus'
import { db, schema } from './lib/db'

// 保证内置权限点 / 分组 / 部门 / 菜单始终注册（幂等，不会清掉 UI 新增项）
ensureBuiltinPermissions()
ensureBuiltinPermissionGroups()
backfillPermissionGroups()
ensureBuiltinDepartments()
// 把内置权限回填到内置角色（admin 全量），解决旧库角色未挂新权限
ensureBuiltinRolePermissions()
// 导航菜单：默认分组与入口（幂等，admin 可 UI 增删改）
ensureBuiltinMenus()

// 现有库管理员若尚无部门归属，补一个（组织归属展示）
const adminForDept = db
  .select()
  .from(schema.users)
  .where(eq(schema.users.email, 'admin@example.com'))
  .get()
if (adminForDept && !adminForDept.departmentId) {
  const east = db
    .select()
    .from(schema.departments)
    .where(eq(schema.departments.name, '华东区'))
    .get()
  if (east) {
    db.update(schema.users).set({ departmentId: east.id }).where(eq(schema.users.id, adminForDept.id)).run()
  }
}

const app = createApp()

showRoutes(app)

export default app
