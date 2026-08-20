import type { Child } from 'hono/jsx'

/** hono/jsx 官方子节点类型 */
export type Node = Child

type ModalProps = {
  /** 唯一 id，打开按钮通过 data-open-dialog 关联，脚本统一控制显示 */
  id: string
  title: Node
  children: Node
  /** 初始是否展开（如表单校验失败时自动打开创建弹窗） */
  open?: boolean
  /** 追加到 modal-box 上的 class（如 max-w-3xl 控制弹窗宽度），默认不加 */
  boxClass?: string
}

/** 打开按钮：点击触发全局脚本打开对应 <dialog> */
export function ModalOpenButton({
  id,
  className = 'btn btn-primary btn-sm',
  children,
}: {
  id: string
  className?: string
  children: Node
}) {
  return (
    <button type="button" class={className} data-open-dialog={id}>
      {children}
    </button>
  )
}

/** 单例弹窗触发按钮：values 在打开时由 islands/row-modal.tsx 填入目标弹窗表单 */
export function RowModalOpenButton({
  id,
  values,
  label,
  className = 'btn btn-ghost btn-xs',
  children,
}: {
  /** 目标 <dialog> 的 id */
  id: string
  /** 打开时按 name 填入表单的字段值（数组对应同名 checkbox 组） */
  values: Record<string, unknown>
  /** 可选，写入弹窗内 [data-row-modal-label] 占位的文本（如邮箱/名称） */
  label?: string
  className?: string
  children: Node
}) {
  return (
    <button
      type="button"
      class={className}
      data-row-modal-open={id}
      data-values={JSON.stringify(values)}
      {...(label !== undefined ? { 'data-label': label } : {})}
    >
      {children}
    </button>
  )
}

/**
 * Modal 容器：基于原生 <dialog>，自带焦点陷阱与 ESC 关闭。
 * 打开/关闭由渲染器注入的全局脚本统一处理（data-open-dialog / data-close-dialog / .modal-backdrop）。
 */
export function Modal({ id, title, children, open = false, boxClass = '' }: ModalProps) {
  return (
    <dialog
      id={id}
      class="modal"
      aria-labelledby={`${id}-title`}
      aria-modal="true"
      {...(open ? { 'data-auto-open': 'true' } : {})}
    >
      <div class={`modal-box max-h-[85vh] overflow-y-auto ${boxClass}`.trim()}>
        <h3 id={`${id}-title`} class="font-bold text-lg">
          {title}
        </h3>
        <div class="mt-4">{children}</div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button type="button" data-close-dialog={id} aria-label="关闭">
          关闭
        </button>
      </form>
    </dialog>
  )
}

/** 底部操作区：取消（关闭 dialog）+ 提交按钮 */
export function ModalActions({
  cancelId,
  submitLabel = '保存',
  submitClass = 'btn btn-primary',
}: {
  cancelId: string
  submitLabel?: string
  submitClass?: string
}) {
  return (
    <div class="modal-action">
      <button type="button" class="btn btn-ghost" data-close-dialog={cancelId}>
        取消
      </button>
      <button type="submit" class={submitClass}>
        {submitLabel}
      </button>
    </div>
  )
}
