import { describe, it, expect, afterEach } from 'vitest'
import { formatSqlLog, isSqlLogEnabled } from '../app/lib/db/logger'

function withEnv(env: Record<string, string | undefined>) {
  const saved = Object.fromEntries(Object.entries(env).map(([k]) => [k, process.env[k]]))
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  return () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

describe('isSqlLogEnabled（DB_LOG 开关解析）', () => {
  afterEach(() => {
    delete process.env.DB_LOG
    delete process.env.NODE_ENV
  })

  it('开启值：1 / true / on / yes（大小写不敏感）', () => {
    for (const v of ['1', 'true', 'on', 'yes', 'TRUE', 'On', 'YES']) {
      const restore = withEnv({ DB_LOG: v })
      expect(isSqlLogEnabled(), `DB_LOG=${v}`).toBe(true)
      restore()
    }
  })

  it('未设置 / 0 / false / off → 关闭', () => {
    for (const v of [undefined, '0', 'false', 'off', '']) {
      const restore = withEnv({ DB_LOG: v })
      expect(isSqlLogEnabled(), `DB_LOG=${String(v)}`).toBe(false)
      restore()
    }
  })

  it('测试环境（NODE_ENV=test）即使 DB_LOG=true 也静默', () => {
    const restore = withEnv({ DB_LOG: 'true', NODE_ENV: 'test' })
    expect(isSqlLogEnabled()).toBe(false)
    restore()
  })
})

describe('formatSqlLog（分类 / 耗时 / 脱敏）', () => {
  it('无 params 时不输出 params 段，带动词分类', () => {
    expect(formatSqlLog('SELECT 1', [])).toBe('[sql:SELECT] SELECT 1')
  })

  it('有 params 时输出 JSON 参数', () => {
    expect(formatSqlLog('SELECT * FROM users WHERE id = ?', ['u1'])).toBe(
      '[sql:SELECT] SELECT * FROM users WHERE id = ? -- params: ["u1"]',
    )
  })

  it('动词分类：INSERT / UPDATE / DELETE / 未知 → SQL', () => {
    expect(formatSqlLog('insert into t (a) values (?)', [1])).toBe('[sql:INSERT] insert into t (a) values (?) -- params: [1]')
    expect(formatSqlLog('update t set a = ?', [1])).toBe('[sql:UPDATE] update t set a = ? -- params: [1]')
    expect(formatSqlLog('delete from t', [])).toBe('[sql:DELETE] delete from t')
    expect(formatSqlLog('PRAGMA table_info("x")', [])).toBe('[sql:PRAGMA] PRAGMA table_info("x")')
  })

  it('耗时与来源标注：readonly + ms', () => {
    expect(formatSqlLog('SELECT 1', [], { ms: 3, source: 'readonly' })).toBe('[sql:SELECT:readonly:3ms] SELECT 1')
    expect(formatSqlLog('SELECT 1', [], { ms: 12.6 })).toBe('[sql:SELECT:13ms] SELECT 1')
  })

  it('颜色开关：color=true 时动词带 ANSI 转义，false 默认纯文本', () => {
    const colored = formatSqlLog('SELECT 1', [], { color: true })
    expect(colored).toContain('\x1b[36m') // SELECT 青色
    expect(formatSqlLog('SELECT 1', [], { color: false })).toBe('[sql:SELECT] SELECT 1')
  })

  it('64 位十六进制（session token）脱敏', () => {
    const token = 'a'.repeat(64)
    expect(formatSqlLog('SELECT * FROM sessions WHERE id = ?', [token])).toBe(
      `[sql:SELECT] SELECT * FROM sessions WHERE id = ? -- params: ["[REDACTED]"]`,
    )
  })

  it('普通短字符串不受脱敏影响', () => {
    expect(formatSqlLog('SELECT * FROM users WHERE id = ?', ['abc123'])).toBe(
      '[sql:SELECT] SELECT * FROM users WHERE id = ? -- params: ["abc123"]',
    )
  })

  it('BigInt 参数 JSON 化兜底不抛错', () => {
    expect(() => formatSqlLog('SELECT * FROM t WHERE x = ?', [BigInt(1)])).not.toThrow()
  })
})
