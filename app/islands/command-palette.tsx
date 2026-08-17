import { useEffect, useMemo, useRef, useState } from 'hono/jsx/dom'
import { Icon } from '../components/icon'
import type { IconName } from '../components/icon'

type Command = {
  id: string
  label: string
  icon: IconName
  group: '导航' | '动作'
  hint?: string
  keywords?: string
  run: () => void
}

function go(href: string) {
  window.location.href = href
}
function logout() {
  const f = document.createElement('form')
  f.method = 'post'
  f.action = '/logout'
  document.body.appendChild(f)
  f.submit()
}

const cycleTheme = () => {
  const w = window as Window & { rbacCycleTheme?: () => void }
  w.rbacCycleTheme?.()
}

// 动作类命令（固定）；导航命令由服务端按菜单数据传入（navItems props）
const ACTION_COMMANDS: Command[] = [
  { id: 'new-user', label: '新建用户', icon: 'plus', group: '动作', keywords: 'create xinjian', run: () => go('/admin/users') },
  { id: 'theme', label: '切换主题', icon: 'sun', group: '动作', keywords: 'theme zhuti', run: cycleTheme },
  { id: 'logout', label: '登出', icon: 'logout', group: '动作', run: logout },
]

export default function CommandPalette({
  navItems,
}: {
  navItems: { id: string; label: string; icon: IconName; href: string }[]
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const gPending = useRef(0)

  const commands = useMemo(
    () => [
      ...navItems.map((n) => ({
        id: n.id,
        label: n.label,
        icon: n.icon,
        group: '导航' as const,
        keywords: '',
        hint: undefined as string | undefined,
        run: () => go(n.href),
      })),
      ...ACTION_COMMANDS,
    ],
    [navItems],
  )

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((c) =>
      (c.label + ' ' + (c.keywords ?? '') + ' ' + (c.hint ?? '')).toLowerCase().includes(q),
    )
  }, [query, commands])

  useEffect(() => {
    setActive(0)
  }, [query])

  function openPalette() {
    const d = dialogRef.current
    if (d && !d.open) d.showModal()
    setTimeout(() => inputRef.current?.focus(), 0)
  }
  function openShortcuts() {
    const d = document.getElementById('shortcuts-help') as HTMLDialogElement | null
    if (d && !d.open) d.showModal()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      // ⌘K / Ctrl+K 打开命令面板
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openPalette()
        return
      }
      // ? 打开快捷键帮助
      if (e.key === '?' && !typing) {
        e.preventDefault()
        openShortcuts()
        return
      }
      // g 序列跳转（G U / G R / G P …）
      if (!typing && !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === 'g') {
        gPending.current = Date.now()
        return
      }
      if (gPending.current && Date.now() - gPending.current < 1200) {
        const map: Record<string, string> = {
          d: '/admin',
          u: '/admin/users',
          r: '/admin/roles',
          p: '/admin/permissions',
          s: '/admin/profile',
          e: '/admin/sessions',
        }
        const dest = map[e.key.toLowerCase()]
        gPending.current = 0
        if (dest) {
          e.preventDefault()
          go(dest)
        }
      }
    }
    document.addEventListener('keydown', onKey)

    const onClick = (e: Event) => {
      const t = e.target as HTMLElement | null
      const opener = t && t.closest ? t.closest('[data-open-command]') : null
      if (opener) {
        e.preventDefault()
        openPalette()
      }
    }
    document.addEventListener('click', onClick)

    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onClick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onInputKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      results[active]?.run()
    }
  }

  return (
    <>
      <dialog id="command-palette" class="modal modal-top" ref={dialogRef} aria-label="命令面板">
        <div class="modal-box max-w-xl p-0 overflow-hidden">
          <div class="flex items-center gap-2 px-3 border-b border-base-300/70">
            <Icon name="search" className="w-4 h-4 opacity-60" />
            <input
              ref={inputRef}
              class="cmdk-input border-0 bg-transparent"
              placeholder="搜索页面、动作…（⌘K）"
              value={query}
              onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
              onKeyDown={onInputKey}
              aria-label="命令搜索"
            />
            <kbd class="cmdk-kbd">ESC</kbd>
          </div>
          <ul class="py-2 max-h-80 overflow-y-auto">
            {results.length === 0 && (
              <li class="px-3 py-6 text-center text-sm text-base-content/40">无匹配结果</li>
            )}
            {results.map((c, i) => (
              <li key={c.id}>
                <a
                  href="#"
                  class="cmdk-item"
                  data-active={i === active ? 'true' : 'false'}
                  onClick={(ev) => {
                    ev.preventDefault()
                    c.run()
                  }}
                  onMouseEnter={() => setActive(i)}
                >
                  <Icon name={c.icon} className="w-4 h-4 opacity-70" />
                  <span>{c.label}</span>
                  {c.hint && <kbd class="cmdk-kbd">{c.hint}</kbd>}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button type="button" aria-label="关闭">
            关闭
          </button>
        </form>
      </dialog>

      <dialog id="shortcuts-help" class="modal" aria-label="键盘快捷键">
        <div class="modal-box">
          <h3 class="font-bold text-lg mb-3">键盘快捷键</h3>
          <ul class="space-y-2 text-sm">
            <li class="flex items-center justify-between">
              <span>打开命令面板</span>
              <kbd class="cmdk-kbd">⌘K / Ctrl K</kbd>
            </li>
            <li class="flex items-center justify-between">
              <span>查看本帮助</span>
              <kbd class="cmdk-kbd">?</kbd>
            </li>
            <li class="flex items-center justify-between">
              <span>跳转到 仪表盘</span>
              <kbd class="cmdk-kbd">G D</kbd>
            </li>
            <li class="flex items-center justify-between">
              <span>跳转到 用户管理</span>
              <kbd class="cmdk-kbd">G U</kbd>
            </li>
            <li class="flex items-center justify-between">
              <span>跳转到 角色管理</span>
              <kbd class="cmdk-kbd">G R</kbd>
            </li>
            <li class="flex items-center justify-between">
              <span>跳转到 权限列表</span>
              <kbd class="cmdk-kbd">G P</kbd>
            </li>
            <li class="flex items-center justify-between">
              <span>跳转到 修改密码</span>
              <kbd class="cmdk-kbd">G S</kbd>
            </li>
            <li class="flex items-center justify-between">
              <span>跳转到 我的会话</span>
              <kbd class="cmdk-kbd">G E</kbd>
            </li>
          </ul>
          <div class="modal-action">
            <button class="btn btn-ghost" data-close-dialog="shortcuts-help">
              关闭
            </button>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button type="button" data-close-dialog="shortcuts-help" aria-label="关闭">
            关闭
          </button>
        </form>
      </dialog>
    </>
  )
}
