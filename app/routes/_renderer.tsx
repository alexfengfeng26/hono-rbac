import { jsxRenderer, useRequestContext } from 'hono/jsx-renderer'
import { Link, Script } from 'honox/server'
import Toast from '../islands/toast'
import CommandPalette from '../islands/command-palette'
import NotificationCenter from '../islands/notification-center'
import { Icon } from '../components/icon'
import type { IconName } from '../components/icon'
import { Breadcrumb } from '../components/breadcrumb'
import type { Crumb } from '../components/breadcrumb'
import type { User } from '../lib/db/schema'
import type { PermissionMap } from '../lib/rbac/permissions'
import { loadMenuTree, flattenMenuTree } from '../lib/rbac/menus'

const SELF_LINKS: { href: string; label: string; icon: IconName }[] = [
  { href: '/admin/profile', label: '修改密码', icon: 'lock' },
  { href: '/admin/sessions', label: '我的会话', icon: 'sessions' },
]

function isActive(itemHref: string, path: string) {
  if (itemHref === '/') return path === '/'
  return itemHref === '/admin' ? path === '/admin' : path.startsWith(itemHref)
}

function Sidebar({ path, user, perms }: { path: string; user: User; perms: PermissionMap }) {
  const tree = loadMenuTree(perms)
  return (
    <aside class="drawer-side">
      <label for="rbac-drawer" aria-label="关闭侧栏" class="drawer-overlay"></label>
      <div class="bg-base-100 border-r border-base-300/70 text-base-content min-h-full w-48 p-2.5 flex flex-col">
        <div class="flex items-center gap-2 px-2 py-2 font-semibold text-base tracking-tight">
          <span class="inline-flex items-center justify-center w-5 h-5 rounded-field bg-primary text-primary-content text-xs font-bold">
            R
          </span>
          <span class="side-brand-text flex-1">RBAC</span>
          <button
            type="button"
            data-sidebar-toggle
            class="btn btn-ghost btn-xs btn-square"
            title="折叠 / 展开侧栏"
            aria-label="折叠或展开侧栏"
          >
            <Icon name="panel" className="w-4 h-4" />
          </button>
        </div>
        <ul class="menu side-nav gap-2 px-0 mt-2 text-base">
          {tree.map((g) => (
            <li key={g.id} class="side-group">
              <details open>
                <summary class="side-group-title">
                  <span class="side-label">{g.name}</span>
                  <Icon name="chevron" className="side-group-chevron w-3.5 h-3.5" />
                </summary>
                <ul class="side-group-items">
                  {g.children.map((item) => (
                    <li key={item.id}>
                      <a
                        href={item.href}
                        class={isActive(item.href, path) ? 'menu-item-active' : undefined}
                        title={item.name}
                      >
                        <Icon name={item.icon} />
                        <span class="side-label">{item.name}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
        <div class="side-foot mt-auto pt-2 border-t border-base-300/70">
          <div class="px-2 py-1 text-xs text-base-content/50 truncate">{user.email}</div>
        </div>
      </div>
    </aside>
  )
}

function Navbar({ user }: { user: User }) {
  return (
    <nav class="navbar min-h-10 h-10 px-3 bg-base-100/80 backdrop-blur border-b border-base-300/70 sticky top-0 z-30">
      <div class="flex-none lg:hidden">
        <label for="rbac-drawer" aria-label="打开侧栏" class="btn btn-square btn-ghost btn-xs">
          <Icon name="menu" className="w-5 h-5" />
        </label>
      </div>
      <button
        type="button"
        data-open-command
        class="btn btn-ghost btn-sm gap-2 normal-case text-base-content/60"
        aria-label="打开命令面板"
      >
        <Icon name="search" className="w-4 h-4" />
        <span class="hidden md:inline">搜索…</span>
        <kbd class="hidden md:inline cmdk-kbd">⌘K</kbd>
      </button>
      <div class="flex-1"></div>
      <div class="flex-none flex items-center gap-1">
        <button
          type="button"
          data-theme-toggle
          class="btn btn-ghost btn-xs btn-square"
          title="切换主题"
          aria-label="切换主题"
        >
          <Icon name="sun" className="w-4 h-4" />
        </button>
        <NotificationCenter />
        <details class="dropdown dropdown-end">
          <summary class="btn btn-ghost btn-xs gap-1.5" role="button">
            <span class="max-w-40 truncate text-xs">{user.email}</span>
            <Icon name="chevron" className="w-3 h-3" />
          </summary>
          <ul class="menu menu-sm dropdown-content bg-base-100 rounded-box z-10 w-44 p-1.5 shadow-sm border border-base-300/70">
            {SELF_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} class="flex items-center gap-2">
                  <Icon name={link.icon} className="w-4 h-4 opacity-70" />
                  {link.label}
                </a>
              </li>
            ))}
            <li class="mt-1 pt-1 border-t border-base-300/70">
              <form method="post" action="/logout">
                <button class="w-full text-left flex items-center gap-2 text-error" type="submit">
                  <Icon name="logout" className="w-4 h-4" />
                  登出
                </button>
              </form>
            </li>
          </ul>
        </details>
      </div>
    </nav>
  )
}

export default jsxRenderer(({ children }) => {
  const c = useRequestContext()
  const user = c.get('user')
  const perms = (c.get('permissions') as PermissionMap | undefined) ?? new Set<string>()
  const path = c.req.path
  const isAdminArea = path.startsWith('/admin')

  // 菜单树（按权限过滤）——侧栏 / 面包屑 / 命令面板共用
  const navTree = user ? loadMenuTree(perms) : []
  const navItems = [
    ...flattenMenuTree(navTree).map((i) => ({ id: i.href, label: i.name, icon: i.icon, href: i.href })),
    ...SELF_LINKS.map((l) => ({ id: l.href, label: l.label, icon: l.icon, href: l.href })),
  ]

  // 面包屑：从菜单数据反查当前页层级（首页 / 当前）
  let crumbs: Crumb[] = []
  if (isAdminArea) {
    crumbs = [{ label: '首页', href: '/' }]
    if (path !== '/admin') {
      const byHref = new Map(flattenMenuTree(navTree).map((i) => [i.href, i.name]))
      const found = byHref.get(path) ?? SELF_LINKS.find((l) => l.href === path)?.label
      if (found) crumbs.push({ label: found })
    }
  }

  return (
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        {/* 管理后台页面包含登录态与实时数据，禁止浏览器缓存，避免新建/编辑后列表不刷新 */}
        <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate, max-age=0" />
        <meta http-equiv="Pragma" content="no-cache" />
        <meta http-equiv="Expires" content="0" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        {/* 主题初始化脚本需在 CSS 渲染前同步执行，避免闪屏 */}
        <script src="/theme.js"></script>
        <Link href="/app/style.css" rel="stylesheet" />
        <Script src="/app/client.ts" async />
      </head>
      <body class="bg-base-200 min-h-screen text-base-content">
        {user && isAdminArea ? (
          <div class="drawer lg:drawer-open">
            <input id="rbac-drawer" type="checkbox" class="drawer-toggle" />
            <div class="drawer-content flex flex-col min-h-screen">
              <Navbar user={user} />
              <main class="flex-1 w-full max-w-7xl mx-auto px-4 md:px-6 py-4">
                <Breadcrumb items={crumbs} />
                {children}
              </main>
            </div>
            <Sidebar path={path} user={user} perms={perms} />
          </div>
        ) : (
          <main class="min-h-screen">{children}</main>
        )}
        <Toast />
        <CommandPalette navItems={navItems} />
        <script
          dangerouslySetInnerHTML={{
            __html: `
/* 修复 hono/jsx/dom 运行时对 <form action> 的污染（form.action 属性被设成节点导致提交 404）。
   任何加载 island 的页面都会触发；SSR 的 action 属性本身正确，这里用属性值回写 DOM 属性。 */
function __fixFormAction() {
  var forms = document.querySelectorAll('form[action]');
  for (var i = 0; i < forms.length; i++) {
    var f = forms[i];
    var attr = f.getAttribute('action');
    if (attr && typeof f.action !== 'string') {
      try { f.action = attr; } catch (e) {}
    }
  }
}
__fixFormAction();
document.addEventListener('DOMContentLoaded', __fixFormAction);
setInterval(__fixFormAction, 500);
/* hono/jsx/dom 会把 <form> 的 action 属性污染成节点（form.action 非字符串）。
   若无法修复，则在提交时用手动重放（fetch + HTML 属性 URL）替代原生提交，保证所有表单可用。 */
document.addEventListener('submit', function (e) {
  var form = e.target;
  if (!(form instanceof HTMLFormElement)) return;
  var attr = form.getAttribute('action');
  if (!attr || typeof form.action === 'string') return;
  if (form.hasAttribute('data-models-json')) return; // 交给 models-submit（fetch 走 getAttribute，不受影响）
  e.preventDefault();
  var fd = new FormData(form);
  var params = new URLSearchParams();
  fd.forEach(function (v, k) { params.append(k, String(v)); });
  fetch(attr, { method: 'POST', body: params, redirect: 'manual' })
    .then(function (res) {
      if (res.status >= 300 && res.status < 400) {
        var loc = res.headers.get('location');
        window.location.href = loc || attr;
      } else if (res.status === 200) {
        res.text().then(function (html) { document.open(); document.write(html); document.close(); });
      } else {
        window.location.href = attr;
      }
    })
    .catch(function () { window.location.href = attr; });
}, true);
document.addEventListener('click', function (e) {
  var t = e.target;
  if (!(t instanceof Element)) return;
  var opener = t.closest('[data-open-dialog]');
  if (opener) { var d = document.getElementById(opener.getAttribute('data-open-dialog')); if (d instanceof HTMLDialogElement) d.showModal(); return; }
  var closer = t.closest('[data-close-dialog]');
  if (closer) { var d2 = document.getElementById(closer.getAttribute('data-close-dialog')); if (d2 instanceof HTMLDialogElement && d2.open) d2.close(); return; }
  var backdrop = t.closest('.modal-backdrop');
  if (backdrop) { var dlg = backdrop.closest('dialog'); if (dlg instanceof HTMLDialogElement) dlg.close(); return; }
  if (t instanceof HTMLDialogElement) t.close();
});
document.querySelectorAll('dialog[data-auto-open="true"]').forEach(function (d) { if (d instanceof HTMLDialogElement) d.showModal(); });
document.addEventListener('submit', function (e) {
  var form = e.target;
  if (!(form instanceof HTMLFormElement)) return;
  var attr = form.getAttribute('action');
  if (attr && typeof form.action !== 'string') {
    try { form.action = attr; } catch (e2) {}
  }
  if (form.getAttribute('method') && form.getAttribute('method').toLowerCase() === 'get') return;
  var btn = form.querySelector('button[type="submit"]');
  if (btn) { btn.classList.add('loading'); btn.disabled = true; }
});
`,
          }}
        />
      </body>
    </html>
  )
})
