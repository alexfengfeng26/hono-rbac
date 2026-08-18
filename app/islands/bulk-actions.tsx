import { useEffect, useState } from 'hono/jsx/dom'

type RoleOption = { id: string; name: string }

type Props = {
  /** 全部可选角色（用于批量分配对话框） */
  roles: RoleOption[]
}

/**
 * 批量操作条：监听表格内 `input.bulk-check[data-bulk-id]` 的勾选变化，
 * 维护选中集合；一旦有选中即在表格上方浮出 contextual 操作条。
 * 所有操作走原生 form POST（action=/admin/users），服务端统一校验权限与边界。
 */
export default function BulkActions({ roles }: Props) {
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    const recompute = () => {
      const all = Array.from(
        document.querySelectorAll('input.bulk-check'),
      ) as HTMLInputElement[]
      const checked = all.filter((c) => c.checked).map((c) => c.value)
      setSelected(checked)
      const selAll = document.querySelector('input[data-bulk-all]') as HTMLInputElement | null
      if (selAll) {
        selAll.checked = all.length > 0 && checked.length === all.length
        selAll.indeterminate = checked.length > 0 && checked.length < all.length
      }
    }
    const onChange = (e: Event) => {
      const target = e.target as HTMLElement
      if (target instanceof HTMLInputElement && target.matches('input[data-bulk-all]')) {
        const all = Array.from(
          document.querySelectorAll('input.bulk-check'),
        ) as HTMLInputElement[]
        all.forEach((c) => (c.checked = target.checked))
      }
      recompute()
    }
    document.addEventListener('change', onChange)
    return () => document.removeEventListener('change', onChange)
  }, [])

  const clear = () => {
    const all = Array.from(document.querySelectorAll('input.bulk-check')) as HTMLInputElement[]
    all.forEach((c) => (c.checked = false))
    const selAll = document.querySelector('input[data-bulk-all]') as HTMLInputElement | null
    if (selAll) {
      selAll.checked = false
      selAll.indeterminate = false
    }
    setSelected([])
  }

  const hiddenInputs = selected.map((id) => (
    <input key={id} type="hidden" name="ids" value={id} />
  ))

  return (
    <>
      <div
        class={`bulk-bar alert shadow-sm mb-3 flex items-center gap-2 flex-wrap ${
          selected.length === 0 ? 'hidden' : ''
        }`}
      >
        <span class="font-medium">已选 {selected.length} 项</span>
        <div class="flex items-center gap-1.5 flex-wrap">
          <button type="button" class="btn btn-sm btn-primary" data-open-dialog="bulk-role-dialog">
            批量分配角色
          </button>
          <form method="post" action="/admin/users" class="contents">
            <input type="hidden" name="intent" value="bulkSetStatus" />
            <input type="hidden" name="status" value="disabled" />
            {hiddenInputs}
            <button type="submit" class="btn btn-sm">
              批量停用
            </button>
          </form>
          <form method="post" action="/admin/users" class="contents">
            <input type="hidden" name="intent" value="bulkSetStatus" />
            <input type="hidden" name="status" value="active" />
            {hiddenInputs}
            <button type="submit" class="btn btn-sm">
              批量启用
            </button>
          </form>
          <button type="button" class="btn btn-sm btn-error" data-open-dialog="bulk-delete-confirm">
            批量删除
          </button>
          <button type="button" class="btn btn-sm btn-ghost" onClick={clear}>
            取消
          </button>
        </div>
      </div>

      {/* 批量分配角色对话框 */}
      <dialog id="bulk-role-dialog" class="modal" aria-labelledby="bulk-role-title" aria-modal="true">
        <div class="modal-box max-h-[85vh] overflow-y-auto">
          <h3 id="bulk-role-title" class="font-bold text-lg">
            批量分配角色
            <span class="text-sm font-normal text-base-content/50">（已选 {selected.length} 项）</span>
          </h3>
          <form method="post" action="/admin/users" class="mt-4">
            <input type="hidden" name="intent" value="bulkAssignRoles" />
            {hiddenInputs}
            <div class="flex flex-col gap-2">
              {roles.map((r) => (
                <label class="flex items-center justify-between gap-3" key={r.id}>
                  <span class="text-sm">{r.name}</span>
                  <input type="checkbox" name="roles" value={r.id} class="checkbox checkbox-sm" />
                </label>
              ))}
              {roles.length === 0 && (
                <p class="text-sm text-base-content/50">暂无角色可分配</p>
              )}
            </div>
            <div class="modal-action mt-4">
              <button type="button" class="btn btn-ghost" data-close-dialog="bulk-role-dialog">
                取消
              </button>
              <button type="submit" class="btn btn-primary">
                保存
              </button>
            </div>
          </form>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button type="button" data-close-dialog="bulk-role-dialog" aria-label="关闭">
            关闭
          </button>
        </form>
      </dialog>

      {/* 批量删除确认对话框 */}
      <dialog
        id="bulk-delete-confirm"
        class="modal"
        aria-labelledby="bulk-delete-title"
        aria-modal="true"
      >
        <div class="modal-box p-4">
          <h3 id="bulk-delete-title" class="font-semibold text-base">
            确认删除
          </h3>
          <p class="py-2.5 text-xs text-base-content/70">
            确定删除选中的 {selected.length} 个用户？被删除的账号不可恢复，其角色与会话将一并清除。
          </p>
          <form method="post" action="/admin/users">
            <input type="hidden" name="intent" value="bulkDelete" />
            {hiddenInputs}
            <div class="modal-action mt-2">
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                data-close-dialog="bulk-delete-confirm"
              >
                取消
              </button>
              <button type="submit" class="btn btn-error btn-sm">
                确认删除
              </button>
            </div>
          </form>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button type="button" data-close-dialog="bulk-delete-confirm" aria-label="关闭">
            关闭
          </button>
        </form>
      </dialog>
    </>
  )
}
