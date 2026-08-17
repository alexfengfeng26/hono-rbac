import { createRoute } from 'honox/factory'
import { eq } from 'drizzle-orm'
import { requireAuth } from '../../lib/auth/guard'
import { getSessionToken } from '../../lib/auth/session'
import { Badge } from '../../components/badge'
import { Icon } from '../../components/icon'
import { PageHeader } from '../../components/page-header'
import ConfirmButton from '../../islands/confirm-button'
import { db, schema } from '../../lib/db'
import type { Session } from '../../lib/db/schema'

function fmt(ts: number | Date | undefined): string {
  if (!ts) return '—'
  const d = ts instanceof Date ? ts : new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('zh-CN', { hour12: false })
}

function SessionsPage({ sessions, currentToken }: { sessions: Session[]; currentToken: string }) {
  const sorted = [...sessions].sort(
    (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
  )
  return (
    <div class="max-w-2xl">
      <title>我的会话 - RBAC</title>
      <PageHeader
        title="我的会话"
        subtitle={`当前账号在 ${sessions.length} 个设备上保持登录`}
      />
      <div class="card bg-base-100 shadow">
        <div class="card-body gap-2">
          {sorted.map((s) => {
            const isCurrent = s.id === currentToken
            return (
              <div
                key={s.id}
                class="flex items-center justify-between gap-3 py-3 border-b border-base-200 last:border-0"
              >
                <div class="flex items-center gap-3 min-w-0">
                  <span class="inline-flex items-center justify-center w-9 h-9 rounded-field bg-primary/10 text-primary">
                    <Icon name="sessions" className="w-5 h-5" />
                  </span>
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-medium truncate">
                        {isCurrent ? '当前设备' : '其他设备'}
                      </span>
                      {isCurrent && <Badge variant="success">使用中</Badge>}
                    </div>
                    <div class="text-xs text-base-content/50">登录于 {fmt(s.createdAt)}</div>
                  </div>
                </div>
                <div class="shrink-0">
                  {isCurrent ? (
                    <span class="text-xs text-base-content/40">无法注销当前会话</span>
                  ) : (
                    <ConfirmButton
                      message="确定注销该设备的登录会话？该设备将被迫下线。"
                      action="/admin/sessions"
                      fields={{ action: 'revoke', sessionId: s.id }}
                      label="注销"
                    />
                  )}
                </div>
              </div>
            )
          })}
          {sorted.length === 0 && (
            <div class="py-10 text-center text-base-content/40">暂无会话</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default createRoute(requireAuth, async (c) => {
  const user = c.get('user')!
  const currentToken = getSessionToken(c) ?? ''
  const sessions = db.select().from(schema.sessions).where(eq(schema.sessions.userId, user.id)).all()
  return c.render(<SessionsPage sessions={sessions} currentToken={currentToken} />)
})

export const POST = createRoute(requireAuth, async (c) => {
  const user = c.get('user')!
  const body = await c.req.parseBody()
  const action = String(body.action ?? '')
  const currentToken = getSessionToken(c) ?? ''

  if (action === 'revoke') {
    const sessionId = String(body.sessionId ?? '')
    if (!sessionId || sessionId === currentToken) {
      return c.redirect('/admin/sessions?flash=error:无法注销当前会话')
    }
    const target = db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .get()
    if (!target || target.userId !== user.id) {
      return c.redirect('/admin/sessions?flash=error:会话不存在')
    }
    db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId)).run()
    return c.redirect('/admin/sessions?flash=success:已注销该会话')
  }

  return c.redirect('/admin/sessions')
})
