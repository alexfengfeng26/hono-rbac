import type { Context } from 'hono'

/**
 * flash 链接：统一生成 `?flash=kind:msg` 并整体 encodeURIComponent。
 * 消费方 toast island 用 URLSearchParams 解析，天然兼容编码后的值。
 */
export function flashHref(path: string, kind: 'success' | 'error', msg: string): string {
  return `${path}?flash=${encodeURIComponent(`${kind}:${msg}`)}`
}

/** flash 重定向：基于 flashHref 直接返回 c.redirect */
export function flashRedirect(
  c: Context,
  path: string,
  kind: 'success' | 'error',
  msg: string,
) {
  return c.redirect(flashHref(path, kind, msg))
}

export type ListParams<T extends string = string> = {
  /** 搜索关键字（trim + 小写） */
  q: string
  /** 页码，下限 1 */
  page: number
  /** 排序字段：命中白名单则取之，否则回落默认值；未传白名单时为 undefined */
  sort: T | undefined
  /** 排序方向，白名单 'asc' | 'desc'，默认 'desc' */
  dir: 'asc' | 'desc'
}

/** 归一化列表页查询参数 q / page / sort / dir（sort 白名单由调用方给出） */
export function parseListParams<T extends string>(
  c: Context,
  sortable: readonly T[] = [],
  defaultSort?: T,
): ListParams<T> {
  const q = String(c.req.query('q') ?? '').trim().toLowerCase()
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1)
  const rawSort = String(c.req.query('sort') ?? '')
  const sort = (sortable as readonly string[]).includes(rawSort)
    ? (rawSort as T)
    : defaultSort
  const dir = c.req.query('dir') === 'asc' ? 'asc' : 'desc'
  return { q, page, sort, dir }
}

/**
 * 拼列表页链接：空值（undefined/null/''）跳过；overrides 覆盖同名参数，
 * 用于翻页（覆盖 page）与切换排序（覆盖 sort/dir）。
 */
export function buildQueryHref(
  base: string,
  params: Record<string, string | undefined | null>,
  overrides: Record<string, string | undefined | null> = {},
): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries({ ...params, ...overrides })) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, v)
  }
  const qs = sp.toString()
  return qs ? `${base}?${qs}` : base
}

/** 把 body.ids 归一化为数组（兼容多个同名隐藏域 或 逗号拼接字符串） */
export function parseIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean)
  if (typeof raw === 'string')
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  return []
}

/** 权限不足时返回 403 Response（与 c.text('403 Forbidden', 403) 等价），有权限返回 null */
export function forbidUnless(perms: ReadonlySet<string>, name: string): Response | null {
  if (perms.has(name)) return null
  return new Response('403 Forbidden', {
    status: 403,
    headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
  })
}

/** 日期格式化（仅年月日），无效值显示 — */
export function fmtDate(ts: number | Date | undefined): string {
  if (!ts) return '—'
  const d = ts instanceof Date ? ts : new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

/** 日期时间格式化（含时分秒，24 小时制），无效值显示 — */
export function fmtDateTime(ts: number | Date | undefined): string {
  if (!ts) return '—'
  const d = ts instanceof Date ? ts : new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('zh-CN', { hour12: false })
}
