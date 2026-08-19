# peiw 全面升级方案

- **状态**：规划（未实施）
- **范围**：当前仓库（HonoX + SQLite RBAC 后台），不含推倒重写
- **日期**：2026-08-19
- **读者**：后续实现与评审

本文基于现有代码（`app/`、`tests/`、`drizzle/`）给出可执行的升级路径。每一项都对应现存短板或明确业务缺口，不写「业界常见所以要做」的空建议。

---

## 1. 现状判断

系统已经是一套可用的 **IAM + 后台壳**：

- 认证：scrypt 密码、HttpOnly Cookie 会话、CSRF、登录失败锁定、改密踢其它设备
- 授权：`resource:action` 权限点、角色继承闭包、菜单按权限过滤、统一 403
- 组织：部门树、用户归属
- 体验：SSR + Islands、命令面板、通知中心骨架、多主题、批量操作
- 质量：Vitest 覆盖认证、RBAC 回归、菜单、SQL 日志；启动幂等 `ensure*`

它适合作为 **单机 / 小团队管理后台** 继续演进，不适合在未补齐下列缺口前直接当生产多实例服务或陪玩业务中台。

### 1.1 已具备的能力（不要重做）

| 能力 | 落点 | 升级时的态度 |
| --- | --- | --- |
| 文件系统路由 + SSR 表单 | `app/routes/**` | 保留。写操作用 POST + `intent`，不要先上 SPA |
| Islands 局部水合 | `app/islands/` | 保留。新交互优先 Island，不引入 React/Vue |
| Drizzle schema + 迁移 | `app/lib/db/schema.ts`、`drizzle/` | 所有表结构变更必须走迁移 |
| 权限闭包 + 防环 | `getRoleClosure` | 业务权限继续复用这套模型 |
| 防锁死（末位 admin） | `users.tsx` / `roles.tsx` | 新写路径必须复用同一规则 |
| 测试用内存库 | `tests/setup.ts` | 新功能默认补集成测试 |

### 1.2 主要短板（按影响排序）

| # | 短板 | 证据 | 影响 |
| --- | --- | --- | --- |
| 1 | 会话 token 明文入库 | `sessions.id` 即 cookie 值 | 库泄露等于全部登录态失窃 |
| 2 | 登录限流只在进程内存 | `login.tsx` 的 `Map` | 多进程失效；重启即清零 |
| 3 | 列表过滤/分页在内存 | `users.tsx` `buildUsersView` 先全表再 `filter`/`slice` | 用户上千后延迟与内存线性涨 |
| 4 | 无审计日志 | schema 无 audit 表 | 无法追责「谁改了谁的角色」 |
| 5 | 无数据范围（行级） | `PermissionMap` 只有权限名集合 | 部门只是展示字段，区运营能看到全国用户 |
| 6 | 无健康检查 / 可观测 | 无 `/health`；日志是 `hono/logger` | 无法接入部署探活与排障 |
| 7 | 无 CI、Docker、单锁文件 | 同时存在 `package-lock.json` 与 `pnpm-lock.yaml`；无 ESLint 脚本 | 构建不可复现 |
| 8 | 路由文件过大、职责混杂 | `admin/users.tsx` ~900 行，视图 + 校验 + 写路径一体 | 改一处易回归 |
| 9 | 通知只有读接口 | `notifications` 表 + `GET/POST /api/notifications`，无生产者 | 铃铛永远是空的 |
| 10 | Flash 走 URL query | `?flash=success:...` | 进浏览器历史与访问日志；可被书签固化 |
| 11 | 登录页展示 seed 口令 | `login.tsx` 底部文案 | 生产误开即泄露默认管理员 |
| 12 | 会话无设备指纹 | `sessions` 只有 id / userId / 时间 | 「我的会话」无法区分设备 |
| 13 | `Clear-Site-Data: "cache"` 过猛 | `_middleware.ts` | 可能清掉同 origin 其它资源缓存 |
| 14 | 预设头像资源未接入 | `public/avatars/*.png` 无引用 | 死资源 |
| 15 | logger 残留 ChatBI 注释 | `app/lib/db/logger.ts` | 说明代码从其它项目拷来，边界未清理 |
| 16 | 写接口权限在 handler 内判断 | `users.tsx` POST 先 parse 再 `perms.has` | 与 GET 的 middleware 风格不一致，易漏 |

这些短板决定了阶段划分：**先让现有后台能安全上线，再补管理能力，再谈平台化与业务域。**

---

## 2. 目标与原则

### 2.1 目标（12 个月内）

1. **可上线**：单实例 SQLite 部署也满足基本安全、备份、探活、审计。
2. **可运营**：管理员能查操作记录、管会话、发通知、按部门看人；列表走数据库分页。
3. **可扩展**：权限模型增加「数据范围」而不破坏现有 `Set<string>` 调用点；业务表能挂同一套守卫。
4. **可交接**：路由拆薄、CI 绿、文档与 `.env.example` 齐全。

非目标（本方案明确不做）：

- 不把栈换成 Next.js / Nest / Spring。
- 不为了「微服务」拆进程。
- 不在 P0/P1 引入 Redis / Postgres / 消息队列（除非并发或备份需求被实测打穿）。
- 不在 IAM 未生产就绪时并行开发陪玩订单主链路。

### 2.2 设计原则

1. **增量，可回滚**：每个阶段可独立合并；schema 变更可向前兼容一版。
2. **SSR 优先**：新页面继续表单 POST；只有交互密度高的控件做 Island。
3. **权限双检**：菜单隐藏不等于接口放行；写路径必须 `requirePermission`。
4. **测试锁行为**：防锁死、继承环、CSRF、限流、审计写入必须有测试。
5. **SQLite 用到头**：WAL + 备份足够支撑中小后台；换库是 P2 决策，不是默认动作。

---

## 3. 关键决策

### D1. 继续 HonoX，不换前端框架

**原因**：页面是管理后台，交互以表格和表单为主，现有 Islands 已覆盖命令面板、批量条、权限选择器。换 React 管理端会重写全部路由与测试，收益低于拆文件与补测试。

**后果**：组件生态继续自建（`app/components`）；图表等用轻量 SVG 或后补 Island，不上重型图表库除非仪表盘有真实指标。

### D2. P0/P1 留在 SQLite，P2 再评估 Postgres

**原因**：Drizzle 已抽象 schema；当前瓶颈是「全表拉进内存过滤」，不是 SQLite 本身。先把查询下推到 SQL。若出现多实例写入或备份/只读分离需求，再加 `drizzle` postgres dialect，schema 大部分可复用。

**触发换库的条件**（满足任一条再立项）：

- 需要 ≥2 个无共享磁盘的应用实例同时写
- 需要点-in-time 恢复或托管备份
- 单库体积或写锁等待被监控打到阈值

### D3. 权限模型演进为「功能权限 ∪ 数据范围」，而不是重做 ABAC

**原因**：代码注释写明曾去掉行级 scope，当前 `PermissionMap = Set<string>`。陪玩/多机构场景缺的是「能看哪些部门的数据」，不是属性规则引擎。

**做法**：

- 保留 `Set<string>` 作为功能权限。
- 新增 `DataScope`（见 §6.5），挂在用户或角色上：`all` | `self_dept` | `dept_subtree` | `explicit_depts`。
- 列表查询统一走 `applyScope(query, user)`，禁止在页面里手写过滤。

### D4. 会话 token 改为「cookie 明文 + 库内哈希」

**原因**：现在 cookie 与 `sessions.id` 相同，备份文件或 SQL 日志（即使有脱敏，也只覆盖 64 hex 一种形态）一旦流出即可冒充。

**做法**：cookie 仍存 32 字节随机值；库内存 `sha256(token)`；查找用哈希。迁移：部署后旧会话全部失效（可接受，文档写明）。

### D5. 限流与登录锁先落库，不上 Redis

**原因**：单实例 SQLite 已能做 `login_attempts` 表；与会话同一事务可见。多实例时再抽存储接口。

### D6. 业务域（陪玩）放在 P3，且以独立表 + 独立权限前缀接入

**原因**：schema 注释已预留「机构 / 工作室」「订单 / 提现通知」，但业务实体为零。先把 IAM 做成稳定平台，再加 `play:*` / `order:*` 权限与表，避免后台半成品和业务半成品缠在一起。

### D7. 包管理锁定一种

仓库同时有 `package-lock.json` 与 `pnpm-lock.yaml`。**选定 npm**（已有 `package-lock.json` 且脚本按 npm 写）或 **选定 pnpm** 后删除另一种锁文件，CI 只认一种。默认建议 **pnpm**（更快、更严），但以团队习惯为准，必须二选一。

---

## 4. 分阶段总览

```
P0  生产就绪（2–3 周）     安全 + 工程底座，现有功能行为基本不变
P1  后台成熟（4–6 周）     审计、范围雏形、会话增强、通知生产、路由拆分
P2  平台化（6–8 周）       数据范围落地、JSON API、备份、可观测、换库评估
P3  业务接入（独立立项）    陪玩域：人员/档期/订单/结算，只依赖 P1 完成的 IAM
```

依赖关系：

```
P0 ──► P1 ──► P2
          └──► P3（可不与 P2 并行，但不早于 P1）
```

工作量按 **1 名熟悉本仓库的全职开发** 估算，含测试与文档，不含业务需求澄清。

---

## 5. P0 — 生产就绪

目标：现有功能可安全部署到一台机器；不引入新业务概念。

### 5.1 会话哈希（必须）

- 改 `app/lib/auth/session.ts`：`createSession` 生成 token，入库 `id = sha256(token)`；`validateSession` / `destroySession` 对 cookie 做同样哈希再查。
- `sessions` 表可增加 `token_hash` 列并逐步弃用明文 id；更简单的做法是 **直接把 id 定义为哈希**，上线清会话。
- 测试：登录后 cookie ≠ 库内 id；库内记录无法直接当 cookie 使用。

### 5.2 登录锁持久化（必须）

- 新表 `login_attempts(email, fail_count, locked_until, updated_at)`，或按邮箱主键 upsert。
- 成功登录清零。与现逻辑保持：5 次失败锁 5 分钟。
- 可选：同时按 IP 计数，防止扫号（阈值单独配置）。
- 删除 `login.tsx` 里的模块级 `Map`。

### 5.3 默认口令与环境开关（必须）

- 登录页 **生产环境不展示** seed 账号。用 `NODE_ENV === 'production'` 或 `SHOW_DEMO_HINT=0`。
- seed 仅在 `db:seed` 输出到 stdout。
- 增加 `.env.example`：`DB_FILE`、`DB_LOG`、`ALLOWED_ORIGINS`、`SHOW_DEMO_HINT`、`APP_BASE_URL`。

### 5.4 Flash 改 Cookie（必须）

- 写操作 redirect 时 `setCookie('rbac_flash', 'success:...', { httpOnly, maxAge: 30, sameSite })`。
- `_renderer` 或 Toast Island 读一次后立刻清 cookie。
- URL 不再带 `flash` / `undo`。undo 改为短时效、绑定用户的服务端 token（或 flash cookie 内带 `undo` payload）。

### 5.5 缓存头收敛（必须）

- 去掉全局 `Clear-Site-Data: "cache"`（`_middleware.ts`），保留 `Cache-Control: no-store` 即可。
- HTML 的 `<meta http-equiv="Cache-Control">` 可留；不要对静态资源 `/app/style.css`、字体也 no-store。静态资源走 Vite 哈希文件名，应长期缓存。

### 5.6 探活与安全响应头

- `GET /healthz`：不鉴权；返回 `{ ok, db: "up"|"down" }`；查 `SELECT 1`。部署用它做 liveness。
- 增加 `X-Content-Type-Options: nosniff`、`Referrer-Policy`、`X-Frame-Options: DENY`（或 CSP `frame-ancestors 'none'`）。
- 生产 `Secure` cookie 已有，确认 `NODE_ENV` 在预览进程里为 `production`。

### 5.7 工程底座

| 项 | 做法 |
| --- | --- |
| 锁文件 | 二选一，删掉另一种；README 写安装命令 |
| Node 版本 | `package.json` `engines.node`，建议 `>=20` |
| `.env.example` | 提交仓库 |
| Dockerfile | 多阶段：build → `node dist/index.js`；数据目录挂卷（`sqlite.db`） |
| `compose.yml` | 仅 app + volume；P0 不引入其它服务 |
| CI | GitHub Actions / 等价：`pnpm i --frozen-lockfile` → `vitest` → `vite build` |
| lint | 加 `eslint` + `typescript-eslint` 脚本；先 warn，P1 再 error |
| 备份脚本 | `scripts/backup-db.sh`：停写或 `VACUUM INTO` 拷走 `sqlite.db` |

### 5.8 小清理（顺手，独立小 PR）

- 删 `tests/_trivial.test.ts`。
- `logger.ts` 去掉 ChatBI / readonly 库表述，或删未用的 `source: 'readonly'` 分支。
- 登录页 / README 同步「生产勿用默认密码」。

### 5.9 P0 验收

- [ ] 新登录后数据库看不到 cookie 原文
- [ ] 重启进程后登录锁定状态仍在
- [ ] 生产构建下登录页无 `admin123`
- [ ] 操作成功后地址栏无 `flash=`
- [ ] `/healthz` 在库文件只读或丢失时返回非 200
- [ ] CI 对主分支每次 push 跑通 test + build
- [ ] 现有 Vitest 全绿；新增会话哈希与限流持久化用例

---

## 6. P1 — 后台成熟

目标：运营能「查得出、管得住、拆得开」，代码不再以 900 行路由文件为单元。

### 6.1 审计日志

新表建议：

```
audit_logs
  id, actor_id, actor_email,
  action,          -- user.update / role.delete / login.fail ...
  target_type, target_id,
  before_json, after_json,   -- 可空，敏感字段脱敏
  ip, user_agent,
  created_at
```

- 在用户 / 角色 / 权限 / 部门 / 菜单的写路径，以及登录成功/失败、停用账号、踢会话处写入。
- 用小型 `audit(c, { action, target, before, after })` 封装，禁止复制粘贴。
- 管理页 `/admin/audit`，权限 `audit:read`。内置 admin 启动回填该权限。
- 密码哈希、session token **禁止**写入 before/after。
- 列表按时间倒序、可按 actor / action / 日期过滤；P1 不做导出也可。

### 6.2 会话增强

`sessions` 增加：

- `ip`、`user_agent`（登录时写入）
- `last_seen_at`（校验会话时节流更新，例如 5 分钟一次）
- 可选 `label`（「Chrome · Windows」由 UA 解析）

「我的会话」展示 IP / UA / 最近活跃。管理员页 `/admin/users/:id` 或用户详情抽屉可踢该用户全部会话（`user:update`）。

滑动过期：访问时若剩余 TTL < 1 天则续 7 天，避免「周一登录周五被踢」同时不会让废弃会话永活。

### 6.3 查询下推

`buildUsersView` / `buildRolesView` 改为 SQL：

- `LIKE` / `instr` 搜索姓名邮箱（注意索引：`users.email` 已 unique；`name` 可加普通索引）
- `status`、`role_id` 用 JOIN + WHERE
- `ORDER BY` + `LIMIT` + `OFFSET`（或 keyset，P1 用 OFFSET 即可）
- 总数 `count(*)` 单独查

验收：用 seed 造 2000 用户，列表 P95 < 100ms（本地 SQLite）。

### 6.4 路由拆分

按页面拆，不按「分层架构」空拆：

```
app/routes/admin/users.tsx          # 只留 GET + POST 分发
app/lib/users/queries.ts            # 列表/详情查询
app/lib/users/commands.ts           # create / update / bulk*
app/lib/users/guards.ts             # 末位 admin、不能删自己
app/routes/admin/users/view.tsx     # JSX 视图（或 components/users-page.tsx）
```

角色、权限、菜单、部门同样处理。POST 入口改为：

```ts
export const POST = createRoute(requireAuth, async (c) => {
  const intent = ...
  const need = INTENT_PERM[intent]
  if (need && !c.get('permissions').has(need)) return c.text('403', 403)
  return handlers[intent](c)
})
```

或每个 intent 一个 `requirePermission` 子中间件。禁止「先改库再发现没权限」。

### 6.5 数据范围（先建模，列表先接用户模块）

```
role_scopes / user_scopes
  owner_type: 'role' | 'user'
  owner_id
  mode: 'all' | 'self_dept' | 'dept_subtree' | 'depts'
  department_id nullable
```

解析优先级：用户显式 scope > 角色 scope 并集。`admin` 角色默认 `all`。

P1 只在 **用户列表** 接上：无 `all` 的运营只能看到范围内用户。角色/权限/菜单仍全局（这些是系统配置，不是业务数据）。

测试：华东区用户看不到华北区账号；admin 不受限。

### 6.6 通知真正可用

- 系统事件写通知：用户被停用、角色被改、密码被管理员重置 → 通知当事人。
- 管理员「发送通知」小表单（`notify:send`），选用户或角色。
- 通知中心已有 GET/已读，补：单条已读、空状态文案。
- 不做实时推送（SSE/WebSocket）——刷新或打开下拉即可。

### 6.7 账号运营补全

| 项 | 说明 |
| --- | --- |
| 管理员重置密码 | 生成一次性密码或强制下次登录改密（`must_change_password` 列） |
| 首次登录改密 | seed / 管理员创建的号可打标 |
| 用户软删除 | `deleted_at`；列表默认排除；硬删除仍需 `user:delete` 且二次确认 |
| 个人资料 | 改名（邮箱变更走 `user:update` 或单独策略） |
| 头像 | 要么接入 `public/avatars` 预设，要么删掉未用资源，不要留死文件 |

### 6.8 命令面板与权限

- 「新建用户」仅当 `user:create` 时出现（现在写死在 `ACTION_COMMANDS`）。
- 动作命令改为服务端按权限注入，与导航同一数据源。

### 6.9 P1 验收

- [ ] 任意用户改角色可在审计页看到 actor / before / after
- [ ] 用户列表 SQL 分页，单测或集成测覆盖「第 2 页不重复」
- [ ] 非全局 scope 用户跨部门读不到人
- [ ] 停用用户会在通知中心出现一条
- [ ] `users.tsx` 主文件 < 250 行
- [ ] 命令面板不再给只读用户「新建用户」

---

## 7. P2 — 平台化

目标：同一套 IAM 能被第二个客户端（脚本、未来 C 端 BFF）调用；部署可观察、可备份、可评估换库。

### 7.1 JSON API（内部，非对外开放平台）

在 `app/routes/api/` 下按资源提供：

- 认证：继续 Cookie（同源管理端）+ 可选 `Authorization: Bearer`（个人访问令牌，哈希入库，权限是用户权限的子集）
- 风格：`GET/POST /api/users`，错误 `{ error, code }`，HTTP 状态与页面守卫一致
- **不要**另起一套权限逻辑；调用 `getPermissionsForUser` + `applyScope`
- 文档：手写 `docs/api.md` 即可，不必上 OpenAPI，除非出现第二个消费方

CSRF：Bearer 请求用 header 鉴权可豁免 Origin 检查；Cookie 请求仍要 CSRF。

### 7.2 可观测

- 请求日志改为 JSON 一行（method, path, status, ms, userId），去掉默认彩色 `hono/logger` 或并存。
- 错误：`_error.tsx` 生成 `error_id`，页面展示该 id，服务端打堆栈。
- 可选：`GET /metrics` Prometheus 文本（请求计数、登录失败、SQLite 忙等待）。P2 初期有 JSON 日志即可。

### 7.3 备份与恢复

- 定时任务不内嵌 app：compose 或宿主机 cron 调 `VACUUM INTO`。
- 管理页「下载备份」仅 `admin` + 二次确认；文件流式输出，并写审计。
- 恢复 **不做** 在线一键恢复（太危险）；文档描述停机替换 `sqlite.db`。

### 7.4 存储抽象（为换库或换限流预留）

抽出极小接口，仍只有一个实现：

```ts
interface AuthStore {
  incrementLoginFail(email: string): LockState
  clearLoginFail(email: string): void
}
```

默认 SQLite。只有 D2 触发条件满足时才加 Postgres 实现 + `DATABASE_URL`。

换库步骤（到点再写详细设计）：

1. Drizzle schema 保持 SQLite 兼容类型（text / integer）
2. 新增 `drizzle.config.pg.ts` 与迁移生成
3. `better-sqlite3` 与 `postgres` 双 driver，用 env 选择
4. 双写或一次性导入脚本；会话可丢

### 7.5 认证增强（按需，可拆）

优先级从高到低：

1. **密码重置邮件**：需要 SMTP 配置；没有邮件服务就保持管理员重置。
2. **TOTP 二次验证**：`otpauth` + 备用码；管理员可强制开启。
3. **登录验证码 / Passkey**：P2 末或更后。

没有邮件基础设施时不要做「忘记密码」半成品。

### 7.6 配置与多环境

- `APP_BASE_URL`、`TRUST_PROXY`（反代后取真实 IP）
- CSRF `ALLOWED_ORIGINS` 必填才能在 production 启动（启动失败优于静默放行）
- `SESSION_TTL_DAYS` 可配

### 7.7 P2 验收

- [ ] 用 curl + Cookie/Bearer 能列出范围内用户，越权 403
- [ ] production 未配 `ALLOWED_ORIGINS` 时进程拒绝启动
- [ ] 备份文件可在另一目录 `DB_FILE=` 拉起并登录
- [ ] 审计覆盖 API 写路径

---

## 8. P3 — 业务接入（陪玩域，独立立项）

P3 不是本后台的「功能补丁」，是 **在稳定 IAM 上长业务**。此处只规定接入契约，不展开产品细节。

### 8.1 接入契约

1. 新权限一律 `域:资源:动作`，例如 `play:companion:read`、`order:payout:approve`。
2. 新权限写入 `PERMISSIONS` 常量，走现有 `ensurePermission` + admin 回填。
3. 菜单用后台「菜单管理」配置，不把业务入口写死在 `MENU_SEED` 以外的第三处。
4. 业务列表必须 `applyScope`：默认按部门子树隔离工作室数据。
5. 订单 / 提现状态变更写 `notifications` + `audit_logs`。
6. 业务表外键用户 / 部门，删除用户用软删，避免订单悬空。

### 8.2 建议的第一批业务对象（仅作规划，实施前另写设计）

| 对象 | 说明 | 依赖 IAM |
| --- | --- | --- |
| 陪玩师 / 达人档案 | 挂 `users` 或独立 `companions.user_id` | 部门 scope |
| 技能 / 品类 | 字典表 | `play:catalog:manage` |
| 档期 | 日历占用 | 本人或本部门 |
| 订单 | 下单、完成、取消、售后 | 审计 + 通知 |
| 结算 / 提现 | 状态机 | 双人审批可用两个权限点 |

P3 启动条件：P1 验收通过（尤其是审计、scope、通知）。

---

## 9. 数据模型演进一览

只列出相对当前 `schema.ts` 的增量，实施时分迁移，不要一次打进一个巨大 SQL。

| 阶段 | 表 / 列 | 用途 |
| --- | --- | --- |
| P0 | `login_attempts` | 持久登录锁 |
| P0 | `sessions.id` 改为 token 哈希（或新列） | 防库泄冒充 |
| P1 | `audit_logs` | 追责 |
| P1 | `sessions.ip/user_agent/last_seen_at` | 设备识别 |
| P1 | `users.must_change_password`、`users.deleted_at` | 运营 |
| P1 | `role_scopes` / `user_scopes` | 数据范围 |
| P1 | 通知由系统插入（表已有） | 生产者 |
| P2 | `api_tokens(id, user_id, hash, scopes, expires_at)` | Bearer |
| P3 | 业务表（另案） | 陪玩 |

迁移原则：可空列 + 默认值，避免停机改写全表；哈希会话允许一次登出所有人。

---

## 10. 安全升级清单（跨阶段）

| 项 | 阶段 | 现状 | 目标 |
| --- | --- | --- | --- |
| 密码哈希 | 已有 | scrypt | 保持；考虑提高 cost 并做算法版本前缀（已有 `scrypt:`） |
| 会话存储 | P0 | 明文 id | SHA-256 |
| CSRF | 已有 | Origin 白名单 | 生产强制配置；Bearer 豁免规则写清 |
| 登录锁 | P0 | 内存 | 落库 + 可选 IP |
| 审计 | P1 | 无 | 全写路径 |
| 权限校验位置 | P1 | POST 内手写 | 与 GET 一样进中间件 |
| 默认口令 | P0 | 登录页展示 | 生产隐藏 |
| Flash | P0 | query | cookie |
| 会话固定 | 已有 | 登录发新 token | 保持；改密已踢其它设备 |
| 文件上传 | 未做 | — | 若做头像上传：类型白名单、体积上限、不按用户文件名存 |
| 依赖扫描 | P2 | 无 | CI `npm audit` / `pnpm audit` |
| 密钥 | P2 | 无应用级 secret | 若加签名 cookie / CSRF token 再引入 `APP_SECRET` |

不建议 P0 就上 WAF、验证码、SSO。先把「库泄 = 全员沦陷」和「重启限流归零」补上。

---

## 11. 体验与前端（克制）

后台已经有主题、侧栏折叠、命令面板、空状态。P0/P1 **不要**做视觉重设计。只修功能缺口：

- Toast 改读 cookie（P0）
- 列表 loading：POST 已有按钮 loading；长查询可加骨架，非必须
- 仪表盘数字改为真实趋势前，不要假图表
- 预设头像：接或删（P1）
- `style.css` 里 WorkBuddy 色板保持；Geist 已在依赖中但正文用 Noto Sans SC —— 要么在 `@theme` 挂上 Geist 作西文，要么移出未用依赖，避免「装了没用」

无障碍：现有 focus-visible 与 reduced-motion 保留；新 Modal 继续 `aria-modal`。不做 i18n，文案保持中文。

---

## 12. 测试策略升级

现有测试质量高于平均水平（CSRF、防爆破、继承环、菜单引用）。升级时：

| 类型 | 要求 |
| --- | --- |
| 集成（`app.request`） | 每个新写路径至少：未登录 302、无权限 403、幸福路径 302、关键防锁死 |
| 单元 | `applyScope`、token 哈希、登录锁状态机、审计脱敏 |
| 回归 | 不删现有 `rbac.test.ts` / `menus.test.ts` 用例 |
| 性能冒烟 | P1 用脚本插 2k 用户后打列表（可放 `tests/perf` 或手动清单，不进默认 CI） |
| 不再增加 | `_trivial.test.ts` 这类占位 |

测试库继续 `:memory:` + seed。需要多进程限流的测试用真实临时文件 DB。

---

## 13. 文档与仓库卫生

| 项 | 动作 |
| --- | --- |
| README | P0 后补 Docker、环境变量、生产注意；去掉或注明演示口令仅开发 |
| `.env.example` | P0 提交 |
| `docs/api.md` | P2 随 API 写 |
| 本文件 | 每完成一阶段把对应验收改成「已落地」并注 PR |
| `reasonix.toml` | 已 gitignore；不要写进方案实现 |
| 双锁文件 | P0 处理 |

---

## 14. 风险与回滚

| 风险 | 缓解 | 回滚 |
| --- | --- | --- |
| 会话改哈希导致全员掉线 | 选维护窗口；README 说明 | 无法平滑回滚旧明文 cookie，属预期 |
| 查询改 SQL 后搜索语义变化 | 保持大小写不敏感的约定；补测试 | 回退该 PR，视图层过滤可临时恢复 |
| scope 配错导致 admin 看不到人 | admin 强制 `all`；无 scope 记录时默认拒绝业务数据、放行系统配置 | 关 feature flag `DATA_SCOPE=0` |
| 审计 JSON 撑爆库 | 截断字段、不存密码；P2 再考虑归档 | 停写审计列，功能仍可用 |
| Docker 卷权限 | 文档写明 uid；compose 指定 user | 改回裸 `node dist` |
| 过早上 Postgres | 坚持 D2 触发条件 | 不启动换库 PR |

---

## 15. 建议实施顺序（PR 粒度）

下列顺序可直接当里程碑。每个 PR 应可单独评审、单独回滚。

### P0

1. 锁文件与 CI、`engines`、`.env.example`
2. 会话 token 哈希 + 测试
3. `login_attempts` 表与登录锁迁移
4. Flash cookie + 去掉 URL flash/undo
5. 登录页隐藏演示口令；缓存头收敛
6. `/healthz` + 安全响应头
7. Dockerfile + 备份脚本 + logger/死测试清理

### P1

8. 拆 `users` 写路径与守卫（无行为变化）
9. 用户/角色列表 SQL 分页
10. `audit_logs` + 管理页 + 各写路径接入
11. 会话 IP/UA/滑动过期
12. `must_change_password`、管理员重置、软删除
13. scope schema + 用户列表过滤
14. 通知生产者 + 管理发送
15. 命令面板按权限注入；头像资源处理
16. 同样方式拆 roles / menus / departments

### P2

17. production 强制 `ALLOWED_ORIGINS`；`TRUST_PROXY`
18. `/api/*` 用户只读 + Bearer token
19. JSON 请求日志与 error id
20. 备份下载（admin）
21. （触发 D2 时）Postgres 适配另开设计

### P3

22. 单独《陪玩域设计》，本方案只作入口约束

---

## 16. 不做清单

避免升级过程变成重写：

- 不上 Next、不上 tRPC、不上 Prisma
- 不引入 Redis，直到出现第二个应用实例且 SQLite 文件无法共享
- 不做通用工作流引擎、规则引擎、多租户 SaaS 隔离（当前是单库部门树，不是租户）
- 不做实时协同编辑、WebSocket 通知
- 不把 daisyUI 换成其它组件库
- 不在 P0 做 MFA / SSO / LDAP
- 不把 Islands 改成「全客户端路由」
- 不为了分层而建 `services/` `repositories/` 空壳；按 `lib/<域>/queries|commands` 拆即可

---

## 17. 成功标准（总体）

升级成功不是「文档里的项都打了勾」，而是同时满足：

1. 演示账号可关、会话泄露面下降、登录锁跨重启有效。
2. 运营能回答「上周谁改过 admin 角色」。
3. 区级账号不能浏览全区用户。
4. 用户过千时列表仍可交互。
5. 新同事按 README + `.env.example` + Docker 能在 15 分钟内跑起来。
6. 业务开发只需加权限常量、菜单、表和 `applyScope`，不必改守卫内核。

若只做完 P0，系统就可以作为内部工具小范围使用。P1 完成后才建议给非开发运营使用。P3 在此之前启动，会把安全债和业务债绑在一起。
