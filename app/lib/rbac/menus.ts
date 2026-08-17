import { randomUUID } from 'node:crypto'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { db, schema } from '../db'
import type { Menu } from '../db/schema'
import type { IconName } from '../../components/icon'
import type { PermissionMap } from './permissions'

/** 侧栏渲染节点：分组标题 + 可见子项 */
export type MenuItemNode = {
  id: string
  name: string
  href: string
  icon: IconName
  requiredPermission: string | null
}
export type MenuNode = { id: string; name: string; icon: IconName | null; children: MenuItemNode[] }

/** 全部菜单行（不过滤，管理页用） */
export function loadAllMenus(): Menu[] {
  return db.select().from(schema.menus).orderBy(asc(schema.menus.parentId), asc(schema.menus.order)).all()
}

/**
 * 按当前用户权限加载菜单树：
 * - 跳过 status='hidden' 与 requiredPermission 未授权的子项
 * - 空分组（无可见子项）不返回
 */
export function loadMenuTree(perms: PermissionMap): MenuNode[] {
  const all = db.select().from(schema.menus).all()
  const childrenOf = new Map<string, Menu[]>()
  const groups: Menu[] = []
  for (const m of all) {
    if (m.parentId) {
      if (!childrenOf.has(m.parentId)) childrenOf.set(m.parentId, [])
      childrenOf.get(m.parentId)!.push(m)
    } else {
      groups.push(m)
    }
  }
  groups.sort((a, b) => a.order - b.order)
  const nodes: MenuNode[] = []
  for (const g of groups) {
    if (g.status !== 'active') continue
    const kids = (childrenOf.get(g.id) ?? [])
      .filter((k) => k.status === 'active' && (!k.requiredPermission || perms.has(k.requiredPermission)))
      .sort((a, b) => a.order - b.order)
      .map(
        (k): MenuItemNode => ({
          id: k.id,
          name: k.name,
          href: k.href ?? '',
          icon: (k.icon ?? 'menu') as IconName,
          requiredPermission: k.requiredPermission,
        }),
      )
    if (!kids.length) continue
    nodes.push({ id: g.id, name: g.name, icon: (g.icon ?? null) as IconName | null, children: kids })
  }
  return nodes
}

/** 拍平菜单树为菜单项列表（命令面板 / 面包屑用） */
export function flattenMenuTree(tree: MenuNode[]): MenuItemNode[] {
  return tree.flatMap((g) => g.children)
}

const MENU_SEED: {
  group: string
  groupOrder: number
  items: { name: string; href: string; icon: IconName; requiredPermission?: string }[]
}[] = [
  {
    group: '总览',
    groupOrder: 0,
    items: [
      { name: '工作台', href: '/', icon: 'dashboard' },
      { name: '仪表盘', href: '/admin', icon: 'panel' },
    ],
  },
  {
    group: '管理',
    groupOrder: 1,
    items: [
      { name: '用户管理', href: '/admin/users', icon: 'users', requiredPermission: 'user:read' },
      { name: '角色管理', href: '/admin/roles', icon: 'roles', requiredPermission: 'role:read' },
      { name: '权限列表', href: '/admin/permissions', icon: 'permissions', requiredPermission: 'role:read' },
      { name: '部门管理', href: '/admin/departments', icon: 'building', requiredPermission: 'org:department:manage' },
      { name: '菜单管理', href: '/admin/menus', icon: 'menu', requiredPermission: 'menu:manage' },
    ],
  },
]

/**
 * 幂等种子：分组按 (parentId=null + name) 查重，菜单项按 href 查重。
 * 与其它 ensure* 一致：不会清掉 UI 新增项，被删除的内置项会恢复。
 */
export function ensureBuiltinMenus(): void {
  for (const g of MENU_SEED) {
    let group = db
      .select()
      .from(schema.menus)
      .where(and(isNull(schema.menus.parentId), eq(schema.menus.name, g.group)))
      .get()
    if (!group) {
      const id = randomUUID()
      db.insert(schema.menus)
        .values({ id, name: g.group, order: g.groupOrder, status: 'active' })
        .run()
      group = db.select().from(schema.menus).where(eq(schema.menus.id, id)).get()!
    }
    g.items.forEach((item, idx) => {
      const existing = db.select().from(schema.menus).where(eq(schema.menus.href, item.href)).get()
      if (existing) return
      db.insert(schema.menus)
        .values({
          id: randomUUID(),
          parentId: group!.id,
          name: item.name,
          href: item.href,
          icon: item.icon,
          requiredPermission: item.requiredPermission ?? null,
          order: idx,
          status: 'active',
        })
        .run()
    })
  }
}
