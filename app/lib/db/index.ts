import '../env' // 副作用：加载项目根目录 .env（DB_FILE / DB_LOG 等），必须先于下方配置读取
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'
import { isSqlLogEnabled, SqlLogger } from './logger'

const sqlite = new Database(process.env.DB_FILE ?? 'sqlite.db')
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

// DB_LOG=1/true/on 时开启 SQL 日志（含 params；logger 在模块加载时固定，运行中改 DB_LOG 需重启）。
// 注意：migrate() 走同一 session，开启后迁移 SQL 也会被打印。
export const db = drizzle(sqlite, { schema, logger: isSqlLogEnabled() ? new SqlLogger() : false })

// 启动时自动应用迁移（幂等，__drizzle_migrations 表记录已应用批次）
migrate(db, { migrationsFolder: './drizzle' })

export { schema }
