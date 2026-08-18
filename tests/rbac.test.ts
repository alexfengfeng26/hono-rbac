import { eq, inArray } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import app from '../app/server'
import { db, schema } from '../app/lib/db'
import { getPermissionsForUser, PERMISSIONS } from '../app/lib/rbac/permissions'
import { hashPassword } from '../app/lib/auth/password'

const ORIGIN = 'http://localhost:5173'

async function login(email: string, password: string) {
  const res = await app.request('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN },
    body: new URLSearchParams({ email, password }).toString(),
  })
  return res.headers.getSetCookie().find((c) => c.startsWith('rbac_session='))?.split(';')[0] ?? ''
}

async function post(
  path: string,
  cookie: string,
  data: Record<string, string | string[]>,
) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x))
    else params.append(k, v)
  }
  return app.request(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: ORIGIN,
      Cookie: cookie,
    },
    body: params.toString(),
  })
}

describe('RBAC 权限模型', () => {
  it('admin 用户拥有全部内置权限', async () => {
    const admin = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'admin@example.com'))
      .get()!
    const perms = await getPermissionsForUser(admin.id)
    expect(perms.size).toBe(PERMISSIONS.length)
    expect(perms.has('user:delete')).toBe(true)
    expect(perms.has('role:update')).toBe(true)
    expect(perms.has('menu:manage')).toBe(true)
    expect(perms.has('org:department:manage')).toBe(true)
  })

  it('user 用户只有只读权限', async () => {
    const user = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'user@example.com'))
      .get()!
    const perms = await getPermissionsForUser(user.id)
    expect(perms.has('user:read')).toBe(true)
    expect(perms.has('role:read')).toBe(true)
    expect(perms.has('user:create')).toBe(false)
    expect(perms.has('role:delete')).toBe(false)
  })

  it('分配角色后权限集合随之变化', async () => {
    const admin = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'admin@example.com'))
      .get()!
    const adminCookie = await login('admin@example.com', 'admin123')

    // 创建新用户并分配 user 角色
    const newUserId = crypto.randomUUID()
    db.insert(schema.users)
      .values({
        id: newUserId,
        email: 'perm-test@example.com',
        name: 'Perm Test',
        passwordHash: 'unused-hash',
      })
      .run()
    const userRole = db.select().from(schema.roles).where(eq(schema.roles.name, 'user')).get()!
    await post('/admin/users', adminCookie, {
      intent: 'updateRoles',
      userId: newUserId,
      roles: [userRole.id],
    })

    const perms = await getPermissionsForUser(newUserId)
    expect(perms.has('user:read')).toBe(true)
    expect(perms.has('user:create')).toBe(false)

    // 移除角色后权限清空
    await post('/admin/users', adminCookie, { intent: 'updateRoles', userId: newUserId })
    expect((await getPermissionsForUser(newUserId)).size).toBe(0)

    db.delete(schema.users).where(eq(schema.users.id, newUserId)).run()
  })
})

describe('权限守卫（HTTP 层）', () => {
  it('无 user:create 权限的用户创建用户返回 403', async () => {
    const demoCookie = await login('user@example.com', 'user123')
    const res = await post('/admin/users', demoCookie, {
      intent: 'create',
      name: 'X',
      email: 'x@example.com',
      password: 'xxxxxx',
    })
    expect(res.status).toBe(403)
  })

  it('admin 可创建用户（302）', async () => {
    const adminCookie = await login('admin@example.com', 'admin123')
    const email = `crud-${Date.now()}@example.com`
    const res = await post('/admin/users', adminCookie, {
      intent: 'create',
      name: 'Crud',
      email,
      password: 'crud1234',
    })
    expect(res.status).toBe(302)
    expect(db.select().from(schema.users).where(eq(schema.users.email, email)).get()).toBeDefined()
  })

  it('无 role:delete 权限删除角色返回 403；admin 删除被引用角色返回 409', async () => {
    const demoCookie = await login('user@example.com', 'user123')
    const adminRole = db.select().from(schema.roles).where(eq(schema.roles.name, 'admin')).get()!

    const denied = await post('/admin/roles', demoCookie, {
      intent: 'delete',
      roleId: adminRole.id,
    })
    expect(denied.status).toBe(403)

    const adminCookie = await login('admin@example.com', 'admin123')
    const conflict = await post('/admin/roles', adminCookie, {
      intent: 'delete',
      roleId: adminRole.id,
    })
    // 被引用角色：302 + flash=error 提示（UX 反馈），角色保持不变
    expect(conflict.status).toBe(302)
    expect(conflict.headers.get('location')).toContain('flash=error')
    expect(db.select().from(schema.roles).where(eq(schema.roles.id, adminRole.id)).get()).toBeDefined()
  })

  it('创建角色可一次勾选多个权限并全部生效', async () => {
    const adminCookie = await login('admin@example.com', 'admin123')
    const res = await post('/admin/roles', adminCookie, {
      intent: 'create',
      name: 'multi-perm',
      permissions: ['user:read', 'role:read', 'user:update'],
    })
    expect(res.status).toBe(302)
    const role = db.select().from(schema.roles).where(eq(schema.roles.name, 'multi-perm')).get()!
    const perms = db
      .select()
      .from(schema.permissions)
      .innerJoin(
        schema.rolePermissions,
        eq(schema.rolePermissions.permissionId, schema.permissions.id),
      )
      .where(eq(schema.rolePermissions.roleId, role.id))
      .all()
    expect(perms.map((p) => p.permissions.name).sort()).toEqual([
      'role:read',
      'user:read',
      'user:update',
    ])
    db.delete(schema.roles).where(eq(schema.roles.id, role.id)).run()
  })
})

describe('统一 403 页面（guard.ts）', () => {
  it('缺少权限的用户访问受保护页面返回统一 403 页面（含布局，非裸 HTML）', async () => {
    const uid = crypto.randomUUID()
    db.insert(schema.users)
      .values({
        id: uid,
        email: 'noperm@example.com',
        name: 'NoPerm',
        passwordHash: await hashPassword('noperm123'),
      })
      .run()
    const cookie = await login('noperm@example.com', 'noperm123')

    const res = await app.request('/admin/users', {
      headers: { Cookie: cookie, Origin: ORIGIN },
    })
    expect(res.status).toBe(403)
    const html = await res.text()
    expect(html).toContain('无权访问')
    // 经过渲染器（含导航栏 / 面包屑），而非旧裸 HTML
    expect(html).toContain('首页')
    expect(html).not.toContain('403 Forbidden')

    db.delete(schema.users).where(eq(schema.users.id, uid)).run()
  })
})

describe('列表搜索 / 分页（Phase 1）', () => {
  it('用户列表支持按关键字搜索', async () => {
    const adminCookie = await login('admin@example.com', 'admin123')
    const uid = crypto.randomUUID()
    const email = `searchable-${Date.now()}@example.com`
    db.insert(schema.users)
      .values({ id: uid, email, name: 'Searchable User', passwordHash: 'x' })
      .run()

    const res = await app.request(`/admin/users?q=${encodeURIComponent(email)}`, {
      headers: { Cookie: adminCookie, Origin: ORIGIN },
    })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain(email)
    expect(html).toContain('Searchable User')

    db.delete(schema.users).where(eq(schema.users.id, uid)).run()
  })

  it('用户列表分页生效（数据超一页时出现第 2 页）', async () => {
    const adminCookie = await login('admin@example.com', 'admin123')
    const ids: string[] = []
    for (let i = 0; i < 11; i++) {
      const uid = crypto.randomUUID()
      ids.push(uid)
      db.insert(schema.users)
        .values({
          id: uid,
          email: `pageuser${i}-${Date.now()}@example.com`,
          name: `PageUser${i}`,
          passwordHash: 'x',
        })
        .run()
    }

    const res = await app.request('/admin/users', {
      headers: { Cookie: adminCookie, Origin: ORIGIN },
    })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('page=2')
    expect(html).toContain('第 1 / 2 页')

    for (const id of ids) db.delete(schema.users).where(eq(schema.users.id, id)).run()
  })
})

describe('表单内联错误（Phase 1）', () => {
  it('创建重复邮箱用户时返回内联错误页（200 + 提示），而非纯文本 409', async () => {
    const adminCookie = await login('admin@example.com', 'admin123')
    const res = await post('/admin/users', adminCookie, {
      intent: 'create',
      name: 'Dup',
      email: 'admin@example.com',
      password: 'dup123',
    })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('该邮箱已存在')
    expect(html).toContain('name="email"')
  })
})

describe('RBAC 回归：继承环与防锁死', () => {
  it('角色继承成环被拒绝（A 继承 B 后，B 不能再继承 A）', async () => {
    const adminCookie = await login('admin@example.com', 'admin123')
    const a = crypto.randomUUID()
    const b = crypto.randomUUID()
    db.insert(schema.roles).values([
      { id: a, name: 'ring_a' },
      { id: b, name: 'ring_b' },
    ]).run()

    // A 继承 B —— 正常
    await post('/admin/roles', adminCookie, { intent: 'update', roleId: a, name: 'ring_a', parentRoles: [b] })
    expect(
      db.select().from(schema.roleParents).where(eq(schema.roleParents.roleId, a)).all()
        .map((r) => r.parentRoleId),
    ).toEqual([b])

    // B 再继承 A —— 成环，应被过滤（B 无任何父角色）
    await post('/admin/roles', adminCookie, { intent: 'update', roleId: b, name: 'ring_b', parentRoles: [a] })
    expect(
      db.select().from(schema.roleParents).where(eq(schema.roleParents.roleId, b)).all(),
    ).toEqual([])

    db.delete(schema.roles).where(inArray(schema.roles.id, [a, b])).run()
  })

  it('不能通过 updateRoles 移除最后一个管理员的 admin 角色', async () => {
    const adminCookie = await login('admin@example.com', 'admin123')
    const adminUser = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'admin@example.com'))
      .get()!
    const adminRole = db.select().from(schema.roles).where(eq(schema.roles.name, 'admin')).get()!
    const userRole = db.select().from(schema.roles).where(eq(schema.roles.name, 'user')).get()!

    const res = await post('/admin/users', adminCookie, {
      intent: 'updateRoles',
      userId: adminUser.id,
      roles: [userRole.id],
    })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('flash=error')
    // admin 角色仍在
    const still = db
      .select()
      .from(schema.userRoles)
      .where(eq(schema.userRoles.userId, adminUser.id))
      .all()
    expect(still.some((r) => r.roleId === adminRole.id)).toBe(true)
  })

  it('内置 admin 角色不可改名', async () => {
    const adminCookie = await login('admin@example.com', 'admin123')
    const adminRole = db.select().from(schema.roles).where(eq(schema.roles.name, 'admin')).get()!

    const renamed = await post('/admin/roles', adminCookie, {
      intent: 'update',
      roleId: adminRole.id,
      name: 'superadmin',
    })
    expect(renamed.headers.get('location')).toContain('flash=error')
    expect(
      db.select().from(schema.roles).where(eq(schema.roles.id, adminRole.id)).get()!.name,
    ).toBe('admin')
  })
})

describe('RBAC 回归：权限-菜单-角色引用一致性', () => {
  it('权限改名后，菜单的 requiredPermission 同步更新', async () => {
    const adminCookie = await login('admin@example.com', 'admin123')
    const pid = crypto.randomUUID()
    const gid = crypto.randomUUID()
    const mid = crypto.randomUUID()
    db.insert(schema.permissions).values({ id: pid, name: 'tmp:rename:before' }).run()
    db.insert(schema.menus).values({ id: gid, name: '改名组', order: 97, status: 'active' }).run()
    db.insert(schema.menus).values({
      id: mid, parentId: gid, name: '改名项', href: `/rename-${mid}`,
      order: 0, status: 'active', requiredPermission: 'tmp:rename:before',
    }).run()

    const res = await post('/admin/permissions', adminCookie, {
      intent: 'update',
      permissionId: pid,
      name: 'tmp:rename:after',
    })
    expect(res.status).toBe(302)
    expect(
      db.select().from(schema.menus).where(eq(schema.menus.id, mid)).get()!.requiredPermission,
    ).toBe('tmp:rename:after')

    db.delete(schema.menus).where(eq(schema.menus.id, gid)).run() // 级联清子项
    db.delete(schema.permissions).where(eq(schema.permissions.id, pid)).run()
  })

  it('删除仍被菜单引用的权限被拦截（302 + flash=error），解除引用后可删除', async () => {
    const adminCookie = await login('admin@example.com', 'admin123')
    const pid = crypto.randomUUID()
    const gid = crypto.randomUUID()
    const mid = crypto.randomUUID()
    db.insert(schema.permissions).values({ id: pid, name: 'tmp:menu:ref' }).run()
    db.insert(schema.menus).values({ id: gid, name: '引用组', order: 96, status: 'active' }).run()
    db.insert(schema.menus).values({
      id: mid, parentId: gid, name: '引用项', href: `/ref-${mid}`,
      order: 0, status: 'active', requiredPermission: 'tmp:menu:ref',
    }).run()

    const blocked = await post('/admin/permissions', adminCookie, { intent: 'delete', permissionId: pid })
    expect(blocked.status).toBe(302)
    expect(blocked.headers.get('location')).toContain('flash=error')
    expect(db.select().from(schema.permissions).where(eq(schema.permissions.id, pid)).get()).toBeDefined()

    db.delete(schema.menus).where(eq(schema.menus.id, gid)).run() // 级联清子项，解除引用
    const ok = await post('/admin/permissions', adminCookie, { intent: 'delete', permissionId: pid })
    expect(ok.headers.get('location')).toContain('flash=success')
    expect(db.select().from(schema.permissions).where(eq(schema.permissions.id, pid)).get()).toBeUndefined()
  })

  it('删除被其他角色继承的角色被拦截，role_parents 边保留；解除继承后可删除', async () => {
    const adminCookie = await login('admin@example.com', 'admin123')
    const parent = crypto.randomUUID()
    const child = crypto.randomUUID()
    db.insert(schema.roles).values([
      { id: parent, name: 'tmp_parent' },
      { id: child, name: 'tmp_child' },
    ]).run()
    db.insert(schema.roleParents).values({ roleId: child, parentRoleId: parent }).run()

    const blocked = await post('/admin/roles', adminCookie, { intent: 'delete', roleId: parent })
    expect(blocked.status).toBe(302)
    expect(blocked.headers.get('location')).toContain('flash=error')
    expect(db.select().from(schema.roles).where(eq(schema.roles.id, parent)).get()).toBeDefined()
    expect(
      db.select().from(schema.roleParents).where(eq(schema.roleParents.parentRoleId, parent)).all().length,
    ).toBe(1)

    db.delete(schema.roleParents).where(eq(schema.roleParents.roleId, child)).run()
    await post('/admin/roles', adminCookie, { intent: 'delete', roleId: parent })
    expect(db.select().from(schema.roles).where(eq(schema.roles.id, parent)).get()).toBeUndefined()
    db.delete(schema.roles).where(eq(schema.roles.id, child)).run()
  })
})
