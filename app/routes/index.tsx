import { createRoute } from 'honox/factory'
import { requireAuth } from '../lib/auth/guard'
import type { PermissionMap } from '../lib/rbac/permissions'
import { Badge } from '../components/badge'
import { Icon } from '../components/icon'
import type { IconName } from '../components/icon'
import type { User } from '../lib/db/schema'

type NavCard = { href: string; title: string; desc: string; icon: IconName; required?: string }

const NAV_CARDS: NavCard[] = [
  { href: '/admin', title: '仪表盘', desc: '平台数据概览', icon: 'panel' },
  { href: '/admin/users', title: '用户管理', desc: '创建用户、分配角色', icon: 'users', required: 'user:read' },
  { href: '/admin/roles', title: '角色管理', desc: '创建角色、配置权限', icon: 'roles', required: 'role:read' },
  { href: '/admin/permissions', title: '权限列表', desc: '查看全部权限点', icon: 'permissions', required: 'role:read' },
  { href: '/admin/departments', title: '部门管理', desc: '组织与机构层级', icon: 'building', required: 'org:department:manage' },
  { href: '/admin/menus', title: '菜单管理', desc: '配置侧栏导航', icon: 'menu', required: 'menu:manage' },
]

// 首页 = 登录后工作台（精简底座版：欢迎 + 按权限过滤的快捷入口）
export default createRoute(requireAuth, async (c) => {
  const user = c.get('user') as User
  const perms = c.get('permissions') as PermissionMap
  const visibleCards = NAV_CARDS.filter((card) => !card.required || perms.has(card.required))

  return c.render(
    <div>
      <title>工作台</title>
      <div class="mb-6">
        <h1 class="text-2xl font-medium">欢迎回来，{user.name}</h1>
        <p class="text-base-content/60 mt-1">
          这里是系统工作台，从下方入口进入各管理模块。
        </p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        {visibleCards.map((card) => (
          <a
            key={card.href}
            href={card.href}
            class="card bg-base-100 shadow hover:shadow-lg hover:-translate-y-0.5 transition"
          >
            <div class="card-body">
              <div class="text-primary">
                <Icon name={card.icon} className="w-7 h-7" />
              </div>
              <h2 class="card-title text-base">{card.title}</h2>
              <p class="text-sm text-base-content/60">{card.desc}</p>
            </div>
          </a>
        ))}
        {visibleCards.length === 0 && (
          <div class="card bg-base-100 shadow md:col-span-3">
            <div class="card-body items-center py-10 text-base-content/40">
              你当前没有可访问的模块，请联系管理员分配权限。
            </div>
          </div>
        )}
      </div>

      <div class="card bg-base-100 shadow mt-6">
        <div class="card-body">
          <h2 class="card-title text-base mb-1">我的权限</h2>
          <div class="flex flex-wrap gap-2">
            {[...perms.keys()].sort().map((p) => (
              <Badge key={p} variant="primary" mono>
                {p}
              </Badge>
            ))}
            {perms.size === 0 && <span class="text-sm text-base-content/50">（无权限）</span>}
          </div>
        </div>
      </div>
    </div>,
  )
})
