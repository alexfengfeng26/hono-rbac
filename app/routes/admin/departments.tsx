import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { createRoute } from 'honox/factory'
import { requirePermission, requireAuth } from '../../lib/auth/guard'
import type { PermissionMap } from '../../lib/rbac/permissions'
import ConfirmButton from '../../islands/confirm-button'
import { Icon } from '../../components/icon'
import { FormField } from '../../components/form-field'
import { Modal, ModalActions, ModalOpenButton } from '../../components/modal'
import { PageHeader } from '../../components/page-header'
import { db, schema } from '../../lib/db'
import type { Context } from 'hono'
import type { Department } from '../../lib/db/schema'

type DeptExtra = {
  error?: string
  form?: { name?: string; parentId?: string }
  openCreate?: boolean
}

type DeptNode = { dept: Department; children: DeptNode[] }

function buildTree(departments: Department[]): DeptNode[] {
  const byId = new Map(departments.map((d) => [d.id, d]))
  const childrenOf = new Map<string, Department[]>()
  const roots: Department[] = []
  for (const d of departments) {
    if (d.parentId && byId.has(d.parentId)) {
      const arr = childrenOf.get(d.parentId) ?? []
      arr.push(d)
      childrenOf.set(d.parentId, arr)
    } else {
      roots.push(d)
    }
  }
  const toNode = (d: Department): DeptNode => ({
    dept: d,
    children: (childrenOf.get(d.id) ?? []).map(toNode),
  })
  return roots.map(toNode)
}

/** 部门子树（含自身），用于编辑父级候选排除，防环（纯函数，不依赖权限库） */
function deptSubtree(departments: Department[], rootId: string): Set<string> {
  const childrenOf = new Map<string, string[]>()
  for (const d of departments) {
    if (d.parentId) {
      const arr = childrenOf.get(d.parentId) ?? []
      arr.push(d.id)
      childrenOf.set(d.parentId, arr)
    }
  }
  const out = new Set<string>()
  const stack = [rootId]
  while (stack.length) {
    const id = stack.pop() as string
    if (out.has(id)) continue
    out.add(id)
    for (const cid of childrenOf.get(id) ?? []) stack.push(cid)
  }
  return out
}

function DepartmentTree({
  nodes,
  userCountByDept,
  canManage,
  editId,
}: {
  nodes: DeptNode[]
  userCountByDept: Map<string, number>
  canManage: boolean
  editId: string
}) {
  if (nodes.length === 0) return null
  return (
    <ul class="menu menu-sm gap-1">
      {nodes.map(({ dept, children }) => (
        <li key={dept.id}>
          <div class="flex items-center justify-between gap-2 rounded-box px-2 py-1.5 hover:bg-base-200">
            <span class="flex items-center gap-2">
              <Icon name="building" className="w-4 h-4 text-primary" />
              <span class="font-medium">{dept.name}</span>
              <span class="text-xs text-base-content/40">{userCountByDept.get(dept.id) ?? 0} 人</span>
            </span>
            {canManage && (
              <span class="flex items-center gap-1">
                <ModalOpenButton id={`edit-${dept.id}`} className="btn btn-ghost btn-xs">
                  编辑
                </ModalOpenButton>
                <ConfirmButton
                  message={`确定删除部门 ${dept.name}？若有子部门或成员则无法删除。`}
                  action="/admin/departments"
                  fields={{ intent: 'delete', departmentId: dept.id }}
                />
              </span>
            )}
          </div>
          {children.length > 0 && (
            <DepartmentTree
              nodes={children}
              userCountByDept={userCountByDept}
              canManage={canManage}
              editId={editId}
            />
          )}
        </li>
      ))}
    </ul>
  )
}

function DepartmentsPage({
  perms,
  departments,
  userCountByDept,
  canManage,
  error,
  form,
  openCreate,
}: {
  perms: PermissionMap
  departments: Department[]
  userCountByDept: Map<string, number>
  canManage: boolean
  error?: string
  form?: { name?: string; parentId?: string }
  openCreate?: boolean
}) {
  const tree = buildTree(departments)
  // 编辑某部门时，父级候选排除自身及其子树（防环）
  const safeParentOptions = (selfId: string) => {
    const blocked = deptSubtree(departments, selfId)
    return departments.filter((d) => d.id !== selfId && !blocked.has(d.id))
  }
  return (
    <div>
      <title>部门管理 - RBAC</title>
      <PageHeader
        title="部门管理"
        subtitle={`共 ${departments.length} 个组织单元`}
        actions={
          canManage && <ModalOpenButton id="create-dept-modal">创建部门</ModalOpenButton>
        }
      />

      <div class="card bg-base-100 shadow p-4">
        {tree.length === 0 ? (
          <p class="text-sm text-base-content/50">还没有部门，点击右上角创建第一个组织单元。</p>
        ) : (
          <DepartmentTree nodes={tree} userCountByDept={userCountByDept} canManage={canManage} editId="" />
        )}
      </div>

      {canManage && (
        <>
          {/* 创建部门 modal */}
          <Modal id="create-dept-modal" title="创建部门" open={openCreate}>
            <form method="post" action="/admin/departments" class="fieldset gap-3">
              <input type="hidden" name="intent" value="create" />
              {error && (
                <div role="alert" class="alert alert-error alert-sm text-sm">
                  {error}
                </div>
              )}
              <FormField label="部门名称" name="name" required placeholder="如 华东区" value={form?.name} />
              <fieldset class="fieldset mt-1">
                <legend class="fieldset-legend">上级部门（留空为顶级）</legend>
                <select name="parentId" class="select select-sm w-full" aria-label="上级部门">
                  <option value="">（顶级部门）</option>
                  {departments.map((d) => (
                    <option value={d.id} selected={form?.parentId === d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </fieldset>
              <ModalActions cancelId="create-dept-modal" submitLabel="创建" />
            </form>
          </Modal>

          {/* 编辑部门 modal（每部门一个） */}
          {departments.map((d) => (
            <Modal
              key={d.id}
              id={`edit-${d.id}`}
              title={
                <span>
                  编辑部门 <span class="text-sm font-normal text-base-content/60">{d.name}</span>
                </span>
              }
            >
              <form method="post" action="/admin/departments" class="fieldset gap-3">
                <input type="hidden" name="intent" value="update" />
                <input type="hidden" name="departmentId" value={d.id} />
                <FormField label="部门名称" name="name" required placeholder="部门名称" value={d.name} />
                <fieldset class="fieldset mt-1">
                  <legend class="fieldset-legend">上级部门（不可选自身或下级，防环）</legend>
                  <select name="parentId" class="select select-sm w-full" aria-label="上级部门">
                    <option value="">（顶级部门）</option>
                    {safeParentOptions(d.id).map((p) => (
                      <option value={p.id} selected={d.parentId === p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </fieldset>
                <ModalActions cancelId={`edit-${d.id}`} submitLabel="保存" />
              </form>
            </Modal>
          ))}
        </>
      )}
    </div>
  )
}

export default createRoute(requireAuth, requirePermission('org:department:manage'), async (c) => {
  const perms = c.get('permissions') as PermissionMap
  const departments = db.select().from(schema.departments).orderBy(schema.departments.order, schema.departments.name).all()
  const users = db.select().from(schema.users).all()
  const userCountByDept = new Map<string, number>()
  for (const u of users) {
    if (u.departmentId) {
      userCountByDept.set(u.departmentId, (userCountByDept.get(u.departmentId) ?? 0) + 1)
    }
  }
  return c.render(
    <DepartmentsPage
      perms={perms}
      departments={departments}
      userCountByDept={userCountByDept}
      canManage={perms.has('org:department:manage')}
    />,
  )
})

export const POST = createRoute(requireAuth, requirePermission('org:department:manage'), async (c) => {
  const perms = c.get('permissions') as PermissionMap
  const body = await c.req.parseBody({ all: true })
  const action = String(body.intent ?? '')

  if (action === 'create') {
    const rawName = String(body.name ?? '').trim()
    const parentId = body.parentId ? String(body.parentId) : null
    if (!rawName) {
      const departments = db.select().from(schema.departments).all()
      return c.render(
        <DepartmentsPage
          perms={perms}
          departments={departments}
          userCountByDept={new Map()}
          canManage
          error="部门名称不能为空"
          form={{ name: rawName, parentId: parentId ?? undefined }}
          openCreate
        />,
      )
    }
    // 校验父级存在
    if (parentId) {
      const p = db.select().from(schema.departments).where(eq(schema.departments.id, parentId)).get()
      if (!p) return c.redirect('/admin/departments?flash=error:上级部门不存在')
    }
    const order = db.select().from(schema.departments).all().length
    db.insert(schema.departments).values({ id: randomUUID(), name: rawName, parentId, order }).run()
    return c.redirect('/admin/departments?flash=success:部门已创建')
  }

  if (action === 'update') {
    const deptId = String(body.departmentId ?? '')
    const dept = db.select().from(schema.departments).where(eq(schema.departments.id, deptId)).get()
    if (!dept) return c.text('部门不存在', 404)
    const rawName = String(body.name ?? '').trim()
    const parentId = body.parentId ? String(body.parentId) : null
    if (!rawName) return c.redirect('/admin/departments?flash=error:部门名称不能为空')
    // 防环：新父级不能是「被移动部门自身或其子树成员」（挂到自身/下级均拦截）
    if (parentId) {
      const all = db.select().from(schema.departments).all()
      const subtree = deptSubtree(all, deptId)
      if (subtree.has(parentId)) {
        return c.redirect('/admin/departments?flash=error:不能将部门挂到自身或下级之下')
      }
      const p = db.select().from(schema.departments).where(eq(schema.departments.id, parentId)).get()
      if (!p) return c.redirect('/admin/departments?flash=error:上级部门不存在')
    }
    db.update(schema.departments).set({ name: rawName, parentId }).where(eq(schema.departments.id, deptId)).run()
    return c.redirect('/admin/departments?flash=success:部门已更新')
  }

  if (action === 'delete') {
    const deptId = String(body.departmentId ?? '')
    const dept = db.select().from(schema.departments).where(eq(schema.departments.id, deptId)).get()
    if (!dept) return c.text('部门不存在', 404)
    const children = db.select().from(schema.departments).where(eq(schema.departments.parentId, deptId)).all()
    if (children.length) {
      return c.redirect('/admin/departments?flash=error:该部门下还有子部门，无法删除')
    }
    const members = db.select().from(schema.users).where(eq(schema.users.departmentId, deptId)).all()
    if (members.length) {
      return c.redirect('/admin/departments?flash=error:该部门仍有成员，无法删除')
    }
    db.delete(schema.departments).where(eq(schema.departments.id, deptId)).run()
    return c.redirect('/admin/departments?flash=success:部门已删除')
  }

  return c.text('未知操作', 400)
})
