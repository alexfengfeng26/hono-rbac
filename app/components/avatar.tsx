import type { Child } from 'hono/jsx'

/** hono/jsx 官方子节点类型 */
export type Node = Child

const PALETTE = [
  { bg: '#e0e7ff', fg: '#3730a3' }, // indigo
  { bg: '#dcfce7', fg: '#166534' }, // green
  { bg: '#fef3c7', fg: '#92400e' }, // amber
  { bg: '#fce7f3', fg: '#9d174d' }, // pink
  { bg: '#cffafe', fg: '#155e75' }, // cyan
  { bg: '#ede9fe', fg: '#5b21b6' }, // violet
  { bg: '#fee2e2', fg: '#991b1b' }, // red
  { bg: '#e2e8f0', fg: '#334155' }, // slate
]

function pick(seed: string): { bg: string; fg: string } {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

type AvatarProps = {
  /** 显示名（取首字符），无则回退到 seed */
  name?: string
  /** 用于选色的稳定种子（如 id 或 email） */
  seed?: string
  className?: string
}

/** 首字母彩色头像：降低长邮箱列表的认知负荷 */
export function Avatar({ name, seed, className = '' }: AvatarProps) {
  const initial = (name?.trim()?.[0] ?? seed?.[0] ?? '?').toUpperCase()
  const { bg, fg } = pick(seed ?? name ?? '?')
  return (
    <span
      class={`inline-flex items-center justify-center rounded-full font-semibold shrink-0 ${className}`}
      style={`background:${bg};color:${fg}`}
      aria-hidden="true"
    >
      {initial}
    </span>
  )
}
