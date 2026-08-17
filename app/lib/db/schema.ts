import { sqliteTable, text, integer, primaryKey, uniqueIndex, index } from 'drizzle-orm/sqlite-core'

/** 部门 / 组织单元（支持树形 parent_id，可映射为陪玩系统的「机构 / 工作室」） */
export const departments = (() => {
  const t = sqliteTable('departments', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    parentId: text('parent_id').references((): any => t.id, { onDelete: 'set null' }),
    order: integer('order').notNull().default(0),
  })
  return t
})()

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull().default('active'), // 'active' | 'disabled'
  departmentId: text('department_id').references(() => departments.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export const permissions = sqliteTable('permissions', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(), // resource:action，如 user:read
  description: text('description'),
  groupId: text('group_id').references(() => permissionGroups.id, { onDelete: 'set null' }),
})

/** 权限分组目录（支持树形 parent_id） */
export const permissionGroups = (() => {
  const t = sqliteTable('permission_groups', {
    id: text('id').primaryKey(),
    key: text('key').notNull().unique(), // 资源域标识，如 user / role / menu
    name: text('name').notNull(),
    description: text('description'),
    icon: text('icon').notNull().default('shield'),
    parentId: text('parent_id').references((): any => t.id, { onDelete: 'set null' }),
    order: integer('order').notNull().default(0),
  })
  return t
})()

export const userRoles = sqliteTable(
  'user_roles',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
)

export const rolePermissions = sqliteTable(
  'role_permissions',
  {
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: text('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
)

/** 角色继承关系（role 继承 parentRole 的全部权限，支持多层，需环检测） */
export const roleParents = sqliteTable(
  'role_parents',
  {
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    parentRoleId: text('parent_role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.parentRoleId] })],
)

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), // session token
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
})

/** 站内通知（通知中心消费；陪玩业务可用作「订单 / 提现」等事件通知） */
export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  body: text('body'),
  readAt: integer('read_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
})

/** 导航菜单（DB 驱动）：顶级行(parentId=null)=分组标题，子行=菜单项；删除分组级联清子项 */
export const menus = (() => {
  const t = sqliteTable(
    'menus',
    {
      id: text('id').primaryKey(),
      parentId: text('parent_id').references((): any => t.id, { onDelete: 'cascade' }),
      name: text('name').notNull(), // 分组名 或 菜单项名
      href: text('href'), // 分组行为 null
      icon: text('icon'), // IconName，可空
      requiredPermission: text('required_permission'), // null = 公开
      order: integer('order').notNull().default(0),
      status: text('status').notNull().default('active'), // 'active' | 'hidden'
      createdAt: integer('created_at', { mode: 'timestamp_ms' })
        .notNull()
        .$defaultFn(() => new Date()),
    },
    (table) => [
      uniqueIndex('menus_href_unique').on(table.href),
      index('menus_parent_order_idx').on(table.parentId, table.order),
    ],
  )
  return t
})()

export type User = typeof users.$inferSelect
export type Role = typeof roles.$inferSelect
export type Permission = typeof permissions.$inferSelect
export type PermissionGroup = typeof permissionGroups.$inferSelect
export type Session = typeof sessions.$inferSelect
export type Department = typeof departments.$inferSelect
export type RoleParent = typeof roleParents.$inferSelect
export type Notification = typeof notifications.$inferSelect
export type Menu = typeof menus.$inferSelect
