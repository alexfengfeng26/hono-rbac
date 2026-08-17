import { createRoute } from 'honox/factory'
import { Badge } from '../../components/badge'
import { Icon } from '../../components/icon'
import type { IconName } from '../../components/icon'
import { PageHeader } from '../../components/page-header'
import { db, schema } from '../../lib/db'
import type { PermissionMap } from '../../lib/rbac/permissions'

type NavCard = { href: string; title: string; desc: string; icon: IconName; required?: string }

const NAV_CARDS: NavCard[] = [
  { href: '/admin/users', title: '用户管理', desc: '创建用户、分配角色', icon: 'users', required: 'user:read' },
  { href: '/admin/roles', title: '角色管理', desc: '创建角色、配置权限', icon: 'roles', required: 'role:read' },
  { href: '/admin/permissions', title: '权限列表', desc: '查看全部权限与归属', icon: 'permissions', required: 'role:read' },
  { href: '/admin/menus', title: '菜单管理', desc: '配置侧栏导航分组与入口', icon: 'menu', required: 'menu:manage' },
]

export default createRoute(async (c) => {
  const user = c.get('user')!
  const permissions = c.get('permissions') ?? new Set<string>()
  const visibleCards = NAV_CARDS.filter((card) => !card.required || permissions.has(card.required))
  const userCount = db.select().from(schema.users).all().length
  const roleCount = db.select().from(schema.roles).all().length
  const permCount = db.select().from(schema.permissions).all().length

  return c.render(
    <div>
      <title>仪表盘 - RBAC</title>
      <PageHeader
        title="仪表盘"
        subtitle={
          <>
            欢迎回来，<strong>{user.name}</strong>
          </>
        }
        actions={
          <Badge variant="outline" className="hidden sm:inline-flex">
            {user.email}
          </Badge>
        }
      />

      <div class="stats shadow bg-base-100 w-full mb-6 stats-vertical sm:stats-horizontal">
        <div class="stat">
          <div class="stat-title">用户</div>
          <div class="stat-value">{userCount}</div>
          <div class="stat-desc text-base-content/50">全部账号</div>
        </div>
        <div class="stat">
          <div class="stat-title">角色</div>
          <div class="stat-value">{roleCount}</div>
          <div class="stat-desc text-base-content/50">权限分组</div>
        </div>
        <div class="stat">
          <div class="stat-title">权限</div>
          <div class="stat-value">{permCount}</div>
          <div class="stat-desc text-base-content/50">系统权限点</div>
        </div>
        <div class="stat">
          <div class="stat-title">我的权限</div>
          <div class="stat-value">{permissions.size}</div>
          <div class="stat-desc text-base-content/50">经角色获得</div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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
              你当前没有可管理的模块
            </div>
          </div>
        )}
      </div>

      <div class="card bg-base-100 shadow">
        <div class="card-body">
          <h2 class="card-title text-base mb-1">我的权限</h2>
          <div class="flex flex-wrap gap-2">
            {[...permissions.keys()].sort().map((p) => (
              <Badge key={p} variant="primary" mono>
                {p}
              </Badge>
            ))}
            {permissions.size === 0 && (
              <span class="text-sm text-base-content/50">（无权限）</span>
            )}
          </div>
        </div>
      </div>
    </div>,
  )
})
