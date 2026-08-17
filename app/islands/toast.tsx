import { useEffect, useState } from 'hono/jsx/dom'

type ToastType = 'success' | 'error' | 'warning' | 'info'
type UndoInfo = { action: string; fields: Record<string, string> }
type ToastItem = { id: number; type: ToastType; message: string; undo?: UndoInfo }

const TOAST_DURATION = 5000

function decodeUndo(raw: string | null): UndoInfo | undefined {
  if (!raw) return undefined
  try {
    const json = atob(raw.replace(/-/g, '+').replace(/_/g, '/'))
    const obj = JSON.parse(json)
    if (obj && typeof obj.action === 'string' && obj.fields && typeof obj.fields === 'object') {
      return obj as UndoInfo
    }
  } catch {
    /* 非法参数忽略 */
  }
  return undefined
}

export default function Toast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    let nextId = 1
    const show = (item: ToastItem) => {
      setToasts((prev) => [...prev, item])
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== item.id))
      }, TOAST_DURATION)
    }

    const params = new URLSearchParams(window.location.search)
    const flash = params.get('flash')
    if (flash) {
      const colon = flash.indexOf(':')
      const type = (colon > 0 ? flash.slice(0, colon) : 'info') as ToastType
      const message = colon > 0 ? flash.slice(colon + 1) : flash
      show({
        id: nextId++,
        type: type === 'success' || type === 'error' || type === 'warning' ? type : 'info',
        message,
        undo: decodeUndo(params.get('undo')),
      })
      // 清理 flash 与 undo 参数，避免刷新/前进后退重复弹出或暴露撤销指令
      history.replaceState(null, '', window.location.pathname)
    }

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ type?: ToastType; message: string; undo?: UndoInfo }>)
        .detail
      if (detail?.message)
        show({
          id: nextId++,
          type: detail.type ?? 'info',
          message: detail.message,
          undo: detail.undo,
        })
    }
    window.addEventListener('rbac-toast', handler)
    return () => window.removeEventListener('rbac-toast', handler)
  }, [])

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id))

  return (
    <div
      class="toast toast-end toast-top z-50 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          class={`alert shadow-lg pointer-events-auto ${
            t.type === 'error'
              ? 'alert-error'
              : t.type === 'warning'
                ? 'alert-warning'
                : t.type === 'info'
                  ? 'alert-info'
                  : 'alert-success'
          }`}
        >
          <span class="text-sm">{t.message}</span>
          {t.undo && (
            <form method="post" action={t.undo.action} class="contents">
              {Object.entries(t.undo.fields).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              <button type="submit" class="btn btn-ghost btn-xs font-medium underline">
                撤销
              </button>
            </form>
          )}
          <button
            class="btn btn-ghost btn-xs btn-square"
            aria-label="关闭"
            onClick={() => dismiss(t.id)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              class="w-4 h-4"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
