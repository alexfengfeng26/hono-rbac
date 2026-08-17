import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 极简 .env 加载器（零依赖，无 dotenv）。
 * 读取项目根目录 .env（已 gitignore），KEY=VALUE 逐行解析注入 process.env。
 * 规则：
 * - **不覆盖**已存在的环境变量（系统/命令行注入的优先级更高）
 * - 支持 `#` 注释行、空行、单双引号包裹、行尾 ` # 注释`
 * - 幂等：进程内只执行一次
 */
let loaded = false

export function loadEnvFile(file = join(process.cwd(), '.env')): void {
  if (loaded) return
  loaded = true
  if (!existsSync(file)) return
  const text = readFileSync(file, 'utf8')
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0]
      const end = value.lastIndexOf(quote)
      if (end > 0) value = value.slice(1, end)
    } else {
      const hash = value.indexOf(' #')
      if (hash >= 0) value = value.slice(0, hash).trim()
    }
    if (key && process.env[key] === undefined) process.env[key] = value
  }
}

/** 副作用入口：确保任何入口（dev / prod / seed / tsx 脚本）在读取配置前已加载 .env */
loadEnvFile()
