import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { hashPassword } from '../auth/password'
import { ensurePermission, ensureBuiltinPermissionGroups, backfillPermissionGroups, ensureBuiltinDepartments, PERMISSIONS } from '../rbac/permissions'
import { db, schema } from './index'

async function main() {
  const adminEmail = 'admin@example.com'
  const existingAdmin = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, adminEmail))
    .get()
  if (existingAdmin) {
    console.log('Seed skipped: admin user already exists')
    process.exit(0)
  }

  // 1. permissions（幂等注册，不会清掉已有项）
  const permissionIds: Record<string, string> = {}
  for (const p of PERMISSIONS) {
    permissionIds[p.name] = ensurePermission(p.name, p.description)
  }

  // 1b. 权限分组目录 + 按 resource 前缀回填（幂等）
  ensureBuiltinPermissionGroups()
  backfillPermissionGroups()
  ensureBuiltinDepartments()

  // 2. roles
  const adminRoleId = randomUUID()
  const userRoleId = randomUUID()
  db.insert(schema.roles)
    .values([
      { id: adminRoleId, name: 'admin', description: '系统管理员，拥有全部权限' },
      { id: userRoleId, name: 'user', description: '普通用户，可查看用户与角色' },
    ])
    .run()

  // 3. role_permissions
  db.insert(schema.rolePermissions)
    .values([
      ...Object.values(permissionIds).map((pid) => ({
        roleId: adminRoleId,
        permissionId: pid,
      })),
      { roleId: userRoleId, permissionId: permissionIds['user:read'] },
      { roleId: userRoleId, permissionId: permissionIds['role:read'] },
    ])
    .run()

  // 4. users + user_roles
  const east = db.select().from(schema.departments).where(eq(schema.departments.name, '华东区')).get()
  const eastTeamA = db
    .select()
    .from(schema.departments)
    .where(eq(schema.departments.name, '华东团队A'))
    .get()
  const adminId = randomUUID()
  const demoId = randomUUID()
  db.insert(schema.users)
    .values([
      {
        id: adminId,
        email: adminEmail,
        name: 'Administrator',
        passwordHash: await hashPassword('admin123'),
        status: 'active',
        departmentId: east?.id ?? null,
      },
      {
        id: demoId,
        email: 'user@example.com',
        name: 'Demo User',
        passwordHash: await hashPassword('user123'),
        status: 'active',
        departmentId: eastTeamA?.id ?? null,
      },
    ])
    .run()
  db.insert(schema.userRoles)
    .values([
      { userId: adminId, roleId: adminRoleId },
      { userId: demoId, roleId: userRoleId },
    ])
    .run()

  console.log('Seed done:')
  console.log('  admin@example.com / admin123  (role: admin)')
  console.log('  user@example.com / user123    (role: user)')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
