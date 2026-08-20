import type { Child } from 'hono/jsx'

/** hono/jsx 官方子节点类型 */
export type Node = Child

type FilterBarProps = {
  /** 提交目标（GET），如 /admin/users */
  action: string
  /** 是否有生效中的筛选条件（决定「清除」按钮是否显示） */
  filtered: boolean
  /** 清除链接，默认回到 action 本身 */
  clearHref?: string
  /** 提交按钮文案，默认「筛选」 */
  submitLabel?: string
  children: Node
}

/** 列表页筛选条：GET 表单容器 + 提交/清除按钮，清除仅在有筛选条件时显示 */
export function FilterBar({
  action,
  filtered,
  clearHref,
  submitLabel = '筛选',
  children,
}: FilterBarProps) {
  return (
    <form method="get" action={action} class="flex flex-wrap items-end gap-3 mb-4">
      {children}
      <button type="submit" class="btn btn-sm btn-outline">
        {submitLabel}
      </button>
      {filtered && (
        <a href={clearHref ?? action} class="btn btn-sm btn-ghost">
          清除
        </a>
      )}
    </form>
  )
}

/** 筛选字段：label + 控件插槽（input/select 由调用方提供） */
export function FilterField({ label, children }: { label: string; children: Node }) {
  return (
    <div class="flex flex-col gap-1">
      <label class="text-xs text-base-content/60">{label}</label>
      {children}
    </div>
  )
}
