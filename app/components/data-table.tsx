import type { Child } from 'hono/jsx'
import { EmptyState } from './empty-state'
import type { IconName } from './icon'

/** hono/jsx 官方子节点类型 */
export type Node = Child

type SortHeaderProps<T extends string = string> = {
  /** 排序字段名 */
  field: T
  /** 表头文案 */
  label: string
  /** 当前排序字段 */
  sort: T
  /** 当前方向 */
  dir: 'asc' | 'desc'
  /** 生成「切换为该字段排序」的链接 */
  sortHref: (field: T) => string
  /** 悬停提示，如「按姓名排序」 */
  title?: string
}

/** 可排序表头链接：当前字段高亮并显示 ↑/↓ 方向标记 */
export function SortHeader<T extends string>({
  field,
  label,
  sort,
  dir,
  sortHref,
  title,
}: SortHeaderProps<T>) {
  const active = sort === field
  return (
    <a href={sortHref(field)} class={active ? 'text-primary' : undefined} title={title}>
      {label}
      {active ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </a>
  )
}

type EmptyRowProps = {
  /** 跨列数（= 表格列数） */
  colspan: number
  /** 图标名（lucide 风格） */
  icon: IconName
  title: string
  description?: string
  /** 可选行动点（链接/按钮） */
  cta?: Node
}

/** 表格空态行：包 EmptyState 并处理 colspan */
export function EmptyRow({ colspan, icon, title, description, cta }: EmptyRowProps) {
  return (
    <tr>
      <td colspan={colspan}>
        <EmptyState icon={icon} title={title} description={description} cta={cta} />
      </td>
    </tr>
  )
}
