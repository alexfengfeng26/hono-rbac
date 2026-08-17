import type { Child } from 'hono/jsx'

/** hono/jsx 官方子节点类型 */
export type Node = Child

type PageHeaderProps = {
  title: string
  subtitle?: Node
  actions?: Node
}

/** 统一页面头部：标题（text-2xl）+ 次要说明（text-sm）+ 右侧操作区 */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div class="flex items-center justify-between gap-4 mb-6">
      <div>
        <h1 class="text-2xl font-bold">{title}</h1>
        {subtitle && <p class="text-sm text-base-content/60 mt-1">{subtitle}</p>}
      </div>
      {actions && <div class="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
