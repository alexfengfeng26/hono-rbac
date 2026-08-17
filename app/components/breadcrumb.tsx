import type { Child } from 'hono/jsx'
import { Icon } from './icon'

/** hono/jsx 官方子节点类型 */
export type Node = Child

export type Crumb = { label: string; href?: string }

type BreadcrumbProps = {
  items: Crumb[]
}

/** 面包屑：首页 / 系统管理 / 当前页 形式，给管理员稳定的方位感 */
export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav class="text-xs text-base-content/50 mb-3 flex items-center gap-1 flex-wrap" aria-label="面包屑">
      {items.map((c, i) => {
        const last = i === items.length - 1
        return (
          <span key={i} class="flex items-center gap-1">
            {c.href && !last ? (
              <a href={c.href} class="hover:text-primary transition-colors">
                {c.label}
              </a>
            ) : (
              <span class={last ? 'text-base-content/80 font-medium' : undefined}>{c.label}</span>
            )}
            {!last && <Icon name="chevron" className="w-3 h-3 opacity-50" />}
          </span>
        )
      })}
    </nav>
  )
}
