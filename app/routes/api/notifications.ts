import { eq } from 'drizzle-orm'
import { createRoute } from 'honox/factory'
import { requireAuth } from '../../lib/auth/guard'
import { db, schema } from '../../lib/db'

// GET /api/notifications —— 当前用户最近 20 条通知（JSON）
export const GET = createRoute(requireAuth, async (c) => {
  const me = c.get('user') as { id: string }
  const rows = db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, me.id))
    .orderBy(schema.notifications.createdAt)
    .limit(20)
    .all()
  return c.json(
    rows.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      unread: !n.readAt,
      createdAt: (n.createdAt as Date).toISOString(),
    })),
  )
})

// POST /api/notifications —— 全部标记已读
export const POST = createRoute(requireAuth, async (c) => {
  const me = c.get('user') as { id: string }
  db.update(schema.notifications)
    .set({ readAt: new Date() })
    .where(eq(schema.notifications.userId, me.id))
    .run()
  return c.json({ ok: true })
})
