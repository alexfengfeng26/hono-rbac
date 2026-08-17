type PaginationProps = {
  page: number
  totalPages: number
  /** 根据目标页码生成链接（保留现有查询参数） */
  buildHref: (page: number) => string
}

function pageRange(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '...')[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  if (start > 2) pages.push('...')
  for (let i = start; i <= end; i++) pages.push(i)
  if (end < total - 1) pages.push('...')
  pages.push(total)
  return pages
}

/** daisyUI join 风格分页：上一页 / 页码（含省略号）/ 下一页，单页时不渲染 */
export function Pagination({ page, totalPages, buildHref }: PaginationProps) {
  if (totalPages <= 1) return null
  const pages = pageRange(page, totalPages)
  return (
    <div class="flex items-center justify-between mt-4 gap-3 flex-wrap">
      <span class="text-xs text-base-content/50">
        第 {page} / {totalPages} 页
      </span>
      <div class="join">
        <a
          class={`join-item btn btn-sm ${page <= 1 ? 'btn-disabled' : ''}`}
          href={buildHref(page - 1)}
          aria-label="上一页"
        >
          上一页
        </a>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`gap-${i}`} class="join-item btn btn-sm btn-disabled">
              …
            </span>
          ) : (
            <a
              key={p}
              class={`join-item btn btn-sm ${p === page ? 'btn-active' : ''}`}
              href={buildHref(p)}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </a>
          ),
        )}
        <a
          class={`join-item btn btn-sm ${page >= totalPages ? 'btn-disabled' : ''}`}
          href={buildHref(page + 1)}
          aria-label="下一页"
        >
          下一页
        </a>
      </div>
    </div>
  )
}
