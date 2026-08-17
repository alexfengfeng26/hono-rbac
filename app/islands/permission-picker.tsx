import { useState } from 'hono/jsx/dom'
import { Icon, type IconName } from '../components/icon'

type Perm = { name: string; description: string }

type GroupMeta = { key: string; name: string; icon: string }

type Props = {
  /** 全部可选权限（来自 PERMISSIONS 常量或数据库查询） */
  permissions: Perm[]
  /** 当前已选中的权限名集合 */
  selected: string[]
  /** 复选框 name，提交时拼入表单 */
  name?: string
  /** 真实分组目录（含 key/name/icon），用于按 resource 前缀归组并展示图标 */
  groups?: GroupMeta[]
}

/** 权限分配面板：按 resource 前缀归组（匹配真实分组目录），可折叠、带实时搜索过滤（客户端） */
export default function PermissionPicker({
  permissions,
  selected,
  name = 'permissions',
  groups = [],
}: Props) {
  const [query, setQuery] = useState('')
  // 受控状态：勾选集合，既保证 SSR 输出正确的 checked 属性，
  // 也避免 hono/jsx 把 defaultChecked 渲染成浏览器不认的字面属性导致回显失效。
  const [checkedSet, setCheckedSet] = useState<Set<string>>(new Set(selected))
  const q = query.trim().toLowerCase()

  // 全选/清空：作用于组内全量（与搜索过滤无关），基于函数式更新器
  const toggleGroup = (list: Perm[], on: boolean) =>
    setCheckedSet((prev) => {
      const next = new Set(prev)
      for (const p of list) {
        if (on) next.add(p.name)
        else next.delete(p.name)
      }
      return next
    })

  const groupByKey = new Map(groups.map((g) => [g.key, g]))
  const grouped = new Map<string, { meta?: GroupMeta; list: Perm[] }>()
  for (const p of permissions) {
    const resource = p.name.split(':')[0] || 'other'
    if (!grouped.has(resource)) grouped.set(resource, { meta: groupByKey.get(resource), list: [] })
    grouped.get(resource)!.list.push(p)
  }

  const sections = [...grouped.entries()]
    .map(([resource, { meta, list }]) => {
      const filtered = list.filter(
        (p) => !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
      )
      return {
        resource,
        groupName: meta?.name ?? resource.charAt(0).toUpperCase() + resource.slice(1),
        icon: (meta?.icon ?? 'permissions') as IconName,
        fullList: list,
        list: filtered,
      }
    })
    .filter((s) => s.list.length > 0)
    .sort((a, b) => a.groupName.localeCompare(b.groupName))

  return (
    <div class="flex flex-col gap-3">
      <input
        type="search"
        class="input input-sm w-full"
        placeholder="搜索权限（名称或描述）"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        aria-label="搜索权限"
      />
      <div class="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
        {sections.map(({ resource, groupName, icon, fullList, list }) => (
          <details class="border border-base-300/70 rounded-box" open>
            <summary class="cursor-pointer select-none px-3 py-2 text-sm font-medium flex items-center justify-between gap-2">
              <span class="flex items-center gap-2">
                <Icon name={icon} className="w-4 h-4 text-primary" />
                {groupName}
              </span>
              <span class="flex items-center gap-1.5">
                <button
                  type="button"
                  class="btn btn-ghost btn-xs px-2"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    toggleGroup(fullList, true)
                  }}
                >
                  全选
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-xs px-2"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    toggleGroup(fullList, false)
                  }}
                >
                  清空
                </button>
                <span class="text-xs text-base-content/40">{list.length}</span>
              </span>
            </summary>
            <div class="px-3 pb-3 grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-1">
              {list.map((p) => (
                <label class="flex items-center gap-2 py-2 pr-2 pl-1 rounded-lg cursor-pointer hover:bg-base-200/40 min-w-0">
                  <input
                    type="checkbox"
                    name={name}
                    value={p.name}
                    checked={checkedSet.has(p.name)}
                    onChange={(e) => {
                      const el = e.target as HTMLInputElement
                      const on = el.checked
                      setCheckedSet((prev) => {
                        const next = new Set(prev)
                        if (on) next.add(p.name)
                        else next.delete(p.name)
                        return next
                      })
                    }}
                    class="checkbox shrink-0"
                  />
                  <span class="flex-1 min-w-0 flex flex-col">
                    <span class="font-mono text-sm truncate">{p.name}</span>
                    <span class="text-xs text-base-content/50 truncate">{p.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </details>
        ))}
        {sections.length === 0 && (
          <p class="text-sm text-base-content/50 py-2 text-center">无匹配的权限</p>
        )}
      </div>
    </div>
  )
}
