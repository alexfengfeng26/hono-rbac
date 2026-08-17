import type { ErrorHandler } from 'hono'

const handler: ErrorHandler = (e, c) => {
  if ('getResponse' in e) {
    return e.getResponse()
  }
  console.error(e.message)
  c.status(500)
  return c.render(
    <div class="min-h-screen flex items-center justify-center p-4">
      <div class="card bg-base-100 shadow-lg w-full max-w-md">
        <div class="card-body items-center text-center gap-4">
          <div class="stat-value text-6xl font-bold text-base-content/20">500</div>
          <h1 class="card-title text-2xl">服务器开小差了</h1>
          <p class="text-base-content/60 text-sm">
            处理请求时发生了错误，请稍后重试。若问题持续，请联系管理员。
          </p>
          <div class="card-actions mt-2">
            <a href="/" class="btn btn-primary btn-sm">
              返回首页
            </a>
          </div>
        </div>
      </div>
    </div>,
  )
}

export default handler
