import { useRef } from 'hono/jsx/dom'

type Props = {
  message: string
  /** 提交目标（如 /admin/users） */
  action: string
  /** 随表单提交的隐藏字段（如 { action: 'delete', userId: '...' }） */
  fields: Record<string, string>
  /** 触发按钮文案，默认「删除」 */
  label?: string
}

export default function ConfirmButton({ message, action, fields, label = '删除' }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = `confirm-${Math.random().toString(36).slice(2, 8)}`

  return (
    <>
      <button
        type="button"
        class="btn btn-ghost btn-xs text-error"
        onClick={() => dialogRef.current?.showModal()}
      >
        {label}
      </button>
      <dialog ref={dialogRef} class="modal" aria-labelledby={titleId} aria-modal="true">
        <div class="modal-box p-4">
          <h3 id={titleId} class="font-semibold text-base">
            确认操作
          </h3>
          <p class="py-2.5 text-xs text-base-content/70">{message}</p>
          <form method="post" action={action}>
            {Object.entries(fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <div class="modal-action mt-2">
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                onClick={() => dialogRef.current?.close()}
              >
                取消
              </button>
              <button type="submit" class="btn btn-error btn-sm">
                确认{label !== '删除' ? label : ''}
              </button>
            </div>
          </form>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button type="button" onClick={() => dialogRef.current?.close()} aria-label="关闭">
            关闭
          </button>
        </form>
      </dialog>
    </>
  )
}
