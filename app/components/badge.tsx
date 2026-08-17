import type { Child } from 'hono/jsx'

/** hono/jsx 官方子节点类型 */
export type Node = Child

type BadgeProps = {
  variant?: 'primary' | 'success' | 'neutral' | 'warning' | 'error' | 'outline'
  /** 等宽字体（权限/角色名） */
  mono?: boolean
  className?: string
  children: Node
}

const VARIANTS: Record<NonNullable<BadgeProps['variant']>, string> = {
  primary: 'badge-primary badge-outline',
  success: 'badge-success badge-outline',
  neutral: 'badge-neutral badge-outline',
  warning: 'badge-warning',
  error: 'badge-error',
  outline: 'badge-outline',
}

/** 统一徽章：badge-sm + 变体，提示类小字号（text-xs 由 daisyUI badge 控制） */
export function Badge({ variant = 'outline', mono = false, className, children }: BadgeProps) {
  return (
    <span
      class={['badge badge-sm', VARIANTS[variant], mono ? 'font-mono' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  )
}
