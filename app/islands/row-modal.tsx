import { useEffect } from 'hono/jsx/dom'

/**
 * 单例行弹窗控制器：替代「每行一个 Modal」的 O(n) DOM 膨胀。
 *
 * 用法：页面只渲染一个 <Modal>（内含空表单），每行的触发按钮用
 * RowModalOpenButton（components/modal.tsx）携带：
 *   data-row-modal-open="<dialog id>"  目标弹窗
 *   data-values='{"name":"…","roles":["id1"]}'  打开时填入表单的字段值
 *   data-label="…"  可选，写入弹窗内 [data-row-modal-label] 占位（如标题里的邮箱）
 *
 * 填充规则：按 input/select 的 name 匹配 values 键；checkbox 组按 value 勾选；
 * values 未覆盖的非隐藏字段复位为空/未勾选，避免沿用上一行的值。
 */
export default function RowModal() {
  useEffect(() => {
    const onClick = (e: Event) => {
      const trigger = (e.target as HTMLElement).closest('[data-row-modal-open]')
      if (!(trigger instanceof HTMLElement)) return
      const id = trigger.getAttribute('data-row-modal-open')
      const dialog = id ? document.getElementById(id) : null
      if (!(dialog instanceof HTMLDialogElement)) return

      let values: Record<string, unknown> = {}
      try {
        values = JSON.parse(trigger.getAttribute('data-values') ?? '{}')
      } catch {
        /* 非法 JSON 视为空值 */
      }

      const label = dialog.querySelector('[data-row-modal-label]')
      if (label) label.textContent = trigger.getAttribute('data-label') ?? ''

      const fields = dialog.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        'input[name], select[name]',
      )
      fields.forEach((el) => {
        const key = el.getAttribute('name') as string
        if (!(key in values)) {
          // 未提供的字段复位（隐藏域如 intent 保持不变）
          if (el instanceof HTMLInputElement) {
            if (el.type === 'checkbox') el.checked = false
            else if (el.type !== 'hidden') el.value = ''
          } else {
            el.selectedIndex = 0
          }
          return
        }
        const v = values[key]
        if (el instanceof HTMLInputElement && el.type === 'checkbox') {
          el.checked = Array.isArray(v) ? v.map(String).includes(el.value) : Boolean(v)
        } else {
          el.value = v == null ? '' : String(v)
        }
      })
      dialog.showModal()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])
  return null
}
