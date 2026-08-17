import { csrf } from 'hono/csrf'
import { logger } from 'hono/logger'
import { createMiddleware } from 'hono/factory'
import { createRoute } from 'honox/factory'
import { db } from '../lib/db'

// 允许本机任意端口（dev）与 ALLOWED_ORIGINS 环境变量配置的部署来源
const allowLocal = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/

// 通过 Hono Variables 泛型把 db 注入 context（app/global.d.ts 声明类型）
const injectDb = createMiddleware(async (c, next) => {
  c.set('db', db)
  await next()
})

// 所有应用页面（含登录态数据）禁止缓存：
// 无 Cache-Control 时浏览器会启发式缓存 GET 响应，导致「新建用户/角色后列表不刷新」。
// 同时追加 Pragma/Expires 以兼容 HTTP/1.0 与部分浏览器的 bfcache。
const noStore = createMiddleware(async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  c.header('Pragma', 'no-cache')
  c.header('Expires', '0')
  // 强制浏览器清空当前源的缓存，解决已有旧缓存页面导致列表不刷新。
  c.header('Clear-Site-Data', '"cache"')
})

export default createRoute(
  injectDb,
  logger(),
  csrf({
    origin: (origin) => {
      if (allowLocal.test(origin)) return true
      const allowed = (process.env.ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      return allowed.includes(origin)
    },
  }),
  noStore,
)
