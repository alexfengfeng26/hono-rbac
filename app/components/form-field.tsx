type FormFieldProps = {
  label: string
  name: string
  type?: 'text' | 'email' | 'password'
  required?: boolean
  placeholder?: string
  minLength?: number
  /** 回填值（校验失败时保留用户输入） */
  value?: string
  /** 字段级错误信息 */
  error?: string
}

/** 统一表单字段：fieldset-label + input（input w-full），支持回填与内联错误 */
export function FormField({
  label,
  name,
  type = 'text',
  required,
  placeholder,
  minLength,
  value,
  error,
}: FormFieldProps) {
  return (
    <>
      <label class="fieldset-label" for={name}>
        {label}
      </label>
      <input
        name={name}
        id={name}
        type={type}
        required={required}
        placeholder={placeholder}
        minlength={minLength}
        value={value}
        class={`input w-full ${error ? 'input-error' : ''}`}
      />
      {error && <p class="text-xs text-error mt-0.5">{error}</p>}
    </>
  )
}
