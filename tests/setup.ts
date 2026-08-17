// 测试环境：内存 SQLite + seed 数据（setup 在测试文件之前执行）
process.env.DB_FILE = ':memory:'
process.env.NODE_ENV = 'test'
export {}
await import('../app/lib/db/seed')
