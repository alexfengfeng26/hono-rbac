import { eq } from 'drizzle-orm'
import { createRoute } from 'honox/factory'
import { FormField } from '../components/form-field'
import { verifyPassword } from '../lib/auth/password'
import {
  createSession,
  getSessionToken,
  setSessionCookie,
  validateSession,
} from '../lib/auth/session'
import { db, schema } from '../lib/db'

/**
 * 登录防爆破限流（内存态，按邮箱计数）：
 * 连续失败 5 次锁定 5 分钟；登录成功立即清零。进程重启即重置，对单实例部署足够。
 */
const LOGIN_MAX_ATTEMPTS = 5
const LOGIN_LOCK_MS = 5 * 60 * 1000
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>()

function loginLockRemaining(email: string): number {
  const rec = loginAttempts.get(email)
  if (!rec || rec.lockedUntil <= Date.now()) return 0
  return Math.ceil((rec.lockedUntil - Date.now()) / 1000)
}

function recordLoginFailure(email: string): void {
  const rec = loginAttempts.get(email) ?? { count: 0, lockedUntil: 0 }
  rec.count += 1
  if (rec.count >= LOGIN_MAX_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOGIN_LOCK_MS
    rec.count = 0
  }
  loginAttempts.set(email, rec)
}

function LoginForm({ error }: { error?: string }) {
  return (
    <div class="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(55%_45%_at_50%_0%,color-mix(in_oklab,var(--color-primary)_16%,transparent),transparent)]">
      <div class="card bg-base-100 w-full max-w-sm shadow-xl border border-base-300/70">
        <div class="card-body gap-5">
          <div class="text-center flex flex-col items-center">
            <span class="inline-flex items-center justify-center w-11 h-11 rounded-box bg-primary text-primary-content text-lg font-bold mb-3 shadow-sm">
              R
            </span>
            <div class="text-2xl font-bold tracking-tight">RBAC 系统登录</div>
            <p class="text-sm text-base-content/60 mt-1">角色权限管理系统</p>
          </div>
          {error && (
            <div role="alert" class="alert alert-error py-2 text-sm">
              <span>{error}</span>
            </div>
          )}
          <form method="post" action="/login" class="fieldset gap-3">
            <FormField label="邮箱" name="email" type="email" required placeholder="you@example.com" />
            <FormField label="密码" name="password" type="password" required placeholder="请输入密码" />
            <button type="submit" class="btn btn-primary mt-2">
              登录
            </button>
          </form>
          <p class="text-xs text-center text-base-content/50">
            seed 账号：admin@example.com / admin123
          </p>
        </div>
      </div>
    </div>
  )
}

export default createRoute(async (c) => {
  const token = getSessionToken(c)
  if (token) {
    const user = await validateSession(token)
    if (user) return c.redirect('/')
  }
  return c.render(<LoginForm />)
})

export const POST = createRoute(async (c) => {
  const body = await c.req.parseBody()
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  if (!email || !password) {
    c.status(400)
    return c.render(<LoginForm error="请输入邮箱和密码" />)
  }
  const user = db.select().from(schema.users).where(eq(schema.users.email, email)).get()
  const lockSec = loginLockRemaining(email)
  if (lockSec > 0) {
    c.status(429)
    return c.render(
      <LoginForm error={`失败次数过多，账号已临时锁定，请 ${Math.ceil(lockSec / 60)} 分钟后再试`} />,
    )
  }
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    recordLoginFailure(email)
    c.status(401)
    return c.render(<LoginForm error="邮箱或密码错误" />)
  }
  if (user.status === 'disabled') {
    c.status(403)
    return c.render(<LoginForm error="该账号已被停用，请联系管理员" />)
  }
  loginAttempts.delete(email)
  const token = await createSession(user.id)
  setSessionCookie(c, token)
  return c.redirect('/')
})
