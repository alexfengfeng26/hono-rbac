/** 统一 403 页面：由 requirePermission 经渲染器渲染，复用导航/主题，避免裸 HTML 字符串 */
export function Forbidden({ permission }: { permission?: string }) {
  return (
    <div class="min-h-[60vh] flex items-center justify-center p-4">
      <div class="card bg-base-100 shadow-lg w-full max-w-md">
        <div class="card-body items-center text-center gap-3">
          <div class="text-6xl font-bold text-base-content/20">403</div>
          <h1 class="card-title">无权访问</h1>
          <p class="text-base-content/60 text-sm">
            {permission ? (
              <>
                你没有权限执行此操作，缺少权限：
                <code class="font-mono text-error">{permission}</code>
              </>
            ) : (
              '你没有权限执行此操作。'
            )}
          </p>
          <div class="card-actions mt-2">
            <a href="/admin" class="btn btn-primary btn-sm">
              返回仪表盘
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
