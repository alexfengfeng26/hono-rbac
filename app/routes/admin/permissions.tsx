import { randomUUID } from 'node:crypto'
import type { PermissionMap } from '../../lib/rbac/permissions'
import { eq } from 'drizzle-orm'
import { createRoute } from 'honox/factory'
import { requirePermission } from '../../lib/auth/guard'
import ConfirmButton from '../../islands/confirm-button'
import { Icon } from '../../components/icon'
import { Badge } from '../../components/badge'
import { EmptyState } from '../../components/empty-state'
import { FormField } from '../../components/form-field'
import { Modal, ModalActions, ModalOpenButton } from '../../components/modal'
import { PageHeader } from '../../components/page-header'
import { validatePermissionName } from '../../lib/rbac/permissions'
import { db, schema } from '../../lib/db'
import type { Context } from 'hono'
import type { Permission, PermissionGroup } from '../../lib/db/schema'

type PermsExtra = {
  error?: string
  form?: { name?: string; description?: string; groupId?: string }
  openCreate?: boolean
}

function buildPermsView(c: Context, extra: PermsExtra = {}) {
  const perms = c.get('permissions') as PermissionMap
  const q = String(c.req.query('q') ?? '').trim().toLowerCase()

  let permsAll = db.select().from(schema.permissions).orderBy(schema.permissions.name).all()
  if (q) {
    permsAll = permsAll.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q),
    )
  }

  const allGroups = db.select().from(schema.permissionGroups).orderBy(schema.permissionGroups.order).all()
  const childrenOf = new Map<string | null, PermissionGroup[]>()
  for (const g of allGroups) {
    const k = g.parentId ?? null
    if (!childrenOf.has(k)) childrenOf.set(k, [])
    childrenOf.get(k)!.push(g)
  }
  const leafGroups = allGroups.filter((g) => !childrenOf.has(g.id))

  const permsByGroup = new Map<string, Permission[]>()
  const ungrouped: Permission[] = []
  for (const p of permsAll) {
    if (p.groupId && permsByGroup.has(p.groupId)) permsByGroup.get(p.groupId)!.push(p)
    else if (p.groupId) permsByGroup.set(p.groupId, [p])
    else ungrouped.push(p)
  }

  const rolePerms = db.select().from(schema.rolePermissions).all()
  const roles = db.select().from(schema.roles).all()
  const roleById = new Map(roles.map((r) => [r.id, r.name]))
  const permRefCount = new Map<string, number>()
  for (const rp of rolePerms) {
    permRefCount.set(rp.permissionId, (permRefCount.get(rp.permissionId) ?? 0) + 1)
  }

  const subtreeCount = (g: PermissionGroup): number => {
    const direct = permsByGroup.get(g.id)?.length ?? 0
    const children = (childrenOf.get(g.id) ?? []).reduce((sum, child) => sum + subtreeCount(child), 0)
    return direct + children
  }
  const hasPerms = (g: PermissionGroup): boolean => subtreeCount(g) > 0

  return (
    <PermsPage
      perms={perms}
      allGroups={allGroups}
      childrenOf={childrenOf}
      leafGroups={leafGroups}
      permsByGroup={permsByGroup}
      ungrouped={ungrouped}
      rolePerms={rolePerms}
      roleById={roleById}
      permRefCount={permRefCount}
      hasPerms={hasPerms}
      q={q}
      total={permsAll.length}
      error={extra.error}
      form={extra.form}
      openCreate={extra.openCreate}
    />
  )
}

function PermTable({
  rows,
  rolePerms,
  roleById,
  permRefCount,
  canWrite,
  canDelete,
}: {
  rows: Permission[]
  rolePerms: typeof schema.rolePermissions.$inferSelect[]
  roleById: Map<string, string>
  permRefCount: Map<string, number>
  canWrite: boolean
  canDelete: boolean
}) {
  if (rows.length === 0) return null
  return (
    <div class="card bg-base-100 shadow overflow-x-auto">
      <table class="table">
        <thead>
          <tr class="text-base-content/60">
            <th>权限名</th>
            <th>描述</th>
            <th>拥有该权限的角色</th>
            <th class="text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const roleNames = rolePerms
              .filter((rp) => rp.permissionId === p.id)
              .map((rp) => roleById.get(rp.roleId))
              .filter((n): n is string => n !== undefined)
            const refCount = permRefCount.get(p.id) ?? 0
            return (
              <tr key={p.id}>
                <td class="font-mono text-primary">{p.name}</td>
                <td class="text-base-content/70">{p.description}</td>
                <td>
                  <div class="flex flex-wrap gap-1.5">
                    {roleNames.map((n) => (
                      <Badge key={n} variant="neutral">
                        {n}
                      </Badge>
                    ))}
                    {roleNames.length === 0 && (
                      <span class="text-xs text-base-content/40">（未分配）</span>
                    )}
                  </div>
                </td>
                <td class="text-right">
                  <div class="flex justify-end gap-2">
                    {canWrite && (
                      <ModalOpenButton id={`edit-${p.id}`} className="btn btn-ghost btn-xs">
                        编辑
                      </ModalOpenButton>
                    )}
                    {canDelete && (
                      <ConfirmButton
                        message={`确定删除权限 ${p.name}？${
                          refCount ? `仍有 ${refCount} 个角色引用它，需先解绑。` : ''
                        }`}
                        action="/admin/permissions"
                        fields={{ intent: 'delete', permissionId: p.id }}
                      />
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PermsPage({
  perms,
  allGroups,
  childrenOf,
  leafGroups,
  permsByGroup,
  ungrouped,
  rolePerms,
  roleById,
  permRefCount,
  hasPerms,
  q = '',
  total = 0,
  error,
  form,
  openCreate = false,
}: {
  perms: PermissionMap
  allGroups: PermissionGroup[]
  childrenOf: Map<string | null, PermissionGroup[]>
  leafGroups: PermissionGroup[]
  permsByGroup: Map<string, Permission[]>
  ungrouped: Permission[]
  rolePerms: typeof schema.rolePermissions.$inferSelect[]
  roleById: Map<string, string>
  permRefCount: Map<string, number>
  hasPerms: (g: PermissionGroup) => boolean
  q?: string
  total?: number
  error?: string
  form?: { name?: string; description?: string; groupId?: string }
  openCreate?: boolean
}) {
  const canWrite = perms.has('role:update')
  const canDelete = perms.has('role:delete')
  const topGroups = allGroups.filter((g) => !g.parentId)
  const anyPerms = total > 0

  return (
    <div>
      <title>权限列表 - RBAC</title>
      <PageHeader
        title="权限列表"
        subtitle={q ? `共 ${total} 个匹配权限点` : `共 ${total} 个权限点`}
        actions={canWrite && <ModalOpenButton id="create-perm-modal">新建权限</ModalOpenButton>}
      />

      {/* 搜索 */}
      <form method="get" action="/admin/permissions" class="flex flex-wrap items-end gap-3 mb-4">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-base-content/60">搜索</label>
          <input
            type="search"
            name="q"
            value={q}
            placeholder="权限名或描述"
            class="input input-sm w-64"
            aria-label="搜索权限"
          />
        </div>
        <button type="submit" class="btn btn-sm btn-outline">
          搜索
        </button>
        {q && (
          <a href="/admin/permissions" class="btn btn-sm btn-ghost">
            清除
          </a>
        )}
      </form>

      {!anyPerms && (
        <EmptyState
          icon="permissions"
          title={q ? '没有匹配的权限' : '暂无权限'}
          description="创建权限点后可分配给角色。"
          cta={
            canWrite && (
              <ModalOpenButton id="create-perm-modal" className="btn btn-sm btn-primary">
                新建权限
              </ModalOpenButton>
            )
          }
        />
      )}

      {anyPerms && (
        <div class="flex flex-col gap-4">
          {/* 分组树（顶层容器 → 子分组 → 权限表） */}
          {topGroups.filter(hasPerms).map((g) => (
            <details open class="border border-base-300/70 rounded-box overflow-hidden">
              <summary class="cursor-pointer select-none px-4 py-3 bg-base-200/50 flex items-center gap-2 text-sm font-medium">
                <Icon name={(g.icon as any) ?? 'shield'} className="w-4 h-4 text-primary" />
                <span>{g.name}</span>
                <Badge variant="outline">{countSubtree(g, permsByGroup, childrenOf)}</Badge>
              </summary>
              <div class="flex flex-col gap-3 p-3">
                {permsByGroup.get(g.id) && (
                  <PermTable
                    rows={permsByGroup.get(g.id)!}
                    rolePerms={rolePerms}
                    roleById={roleById}
                    permRefCount={permRefCount}
                    canWrite={canWrite}
                    canDelete={canDelete}
                  />
                )}
                {(childrenOf.get(g.id) ?? [])
                  .filter(hasPerms)
                  .map((child) => (
                    <div class="flex flex-col gap-2 pl-2 border-l-2 border-base-300">
                      <div class="flex items-center gap-2 text-sm font-medium">
                        <Icon name={(child.icon as any) ?? 'shield'} className="w-4 h-4 text-primary" />
                        <span>{child.name}</span>
                        <Badge variant="outline">{permsByGroup.get(child.id)?.length ?? 0}</Badge>
                      </div>
                      <PermTable
                        rows={permsByGroup.get(child.id) ?? []}
                        rolePerms={rolePerms}
                        roleById={roleById}
                        permRefCount={permRefCount}
                        canWrite={canWrite}
                        canDelete={canDelete}
                      />
                    </div>
                  ))}
              </div>
            </details>
          ))}

          {/* 未分组兜底 */}
          {ungrouped.length > 0 && (
            <details open class="border border-base-300/70 rounded-box overflow-hidden">
              <summary class="cursor-pointer select-none px-4 py-3 bg-base-200/50 flex items-center gap-2 text-sm font-medium">
                <Icon name="filter" className="w-4 h-4 text-base-content/60" />
                <span>未分组</span>
                <Badge variant="outline">{ungrouped.length}</Badge>
              </summary>
              <div class="p-3">
                <PermTable
                  rows={ungrouped}
                  rolePerms={rolePerms}
                  roleById={roleById}
                  permRefCount={permRefCount}
                  canWrite={canWrite}
                  canDelete={canDelete}
                />
              </div>
            </details>
          )}
        </div>
      )}

      {/* 新建权限 modal */}
      <Modal id="create-perm-modal" title="新建权限" open={openCreate}>
        <form method="post" action="/admin/permissions" class="fieldset gap-3">
          <input type="hidden" name="intent" value="create" />
          {error && (
            <div role="alert" class="alert alert-error alert-sm text-sm">
              {error}
            </div>
          )}
          <FormField
            label="权限名"
            name="name"
            required
            placeholder="如 report:read"
            value={form?.name}
          />
          <FormField
            label="描述"
            name="description"
            placeholder="简要说明该权限用途"
            value={form?.description}
          />
          <fieldset class="fieldset">
            <legend class="fieldset-legend">分组</legend>
            <select name="groupId" class="select select-sm w-full" defaultValue={form?.groupId ?? ''}>
              <option value="">自动（按 resource 前缀）</option>
              {leafGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </fieldset>
          <ModalActions cancelId="create-perm-modal" submitLabel="创建权限" />
        </form>
      </Modal>

      {/* 编辑权限 modal（每权限一个） */}
      {canWrite &&
        [...permsByGroup.values()].flat().map((p) => (
          <Modal
            key={p.id}
            id={`edit-${p.id}`}
            title={
              <span>
                编辑权限{' '}
                <span class="text-sm font-normal text-base-content/60">{p.name}</span>
              </span>
            }
          >
            <form method="post" action="/admin/permissions" class="fieldset gap-3">
              <input type="hidden" name="intent" value="update" />
              <input type="hidden" name="permissionId" value={p.id} />
              <FormField
                label="权限名"
                name="name"
                required
                placeholder="如 report:read"
                value={p.name}
              />
              <FormField
                label="描述"
                name="description"
                placeholder="简要说明该权限用途"
                value={p.description ?? ''}
              />
              <fieldset class="fieldset">
                <legend class="fieldset-legend">分组</legend>
                <select name="groupId" class="select select-sm w-full" defaultValue={p.groupId ?? ''}>
                  <option value="">自动（按 resource 前缀）</option>
                  {leafGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </fieldset>
              <ModalActions cancelId={`edit-${p.id}`} submitLabel="保存" />
            </form>
          </Modal>
        ))}
    </div>
  )
}

/** 统计某分组子树下的权限总数（与 hasPerms 同口径） */
function countSubtree(
  g: PermissionGroup,
  permsByGroup: Map<string, Permission[]>,
  childrenOf: Map<string | null, PermissionGroup[]>,
): number {
  const direct = permsByGroup.get(g.id)?.length ?? 0
  const children = (childrenOf.get(g.id) ?? []).reduce((sum, c) => sum + countSubtree(c, permsByGroup, childrenOf), 0)
  return direct + children
}

export default createRoute(requirePermission('role:read'), async (c) => {
  return c.render(buildPermsView(c))
})

export const POST = createRoute(async (c) => {
  const perms = c.get('permissions') ?? new Set<string>()
  const body = await c.req.parseBody({ all: true })
  const action = String(body.intent ?? '')

  if (action === 'create') {
    if (!perms.has('role:update')) return c.text('403 Forbidden', 403)
    const rawName = String(body.name ?? '')
    const description = String(body.description ?? '').trim() || null
    const nameError = validatePermissionName(rawName)
    if (nameError) {
      return c.render(
        buildPermsView(c, {
          error: nameError,
          form: { name: rawName, description: String(body.description ?? ''), groupId: String(body.groupId ?? '') },
          openCreate: true,
        }),
      )
    }
    const name = rawName.trim().toLowerCase()
    if (db.select().from(schema.permissions).where(eq(schema.permissions.name, name)).get()) {
      return c.render(
        buildPermsView(c, {
          error: '该权限名已存在',
          form: { name: rawName, description: String(body.description ?? ''), groupId: String(body.groupId ?? '') },
          openCreate: true,
        }),
      )
    }
    const groupId = resolveGroupId(String(body.groupId ?? ''))
    db.insert(schema.permissions).values({ id: randomUUID(), name, description, groupId }).run()
    return c.redirect('/admin/permissions?flash=success:权限已创建')
  }

  if (action === 'update') {
    if (!perms.has('role:update')) return c.text('403 Forbidden', 403)
    const permissionId = String(body.permissionId ?? '')
    const rawName = String(body.name ?? '')
    const description = String(body.description ?? '').trim() || null
    const perm = db
      .select()
      .from(schema.permissions)
      .where(eq(schema.permissions.id, permissionId))
      .get()
    if (!perm) return c.text('权限不存在', 404)
    const nameError = validatePermissionName(rawName)
    if (nameError) return c.redirect(`/admin/permissions?flash=${encodeURIComponent('error:' + nameError)}`)
    const name = rawName.trim().toLowerCase()
    const clash = db
      .select()
      .from(schema.permissions)
      .where(eq(schema.permissions.name, name))
      .get()
    if (clash && clash.id !== permissionId) {
      return c.redirect('/admin/permissions?flash=error:该权限名已存在')
    }
    const groupId = resolveGroupId(String(body.groupId ?? ''))
    db.update(schema.permissions).set({ name, description, groupId }).where(eq(schema.permissions.id, permissionId)).run()
    return c.redirect('/admin/permissions?flash=success:权限已更新')
  }

  if (action === 'delete') {
    if (!perms.has('role:delete')) return c.text('403 Forbidden', 403)
    const permissionId = String(body.permissionId ?? '')
    const perm = db
      .select()
      .from(schema.permissions)
      .where(eq(schema.permissions.id, permissionId))
      .get()
    if (!perm) return c.text('权限不存在', 404)
    const refs = db
      .select()
      .from(schema.rolePermissions)
      .where(eq(schema.rolePermissions.permissionId, permissionId))
      .all()
    if (refs.length) {
      return c.redirect('/admin/permissions?flash=error:该权限仍被角色引用，无法删除')
    }
    db.delete(schema.permissions).where(eq(schema.permissions.id, permissionId)).run()
    return c.redirect('/admin/permissions?flash=success:权限已删除')
  }

  return c.text('未知操作', 400)
})

/** 解析表单提交的分组：空串视为「自动（按前缀）」→ null，让启动 backfill 处理 */
function resolveGroupId(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  const g = db.select().from(schema.permissionGroups).where(eq(schema.permissionGroups.id, v)).get()
  return g ? g.id : null
}
