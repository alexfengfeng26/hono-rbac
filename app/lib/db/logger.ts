import type { Logger } from 'drizzle-orm/logger'
import '../env' // 副作用：确保任何入口（含独立跑 exec.ts）都已加载 .env（DB_LOG）

/**
 * SQL 日志工具（DB_LOG 开关，默认关闭）。
 * - 主库：drizzle logger（SqlLogger，含 params；logQuery 在执行前触发，无耗时）
 * - ChatBI 只读库：runReadonlyQuery 执行后打印（含耗时 ms + source=readonly）
 * - 输出格式：[sql:SELECT] / [sql:UPDATE:2ms] / [sql:SELECT:readonly:3ms]
 * - 动词分类着色（终端 TTY 时启用，重定向/管道自动降级纯文本）
 * - 测试环境（NODE_ENV=test）强制静默
 */

const ENABLED_VALUES = new Set(['1', 'true', 'on', 'yes'])
const KNOWN_VERBS = new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'BEGIN', 'COMMIT', 'PRAGMA'])

/** 是否开启 SQL 日志：DB_LOG ∈ {1,true,on,yes}（大小写不敏感）；测试环境强制关闭 */
export function isSqlLogEnabled(): boolean {
  if (process.env.NODE_ENV === 'test') return false
  const v = String(process.env.DB_LOG ?? '').trim().toLowerCase()
  return ENABLED_VALUES.has(v)
}

/** 从 SQL 首词分类动词（SELECT/INSERT/UPDATE/DELETE…），未知归为 SQL */
function classifyVerb(query: string): string {
  const m = query.match(/^\s*([A-Za-z]+)/)
  const word = (m?.[1] ?? '').toUpperCase()
  return KNOWN_VERBS.has(word) ? word : 'SQL'
}

const ANSI = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m', // SELECT
  green: '\x1b[32m', // INSERT
  yellow: '\x1b[33m', // UPDATE
  red: '\x1b[31m', // DELETE
  gray: '\x1b[90m', // 其他（事务/迁移等）
}

const VERB_COLOR: Record<string, string> = {
  SELECT: ANSI.cyan,
  INSERT: ANSI.green,
  UPDATE: ANSI.yellow,
  DELETE: ANSI.red,
}

export type SqlLogOpts = {
  /** 执行耗时（ms），只读库提供；主库 drizzle logger 无法获取 */
  ms?: number
  /** 来源：db（主库）| readonly（问数只读库） */
  source?: 'db' | 'readonly'
  /** 是否启用 ANSI 颜色（默认由 logSql 按 TTY 判定） */
  color?: boolean
}

/** 64 位十六进制（session token）视为敏感值脱敏；JSON 序列化兜底（BigInt/循环引用） */
function safeJson(value: unknown[]): string {
  let json: string
  try {
    json = JSON.stringify(value)
  } catch {
    json = String(value)
  }
  return json.replace(/"[0-9a-f]{64}"/gi, '"[REDACTED]"')
}

/** 格式化一行 SQL 日志：`[sql:SELECT:3ms] <query> -- params: [...]`（color 时仅动词着色） */
export function formatSqlLog(query: string, params: unknown[], opts: SqlLogOpts = {}): string {
  const verb = classifyVerb(query)
  const verbText = opts.color ? `${VERB_COLOR[verb] ?? ANSI.gray}${verb}${ANSI.reset}` : verb
  const parts = ['sql', verbText]
  if (opts.source === 'readonly') parts.push('readonly')
  if (opts.ms !== undefined) parts.push(`${Math.round(opts.ms)}ms`)

  let out = `[${parts.join(':')}] ${query}`
  if (params.length) out += ` -- params: ${safeJson(params)}`
  return out
}

/** 按开关打印 SQL 日志（动态读 env；TTY 时自动着色，NO_COLOR 可强制关闭） */
export function logSql(query: string, params: unknown[] = [], opts: SqlLogOpts = {}): void {
  if (!isSqlLogEnabled()) return
  const color = opts.color ?? (process.stdout.isTTY === true && process.env.NO_COLOR === undefined)
  console.log(formatSqlLog(query, params, { ...opts, color }))
}

/** 主库 drizzle logger：PreparedQuery 的 run/all/get/values 全部触发（含 params，无耗时） */
export class SqlLogger implements Logger {
  logQuery(query: string, params: unknown[]): void {
    logSql(query, params, { source: 'db' })
  }
}
