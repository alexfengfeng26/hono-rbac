import { randomUUID } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import { createRoute } from 'honox/factory'
import type { Context } from 'hono'
import { requirePermission } from '../../lib/auth/guard'
import ConfirmButton from '../../islands/confirm-button'
import { Icon, ICON_NAMES, type IconName } from '../../components/icon'
import { Badge } from '../../components/badge'
import { EmptyState } from '../../components/empty-state'
import { FormField } from '../../components/form-field'
import { Modal, ModalActions, ModalOpenButton } from '../../components/modal'
import { PageHeader } from '../../components/page-header'
import { PERMISSIONS, type PermissionMap } from '../../lib/rbac/permissions'
import { db, schema } from '../../lib/db'
import type { Menu } from '../../lib/db/schema'

type FormState = {
  name?: string
  href?: string
  icon?: string
  requiredPermission?: string
  status?: string
}

function iconOptions(selected?: string) {
  return ICON_NAMES.map((n) => (
    <option key={n} value={n} selected={n === selected}>
      {n}
    </option>
  ))
}

function permissionOptions(selected?: string) {
  return (
    <>
      <option value="" selected={!selected}>
        公开（所有人可见）
      </option>
      {PERMISSIONS.map((p) => (
        <option key={p.name} value={p.name} selected={selected === p.name}>
          {p.name}
        </option>
      ))}
    </>
  )
}

function statusOptions(selected?: string) {
  return (
    <>
      <option value="active" selected={selected !== 'hidden'}>
        显示
      </option>
      <option value="hidden" selected={selected === 'hidden'}>
        隐藏
      </option>
    </>
  )
}

function MenusPage({
  groups,
  childrenOf,
  perms,
  error,
  form,
  openModal,
}: {
  groups: Menu[]
  childrenOf: Map<string, Menu[]>
  perms: PermissionMap
  error?: string
  form?: FormState
  openModal?: string
}) {
  return (
    <div>
      <PageHeader
        title="菜单管理"
        subtitle="配置侧栏导航分组与入口（权限不足的菜单项对用户自动隐藏）"
        actions={
          <ModalOpenButton id="create-group-modal" className="btn btn-primary btn-sm">
            新建分组
          </ModalOpenButton>
        }
      />

      {error && <div class="alert alert-error alert-sm text-sm mb-3">{error}</div>}

      {groups.length === 0 && (
        <EmptyState
          icon="menu"
          title="还没有菜单分组"
          description="点击「新建分组」创建第一个导航分组，再在组内新增菜单项。"
          cta={<ModalOpenButton id="create-group-modal">新建分组</ModalOpenButton>}
        />
      )}

      {groups.map((g) => {
        const items = (childrenOf.get(g.id) ?? []).sort((a, b) => a.order - b.order)
        return (
          <div key={g.id} class="card bg-base-100 shadow mt-4">
            <div class="card-body p-4">
              <div class="flex items-center justify-between flex-wrap gap-2">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-sm">{g.name}</span>
                  <Badge variant="neutral">{items.length} 项</Badge>
                </div>
                <div class="flex items-center gap-1">
                  <form method="post" action="/admin/menus" class="inline">
                    <input type="hidden" name="action" value="groupMoveUp" />
                    <input type="hidden" name="id" value={g.id} />
                    <button class="btn btn-ghost btn-xs" title="上移分组">
                      ↑
                    </button>
                  </form>
                  <form method="post" action="/admin/menus" class="inline">
                    <input type="hidden" name="action" value="groupMoveDown" />
                    <input type="hidden" name="id" value={g.id} />
                    <button class="btn btn-ghost btn-xs" title="下移分组">
                      ↓
                    </button>
                  </form>
                  <ModalOpenButton id={`edit-group-${g.id}`} className="btn btn-ghost btn-xs">
                    重命名
                  </ModalOpenButton>
                  <ConfirmButton
                    action="/admin/menus"
                    fields={{ action: 'groupDelete', id: g.id }}
                    message={`删除分组「${g.name}」将同时删除其下 ${items.length} 个菜单项，确定？`}
                    label="删除"
                  />
                </div>
              </div>

              <div class="mt-2 overflow-x-auto">
                <table class="table table-sm">
                  <thead>
                    <tr class="text-base-content/60">
                      <th class="w-8"></th>
                      <th>名称</th>
                      <th>链接</th>
                      <th>权限</th>
                      <th>状态</th>
                      <th class="text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id}>
                        <td>
                          <span class="inline-flex">
                            <Icon name={(it.icon ?? 'menu') as IconName} className="w-4 h-4" />
                          </span>
                        </td>
                        <td class="text-sm">{it.name}</td>
                        <td class="text-xs font-mono text-base-content/60">{it.href ?? '—'}</td>
                        <td>
                          {it.requiredPermission ? (
                            <Badge variant="outline" mono>
                              {it.requiredPermission}
                            </Badge>
                          ) : (
                            <Badge variant="success">公开</Badge>
                          )}
                        </td>
                        <td>
                          {it.status === 'hidden' ? (
                            <Badge variant="warning">隐藏</Badge>
                          ) : (
                            <Badge variant="success">显示</Badge>
                          )}
                        </td>
                        <td>
                          <div class="flex items-center justify-end gap-1">
                            <form method="post" action="/admin/menus" class="inline">
                              <input type="hidden" name="action" value="itemMoveUp" />
                              <input type="hidden" name="id" value={it.id} />
                              <button class="btn btn-ghost btn-xs" title="上移">
                                ↑
                              </button>
                            </form>
                            <form method="post" action="/admin/menus" class="inline">
                              <input type="hidden" name="action" value="itemMoveDown" />
                              <input type="hidden" name="id" value={it.id} />
                              <button class="btn btn-ghost btn-xs" title="下移">
                                ↓
                              </button>
                            </form>
                            <ModalOpenButton id={`edit-item-${it.id}`} className="btn btn-ghost btn-xs">
                              编辑
                            </ModalOpenButton>
                            <ConfirmButton
                              action="/admin/menus"
                              fields={{ action: 'itemDelete', id: it.id }}
                              message={`删除菜单项「${it.name}」？`}
                              label="删除"
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={6} class="text-center text-sm text-base-content/40 py-3">
                          该分组暂无菜单项
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div class="mt-2 flex justify-end">
                <ModalOpenButton id={`create-item-${g.id}`} className="btn btn-outline btn-sm">
                  新增菜单项
                </ModalOpenButton>
              </div>
            </div>
          </div>
        )
      })}

      {/* 新建分组 */}
      <Modal id="create-group-modal" title="新建分组" open={openModal === 'create-group'}>
        <form method="post" action="/admin/menus" class="flex flex-col gap-2">
          <input type="hidden" name="action" value="groupCreate" />
          <FormField label="分组名称" name="name" required placeholder="如：管理 / 业务 / 分析" value={form?.name} />
          <ModalActions cancelId="create-group-modal" submitLabel="创建" />
        </form>
      </Modal>

      {/* 重命名分组 */}
      {groups.map((g) => (
        <Modal key={`edit-group-${g.id}`} id={`edit-group-${g.id}`} title={`重命名分组「${g.name}」`}>
          <form method="post" action="/admin/menus" class="flex flex-col gap-2">
            <input type="hidden" name="action" value="groupUpdate" />
            <input type="hidden" name="id" value={g.id} />
            <FormField label="分组名称" name="name" required value={form?.name} />
            <ModalActions cancelId={`edit-group-${g.id}`} submitLabel="保存" />
          </form>
        </Modal>
      ))}

      {/* 新增菜单项 */}
      {groups.map((g) => (
        <Modal
          key={`create-item-${g.id}`}
          id={`create-item-${g.id}`}
          title={`在「${g.name}」下新增菜单项`}
          boxClass="max-w-xl"
        >
          <form method="post" action="/admin/menus" class="flex flex-col gap-2">
            <input type="hidden" name="action" value="itemCreate" />
            <input type="hidden" name="parentId" value={g.id} />
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <FormField label="名称" name="name" required placeholder="如：用户管理" value={form?.name} />
              <FormField label="链接" name="href" required placeholder="/admin/users" value={form?.href} />
            </div>
            <label class="fieldset-label" for={`icon-${g.id}`}>
              图标
            </label>
            <select name="icon" id={`icon-${g.id}`} class="select select-sm w-full">
              {iconOptions(form?.icon)}
            </select>
            <label class="fieldset-label" for={`perm-${g.id}`}>
              可见权限
            </label>
            <select name="requiredPermission" id={`perm-${g.id}`} class="select select-sm w-full">
              {permissionOptions(form?.requiredPermission)}
            </select>
            <label class="fieldset-label" for={`status-${g.id}`}>
              状态
            </label>
            <select name="status" id={`status-${g.id}`} class="select select-sm w-full">
              {statusOptions(form?.status)}
            </select>
            <ModalActions cancelId={`create-item-${g.id}`} submitLabel="创建" />
          </form>
        </Modal>
      ))}

      {/* 编辑菜单项 */}
      {groups.flatMap((g) =>
        (childrenOf.get(g.id) ?? []).map((it) => (
          <Modal
            key={`edit-item-${it.id}`}
            id={`edit-item-${it.id}`}
            title={`编辑菜单项「${it.name}」`}
            boxClass="max-w-xl"
          >
            <form method="post" action="/admin/menus" class="flex flex-col gap-2">
              <input type="hidden" name="action" value="itemUpdate" />
              <input type="hidden" name="id" value={it.id} />
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <FormField label="名称" name="name" required value={it.name} />
                <FormField label="链接" name="href" required value={it.href ?? ''} />
              </div>
              <label class="fieldset-label" for={`eicon-${it.id}`}>
                图标
              </label>
              <select name="icon" id={`eicon-${it.id}`} class="select select-sm w-full">
                {iconOptions(it.icon ?? 'menu')}
              </select>
              <label class="fieldset-label" for={`eperm-${it.id}`}>
                可见权限
              </label>
              <select name="requiredPermission" id={`eperm-${it.id}`} class="select select-sm w-full">
                {permissionOptions(it.requiredPermission ?? undefined)}
              </select>
              <label class="fieldset-label" for={`estatus-${it.id}`}>
                状态
              </label>
              <select name="status" id={`estatus-${it.id}`} class="select select-sm w-full">
                {statusOptions(it.status)}
              </select>
              <ModalActions cancelId={`edit-item-${it.id}`} submitLabel="保存" />
            </form>
          </Modal>
        )),
      )}
    </div>
  )
}

function buildMenusView(c: Context, extra: { error?: string; form?: FormState; openModal?: string } = {}) {
  const perms = c.get('permissions') as PermissionMap
  const all = db.select().from(schema.menus).all()
  const groups = all
    .filter((m) => !m.parentId)
    .sort((a, b) => a.order - b.order)
  const childrenOf = new Map<string, Menu[]>()
  for (const m of all) {
    if (m.parentId) {
      if (!childrenOf.has(m.parentId)) childrenOf.set(m.parentId, [])
      childrenOf.get(m.parentId)!.push(m)
    }
  }
  return <MenusPage groups={groups} childrenOf={childrenOf} perms={perms} {...extra} />
}

export default createRoute(requirePermission('menu:manage'), (c) => {
  return c.render(buildMenusView(c))
})

function swapOrder(rows: { id: string; order: number }[], id: string, dir: 1 | -1): boolean {
  const idx = rows.findIndex((r) => r.id === id)
  const j = idx + dir
  if (idx < 0 || j < 0 || j >= rows.length) return false
  const a = rows[idx]
  const b = rows[j]
  db.update(schema.menus).set({ order: b.order }).where(eq(schema.menus.id, a.id)).run()
  db.update(schema.menus).set({ order: a.order }).where(eq(schema.menus.id, b.id)).run()
  return true
}

export const POST = createRoute(async (c) => {
  const perms = c.get('permissions') as PermissionMap
  if (!perms.has('menu:manage')) return c.text('403 Forbidden', 403)
  const body = await c.req.parseBody({ all: true })
  const action = String(body.action ?? '')
  const flash = (msg: string) => c.redirect(`/admin/menus?flash=${encodeURIComponent(msg)}`)
  const str = (v: unknown) => String(v ?? '').trim()

  switch (action) {
    case 'groupCreate': {
      const name = str(body.name)
      if (!name) return flash('error:分组名称不能为空')
      const max = db
        .select()
        .from(schema.menus)
        .all()
        .filter((m) => !m.parentId)
        .reduce((acc, m) => Math.max(acc, m.order), -1)
      db.insert(schema.menus)
        .values({ id: randomUUID(), name, order: max + 1, status: 'active' })
        .run()
      return flash('success:分组已创建')
    }
    case 'groupUpdate': {
      const id = str(body.id)
      const name = str(body.name)
      if (!id || !name) return flash('error:参数不完整')
      db.update(schema.menus).set({ name }).where(eq(schema.menus.id, id)).run()
      return flash('success:分组已重命名')
    }
    case 'groupDelete': {
      const id = str(body.id)
      if (!id) return flash('error:参数不完整')
      db.delete(schema.menus).where(eq(schema.menus.id, id)).run() // FK 级联清子项
      return flash('success:分组及其菜单项已删除')
    }
    case 'groupMoveUp':
    case 'groupMoveDown': {
      const id = str(body.id)
      const groups = db
        .select({ id: schema.menus.id, parentId: schema.menus.parentId, order: schema.menus.order })
        .from(schema.menus)
        .all()
        .filter((m) => !m.parentId)
        .sort((a, b) => a.order - b.order)
      if (!swapOrder(groups, id, action === 'groupMoveUp' ? -1 : 1)) return flash('error:已在边界')
      return flash('success:已移动')
    }
    case 'itemCreate': {
      const parentId = str(body.parentId)
      const name = str(body.name)
      const href = str(body.href)
      if (!parentId || !name || !href) return flash('error:名称与链接必填')
      if (!href.startsWith('/')) return flash('error:链接必须以 / 开头')
      if (db.select().from(schema.menus).where(eq(schema.menus.href, href)).get())
        return flash('error:该链接已存在')
      const icon = ICON_NAMES.includes(str(body.icon) as IconName) ? str(body.icon) : 'menu'
      const requiredPermission = str(body.requiredPermission) || null
      const status = str(body.status) === 'hidden' ? 'hidden' : 'active'
      const siblings = db
        .select()
        .from(schema.menus)
        .all()
        .filter((m) => m.parentId === parentId)
      const order = siblings.reduce((acc, m) => Math.max(acc, m.order), -1) + 1
      db.insert(schema.menus)
        .values({ id: randomUUID(), parentId, name, href, icon, requiredPermission, order, status })
        .run()
      return flash('success:菜单项已创建')
    }
    case 'itemUpdate': {
      const id = str(body.id)
      const name = str(body.name)
      const href = str(body.href)
      if (!id || !name || !href) return flash('error:名称与链接必填')
      if (!href.startsWith('/')) return flash('error:链接必须以 / 开头')
      const dup = db.select().from(schema.menus).all().find((m) => m.href === href && m.id !== id)
      if (dup) return flash('error:该链接已被其他菜单使用')
      const icon = ICON_NAMES.includes(str(body.icon) as IconName) ? str(body.icon) : 'menu'
      const requiredPermission = str(body.requiredPermission) || null
      const status = str(body.status) === 'hidden' ? 'hidden' : 'active'
      db.update(schema.menus)
        .set({ name, href, icon, requiredPermission, status })
        .where(eq(schema.menus.id, id))
        .run()
      return flash('success:菜单项已更新')
    }
    case 'itemDelete': {
      const id = str(body.id)
      if (!id) return flash('error:参数不完整')
      db.delete(schema.menus).where(eq(schema.menus.id, id)).run()
      return flash('success:菜单项已删除')
    }
    case 'itemMoveUp':
    case 'itemMoveDown': {
      const id = str(body.id)
      const target = db.select().from(schema.menus).where(eq(schema.menus.id, id)).get()
      if (!target) return flash('error:菜单项不存在')
      const rows = db
        .select({ id: schema.menus.id, parentId: schema.menus.parentId, order: schema.menus.order })
        .from(schema.menus)
        .all()
        .filter((m) => m.parentId === target.parentId)
        .sort((a, b) => a.order - b.order)
      if (!swapOrder(rows, id, action === 'itemMoveUp' ? -1 : 1)) return flash('error:已在边界')
      return flash('success:已移动')
    }
    default:
      return flash('error:未知操作')
  }
})
