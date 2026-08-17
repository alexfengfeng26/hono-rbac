import { useEffect, useState } from 'hono/jsx/dom'
import { Icon } from '../components/icon'

type Note = { id: string; title: string; body: string | null; unread: boolean; createdAt: string }

export default function NotificationCenter() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loaded, setLoaded] = useState(false)
  const unread = notes.filter((n) => n.unread).length

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/notifications', { headers: { Accept: 'application/json' } })
        if (res.ok) {
          setNotes((await res.json()) as Note[])
        }
      } catch {
        /* 静默失败：保持空列表 */
      } finally {
        setLoaded(true)
      }
    })()
  }, [])

  function markAll() {
    setNotes((prev) => prev.map((n) => ({ ...n, unread: false })))
    void fetch('/api/notifications', { method: 'POST' }).catch(() => {})
  }

  function fmtTime(iso: string): string {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('zh-CN', { hour12: false })
  }

  return (
    <div class="dropdown dropdown-end">
      <button
        tabindex={0}
        role="button"
        class="btn btn-ghost btn-xs btn-square relative"
        aria-label="通知中心"
      >
        <Icon name="bell" className="w-4 h-4" />
        {unread > 0 && (
          <span class="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-error text-error-content text-[10px] font-bold">
            {unread}
          </span>
        )}
      </button>
      <ul class="dropdown-content menu bg-base-100 rounded-box z-20 w-80 p-2 shadow border border-base-300/70 max-h-96 overflow-y-auto">
        <li class="flex items-center justify-between px-2 py-1">
          <span class="font-medium text-sm">通知</span>
          <button class="link link-primary text-xs" onClick={markAll} disabled={unread === 0}>
            全部已读
          </button>
        </li>
        <div class="divider my-1"></div>
        {!loaded && <li class="text-xs text-base-content/40 px-2 py-2">加载中…</li>}
        {loaded && notes.length === 0 && (
          <li class="text-xs text-base-content/40 px-2 py-2">暂无通知</li>
        )}
        {notes.map((n) => (
          <li key={n.id}>
            <div class="flex flex-col gap-0.5 px-2 py-1.5">
              <div class="flex items-center gap-2">
                {n.unread && <span class="w-1.5 h-1.5 rounded-full bg-primary"></span>}
                <span class="text-sm font-medium truncate">{n.title}</span>
                <span class="ml-auto text-[10px] text-base-content/40 shrink-0">{fmtTime(n.createdAt)}</span>
              </div>
              {n.body && <span class="text-xs text-base-content/60 pl-3.5 whitespace-pre-wrap">{n.body}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
