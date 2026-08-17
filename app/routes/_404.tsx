import type { NotFoundHandler } from 'hono'

const handler: NotFoundHandler = (c) => {
  c.status(404)
  return c.render(
    <div class="min-h-screen flex items-center justify-center p-4">
      <div class="card bg-base-100 shadow-lg w-full max-w-md">
        <div class="card-body items-center text-center gap-4">
          <div class="stat-value text-6xl font-bold text-base-content/20">404</div>
          <h1 class="card-title text-2xl">页面不存在</h1>
          <p class="text-base-content/60 text-sm">
            你访问的地址不存在或已被移除，请检查链接后重试。
          </p>
          <div class="card-actions mt-2">
            <a href="/" class="btn btn-primary btn-sm">
              返回首页
            </a>
            <a href="/admin" class="btn btn-ghost btn-sm">
              前往仪表盘
            </a>
          </div>
        </div>
      </div>
    </div>,
  )
}

export default handler
