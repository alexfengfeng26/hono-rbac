import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { db, schema } from '../db'

export const PERMISSIONS = [
  { name: 'user:read', description: '查看用户列表与详情' },
  { name: 'user:create', description: '创建用户' },
  { name: 'user:update', description: '为用户分配/移除角色' },
  { name: 'user:delete', description: '删除用户' },
  { name: 'role:read', description: '查看角色列表与权限' },
  { name: 'role:create', description: '创建角色' },
  { name: 'role:update', description: '编辑角色的权限' },
  { name: 'role:delete', description: '删除角色' },
  { name: 'org:department:manage', description: '管理部门与组织单元' },
  { name: 'menu:manage', description: '管理导航菜单' },
] as const

/**
 * 用户的权限视图：权限名集合。
 * 集合中存在某权限名 = 拥有该动作权限（Set.has 语义）。
 */
export type PermissionMap = Set<string>

export type PermissionName = (typeof PERMISSIONS)[number]['name']

/**
 * 权限分组目录（支持树形 parentKey）。
 * key 同时作为权限 resource 前缀的映射（如 user:* → user 分组）。
 */
export type PermissionGroupMeta = {
  key: string
  name: string
  description: string
  icon: string
  order: number
  parentKey?: string
}

export const PERMISSION_GROUPS: PermissionGroupMeta[] = [
  { key: 'iam', name: '身份与访问', description: '用户、角色与权限的统一管理域', icon: 'shield', order: 0 },
  { key: 'user', name: '用户管理', description: '用户账户的查看与维护', icon: 'users', order: 1, parentKey: 'iam' },
  { key: 'role', name: '角色管理', description: '角色及其权限分配', icon: 'roles', order: 2, parentKey: 'iam' },
  { key: 'permission', name: '权限管理', description: '权限点的定义与维护', icon: 'key', order: 3, parentKey: 'iam' },
  { key: 'org', name: '组织管理', description: '部门与组织单元', icon: 'building', order: 4 },
  { key: 'menu', name: '菜单管理', description: '导航菜单与入口配置', icon: 'menu', order: 5 },
]

/**
 * 幂等注册单个权限点：已存在则跳过，不存在则写入。
 * 让内置权限在系统启动 / 重置后始终可用，同时不会清掉 UI 新增的权限。
 */
export function ensurePermission(name: string, description: string): string {
  const existing = db
    .select()
    .from(schema.permissions)
    .where(eq(schema.permissions.name, name))
    .get()
  if (existing) return existing.id
  const id = randomUUID()
  db.insert(schema.permissions).values({ id, name, description }).run()
  return id
}

/** 幂等注册单个权限分组（含树父节点解析） */
export function ensurePermissionGroup(g: PermissionGroupMeta): string {
  const existing = db
    .select()
    .from(schema.permissionGroups)
    .where(eq(schema.permissionGroups.key, g.key))
    .get()
  if (existing) return existing.id
  const parentId = g.parentKey
    ? (db
        .select()
        .from(schema.permissionGroups)
        .where(eq(schema.permissionGroups.key, g.parentKey))
        .get()?.id ?? null)
    : null
  const id = randomUUID()
  db.insert(schema.permissionGroups)
    .values({ id, key: g.key, name: g.name, description: g.description, icon: g.icon, parentId, order: g.order })
    .run()
  return id
}

/** 启动时保证全部内置权限已注册（幂等） */
export function ensureBuiltinPermissions(): void {
  for (const p of PERMISSIONS) ensurePermission(p.name, p.description)
}

/**
 * 把内置权限回填到内置角色，解决「新增权限后，旧库里已有角色未挂上」的问题。
 * - admin 角色：补全全部权限，保证管理员始终拥有系统全部能力。
 * - user  角色：保持「基线非特权」角色（仅 user:read / role:read 只读）。
 * 幂等：已存在的关系跳过，重复启动不会重复写入。
 */
export function ensureBuiltinRolePermissions(): void {
  const adminRole = db.select().from(schema.roles).where(eq(schema.roles.name, 'admin')).get()
  if (adminRole) {
    const owned = new Set(
      db
        .select({ pid: schema.rolePermissions.permissionId })
        .from(schema.rolePermissions)
        .where(eq(schema.rolePermissions.roleId, adminRole.id))
        .all()
        .map((r) => r.pid),
    )
    const missing = db
      .select()
      .from(schema.permissions)
      .all()
      .filter((p) => !owned.has(p.id))
    if (missing.length) {
      db.insert(schema.rolePermissions)
        .values(missing.map((p) => ({ roleId: adminRole.id, permissionId: p.id })))
        .run()
    }
  }
}

/** 启动时保证全部内置权限分组已注册（父节点优先，幂等） */
export function ensureBuiltinPermissionGroups(): void {
  for (const g of [...PERMISSION_GROUPS].sort((a, b) => (a.parentKey ? 1 : 0) - (b.parentKey ? 1 : 0))) {
    ensurePermissionGroup(g)
  }
}

/** 内置部门 / 组织单元（树形，表示 总公司 → 大区 → 团队；陪玩系统可映射为机构层级） */
export const DEPARTMENTS: { name: string; parentName?: string; order: number }[] = [
  { name: '总公司', order: 0 },
  { name: '华东区', parentName: '总公司', order: 1 },
  { name: '华东团队A', parentName: '华东区', order: 2 },
  { name: '华北区', parentName: '总公司', order: 1 },
]

/** 启动时保证内置部门已注册（父节点优先，幂等） */
export function ensureBuiltinDepartments(): void {
  for (const d of DEPARTMENTS) {
    const existing = db
      .select()
      .from(schema.departments)
      .where(eq(schema.departments.name, d.name))
      .get()
    if (existing) continue
    const parentId = d.parentName
      ? db
          .select()
          .from(schema.departments)
          .where(eq(schema.departments.name, d.parentName))
          .get()?.id ?? null
      : null
    db.insert(schema.departments)
      .values({ id: randomUUID(), name: d.name, parentId, order: d.order })
      .run()
  }
}

/** 按 resource 前缀把权限回填到对应分组（幂等，仅补全 group_id 为空者） */
export function backfillPermissionGroups(): void {
  const groups = db.select().from(schema.permissionGroups).all()
  const byKey = new Map(groups.map((g) => [g.key, g.id]))
  for (const p of db.select().from(schema.permissions).all()) {
    if (p.groupId) continue
    const resource = p.name.split(':')[0] || 'other'
    const gid = byKey.get(resource)
    if (gid) {
      db.update(schema.permissions).set({ groupId: gid }).where(eq(schema.permissions.id, p.id)).run()
    }
  }
}

/** 校验权限名格式：resource:action（支持多级，如 org:department:manage），仅含小写字母/数字/下划线/连字符 */
export function validatePermissionName(name: string): string | null {
  const trimmed = name.trim().toLowerCase()
  if (!trimmed) return '权限名不能为空'
  if (!/^[a-z0-9_-]+(:[a-z0-9_-]+)+$/.test(trimmed)) {
    return '权限名格式应为 resource:action（如 report:read）'
  }
  return null
}

/** 取角色的全部祖先（含自身），带环检测；用于角色继承展开 */
export function getRoleClosure(roleId: string): Set<string> {
  const closure = new Set<string>()
  const stack = [roleId]
  while (stack.length) {
    const id = stack.pop() as string
    if (closure.has(id)) continue
    closure.add(id)
    const parents = db
      .select({ parentId: schema.roleParents.parentRoleId })
      .from(schema.roleParents)
      .where(eq(schema.roleParents.roleId, id))
      .all()
    for (const p of parents) stack.push(p.parentId)
  }
  return closure
}

/**
 * 核心：按「直接挂载的角色 id 列表」计算权限（含角色继承闭包）。
 * 返回权限名集合（功能权限），不再有行级 scope 维度。
 */
export function getPermissionsForRoles(roleIds: string[]): PermissionMap {
  const closure = new Set<string>()
  for (const roleId of roleIds) {
    for (const cid of getRoleClosure(roleId)) closure.add(cid)
  }
  const rows = db
    .select({
      permissionName: schema.permissions.name,
    })
    .from(schema.rolePermissions)
    .innerJoin(
      schema.permissions,
      eq(schema.permissions.id, schema.rolePermissions.permissionId),
    )
    .where(inArray(schema.rolePermissions.roleId, [...closure]))
    .all()
  const set = new Set<string>()
  for (const row of rows) set.add(row.permissionName)
  return set
}

/**
 * 查询某用户经（含继承）角色拥有的权限，返回权限名集合（功能权限）。
 */
export async function getPermissionsForUser(
  userId: string,
): Promise<PermissionMap> {
  const roleIds = db
    .select({ roleId: schema.userRoles.roleId })
    .from(schema.userRoles)
    .where(eq(schema.userRoles.userId, userId))
    .all()
    .map((r) => r.roleId)
  return getPermissionsForRoles(roleIds)
}
