import type { Child } from 'hono/jsx'
import { Icon } from './icon'
import type { IconName } from './icon'

/** hono/jsx 官方子节点类型 */
export type Node = Child

type EmptyStateProps = {
  /** 图标名（lucide 风格） */
  icon: IconName
  title: string
  description?: string
  /** 可选行动点（链接/按钮），如「去创建第一个」 */
  cta?: Node
}

/** 空状态：插画图标 + 标题 + 描述 + 可选 CTA，替换列表的「暂无…」占位 */
export function EmptyState({ icon, title, description, cta }: EmptyStateProps) {
  return (
    <div class="card bg-base-100 shadow">
      <div class="card-body items-center text-center py-16">
        <span class="inline-flex items-center justify-center w-14 h-14 rounded-full bg-base-200 text-base-content/40">
          <Icon name={icon} className="w-7 h-7" />
        </span>
        <h3 class="font-semibold text-base mt-3">{title}</h3>
        {description && <p class="text-sm text-base-content/50 max-w-sm">{description}</p>}
        {cta && <div class="mt-2">{cta}</div>}
      </div>
    </div>
  )
}
