# peiw

基于 **HonoX + SQLite** 的角色权限（RBAC）管理后台。提供用户、角色、权限、部门、菜单的完整管理能力，以及会话、通知、主题等后台底座能力。数据层与权限模型按「机构 / 工作室」树形组织预留，可直接作为陪玩、SaaS 后台的身份与访问控制底座。

界面文案为中文，视觉采用青绿品牌色板（WorkBuddy 风格），支持明暗多主题与侧栏折叠。

规划文档见 [`docs/`](./docs/)（含 [全面升级方案](./docs/upgrade-plan.md)）。

## 功能概览

### 身份与访问

| 能力 | 说明 |
| --- | --- |
| 登录 / 登出 | 邮箱 + 密码；HttpOnly Cookie 会话，有效期 7 天 |
| 登录防爆破 | 同一邮箱连续失败 5 次锁定 5 分钟（进程内计数） |
| 账号状态 | `active` / `disabled`；停用账号立即拒绝会话 |
| 修改密码 | 校验当前密码；改密后注销其它设备会话 |
| 会话管理 | 查看本账号全部设备会话，可注销其它设备 |

### RBAC

| 能力 | 说明 |
| --- | --- |
| 用户管理 | 创建 / 编辑 / 删除；分配角色与部门；启用停用；批量操作（含撤销停用） |
| 角色管理 | 创建 / 编辑 / 删除；勾选权限；角色继承（多层闭包 + 环检测） |
| 权限点 | `resource:action` 命名（支持多级，如 `org:department:manage`）；树形分组目录 |
| 防锁死 | 不能停用 / 删除自己；不能剥离最后一个管理员；内置 `admin` 角色不可改名或删除 |
| 权限守卫 | 未登录重定向登录页；缺权限返回统一 403 页面 |

### 组织与导航

| 能力 | 说明 |
| --- | --- |
| 部门管理 | 树形部门（总公司 → 大区 → 团队）；防环；有子部门或成员时禁止删除 |
| 菜单管理 | DB 驱动侧栏：分组 + 菜单项；按权限过滤；排序 / 显隐 / 级联删除 |
| 工作台 | 登录后首页，按权限展示快捷入口与当前权限列表 |
| 仪表盘 | 用户 / 角色 / 权限数量统计与模块入口 |

### 交互与体验

- **命令面板**（`⌘K`）：按权限可见的导航项 + 新建用户 / 切换主题 / 登出
- **通知中心**：当前用户最近 20 条站内通知，支持全部已读
- **主题**：light / dark / corporate / cupcake / nord / synthwave，本地持久化，避免闪屏
- **侧栏**：可折叠为图标模式；分组可收起；移动端抽屉
- **Toast**：URL `?flash=success:消息` 反馈（统一由 `flashRedirect` 生成，全量 URL 编码）；批量停用支持一键撤销
- **搜索 / 分页 / 排序**：用户、角色、权限列表（统一的筛选栏 `FilterBar` 与排序表头 `SortHeader`）
- **行编辑弹窗单例**：列表页共用 1 个弹窗 DOM，打开时由 `row-modal` island 按行数据填充，不随行数膨胀
- **空状态 / 面包屑 / 确认对话框 / 表单内联错误**

## 技术栈

| 层 | 选型 |
| --- | --- |
| 运行时 | Node.js，ESM |
| Web 框架 | [Hono](https://hono.dev) 4 + [HonoX](https://github.com/honojs/honox) 0.1（文件系统路由、SSR、Islands） |
| UI | Hono JSX（`hono/jsx`），无 React 运行时 |
| 样式 | Tailwind CSS 4 + daisyUI 5；Geist / Noto Sans SC 可变字体 |
| 数据库 | SQLite（[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)）+ [Drizzle ORM](https://orm.drizzle.team) |
| 构建 | Vite 8（client + SSR 两步构建，`@hono/vite-build/node`） |
| 测试 | Vitest 4，内存 SQLite |

交互热点（命令面板、通知中心、权限选择器、批量操作、确认按钮、行编辑弹窗、Toast）以 HonoX **Islands** 形式在客户端水合；页面主体走服务端渲染 + 原生 `<form>` POST，避免引入重量级前端状态库。

## 架构

```
浏览器
  │  GET 页面（SSR JSX） / POST 表单 / JSON API
  ▼
HonoX 路由（app/routes）
  ├─ 全局中间件：注入 db、请求日志、CSRF、禁止缓存
  ├─ requireAuth：校验 Cookie 会话，注入 user + permissions
  └─ requirePermission：动作级权限校验
        │
        ▼
  RBAC 核心（app/lib/rbac）
        │  角色继承闭包 → 权限名集合
        ▼
  Drizzle + better-sqlite3（WAL + 外键）
        │
        ▼
  sqlite.db（启动时自动 migrate + 幂等 ensure* 内置数据）
```

### 请求处理要点

- **文件系统路由**：`app/routes/*.tsx` 对应页面；`export const POST` 处理写操作。
- **Intent 模式**：同一 POST 入口用隐藏域 `intent` 区分 create / update / delete / 批量操作。
- **Islands**：仅对需要浏览器状态的组件加水合，其余保持 SSR。
- **无缓存**：管理页响应带 `Cache-Control: no-store`，避免列表在增删后不刷新。
- **CSRF**：Hono `csrf()`；本机任意端口默认放行，生产用 `ALLOWED_ORIGINS`。

### RBAC 模型

```
User ──< user_roles >── Role ──< role_permissions >── Permission
                              │
                              └── role_parents（继承，多层闭包，环检测）
User ── department（树）
Permission ── permission_group（树，按 resource 前缀回填）
Menu（分组 / 子项，required_permission 过滤可见性）
```

权限解析：用户直接角色 ∪ 祖先角色 → 权限名 `Set`。侧栏、工作台卡片、按钮均按该集合过滤；写接口再做一次动作级校验。

内置权限点：

| 权限名 | 含义 |
| --- | --- |
| `user:read` / `user:create` / `user:update` / `user:delete` | 用户 CRUD 与角色分配 |
| `role:read` / `role:create` / `role:update` / `role:delete` | 角色与权限点维护 |
| `org:department:manage` | 部门树 |
| `menu:manage` | 导航菜单 |

内置角色：`admin`（全部权限，启动时回填新权限）与 `user`（仅 `user:read`、`role:read`）。

内置数据在进程启动时 **幂等注册**（`ensureBuiltin*`）：已存在则跳过，不会清掉 UI 新增项；被删的内置项会在下次启动恢复。

## 目录结构

```
app/
  client.ts                 # Islands 客户端入口
  server.ts                 # 启动：ensure* + createApp
  style.css                 # Tailwind / daisyUI 主题与密度
  components/               # 无状态展示组件（图标、筛选栏、排序表头、分页、Modal…）
  islands/                  # 客户端水合组件（含 row-modal 行编辑单例弹窗）
  lib/
    env.ts                  # 零依赖 .env 加载
    admin/helpers.ts        # 列表页公共助手：flashRedirect / parseListParams / buildQueryHref / parseIds / forbidUnless / fmtDate(Time)
    auth/                   # 密码（scrypt）、会话、守卫
    db/                     # schema、连接、迁移、seed、SQL 日志
    rbac/                   # 权限点、角色闭包、菜单树
  routes/
    _middleware.ts          # 全局中间件
    _renderer.tsx           # 后台布局（侧栏 / 顶栏 / 面包屑）
    login.tsx / logout.tsx
    index.tsx               # 工作台
    admin/                  # 仪表盘、用户、角色、权限、部门、菜单、资料、会话
    api/notifications.ts
drizzle/                    # 迁移 SQL
public/                     # favicon、theme.js、预设头像
tests/                      # Vitest：认证、RBAC、菜单、守卫、SQL 日志
```

### 列表页开发套件

新增列表页（如陪玩业务的类目 / 服务 / 订单）直接复用现成套件，以 `admin/users.tsx` 为样板：

- `app/lib/admin/helpers.ts`：`parseListParams`（q/page/sort/dir 归一化）、`buildQueryHref`（翻页与排序链接）、`flashRedirect`（操作反馈）、`parseIds`（批量 ids）、`forbidUnless`（POST 权限检查一行式）
- `app/components/filter-bar.tsx`：`FilterBar` + `FilterField` 筛选表单
- `app/components/data-table.tsx`：`SortHeader` 排序表头 + `EmptyRow` 空态行
- `app/islands/row-modal.tsx` + `RowModalOpenButton`（`components/modal.tsx`）：行编辑单例弹窗，按钮 `data-values` 携带行数据，island 打开时填充表单

## 快速开始

需要 Node.js（建议 20+）与 npm / pnpm。

```bash
# 安装依赖
npm install

# 生成并应用迁移（首次；dev 启动也会自动 migrate）
npm run db:generate
npm run db:migrate

# 写入演示账号（已存在 admin 则跳过）
npm run db:seed

# 开发
npm run dev
```

浏览器打开提示的本地地址（通常 `http://localhost:5173`）。

演示账号：

| 邮箱 | 密码 | 角色 |
| --- | --- | --- |
| `admin@example.com` | `admin123` | admin（全部权限） |
| `user@example.com` | `user123` | user（只读） |

密码策略：至少 8 位，且同时包含字母与数字。

### 生产构建

```bash
npm run build      # 先打 client，再打 SSR（共享 dist，不清空）
npm run preview    # node dist/index.js
```

### 测试

```bash
npm test           # vitest run，使用内存 SQLite + seed
```

覆盖认证与 CSRF、登录防爆破、改密踢会话、RBAC 守卫、角色继承环、管理员防锁死、权限-菜单引用一致性、菜单幂等与过滤、SQL 日志等。

## 环境变量

项目自带零依赖 `.env` 加载器（不覆盖已有系统变量）。可将下列项写入项目根目录 `.env`（已 gitignore）：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `DB_FILE` | `sqlite.db` | SQLite 文件路径；测试强制 `:memory:` |
| `DB_LOG` | 关闭 | `1` / `true` / `on` / `yes` 时打印 SQL（含参数；session token 脱敏）；测试环境强制静默 |
| `ALLOWED_ORIGINS` | 空 | 生产 CSRF 允许的 Origin，逗号分隔；本机 `localhost` / `127.0.0.1` 始终允许 |
| `NODE_ENV` | — | `production` 时会话 Cookie 加 `Secure` |

数据库启用 WAL 与外键。启动时自动执行 `drizzle/` 下迁移。

常用脚本：

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | Vite 开发服务器 |
| `npm run build` | client + SSR 两步构建 |
| `npm run preview` | 运行 `dist/index.js` |
| `npm run db:generate` | 根据 schema 生成迁移 |
| `npm run db:migrate` | 应用迁移 |
| `npm run db:seed` | 种子数据 |
| `npm test` | 跑测试 |

## 安全设计

- 密码：`scrypt` + 随机 salt，`timingSafeEqual` 校验
- 会话：32 字节随机 token，HttpOnly / SameSite=Lax Cookie；过期自动清理
- CSRF：所有状态变更 POST 校验 Origin
- 停用账号：拒绝会话并删除该用户 session
- 改密：踢掉其它设备
- 表单提交中按钮 loading + disabled，降低重复提交
- 管理页禁止浏览器缓存

## UI 约定

- 布局：登录态的 `/` 与 `/admin/*` 共用侧栏 + 顶栏；登录页独立居中卡片
- 密度：根字号 14px；卡片细边框、弱阴影
- 无障碍：焦点环、`prefers-reduced-motion` 关闭动画、确认框 `aria-modal`
- 错误页：自定义 404 / 500 卡片页
- 主题脚本 `public/theme.js` 在 CSS 前同步执行，避免主题与侧栏状态闪屏

## 扩展方向

当前仓库是 **IAM + 后台壳**，业务域（订单、陪玩师、结算等）尚未接入。扩展时可：

1. 在 `PERMISSIONS` / `PERMISSION_GROUPS` 增加业务权限点（启动时幂等注册）
2. 用菜单管理把新路由挂到侧栏，并设置 `requiredPermission`
3. 在 `schema.ts` 增加业务表，走 Drizzle 迁移
4. 列表页直接用「列表页开发套件」（`lib/admin/helpers.ts` + `FilterBar` + `SortHeader` + `row-modal`），以 `admin/users.tsx` 为样板
5. 用 `notifications` 投递订单、提现等事件

部门树可映射为「机构 / 工作室」；角色继承适合「运营主管继承运营专员权限」这类层级。
