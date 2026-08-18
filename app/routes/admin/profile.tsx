import { createRoute } from 'honox/factory'
import { and, eq, ne } from 'drizzle-orm'
import { requireAuth } from '../../lib/auth/guard'
import { hashPassword, validatePassword, verifyPassword } from '../../lib/auth/password'
import { getSessionToken } from '../../lib/auth/session'
import { PageHeader } from '../../components/page-header'
import { FormField } from '../../components/form-field'
import { db, schema } from '../../lib/db'

function ProfileForm({
  error,
  values,
}: {
  error?: string
  values?: { currentPassword?: string; newPassword?: string }
}) {
  return (
    <div class="max-w-md">
      <title>修改密码 - RBAC</title>
      <PageHeader title="修改密码" subtitle="定期更换密码有助于保护账号安全" />
      {error && (
        <div role="alert" class="alert alert-error py-2 text-sm mb-4">
          <span>{error}</span>
        </div>
      )}
      <div class="card bg-base-100 shadow">
        <div class="card-body gap-4">
          <form method="post" action="/admin/profile" class="fieldset gap-3">
            <FormField
              label="当前密码"
              name="currentPassword"
              type="password"
              required
              placeholder="请输入当前密码"
              value={values?.currentPassword}
            />
            <FormField
              label="新密码"
              name="newPassword"
              type="password"
              required
              placeholder="至少 8 位，含字母与数字"
              minLength={8}
              value={values?.newPassword}
            />
            <FormField
              label="确认新密码"
              name="confirmPassword"
              type="password"
              required
              placeholder="再次输入新密码"
              minLength={8}
            />
            <button type="submit" class="btn btn-primary mt-2">
              更新密码
            </button>
          </form>
          <p class="text-xs text-base-content/50">
            密码策略：至少 8 位，且同时包含字母和数字。
          </p>
        </div>
      </div>
    </div>
  )
}

export default createRoute(requireAuth, async (c) => {
  return c.render(<ProfileForm />)
})

export const POST = createRoute(requireAuth, async (c) => {
  const user = c.get('user')!
  const body = await c.req.parseBody()
  const currentPassword = String(body.currentPassword ?? '')
  const newPassword = String(body.newPassword ?? '')
  const confirmPassword = String(body.confirmPassword ?? '')

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    return c.render(
      <ProfileForm error="当前密码不正确" values={{ currentPassword, newPassword }} />,
    )
  }
  const policyError = validatePassword(newPassword)
  if (policyError) {
    return c.render(<ProfileForm error={policyError} values={{ currentPassword, newPassword }} />)
  }
  if (newPassword !== confirmPassword) {
    return c.render(
      <ProfileForm error="两次输入的新密码不一致" values={{ currentPassword, newPassword }} />,
    )
  }

  db.update(schema.users)
    .set({ passwordHash: await hashPassword(newPassword) })
    .where(eq(schema.users.id, user.id))
    .run()

  // 改密后注销其它设备的会话（当前设备保持登录），防止旧会话被继续冒用
  const currentToken = getSessionToken(c) ?? ''
  db.delete(schema.sessions)
    .where(and(eq(schema.sessions.userId, user.id), ne(schema.sessions.id, currentToken)))
    .run()

  return c.redirect('/admin/profile?flash=success:密码已更新，其它设备已下线')
})
