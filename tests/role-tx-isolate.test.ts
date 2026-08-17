import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { db, schema } from '../app/lib/db'

describe('角色权限写入隔离测试', () => {
  it('复刻 create 路由：db.transaction 内写 role_permissions 是否落库', () => {
    const permNames = ['crm:contact:read', 'crm:contact:create']
    const id = randomUUID()
    db.insert(schema.roles).values({ id, name: 'iso_' + id.slice(0, 6), description: '' }).run()

    db.transaction((tx) => {
      const permRows = tx
        .select()
        .from(schema.permissions)
        .where(inArray(schema.permissions.name, permNames))
        .all()
      tx.insert(schema.rolePermissions)
        .values(permRows.map((p) => ({ roleId: id, permissionId: p.id })))
        .run()
    })

    const cnt = db
      .select()
      .from(schema.rolePermissions)
      .where(eq(schema.rolePermissions.roleId, id))
      .all().length
    console.log('事务写入后 role_permissions 条数 =', cnt)
    expect(cnt).toBe(2)
  })
})
