import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import app from '../app/server'
import { db, schema } from '../app/lib/db'
import { hashPassword } from '../app/lib/auth/password'
import { createSession } from '../app/lib/auth/session'

const ORIGIN = 'http://localhost:5173'

async function login(email: string, password: string) {
  const res = await app.request('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN },
    body: new URLSearchParams({ email, password }).toString(),
  })
  const cookie =
    res.headers.getSetCookie().find((c) => c.startsWith('rbac_session='))?.split(';')[0] ?? ''
  return { res, cookie }
}

describe('认证流程', () => {
  it('正确凭据登录：302 + 种 cookie', async () => {
    const { res, cookie } = await login('admin@example.com', 'admin123')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/')
    expect(cookie).toContain('rbac_session=')
  })

  it('错误密码：401', async () => {
    const { res } = await login('admin@example.com', 'wrong-password')
    expect(res.status).toBe(401)
  })

  it('无 Origin 的 POST 被 CSRF 拦截：403', async () => {
    const res = await app.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: 'admin@example.com', password: 'admin123' }).toString(),
    })
    expect(res.status).toBe(403)
  })

  it('未登录访问受保护页：重定向 /login', async () => {
    const res = await app.request('/admin/users')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/login')
  })

  it('登录后可访问受保护页，登出后失效', async () => {
    const { cookie } = await login('user@example.com', 'user123')
    expect(cookie).toContain('rbac_session=')
    const protectedRes = await app.request('/admin/users', { headers: { Cookie: cookie } })
    expect(protectedRes.status).toBe(200)

    const logoutRes = await app.request('/logout', {
      method: 'POST',
      headers: { Origin: ORIGIN, Cookie: cookie },
    })
    expect(logoutRes.status).toBe(302)
    expect(logoutRes.headers.get('location')).toBe('/login')

    const after = await app.request('/admin/users', { headers: { Cookie: cookie } })
    expect(after.status).toBe(302)
    expect(after.headers.get('location')).toBe('/login')
  })

  it('过期 session：拒绝访问且自动清理', async () => {
    const userId = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'admin@example.com'))
      .get()!.id
    const expiredToken = 'expired-token-' + randomUUID()
    db.insert(schema.sessions)
      .values({ id: expiredToken, userId, expiresAt: new Date(Date.now() - 1000) })
      .run()

    const res = await app.request('/admin/users', {
      headers: { Cookie: `rbac_session=${expiredToken}` },
    })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/login')
    expect(
      db.select().from(schema.sessions).where(eq(schema.sessions.id, expiredToken)).get(),
    ).toBeUndefined()
  })
})

describe('安全加固', () => {
  it('登录防爆破：同一邮箱连续失败 5 次后临时锁定（429）', async () => {
    const email = `brute-${randomUUID().slice(0, 8)}@example.com`
    db.insert(schema.users)
      .values({
        id: randomUUID(),
        email,
        name: 'Brute',
        passwordHash: await hashPassword('rightpass1'),
      })
      .run()

    // 前 5 次错误密码均为 401
    for (let i = 0; i < 5; i++) {
      const { res } = await login(email, 'wrong-password')
      expect(res.status).toBe(401)
    }
    // 第 6 次即使密码正确也被锁定
    const { res } = await login(email, 'rightpass1')
    expect(res.status).toBe(429)
    const html = await res.text()
    expect(html).toContain('临时锁定')
  })

  it('修改密码后其它设备会话失效，当前设备保持登录', async () => {
    const userId = randomUUID()
    const email = `pw-${randomUUID().slice(0, 8)}@example.com`
    db.insert(schema.users)
      .values({ id: userId, email, name: 'Pw', passwordHash: await hashPassword('oldpass123') })
      .run()
    // 模拟两台设备登录
    const deviceA = `rbac_session=${await createSession(userId)}`
    const deviceB = `rbac_session=${await createSession(userId)}`

    // 设备 A 修改密码
    const res = await app.request('/admin/profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: ORIGIN,
        Cookie: deviceA,
      },
      body: new URLSearchParams({
        currentPassword: 'oldpass123',
        newPassword: 'newpass456',
        confirmPassword: 'newpass456',
      }).toString(),
    })
    expect(res.status).toBe(302)

    // 设备 B 会话被注销；设备 A 仍可用
    const bRes = await app.request('/admin/profile', { headers: { Cookie: deviceB } })
    expect(bRes.status).toBe(302)
    expect(bRes.headers.get('location')).toBe('/login')
    const aRes = await app.request('/admin/profile', { headers: { Cookie: deviceA } })
    expect(aRes.status).toBe(200)

    // 新密码可登录，旧密码不可
    const oldLogin = await login(email, 'oldpass123')
    expect(oldLogin.res.status).toBe(401)
    const newLogin = await login(email, 'newpass456')
    expect(newLogin.res.status).toBe(302)
  })
})

afterAll(() => {
  // 内存库无需清理，占位保持显式
})
