import { describe, it, expect, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import app from '../app/server'
import { db, schema } from '../app/lib/db'
import { createSession } from '../app/lib/auth/session'

async function authHeaders(userId: string): Promise<Record<string, string>> {
  const token = await createSession(userId)
  return { cookie: `rbac_session=${token}` }
}

describe('角色权限保存链路验证', () => {
  let adminId: string

  beforeAll(async () => {
    adminId = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'admin@example.com'))
      .get()!.id
  })

  it('SSR: 角色表单渲染出 CRM 权限复选框 (name=permissions)', async () => {
    const res = await app.request('/admin/roles', { headers: await authHeaders(adminId) })
    expect(res.status).toBe(200)
    const html = await res.text()
    // 关键断言：CRM 权限的 checkbox 必须出现在服务端渲染的 HTML 中
    expect(html).toContain('name="permissions"')
    expect(html).toContain('value="crm:contact:read"')
    expect(html).toContain('value="crm:contact:create"')
    // 不再有数据范围（scope）选择框
    expect(html).not.toContain('name="scope:')
    // admin 拥有全部权限 → 其编辑弹窗里 CRM 复选框必须带 checked 属性（浏览器认可的勾选标记）
    expect(html).toContain('value="crm:contact:read" checked')
  })

  it('POST: 创建角色并勾选 CRM 权限 → role_permissions 落库', async () => {
    const body = new URLSearchParams()
    body.append('action', 'create')
    body.append('name', 'crm管理员_验证')
    body.append('description', '集成验证用')
    body.append('permissions', 'crm:contact:read')
    body.append('permissions', 'crm:contact:create')

    const res = await app.request('/admin/roles', {
      method: 'POST',
      headers: {
        ...(await authHeaders(adminId)),
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'http://localhost',
      },
      body: body.toString(),
    })
    expect(res.status).toBe(302)

    const role = db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, 'crm管理员_验证'))
      .get()
    expect(role).toBeTruthy()
    const perms = db
      .select()
      .from(schema.rolePermissions)
      .where(eq(schema.rolePermissions.roleId, role!.id))
      .all()
    expect(perms.length).toBe(2)
  })

  it('POST: 编辑角色更新权限 → 旧权限被替换', async () => {
    // 先建一个只有 read 的角色
    const id = crypto.randomUUID()
    db.insert(schema.roles).values({ id, name: 'edit_tmp', description: '' }).run()
    const readId = db
      .select()
      .from(schema.permissions)
      .where(eq(schema.permissions.name, 'crm:contact:read'))
      .get()!.id
    db.insert(schema.rolePermissions).values({ roleId: id, permissionId: readId }).run()

    const body = new URLSearchParams()
    body.append('action', 'update')
    body.append('roleId', id)
    body.append('name', 'edit_tmp')
    body.append('description', 'updated')
    body.append('permissions', 'crm:contact:read')
    body.append('permissions', 'crm:contact:update')
    body.append('permissions', 'crm:contact:assign')

    const res = await app.request('/admin/roles', {
      method: 'POST',
      headers: {
        ...(await authHeaders(adminId)),
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'http://localhost',
      },
      body: body.toString(),
    })
    expect(res.status).toBe(302)

    const perms = db
      .select()
      .from(schema.rolePermissions)
      .where(eq(schema.rolePermissions.roleId, id))
      .all()
    expect(perms.length).toBe(3)
  })
})
