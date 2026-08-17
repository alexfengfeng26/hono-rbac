import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { db, schema } from '../db'

export const SESSION_COOKIE = 'rbac_session'
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 天

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  await db
    .insert(schema.sessions)
    .values({ id: token, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) })
    .run()
  return token
}

export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  })
}

export function getSessionToken(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE)
}

/** 校验 token，返回对应用户；过期/无效则清理并返回 null */
export async function validateSession(token: string) {
  const session = db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.id, token))
    .get()
  if (!session) return null
  if (session.expiresAt.getTime() < Date.now()) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, token)).run()
    return null
  }
  const user = db.select().from(schema.users).where(eq(schema.users.id, session.userId)).get()
  // 停用账号即使持有有效会话也一律拒绝
  if (!user || user.status !== 'active') return null
  return user
}

export async function destroySession(c: Context): Promise<void> {
  const token = getSessionToken(c)
  if (token) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, token)).run()
  }
  deleteCookie(c, SESSION_COOKIE)
}
