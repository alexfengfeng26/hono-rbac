import { randomUUID } from 'node:crypto'
import type { PermissionMap } from '../../lib/rbac/permissions'
import { eq, inArray } from 'drizzle-orm'
import { createRoute } from 'honox/factory'
import { requirePermission } from '../../lib/auth/guard'
import ConfirmButton from '../../islands/confirm-button'
import PermissionPicker from '../../islands/permission-picker'
import { Badge } from '../../components/badge'
import { EmptyState } from '../../components/empty-state'
import { Icon } from '../../components/icon'
import { FormField } from '../../components/form-field'
import { Modal, ModalActions, ModalOpenButton } from '../../components/modal'
import { PageHeader } from '../../components/page-header'
import { Pagination } from '../../components/pagination'
import { PERMISSION_GROUPS, getRoleClosure } from '../../lib/rbac/permissions'
import { db, schema } from '../../lib/db'
import type { Context } from 'hono'
import type { Permission, Role } from '../../lib/db/schema'

type Row = { role: Role; permissions: Permission[]; parentRoleIds: string[] }

const PAGE_SIZE = 12

type RolesExtra = {
  error?: string
  form?: { name?: string; description?: string }
  openCreate?: boolean
}

/** 组装角色列表视图（含搜索/分页），GET 与 POST 校验失败复用 */
function buildRolesView(c: Context, extra: RolesExtra = {}) {
  const perms = c.get('permissions') as PermissionMap
  const roles = db.select().from(schema.roles).orderBy(schema.roles.name).all()
  const q = String(c.req.query('q') ?? '').trim().toLowerCase()
  const requestedPage = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1)

  let rolesAll = db.select().from(schema.roles).orderBy(schema.roles.name).all()
  if (q) {
    rolesAll = rolesAll.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q),
    )
  }
  const total = rolesAll.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(requestedPage, totalPages)
  const pageRoles = rolesAll.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const rolePerms = db.select().from(schema.rolePermissions).all()
  const permissions = db.select().from(schema.permissions).all()
  // 权限选择器数据源：DB 全量权限（含 UI 自定义项）+ DB 分组目录（空库时回退内置常量）
  const pickerPermissions = permissions
    .map((p) => ({ name: p.name, description: p.description ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const dbGroups = db.select().from(schema.permissionGroups).all()
  const pickerGroups = dbGroups.length
    ? dbGroups.map((g) => ({ key: g.key, name: g.name, icon: g.icon }))
    : PERMISSION_GROUPS.map((g) => ({ key: g.key, name: g.name, icon: g.icon }))
  const userRoles = db.select().from(schema.userRoles).all()
  const permById = new Map(permissions.map((p) => [p.id, p]))
  const roleParentRows = db.select().from(schema.roleParents).all()
  const parentsByRole = new Map<string, string[]>()
  for (const rp of roleParentRows) {
    const arr = parentsByRole.get(rp.roleId) ?? []
    arr.push(rp.parentRoleId)
    parentsByRole.set(rp.roleId, arr)
  }
  const rows: Row[] = pageRoles.map((role) => ({
    role,
    parentRoleIds: parentsByRole.get(role.id) ?? [],
    permissions: rolePerms
      .filter((rp) => rp.roleId === role.id)
      .map((rp) => permById.get(rp.permissionId))
      .filter((p): p is Permission => p !== undefined),
  }))
  const usersCount = new Map<string, number>()
  for (const ur of userRoles) {
    usersCount.set(ur.roleId, (usersCount.get(ur.roleId) ?? 0) + 1)
  }

  const buildHref = (p: number) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    params.set('page', String(p))
    return `/admin/roles?${params.toString()}`
  }

  return (
    <RolesPage
      perms={perms}
      rows={rows}
      roles={roles}
      usersCount={usersCount}
      pickerPermissions={pickerPermissions}
      pickerGroups={pickerGroups}
      q={q}
      page={page}
      totalPages={totalPages}
      total={total}
      buildHref={buildHref}
      error={extra.error}
      form={extra.form}
      openCreate={extra.openCreate}
    />
  )
}

function RolesPage({
  perms,
  rows,
  roles,
  usersCount,
  pickerPermissions,
  pickerGroups,
  q = '',
  page = 1,
  totalPages = 1,
  total = 0,
  buildHref,
  error,
  form,
  openCreate = false,
}: {
  perms: PermissionMap
  rows: Row[]
  roles: Role[]
  usersCount: Map<string, number>
  pickerPermissions: { name: string; description: string }[]
  pickerGroups: { key: string; name: string; icon: string }[]
  q?: string
  page?: number
  totalPages?: number
  total?: number
  buildHref?: (p: number) => string
  error?: string
  form?: { name?: string; description?: string }
  openCreate?: boolean
}) {
  const roleNameById = new Map(roles.map((r) => [r.id, r.name]))
  return (
    <div>
      <title>角色管理 - RBAC</title>
      <PageHeader
        title="角色管理"
        subtitle={q ? `共 ${total} 个匹配角色` : `共 ${total} 个角色`}
        actions={
          perms.has('role:create') && (
            <ModalOpenButton id="create-role-modal">创建角色</ModalOpenButton>
          )
        }
      />

      {/* 搜索 */}
      <form method="get" action="/admin/roles" class="flex flex-wrap items-end gap-3 mb-4">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-base-content/60">搜索</label>
          <input
            type="search"
            name="q"
            value={q}
            placeholder="角色名或描述"
            class="input input-sm w-64"
            aria-label="搜索角色"
          />
        </div>
        <button type="submit" class="btn btn-sm btn-outline">
          搜索
        </button>
        {q && (
          <a href="/admin/roles" class="btn btn-sm btn-ghost">
            清除
          </a>
        )}
      </form>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rows.map(({ role, permissions: rolePerms, parentRoleIds }) => (
          <div key={role.id} class="card bg-base-100 shadow hover:border-primary/40 transition-colors">
            <div class="card-body gap-4 flex flex-col">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <h2 class="card-title text-base">{role.name}</h2>
                  {role.description && (
                    <p class="text-sm text-base-content/60 mt-1">{role.description}</p>
                  )}
                </div>
                <Badge variant="outline" className="shrink-0">
                  {usersCount.get(role.id) ?? 0} 个用户
                </Badge>
              </div>
              <div class="flex flex-wrap gap-1.5">
                {rolePerms.map((p) => (
                  <Badge key={p.id} variant="outline" mono>
                    {p.name}
                  </Badge>
                ))}
                {rolePerms.length === 0 && (
                  <span class="text-xs text-base-content/40">（无权限）</span>
                )}
              </div>
              {parentRoleIds.length > 0 && (
                <div class="text-xs text-base-content/50 flex items-center gap-1">
                  <Icon name="git-branch" className="w-3.5 h-3.5" />
                  继承：{parentRoleIds.map((id) => roleNameById.get(id) ?? id).join('、')}
                </div>
              )}
              <div class="card-actions justify-end border-t border-base-200 pt-3 mt-auto">
                {perms.has('role:update') && (
                  <ModalOpenButton id={`edit-${role.id}`} className="btn btn-ghost btn-sm">
                    编辑
                  </ModalOpenButton>
                )}
                {perms.has('role:delete') && (
                  <ConfirmButton
                    message={`确定删除角色 ${role.name}？删除后不可恢复。`}
                    action="/admin/roles"
                    fields={{ intent: 'delete', roleId: role.id }}
                  />
                )}
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div class="md:col-span-2">
            <EmptyState
              icon="roles"
              title={q ? '没有匹配的角色' : '还没有角色'}
              description="创建第一个角色并为其分配权限。"
              cta={
                perms.has('role:create') && (
                  <ModalOpenButton id="create-role-modal" className="btn btn-sm btn-primary">
                    创建角色
                  </ModalOpenButton>
                )
              }
            />
          </div>
        )}
      </div>

      {buildHref && <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />}

      {/* 创建角色 modal */}
      <Modal id="create-role-modal" title="创建角色" open={openCreate} boxClass="max-w-3xl">
        <form method="post" action="/admin/roles" class="fieldset gap-3">
          <input type="hidden" name="intent" value="create" />
          {error && (
            <div role="alert" class="alert alert-error alert-sm text-sm">
              {error}
            </div>
          )}
          <FormField
            label="角色名"
            name="name"
            required
            placeholder="如 operator"
            value={form?.name}
          />
          <FormField
            label="描述（可选）"
            name="description"
            placeholder="简要说明角色用途"
            value={form?.description}
          />
          <fieldset class="fieldset mt-1">
            <legend class="fieldset-legend">继承角色（自动获得父角色的权限）</legend>
            <div class="flex flex-wrap gap-4">
              {roles.map((r) => (
                <label class="flex items-center gap-2 text-sm" key={r.id}>
                  <input type="checkbox" name="parentRoles" value={r.id} class="checkbox checkbox-sm" />
                  {r.name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset class="fieldset mt-1">
            <legend class="fieldset-legend">权限</legend>
            <PermissionPicker
              permissions={pickerPermissions}
              groups={pickerGroups}
              selected={[]}
              name="permissions"
            />
          </fieldset>
          <ModalActions cancelId="create-role-modal" submitLabel="创建角色" />
        </form>
      </Modal>

      {/* 编辑角色 modal（每角色一个）：名称/描述 + 权限 */}
      {perms.has('role:update') &&
        rows.map(({ role, permissions: rolePerms, parentRoleIds }) => (
          <Modal
            key={role.id}
            id={`edit-${role.id}`}
            boxClass="max-w-3xl"
            title={
              <span>
                编辑角色{' '}
                <span class="text-sm font-normal text-base-content/60">{role.name}</span>
              </span>
            }
          >
            <form method="post" action="/admin/roles" class="fieldset gap-3">
              <input type="hidden" name="intent" value="update" />
              <input type="hidden" name="roleId" value={role.id} />
              <FormField
                label="角色名"
                name="name"
                required
                placeholder="如 operator"
                value={role.name}
              />
              <FormField
                label="描述（可选）"
                name="description"
                placeholder="简要说明角色用途"
                value={role.description ?? ''}
              />
              <fieldset class="fieldset mt-1">
                <legend class="fieldset-legend">继承角色（自动获得父角色的权限）</legend>
                <div class="flex flex-wrap gap-4">
                  {roles
                    .filter((r) => r.id !== role.id)
                    .map((r) => (
                      <label class="flex items-center gap-2 text-sm" key={r.id}>
                        <input
                          type="checkbox"
                          name="parentRoles"
                          value={r.id}
                          defaultChecked={parentRoleIds.includes(r.id)}
                          class="checkbox checkbox-sm"
                        />
                        {r.name}
                      </label>
                    ))}
                </div>
              </fieldset>
              <fieldset class="fieldset mt-1">
                <legend class="fieldset-legend">权限</legend>
                <PermissionPicker
                  permissions={pickerPermissions}
                  groups={pickerGroups}
                  selected={rolePerms.map((p) => p.name)}
                  name="permissions"
                />
              </fieldset>
              <ModalActions cancelId={`edit-${role.id}`} submitLabel="保存" />
            </form>
          </Modal>
        ))}
    </div>
  )
}

export default createRoute(requirePermission('role:read'), async (c) => {
  return c.render(buildRolesView(c))
})

export const POST = createRoute(async (c) => {
  const perms = c.get('permissions') ?? new Set<string>()
  const body = await c.req.parseBody({ all: true })
  const action = String(body.intent ?? '')
  const permissionNames = body.permissions
    ? Array.isArray(body.permissions)
      ? body.permissions.map(String)
      : [String(body.permissions)]
    : []
  const parentRoles = body.parentRoles
    ? Array.isArray(body.parentRoles)
      ? body.parentRoles.map(String)
      : [String(body.parentRoles)]
    : []
  const existingRoleIds = new Set(
    db.select({ id: schema.roles.id }).from(schema.roles).all().map((r) => r.id),
  )

  if (action === 'create') {
    if (!perms.has('role:create')) return c.text('403 Forbidden', 403)
    const rawName = String(body.name ?? '')
    const name = rawName.trim()
    const rawDescription = String(body.description ?? '')
    const description = rawDescription.trim() || null
    const formValues = { name: rawName, description: rawDescription }
    if (!name) {
      return c.render(
        buildRolesView(c, { error: '角色名不能为空', form: formValues, openCreate: true }),
      )
    }
    if (db.select().from(schema.roles).where(eq(schema.roles.name, name)).get()) {
      return c.render(
        buildRolesView(c, { error: '该角色名已存在', form: formValues, openCreate: true }),
      )
    }
    const id = randomUUID()
    db.insert(schema.roles).values({ id, name, description }).run()
    const safeParents = parentRoles.filter((pr) => pr && pr !== id && existingRoleIds.has(pr))
    db.transaction((tx) => {
      if (permissionNames.length) {
        const permRows = tx
          .select()
          .from(schema.permissions)
          .where(inArray(schema.permissions.name, permissionNames))
          .all()
        tx.insert(schema.rolePermissions)
          .values(permRows.map((p) => ({ roleId: id, permissionId: p.id })))
          .run()
      }
      for (const pr of safeParents) {
        tx.insert(schema.roleParents).values({ roleId: id, parentRoleId: pr }).run()
      }
    })
    return c.redirect('/admin/roles?flash=success:角色已创建')
  }

  if (action === 'update') {
    if (!perms.has('role:update')) return c.text('403 Forbidden', 403)
    const roleId = String(body.roleId ?? '')
    const role = db.select().from(schema.roles).where(eq(schema.roles.id, roleId)).get()
    if (!role) return c.text('角色不存在', 404)
    const rawName = String(body.name ?? '')
    const name = rawName.trim()
    const description = String(body.description ?? '').trim() || null
    if (!name) return c.redirect('/admin/roles?flash=error:角色名不能为空')
    // 内置 admin 角色禁止改名（防锁死逻辑按名字 'admin' 定位管理员角色）
    if (role.name === 'admin' && name !== 'admin') {
      return c.redirect('/admin/roles?flash=error:内置 admin 角色不可改名')
    }
    const nameClash = db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, name))
      .get()
    if (nameClash && nameClash.id !== roleId) {
      return c.redirect('/admin/roles?flash=error:该角色名已存在')
    }
    db.update(schema.roles).set({ name, description }).where(eq(schema.roles.id, roleId)).run()
    // 环检测：pr 的祖先闭包（含自身）若包含 roleId，则 roleId 是 pr 的后代，继承会成环
    const safeParents = parentRoles.filter(
      (pr) => pr && pr !== roleId && existingRoleIds.has(pr) && !getRoleClosure(pr).has(roleId),
    )
    db.transaction((tx) => {
      tx.delete(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, roleId)).run()
      if (permissionNames.length) {
        const permRows = tx
          .select()
          .from(schema.permissions)
          .where(inArray(schema.permissions.name, permissionNames))
          .all()
        tx.insert(schema.rolePermissions)
          .values(permRows.map((p) => ({ roleId, permissionId: p.id })))
          .run()
      }
      tx.delete(schema.roleParents).where(eq(schema.roleParents.roleId, roleId)).run()
      for (const pr of safeParents) {
        tx.insert(schema.roleParents).values({ roleId, parentRoleId: pr }).run()
      }
    })
    return c.redirect('/admin/roles?flash=success:角色已更新')
  }

  if (action === 'delete') {
    if (!perms.has('role:delete')) return c.text('403 Forbidden', 403)
    const roleId = String(body.roleId ?? '')
    const role = db.select().from(schema.roles).where(eq(schema.roles.id, roleId)).get()
    if (!role) return c.text('角色不存在', 404)
    if (role.name === 'admin') {
      return c.redirect('/admin/roles?flash=error:内置 admin 角色不可删除')
    }
    const refs = db
      .select()
      .from(schema.userRoles)
      .where(eq(schema.userRoles.roleId, roleId))
      .all()
    if (refs.length) {
      return c.redirect('/admin/roles?flash=error:该角色仍被用户引用，无法删除')
    }
    db.delete(schema.roles).where(eq(schema.roles.id, roleId)).run()
    return c.redirect('/admin/roles?flash=success:角色已删除')
  }

  return c.text('未知操作', 400)
})
