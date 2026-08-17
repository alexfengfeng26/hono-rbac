import { randomUUID } from 'node:crypto'
import type { PermissionMap } from '../../lib/rbac/permissions'
import { eq, inArray, sql } from 'drizzle-orm'
import { createRoute } from 'honox/factory'
import { hashPassword, validatePassword } from '../../lib/auth/password'
import { requirePermission } from '../../lib/auth/guard'
import ConfirmButton from '../../islands/confirm-button'
import BulkActions from '../../islands/bulk-actions'
import { Avatar } from '../../components/avatar'
import { Badge } from '../../components/badge'
import { EmptyState } from '../../components/empty-state'
import { FormField } from '../../components/form-field'
import { Modal, ModalActions, ModalOpenButton } from '../../components/modal'
import { PageHeader } from '../../components/page-header'
import { Pagination } from '../../components/pagination'
import { db, schema } from '../../lib/db'
import type { Context } from 'hono'
import type { Role, User, Department } from '../../lib/db/schema'

type Row = { user: User; roles: Role[]; lastLogin?: number }

const PAGE_SIZE = 10

type SortField = 'name' | 'createdAt'
type UsersExtra = {
  error?: string
  form?: { name?: string; email?: string; roles?: string[] }
  openCreate?: boolean
}

function fmtDate(ts: number | Date | undefined): string {
  if (!ts) return '—'
  const d = ts instanceof Date ? ts : new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

/** 拥有「admin」角色的用户 id 集合（用于防锁死判断） */
function adminUserIds(): string[] {
  const adminRole = db.select().from(schema.roles).where(eq(schema.roles.name, 'admin')).get()
  if (!adminRole) return []
  return db
    .select({ id: schema.userRoles.userId })
    .from(schema.userRoles)
    .where(eq(schema.userRoles.roleId, adminRole.id))
    .all()
    .map((r) => r.id)
}

/** 把 body.ids 归一化为数组（兼容多个同名隐藏域 或 逗号拼接字符串） */
function parseIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean)
  if (typeof raw === 'string')
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  return []
}

/** 组装用户列表视图（含搜索/角色筛选/状态筛选/分页/排序），GET 与 POST 校验失败复用 */
function buildUsersView(c: Context, extra: UsersExtra = {}) {
  const me = c.get('user') as User
  const perms = c.get('permissions') as PermissionMap
  const q = String(c.req.query('q') ?? '').trim().toLowerCase()
  const roleFilter = String(c.req.query('role') ?? '').trim()
  const statusFilter = String(c.req.query('status') ?? '').trim()
  const requestedPage = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1)
  const sort = (c.req.query('sort') === 'name' ? 'name' : 'createdAt') as SortField
  const dir = c.req.query('dir') === 'asc' ? 'asc' : 'desc'

  // 候选用户 id（按角色过滤后取交集）
  let candidateIds: string[]
  if (roleFilter) {
    candidateIds = db
      .select({ id: schema.userRoles.userId })
      .from(schema.userRoles)
      .where(eq(schema.userRoles.roleId, roleFilter))
      .all()
      .map((r) => r.id)
  } else {
    candidateIds = db.select({ id: schema.users.id }).from(schema.users).all().map((r) => r.id)
  }
  const base = db.select().from(schema.users)
  let candidates = candidateIds.length
    ? base.where(inArray(schema.users.id, candidateIds)).all()
    : base.all()
  if (q) {
    candidates = candidates.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    )
  }
  if (statusFilter === 'active' || statusFilter === 'disabled') {
    candidates = candidates.filter((u) => u.status === statusFilter)
  }
  candidates.sort((a, b) => {
    const cmp =
      sort === 'name'
        ? a.name.localeCompare(b.name, 'zh-CN')
        : (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)
    return dir === 'asc' ? cmp : -cmp
  })

  const total = candidates.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(requestedPage, totalPages)
  const pageUsers = candidates.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const roles = db.select().from(schema.roles).orderBy(schema.roles.name).all()
  const departments = db.select().from(schema.departments).all()
  const userRoles = db.select().from(schema.userRoles).all()
  const roleById = new Map(roles.map((r) => [r.id, r]))

  // 最后登录时间：从 sessions 取每个用户 max(created_at)
  const lastLoginMap = new Map<string, number>()
  db.select({
    userId: schema.sessions.userId,
    last: sql<number>`max(${schema.sessions.createdAt})`,
  })
    .from(schema.sessions)
    .groupBy(schema.sessions.userId)
    .all()
    .forEach((r) => lastLoginMap.set(r.userId, Number(r.last)))

  const rows: Row[] = pageUsers.map((u) => ({
    user: u,
    roles: userRoles
      .filter((ur) => ur.userId === u.id)
      .map((ur) => roleById.get(ur.roleId))
      .filter((r): r is Role => r !== undefined),
    lastLogin: lastLoginMap.get(u.id),
  }))

  const buildHref = (p: number) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (roleFilter) params.set('role', roleFilter)
    if (statusFilter) params.set('status', statusFilter)
    params.set('sort', sort)
    params.set('dir', dir)
    params.set('page', String(p))
    return `/admin/users?${params.toString()}`
  }
  const sortHref = (field: SortField) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (roleFilter) params.set('role', roleFilter)
    if (statusFilter) params.set('status', statusFilter)
    params.set('sort', field)
    params.set('dir', sort === field && dir === 'desc' ? 'asc' : 'desc')
    return `/admin/users?${params.toString()}`
  }
  const sortMarker = (field: SortField) =>
    sort === field ? (dir === 'asc' ? ' ↑' : ' ↓') : ''

  return (
    <UsersPage
      me={me}
      perms={perms}
      rows={rows}
      roles={roles}
      departments={departments}
      q={q}
      roleFilter={roleFilter}
      statusFilter={statusFilter}
      page={page}
      totalPages={totalPages}
      total={total}
      sort={sort}
      dir={dir}
      buildHref={buildHref}
      sortHref={sortHref}
      sortMarker={sortMarker}
      error={extra.error}
      form={extra.form}
      openCreate={extra.openCreate}
    />
  )
}

function UsersPage({
  me,
  perms,
  rows,
  roles,
  departments,
  q = '',
  roleFilter = '',
  statusFilter = '',
  page = 1,
  totalPages = 1,
  total = 0,
  sort = 'createdAt',
  dir = 'desc',
  buildHref,
  sortHref,
  sortMarker,
  error,
  form,
  openCreate = false,
}: {
  me: User
  perms: PermissionMap
  rows: Row[]
  roles: Role[]
  departments: Department[]
  q?: string
  roleFilter?: string
  statusFilter?: string
  page?: number
  totalPages?: number
  total?: number
  sort?: SortField
  dir?: 'asc' | 'desc'
  buildHref?: (p: number) => string
  sortHref?: (f: SortField) => string
  sortMarker?: (f: SortField) => string
  error?: string
  form?: { name?: string; email?: string; roles?: string[] }
  openCreate?: boolean
}) {
  const formRoles = new Set(form?.roles ?? [])
  const isFiltered = !!(q || roleFilter || statusFilter)
  return (
    <div>
      <title>用户管理 - RBAC</title>
      <PageHeader
        title="用户管理"
        subtitle={isFiltered ? `共 ${total} 个匹配用户` : `共 ${total} 个用户`}
        actions={
          perms.has('user:create') && (
            <ModalOpenButton id="create-user-modal">创建用户</ModalOpenButton>
          )
        }
      />

      {/* 搜索 / 筛选 */}
      <form method="get" action="/admin/users" class="flex flex-wrap items-end gap-3 mb-4">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-base-content/60">搜索</label>
          <input
            type="search"
            name="q"
            value={q}
            placeholder="姓名或邮箱"
            class="input input-sm w-56"
            aria-label="搜索用户"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-base-content/60">角色</label>
          <select name="role" class="select select-sm w-40" aria-label="按角色筛选">
            <option value="">全部角色</option>
            {roles.map((r) => (
              <option value={r.id} selected={roleFilter === r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-base-content/60">状态</label>
          <select name="status" class="select select-sm w-32" aria-label="按状态筛选">
            <option value="">全部状态</option>
            <option value="active" selected={statusFilter === 'active'}>
              已激活
            </option>
            <option value="disabled" selected={statusFilter === 'disabled'}>
              已停用
            </option>
          </select>
        </div>
        <button type="submit" class="btn btn-sm btn-outline">
          筛选
        </button>
        {isFiltered && (
          <a href="/admin/users" class="btn btn-sm btn-ghost">
            清除
          </a>
        )}
      </form>

      {/* 批量操作条（选中后浮出） */}
      {perms.has('user:update') || perms.has('user:delete') ? <BulkActions roles={roles} /> : null}

      {/* 桌面端表格 */}
      <div class="card bg-base-100 shadow overflow-x-auto hidden md:block">
        <table class="table">
          <thead class="bg-base-100">
            <tr class="text-base-content/60">
              <th class="w-10">
                <input type="checkbox" data-bulk-all class="checkbox checkbox-sm" aria-label="全选" />
              </th>
              <th>
                <a
                  href={sortHref?.('name')}
                  class={sort === 'name' ? 'text-primary' : undefined}
                  title="按姓名排序"
                >
                  姓名{sortMarker?.('name')}
                </a>
              </th>
              <th>邮箱</th>
              <th>角色</th>
              <th>状态</th>
              <th>
                <a
                  href={sortHref?.('createdAt')}
                  class={sort === 'createdAt' ? 'text-primary' : undefined}
                  title="按创建时间排序"
                >
                  创建时间{sortMarker?.('createdAt')}
                </a>
              </th>
              <th>最后登录</th>
              <th class="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ user, roles: userRoleList, lastLogin }) => (
              <tr key={user.id} class="hover:bg-base-200/60">
                <td>
                  <input
                    type="checkbox"
                    class="bulk-check checkbox checkbox-sm"
                    data-bulk-id={user.id}
                    value={user.id}
                    aria-label={`选择 ${user.name}`}
                  />
                </td>
                <td>
                  <div class="flex items-center gap-2 min-w-0">
                    <Avatar name={user.name} seed={user.id} className="w-8 h-8 text-sm" />
                    <span class="font-medium truncate">{user.name}</span>
                  </div>
                </td>
                <td class="text-base-content/70">{user.email}</td>
                <td>
                  <div class="flex flex-wrap gap-1">
                    {userRoleList.map((r) => (
                      <Badge key={r.id} variant="primary" mono>
                        {r.name}
                      </Badge>
                    ))}
                    {userRoleList.length === 0 && (
                      <span class="text-xs text-base-content/40">（无角色）</span>
                    )}
                  </div>
                </td>
                <td>
                  <Badge variant={user.status === 'active' ? 'success' : 'neutral'} mono>
                    {user.status === 'active' ? '已激活' : '已停用'}
                  </Badge>
                </td>
                <td class="text-base-content/60 whitespace-nowrap">{fmtDate(user.createdAt)}</td>
                <td class="text-base-content/60 whitespace-nowrap">{fmtDate(lastLogin)}</td>
                <td class="text-right">
                  <div class="flex justify-end gap-2">
                    {perms.has('user:update') && (
                      <ModalOpenButton id={`edit-${user.id}`} className="btn btn-ghost btn-xs">
                        编辑
                      </ModalOpenButton>
                    )}
                    {perms.has('user:update') && (
                      <ModalOpenButton id={`assign-${user.id}`} className="btn btn-ghost btn-xs">
                        分配角色
                      </ModalOpenButton>
                    )}
                    {perms.has('user:delete') && user.id !== me.id && (
                      <ConfirmButton
                        message={`确定删除用户 ${user.name}（${user.email}）？此操作不可撤销。`}
                        action="/admin/users"
                        fields={{ action: 'delete', userId: user.id }}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colspan={8}>
                  <EmptyState
                    icon="users"
                    title="没有匹配的用户"
                    description="尝试调整搜索条件，或创建新用户。"
                    cta={
                      isFiltered ? (
                        <a href="/admin/users" class="btn btn-sm btn-outline">
                          清除筛选
                        </a>
                      ) : (
                        perms.has('user:create') && (
                          <ModalOpenButton id="create-user-modal" className="btn btn-sm btn-primary">
                            创建用户
                          </ModalOpenButton>
                        )
                      )
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 移动端卡片 */}
      <div class="md:hidden flex flex-col gap-3">
        {rows.map(({ user, roles: userRoleList, lastLogin }) => (
          <div key={user.id} class="card bg-base-100 shadow p-3">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <input
                  type="checkbox"
                  class="bulk-check checkbox checkbox-sm"
                  data-bulk-id={user.id}
                  value={user.id}
                  aria-label={`选择 ${user.name}`}
                />
                <Avatar name={user.name} seed={user.id} className="w-9 h-9 text-sm" />
                <div class="min-w-0">
                  <div class="font-medium truncate">{user.name}</div>
                  <div class="text-xs text-base-content/60 truncate">{user.email}</div>
                </div>
              </div>
              <div class="flex items-center gap-1">
                {perms.has('user:update') && (
                  <ModalOpenButton id={`edit-${user.id}`} className="btn btn-ghost btn-xs">
                    编辑
                  </ModalOpenButton>
                )}
                {perms.has('user:update') && (
                  <ModalOpenButton id={`assign-${user.id}`} className="btn btn-ghost btn-xs">
                    分配角色
                  </ModalOpenButton>
                )}
                {perms.has('user:delete') && user.id !== me.id && (
                  <ConfirmButton
                    message={`确定删除用户 ${user.name}？此操作不可撤销。`}
                    action="/admin/users"
                    fields={{ action: 'delete', userId: user.id }}
                  />
                )}
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-1.5 mt-2">
              <Badge variant={user.status === 'active' ? 'success' : 'neutral'} mono>
                {user.status === 'active' ? '已激活' : '已停用'}
              </Badge>
              {userRoleList.map((r) => (
                <Badge key={r.id} variant="primary" mono>
                  {r.name}
                </Badge>
              ))}
              {userRoleList.length === 0 && (
                <span class="text-xs text-base-content/40">（无角色）</span>
              )}
            </div>
            <div class="text-xs text-base-content/50 mt-2">
              创建于 {fmtDate(user.createdAt)} · 最后登录 {fmtDate(lastLogin)} ·{' '}
              {perms.has('user:update') && (
                <ModalOpenButton
                  id={`assign-${user.id}`}
                  className="btn btn-ghost btn-xs inline-flex align-middle"
                >
                  分配角色
                </ModalOpenButton>
              )}
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <EmptyState
            icon="users"
            title="没有匹配的用户"
            description="尝试调整搜索条件，或创建新用户。"
            cta={
              isFiltered ? (
                <a href="/admin/users" class="btn btn-sm btn-outline">
                  清除筛选
                </a>
              ) : (
                perms.has('user:create') && (
                  <ModalOpenButton id="create-user-modal" className="btn btn-sm btn-primary">
                    创建用户
                  </ModalOpenButton>
                )
              )
            }
          />
        )}
      </div>

      {buildHref && <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />}

      {/* 创建用户 modal */}
      <Modal id="create-user-modal" title="创建用户" open={openCreate}>
        <form method="post" action="/admin/users" class="fieldset gap-3">
          <input type="hidden" name="action" value="create" />
          {error && (
            <div role="alert" class="alert alert-error alert-sm text-sm">
              {error}
            </div>
          )}
          <FormField
            label="姓名"
            name="name"
            required
            placeholder="姓名"
            value={form?.name}
          />
          <FormField
            label="邮箱"
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            value={form?.email}
          />
          <FormField
            label="初始密码"
            name="password"
            type="password"
            required
            placeholder="至少 8 位，含字母与数字"
            minLength={8}
          />
          <fieldset class="fieldset mt-1">
            <legend class="fieldset-legend">初始角色</legend>
            <div class="flex flex-wrap gap-4">
              {roles.map((r) => (
                <label class="flex items-center gap-2 text-sm" key={r.id}>
                  <input
                    type="checkbox"
                    name="roles"
                    value={r.id}
                    defaultChecked={formRoles.has(r.id)}
                    class="checkbox checkbox-sm"
                  />
                  {r.name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset class="fieldset mt-1">
            <legend class="fieldset-legend">部门</legend>
            <select name="departmentId" class="select select-sm w-full" aria-label="部门">
              <option value="">（未分配）</option>
              {departments.map((d) => (
                <option value={d.id}>{d.name}</option>
              ))}
            </select>
          </fieldset>
          <ModalActions cancelId="create-user-modal" submitLabel="创建用户" />
        </form>
      </Modal>

      {/* 分配角色 modal（每用户一个） */}
      {perms.has('user:update') &&
        rows.map(({ user, roles: userRoleList }) => (
          <Modal
            key={user.id}
            id={`assign-${user.id}`}
            title={
              <span>
                分配角色{' '}
                <span class="text-sm font-normal text-base-content/60">{user.email}</span>
              </span>
            }
          >
            <form method="post" action="/admin/users">
              <input type="hidden" name="action" value="updateRoles" />
              <input type="hidden" name="userId" value={user.id} />
              <div class="flex flex-col gap-3">
                {roles.map((r) => (
                  <label class="flex items-center justify-between gap-3" key={r.id}>
                    <span class="text-sm">{r.name}</span>
                    <input
                      type="checkbox"
                      name="roles"
                      value={r.id}
                      checked={userRoleList.some((ur) => ur.id === r.id)}
                      class="checkbox checkbox-sm"
                    />
                  </label>
                ))}
                {roles.length === 0 && (
                  <p class="text-sm text-base-content/50">暂无角色可分配</p>
                )}
              </div>
              <ModalActions cancelId={`assign-${user.id}`} submitLabel="保存" />
            </form>
          </Modal>
        ))}

      {/* 编辑用户 modal（每用户一个）：资料 + 状态 + 重置密码 + 角色 */}
      {perms.has('user:update') &&
        rows.map(({ user, roles: userRoleList }) => (
          <Modal
            key={`edit-${user.id}`}
            id={`edit-${user.id}`}
            title={
              <span>
                编辑用户{' '}
                <span class="text-sm font-normal text-base-content/60">{user.email}</span>
              </span>
            }
          >
            <form method="post" action="/admin/users" class="fieldset gap-3">
              <input type="hidden" name="action" value="update" />
              <input type="hidden" name="userId" value={user.id} />
              <FormField label="姓名" name="name" required placeholder="姓名" value={user.name} />
              <FormField
                label="邮箱"
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                value={user.email}
              />
              <div class="flex flex-col gap-1">
                <label class="fieldset-label" for={`status-${user.id}`}>
                  状态
                </label>
                <select
                  id={`status-${user.id}`}
                  name="status"
                  class="select select-sm w-full"
                  aria-label="用户状态"
                >
                  <option value="active" selected={user.status === 'active'}>
                    已激活
                  </option>
                  <option value="disabled" selected={user.status === 'disabled'}>
                    已停用
                  </option>
                </select>
              </div>
              <fieldset class="fieldset mt-1">
                <legend class="fieldset-legend">部门</legend>
                <select name="departmentId" class="select select-sm w-full" aria-label="部门">
                  <option value="">（未分配）</option>
                  {departments.map((d) => (
                    <option value={d.id} selected={user.departmentId === d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </fieldset>
              <FormField
                label="重置密码（留空则不修改）"
                name="password"
                type="password"
                placeholder="至少 8 位，含字母与数字"
                minLength={8}
              />
              <fieldset class="fieldset mt-1">
                <legend class="fieldset-legend">角色</legend>
                <div class="flex flex-wrap gap-4">
                  {roles.map((r) => (
                    <label class="flex items-center gap-2 text-sm" key={r.id}>
                      <input
                        type="checkbox"
                        name="roles"
                        value={r.id}
                        defaultChecked={userRoleList.some((ur) => ur.id === r.id)}
                        class="checkbox checkbox-sm"
                      />
                      {r.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <ModalActions cancelId={`edit-${user.id}`} submitLabel="保存" />
            </form>
          </Modal>
        ))}
    </div>
  )
}

export default createRoute(requirePermission('user:read'), async (c) => {
  return c.render(buildUsersView(c))
})

export const POST = createRoute(async (c) => {
  const me = c.get('user') as User
  const perms = c.get('permissions') ?? new Set<string>()
  const body = await c.req.parseBody({ all: true })
  const action = String(body.action ?? '')
  const roles = body.roles
    ? Array.isArray(body.roles)
      ? body.roles.map(String)
      : [String(body.roles)]
    : []
  const ids = parseIds(body.ids)

  if (action === 'create') {
    if (!perms.has('user:create')) return c.text('403 Forbidden', 403)
    const rawName = String(body.name ?? '')
    const rawEmail = String(body.email ?? '')
    const name = rawName.trim()
    const email = rawEmail.trim().toLowerCase()
    const password = String(body.password ?? '')
    const formValues = { name: rawName, email: rawEmail, roles }
    if (!name || !email || !password) {
      return c.render(
        buildUsersView(c, {
          error: '请完整填写姓名、邮箱与初始密码',
          form: formValues,
          openCreate: true,
        }),
      )
    }
    if (db.select().from(schema.users).where(eq(schema.users.email, email)).get()) {
      return c.render(
        buildUsersView(c, { error: '该邮箱已存在', form: formValues, openCreate: true }),
      )
    }
    const policyError = validatePassword(password)
    if (policyError) {
      return c.render(buildUsersView(c, { error: policyError, form: formValues, openCreate: true }))
    }
    const id = randomUUID()
    db.insert(schema.users)
      .values({
        id,
        email,
        name,
        passwordHash: await hashPassword(password),
        status: 'active',
        departmentId: body.departmentId ? String(body.departmentId) : null,
      })
      .run()
    if (roles.length) {
      db.insert(schema.userRoles)
        .values(roles.map((roleId) => ({ userId: id, roleId })))
        .run()
    }
    return c.redirect('/admin/users?flash=success:用户已创建')
  }

  if (action === 'updateRoles') {
    if (!perms.has('user:update')) return c.text('403 Forbidden', 403)
    const userId = String(body.userId ?? '')
    const user = db.select().from(schema.users).where(eq(schema.users.id, userId)).get()
    if (!user) return c.text('用户不存在', 404)
    db.transaction((tx) => {
      tx.delete(schema.userRoles).where(eq(schema.userRoles.userId, userId)).run()
      if (roles.length) {
        tx.insert(schema.userRoles)
          .values(roles.map((roleId) => ({ userId, roleId })))
          .run()
      }
    })
    return c.redirect('/admin/users?flash=success:角色已更新')
  }

  if (action === 'update') {
    if (!perms.has('user:update')) return c.text('403 Forbidden', 403)
    const userId = String(body.userId ?? '')
    const user = db.select().from(schema.users).where(eq(schema.users.id, userId)).get()
    if (!user) return c.text('用户不存在', 404)
    const rawName = String(body.name ?? '')
    const name = rawName.trim()
    const rawEmail = String(body.email ?? '')
    const email = rawEmail.trim().toLowerCase()
    const status = String(body.status ?? user.status) === 'disabled' ? 'disabled' : 'active'
    const password = String(body.password ?? '')
    if (!name || !email) {
      return c.redirect('/admin/users?flash=error:姓名与邮箱不能为空')
    }
    const emailClash = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .get()
    if (emailClash && emailClash.id !== userId) {
      return c.redirect('/admin/users?flash=error:该邮箱已被其他用户使用')
    }
    // 防锁死：不能停用当前登录账号 / 最后一个管理员
    if (status === 'disabled') {
      if (userId === me.id) {
        return c.redirect('/admin/users?flash=error:不能停用当前登录的账号')
      }
      const admins = new Set(adminUserIds())
      if (admins.size <= 1 && admins.has(userId)) {
        return c.redirect('/admin/users?flash=error:不能停用最后一个管理员')
      }
    }
    const patch: Partial<typeof schema.users.$inferInsert> = {
      name,
      email,
      status,
      departmentId: body.departmentId ? String(body.departmentId) : null,
    }
    if (password) {
      const policyError = validatePassword(password)
      if (policyError) return c.redirect(`/admin/users?flash=${encodeURIComponent('error:' + policyError)}`)
      patch.passwordHash = await hashPassword(password)
    }
    db.update(schema.users).set(patch).where(eq(schema.users.id, userId)).run()
    db.transaction((tx) => {
      tx.delete(schema.userRoles).where(eq(schema.userRoles.userId, userId)).run()
      if (roles.length) {
        tx.insert(schema.userRoles)
          .values(roles.map((roleId) => ({ userId, roleId })))
          .run()
      }
    })
    if (status === 'disabled') {
      db.delete(schema.sessions).where(eq(schema.sessions.userId, userId)).run()
    }
    return c.redirect('/admin/users?flash=success:用户已更新')
  }

  if (action === 'delete') {
    if (!perms.has('user:delete')) return c.text('403 Forbidden', 403)
    const userId = String(body.userId ?? '')
    if (userId === me.id) return c.text('不能删除自己', 400)
    const user = db.select().from(schema.users).where(eq(schema.users.id, userId)).get()
    if (!user) return c.text('用户不存在', 404)
    db.delete(schema.users).where(eq(schema.users.id, userId)).run() // 级联删除 user_roles/sessions
    return c.redirect('/admin/users?flash=success:用户已删除')
  }

  if (action === 'bulkAssignRoles') {
    if (!perms.has('user:update')) return c.text('403 Forbidden', 403)
    if (ids.length === 0) return c.redirect('/admin/users?flash=error:请先选择用户')
    const admins = new Set(adminUserIds())
    const targets = ids.filter((id) => !(admins.size <= 1 && admins.has(id)))
    db.transaction((tx) => {
      for (const id of targets) {
        tx.delete(schema.userRoles).where(eq(schema.userRoles.userId, id)).run()
        if (roles.length) {
          tx.insert(schema.userRoles)
            .values(roles.map((roleId) => ({ userId: id, roleId })))
            .run()
        }
      }
    })
    const skipped = ids.length - targets.length
    const msg = `已为 ${targets.length} 个用户分配角色${skipped ? `（跳过 ${skipped} 个不可变更的管理员）` : ''}`
    return c.redirect(`/admin/users?flash=${encodeURIComponent('success:' + msg)}`)
  }

  if (action === 'bulkSetStatus') {
    if (!perms.has('user:update')) return c.text('403 Forbidden', 403)
    const status = String(body.status) === 'active' ? 'active' : 'disabled'
    const admins = new Set(adminUserIds())
    const targets = ids.filter(
      (id) =>
        id !== me.id && !(status === 'disabled' && admins.size <= 1 && admins.has(id)),
    )
    for (const id of targets) {
      db.update(schema.users).set({ status }).where(eq(schema.users.id, id)).run()
      if (status === 'disabled') {
        db.delete(schema.sessions).where(eq(schema.sessions.userId, id)).run()
      }
    }
    const skipped = ids.length - targets.length
    const verb = status === 'disabled' ? '停用' : '启用'
    const msg = `已${verb} ${targets.length} 个用户${skipped ? `（跳过 ${skipped} 项）` : ''}`
    const base = `/admin/users?flash=${encodeURIComponent('success:' + msg)}`
    // 停用操作提供「撤销」（反向批量启用）
    if (status === 'disabled' && targets.length > 0) {
      const undo = Buffer.from(
        JSON.stringify({ action: '/admin/users', fields: { action: 'bulkSetStatus', status: 'active', ids: targets.join(',') } }),
      ).toString('base64url')
      return c.redirect(`${base}&undo=${undo}`)
    }
    return c.redirect(base)
  }

  if (action === 'bulkDelete') {
    if (!perms.has('user:delete')) return c.text('403 Forbidden', 403)
    const admins = new Set(adminUserIds())
    const targets = ids.filter((id) => id !== me.id && !(admins.size <= 1 && admins.has(id)))
    for (const id of targets) {
      db.delete(schema.users).where(eq(schema.users.id, id)).run() // 级联删除
    }
    const skipped = ids.length - targets.length
    const msg = `已删除 ${targets.length} 个用户${skipped ? `（跳过 ${skipped} 项）` : ''}`
    return c.redirect(`/admin/users?flash=${encodeURIComponent('success:' + msg)}`)
  }

  return c.text('未知操作', 400)
})
