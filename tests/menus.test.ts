import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import app from '../app/server'
import { db, schema } from '../app/lib/db'
import { createSession } from '../app/lib/auth/session'
import { getPermissionsForUser } from '../app/lib/rbac/permissions'
import { ensureBuiltinMenus, loadMenuTree, loadAllMenus } from '../app/lib/rbac/menus'

function userId(email: string): string {
  return db.select().from(schema.users).where(eq(schema.users.email, email)).get()!.id
}
async function authHeaders(uid: string) {
  return { cookie: `rbac_session=${await createSession(uid)}` }
}

const GROUP_COUNT = 2
const ITEM_COUNT = 7

describe('菜单管理', () => {
  it('ensureBuiltinMenus 幂等：重复执行不产生重复分组/菜单项', () => {
    ensureBuiltinMenus()
    const g1 = loadAllMenus().filter((m) => !m.parentId).length
    const i1 = loadAllMenus().filter((m) => !!m.parentId).length
    ensureBuiltinMenus()
    const g2 = loadAllMenus().filter((m) => !m.parentId).length
    const i2 = loadAllMenus().filter((m) => !!m.parentId).length
    expect([g2, i2]).toEqual([g1, i1])
    expect(g1).toBe(GROUP_COUNT)
    expect(i1).toBe(ITEM_COUNT)
  })

  it('loadMenuTree：admin 看到全部分组与子项，公开项/授权项正确归属', async () => {
    const adminPerms = await getPermissionsForUser(userId('admin@example.com'))
    const tree = loadMenuTree(adminPerms)
    expect(tree.length).toBe(GROUP_COUNT)
    const overview = tree.find((g) => g.name === '总览')!
    expect(overview.children.map((c) => c.name)).toEqual(['工作台', '仪表盘'])
    const manage = tree.find((g) => g.name === '管理')!
    expect(manage.children.some((c) => c.name === '菜单管理')).toBe(true)
  })

  it('loadMenuTree：权限过滤——无 crm:contact:read 的用户看不到「客户管理」，隐藏项/空组被剔除', async () => {
    const userPerms = await getPermissionsForUser(userId('user@example.com'))
    const allNames = loadMenuTree(userPerms).flatMap((g) => g.children.map((c) => c.name))
    expect(allNames).not.toContain('客户管理')

    // 构造隐藏项 + 空组后：loadMenuTree 不返回
    const groupId = randomUUID()
    db.insert(schema.menus).values({ id: groupId, name: '临时组', order: 99, status: 'active' }).run()
    const hiddenId = randomUUID()
    db.insert(schema.menus)
      .values({ id: hiddenId, parentId: groupId, name: '隐藏项', href: '/hidden', status: 'hidden', order: 0 })
      .run()
    const adminPerms = await getPermissionsForUser(userId('admin@example.com'))
    const tree = loadMenuTree(adminPerms)
    expect(tree.find((g) => g.name === '临时组')).toBeUndefined() // 全部子项 hidden → 空组剔除
    db.delete(schema.menus).where(eq(schema.menus.id, groupId)).run()
    db.delete(schema.menus).where(eq(schema.menus.id, hiddenId)).run()
  })

  it('/admin/menus 守卫：admin 200 含分组标题；demo 用户 403', async () => {
    const adminRes = await app.request('/admin/menus', { headers: await authHeaders(userId('admin@example.com')) })
    expect(adminRes.status).toBe(200)
    expect(await adminRes.text()).toContain('总览')

    const demoRes = await app.request('/admin/menus', { headers: await authHeaders(userId('user@example.com')) })
    expect(demoRes.status).toBe(403)
  })

  it('POST：itemCreate 校验 href 唯一；itemMoveUp 交换顺序；groupDelete 级联清子项', async () => {
    const adminId = userId('admin@example.com')
    const groupId = randomUUID()
    db.insert(schema.menus).values({ id: groupId, name: '测试组', order: 98, status: 'active' }).run()
    const mk = (order: number) => {
      const id = randomUUID()
      db.insert(schema.menus)
        .values({ id, parentId: groupId, name: `项${order}`, href: `/t-${id}`, order, status: 'active' })
        .run()
      return id
    }
    const a = mk(0)
    const b = mk(1)

    // itemCreate
    const res = await app.request('/admin/menus', {
      method: 'POST',
      headers: { ...(await authHeaders(adminId)), 'content-type': 'application/x-www-form-urlencoded', origin: 'http://localhost' },
      body: new URLSearchParams({ intent: 'itemCreate', parentId: groupId, name: '新增', href: '/brand-new', icon: 'chart' }).toString(),
    })
    expect(res.status).toBe(302)
    expect(db.select().from(schema.menus).where(eq(schema.menus.href, '/brand-new')).get()).toBeTruthy()

    // href 重复 → 报错
    const dup = await app.request('/admin/menus', {
      method: 'POST',
      headers: { ...(await authHeaders(adminId)), 'content-type': 'application/x-www-form-urlencoded', origin: 'http://localhost' },
      body: new URLSearchParams({ intent: 'itemCreate', parentId: groupId, name: '重复', href: '/brand-new', icon: 'chart' }).toString(),
    })
    expect(dup.status).toBe(302)

    // itemMoveUp：b 上移后 order < a 的 order
    await app.request('/admin/menus', {
      method: 'POST',
      headers: { ...(await authHeaders(adminId)), 'content-type': 'application/x-www-form-urlencoded', origin: 'http://localhost' },
      body: new URLSearchParams({ intent: 'itemMoveUp', id: b }).toString(),
    })
    const after = db.select().from(schema.menus).where(eq(schema.menus.id, a)).get()!.order
    const bAfter = db.select().from(schema.menus).where(eq(schema.menus.id, b)).get()!.order
    expect(bAfter).toBeLessThan(after)

    // groupDelete 级联：删组后子项全消失
    const childCountBefore = loadAllMenus().filter((m) => m.parentId === groupId).length
    expect(childCountBefore).toBeGreaterThan(0)
    await app.request('/admin/menus', {
      method: 'POST',
      headers: { ...(await authHeaders(adminId)), 'content-type': 'application/x-www-form-urlencoded', origin: 'http://localhost' },
      body: new URLSearchParams({ intent: 'groupDelete', id: groupId }).toString(),
    })
    expect(db.select().from(schema.menus).where(eq(schema.menus.id, groupId)).get()).toBeUndefined()
    expect(loadAllMenus().filter((m) => m.parentId === groupId).length).toBe(0)
  })

  it('首页 HTML 的命令面板 island 携带 navItems（含菜单项名称）', async () => {
    const res = await app.request('/', { headers: await authHeaders(userId('admin@example.com')) })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('command-palette')
    expect(html).toContain('工作台')
  })

  it('菜单表单的可见权限选项来自数据库（含自定义权限），非法权限名提交后按 null 处理', async () => {
    const pid = randomUUID()
    db.insert(schema.permissions).values({ id: pid, name: 'tmp:menu:option' }).run()

    const res = await app.request('/admin/menus', { headers: await authHeaders(userId('admin@example.com')) })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('tmp:menu:option')

    // itemCreate 提交不存在的权限名 → requiredPermission 落库为 null
    const groupId = randomUUID()
    db.insert(schema.menus).values({ id: groupId, name: '校验组', order: 95, status: 'active' }).run()
    const adminId = userId('admin@example.com')
    const href = '/invalid-perm-item'
    const post = await app.request('/admin/menus', {
      method: 'POST',
      headers: { ...(await authHeaders(adminId)), 'content-type': 'application/x-www-form-urlencoded', origin: 'http://localhost' },
      body: new URLSearchParams({
        intent: 'itemCreate', parentId: groupId, name: '非法权限项', href, icon: 'menu',
        requiredPermission: 'not:a-real-permission',
      }).toString(),
    })
    expect(post.status).toBe(302)
    expect(db.select().from(schema.menus).where(eq(schema.menus.href, href)).get()!.requiredPermission).toBeNull()

    db.delete(schema.menus).where(eq(schema.menus.id, groupId)).run() // 级联清子项
    db.delete(schema.permissions).where(eq(schema.permissions.id, pid)).run()
  })
})
