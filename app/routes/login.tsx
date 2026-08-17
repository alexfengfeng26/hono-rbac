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

function LoginForm({ error }: { error?: string }) {
  return (
    <div class="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklab,var(--color-primary)_8%,transparent),transparent)]">
      <div class="card bg-base-100 w-full max-w-sm shadow-xl">
        <div class="card-body gap-5">
          <div class="text-center">
            <div class="text-2xl font-bold">RBAC 系统登录</div>
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
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    c.status(401)
    return c.render(<LoginForm error="邮箱或密码错误" />)
  }
  if (user.status === 'disabled') {
    c.status(403)
    return c.render(<LoginForm error="该账号已被停用，请联系管理员" />)
  }
  const token = await createSession(user.id)
  setSessionCookie(c, token)
  return c.redirect('/')
})
