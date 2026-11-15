# MiyuManager 开发规划

> 状态：v1 规划已锁定；C1–C7 已实现，G2/G4 已确认；C7 待 G5 确认，确认后进入 C8
>
> 更新日期：2026-11-15  
> 目标平台：Windows 10 22H2 / Windows 11，x64 优先  
> 产品形态：本地优先的 Windows Galgame / AVG 游戏库管理器  
> 技术栈：Tauri 2 + Rust + React 19 + TypeScript + Vite + SQLite

## 1. 项目定义

MiyuManager 是一个面向 Galgame / AVG 电子游戏的本地库管理器。它不是通用游戏启动器的换皮，也不是电子书、视频或影视资料管理器。核心价值是把作品、发行版本、本地安装副本、元数据来源、启动配置、用户游玩状态和游玩时长组织成一套适合 Galgame 的数据模型，并提供高质量的桌面与电视大屏体验。

v1 的用户路径是：添加本地目录 → 扫描并确认可执行文件 → 在游戏库中找到作品 → 查看详情和来源信息 → 配置启动方式 → 启动游戏 → 自动记录时长 → 查看统计 → 在电视/大屏模式中继续使用。

v1 必须做到：

- 离线可用，不要求账号，不依赖云端服务。
- 能管理大量作品，游戏库滚动和搜索不因封面数量增加而明显退化。
- 元数据来源可追溯，字段冲突可解释、可锁定、可手动修正。
- 启动配置能处理中文和日文路径、工作目录、参数以及 Locale Emulator/NTLEA 一类包装器。
- 时长统计不注入游戏、不读取游戏内存，程序崩溃后能恢复或截断会话。
- 大屏模式是独立的 10-foot 体验，支持手柄和键盘，不是桌面界面的简单放大。
- 视觉方向明确，用真实封面、真实标题和真实状态做设计验收。

v1 明确不做：

- 电子书阅读器、视频库、影视资料馆或通用媒体中心。
- 游戏商店、购买、价格、发售新闻或商店推荐页。
- 读取游戏内进度、章节、路线、存档、成就或游戏内状态；也不伪造这些数据。
- 第三方插件市场和任意代码加载。
- 云同步、账号系统、在线商店和社交功能。
- 成就系统、路线/角色攻略跟踪、存档云备份。
- Android、macOS、Linux、Steam Deck 的正式支持。
- EGS、Getchu、DLsite 等额外来源的正式适配器；这些在 v1 后按同一 Provider 接口扩展。
- 游戏内覆盖层、注入式时长统计和反作弊兼容层。

管理器可以可靠获得的数据是：本地安装、可执行文件、工作目录、参数、环境变量、启动配置、进程会话、启动时间、结束时间、累计时长、启动次数、用户自己设置的状态/评分/收藏/备注，以及来源可追溯的元数据。游戏状态和游玩进度不属于 v1 的自动能力。

## 2. 已锁定的技术栈

| 层           | 选择                                             | 说明                                                               |
| ------------ | ------------------------------------------------ | ------------------------------------------------------------------ |
| 桌面壳       | Tauri 2.x                                        | 使用系统 WebView2；Rust 负责文件、SQLite、网络、进程和 Windows API |
| 前端         | React 19 + TypeScript                            | 面向复杂、自定义界面；不使用 SSR                                   |
| 构建         | Vite                                             | 纯 SPA；Tauri 开发和生产构建共用                                   |
| 路由         | React Router + `createHashRouter`                | 桌面本地协议下更稳；大屏作为独立路由/窗口                          |
| 样式         | Tailwind CSS 4 + CSS 变量                        | Tailwind 负责布局效率，视觉 token 自己定义                         |
| 交互原语     | Radix Primitives                                 | 只用无样式行为，不采用 shadcn 默认视觉主题                         |
| 动效         | CSS transition 为主，Motion 选择性使用           | 频繁交互优先 CSS；共享元素和编排动效再用 Motion                    |
| 数据请求     | TanStack Query                                   | 管理 Rust 命令返回的数据、缓存、失效和后台任务状态                 |
| 虚拟列表     | TanStack Virtual                                 | 大游戏库封面墙、列表和搜索结果                                     |
| 客户端状态   | Zustand                                          | 只放窗口、筛选面板、临时选择和 UI 状态                             |
| 表单         | React Hook Form + Zod                            | 启动配置、来源设置、扫描目录和手动编辑                             |
| 图标         | Lucide React + 自定义品牌图形                    | 功能图标使用统一线性图标；主视觉自己设计                           |
| 通知         | Sonner                                           | 任务失败、扫描完成、元数据更新等短反馈                             |
| 数据库       | SQLite + `sqlx` + FTS5                           | WAL、迁移、全文搜索；显式 SQL，不引入重 ORM                        |
| 网络抓取     | `reqwest` + `scraper` + `serde`                  | API 优先，HTML 源作为可控适配器                                    |
| Windows 集成 | `sysinfo` + `windows` crate                      | 进程枚举、前台窗口、路径和 Job Object                              |
| 图片处理     | `image`                                          | 原图缓存、WebP 缩略图、尺寸和校验和                                |
| IPC 类型     | `tauri-specta`                                   | 从 Rust 生成 TypeScript 类型，避免手写两份                         |
| 前端测试     | Vitest + React Testing Library + Playwright 截图 | 单元、组件和视觉回归                                               |
| Rust 测试    | `cargo test` + fixture 数据库                    | 扫描、合并、会话和启动逻辑                                         |
| 工程规范     | pnpm、ESLint、Prettier、Rustfmt、Clippy          | 每个子对话结束必须通过                                             |

### 2.1 本机环境基线

已在本机确认：

- Node `v24.22.0`
- pnpm `11.25.0`
- Rust `1.100.0`
- WebView2 Runtime `157.0.4341.46`
- Git 仓库已初始化，当前尚无提交

具体依赖版本以 `pnpm-lock.yaml` 和 `Cargo.lock` 为准。

### 2.2 已锁定的工程决策

- 包管理器使用 pnpm；不混用 npm/pnpm 锁文件。
- `src-tauri` 是唯一允许直接访问数据库、文件系统和进程的边界。
- 前端不能直接读写本地文件，也不能拼接 shell 命令。
- 长任务统一走 Rust 后台任务 + 事件进度，不在 UI 线程执行阻塞 I/O。
- 数据库从第一天启用迁移，设置为 WAL 模式；时间统一存 UTC，展示时转本地时区。
- 作品模型采用 Work → Release → LocalCopy，而不是单一 Game 表。
- 默认数据目录为 `%APPDATA%\MiyuManager`；C8 提供自定义数据目录设置，便携版在 C9 再决定。
- v1 UI 语言为简体中文，代码从 C1 开始预留 i18n key；日文/英文翻译不阻塞 v1。
- v1 默认来源优先级按字段决定：中文标题/简介优先 Bangumi，原始标题/标签/关联作品优先 VNDB，商店信息和发行日期优先 Steam。C4 已提供来源顺序、字段锁定和手动字段保护；C5 已提供字段级排序、全局顺序开关、多源冲突和批量刮削。
- 默认不采集匿名使用数据，不发送遥测。
- 游戏内进度、路线、章节、存档状态不由管理器自动读取；用户状态、评分、收藏和备注由用户维护。

## 3. 产品范围与页面

| 路由           | 页面     | 主要职责                                       |
| -------------- | -------- | ---------------------------------------------- |
| `#/`           | 首页     | 最近启动、最近入库、收藏、想玩清单、游戏库概览 |
| `#/library`    | 游戏库   | 封面墙/列表、搜索、筛选、排序、批量操作        |
| `#/work/:id`   | 作品详情 | 元数据、来源、封面、游玩状态、启动配置、会话   |
| `#/stats`      | 统计     | 总时长、热力图、周/月/年、单作品和最近会话     |
| `#/settings`   | 设置     | 扫描目录、来源、启动器、外观、数据目录、更新   |
| `#/big-screen` | 大屏模式 | 独立窗口、手柄导航、最近启动、随机、启动       |

首次启动流程必须能完成：选择扫描目录 → 扫描候选 exe → 确认主程序 → 进入游戏库。后续启动则直接进入上次页面或首页。

UI 文案使用“游戏库 / 游戏 / 游玩状态 / 已通关 / 启动游戏”；路由和数据库字段可以保留英文 `library`、`reading` 等内部命名，但不能把界面写成电子书或影院。

## 4. 架构与数据模型

### 4.1 目录结构

```text
MiyuManager/
  docs/
    DEVELOPMENT_PLAN.md
    STATUS.md
    DESIGN.md
  src/
    app/                      # 路由、窗口、启动入口
    design-system/            # token、无样式基础组件、图标规范
    features/
      home/
      library/
      work-detail/
      metadata/
      stats/
      bigscreen/
      settings/
      prototypes/             # C1 视觉原型，方向确认后收敛
    lib/                      # IPC 客户端、格式化、错误映射
  src-tauri/
    migrations/
    src/
      commands/
      domain/
      db/
      assets/
      scrapers/
      tracking/
      launcher/
      jobs/
      error.rs
      lib.rs
  tests/
    fixtures/
  scripts/
```

### 4.2 数据模型

| 表                                 | 关键字段                                                                     | 用途                           |
| ---------------------------------- | ---------------------------------------------------------------------------- | ------------------------------ |
| `works`                            | id、canonical_title、original_title、aliases_json、description、release_year | 作品级规范信息                 |
| `releases`                         | id、work_id、platform、language、release_date、developer、publisher          | 具体发行版本                   |
| `local_copies`                     | id、release_id、root_path、exe_path、working_dir、size_bytes、status         | 本机安装副本                   |
| `launch_profiles`                  | id、local_copy_id、args_json、env_json、locale_mode、wrapper_path、monitor   | 可复用启动配置                 |
| `source_records`                   | id、provider、source_id、raw_json、fetched_at、etag                          | 原始来源响应，支持审计和重放   |
| `metadata_claims`                  | id、work_id、field、value_json、source、confidence、locked、fetched_at       | 字段级来源、冲突和锁定         |
| `assets`                           | id、work_id、kind、local_path、width、height、checksum、source               | 封面、横幅、截图和缩略图       |
| `play_sessions`                    | id、local_copy_id、started_at、ended_at、duration_sec、source、exe_path      | 游玩会话                       |
| `user_entries`                     | work_id、status、rating、favorite、notes、updated_at                         | 用户游玩状态、评分、备注和收藏 |
| `collections` / `collection_items` | id、name、sort_order / collection_id、work_id                                | 自定义收藏集                   |
| `settings`                         | key、value_json                                                              | 应用设置                       |

关系是 `works 1:N releases 1:N local_copies`，`local_copies 1:1 launch_profiles`，`works N:M collections`。一个 release 可以有多个 local copy；一个 local copy 对应一个默认启动配置。

启动次数、累计时长、最近启动时间由 `play_sessions` 聚合，不额外维护游戏内进度字段。用户备注可以记录“二周目”等主观信息，但必须在 UI 中显示为用户备注，不能伪装成自动读取的游戏状态。

### 4.3 IPC 边界

核心命令按领域分组：

- `library_scan_start`、`library_scan_cancel`、`library_list`、`library_query`
- `work_get`、`work_update`、`work_merge_apply`
- `metadata_search`、`metadata_fetch`、`metadata_batch_start`、`metadata_batch_cancel`
- `launch_start`、`launch_stop`、`launch_validate`
- `sessions_list`、`session_update`、`session_delete`、`stats_get`
- `settings_get`、`settings_set`、`bigscreen_open`

长任务统一返回 `job_id`，通过 `scan.progress`、`scrape.progress`、`session.updated`、`job.failed` 等事件汇报。错误统一为 `{ code, message, details? }`，前端只展示可理解的提示，不直接把 Rust 错误堆栈扔给用户。

### 4.4 后台任务与资源边界

- 扫描、抓取、图片下载在 Rust 侧并发执行，默认限制并发数并支持取消。
- 封面原图和缩略图分开缓存；列表只加载缩略图。
- 数据库写操作串行化或使用短事务；长事务禁止跨越网络请求。
- 外部进程启动必须使用参数数组，不经过 shell；所有路径先规范化并验证。
- Tauri capability 最小化；不使用任意 shell 插件；不加载远程页面。
- 启动器只负责启动和跟踪进程，不读取游戏内存、不注入、不修改游戏文件。

## 5. 设计契约与视觉门槛

### 5.1 产品定位与视觉主张

产品是 **本地 Galgame / AVG 游戏库管理器**，不是电子书管理器、影视资料馆或游戏商店。视觉重点是游戏封面、包装、启动、游玩时长、用户状态和元数据，而不是阅读页、放映厅或商店货架。

核心主张是：**先把“游戏库”做得像游戏，再把它做得像一个可靠的本地工具。**

### 5.2 本轮视觉方向

C1 第一步已经产出三套可切换原型；G1 已选择 A 游戏启动器，B/C 保留为对照：

1. **A 游戏启动器**：深色主机式启动器，最近启动、游玩时长、横向游戏架。推荐作为主方向。
2. **B 游戏收藏架**：暖色实体包装、书脊、编号和收藏标签，信息密度高，适合大量作品和元数据。
3. **C 游玩频道**：播控蓝、OSD、最近游玩节目单，适合大屏模式和游玩记录。

三套原型共用同一组 mock 数据，都包含首页、游戏库和作品详情。完整说明见 `docs/DESIGN.md`。

不再采用“私人放映室 / 电影档案库”作为主视觉方向；也不采用游戏商店、发售新闻或“游戏内进度”作为界面卖点。

### 5.3 设计工作流

C1 的设计工作必须按 `frontend-design` Skill 的流程执行：先写设计计划（4–6 个命名色值、两类字体角色、布局 ASCII、设计原则），对照 brief review，再开始编码；完成后截图自评，并主动删掉一个不服务于内容的装饰。交互细节使用 `emil-design-eng` 的动效和焦点原则。

`docs/DESIGN.md` 最低内容：

- 视觉关键词和一句明确的设计主张。
- 4–6 个颜色 token，以及每个颜色的使用场景。
- 标题字体、界面字体、字号层级和 CJK 字体回退方案。
- Home、Library、Detail、Big Screen 四个布局的 ASCII wireframe。
- 动效原则：一个标志性过场、常规反馈时长、reduced motion。
- 明确的反模式清单：统一圆角卡片、整窗实时模糊、霓虹渐变、无意义入场动画、虚假游戏内进度、商店语汇。

设计验收不是“看起来不错”，而是：真实封面和标题不溢出；1080p、4K、150% 缩放下层级清楚；键盘焦点可见；弱网/无封面有可用的 fallback；大屏不依赖 hover；界面不出现无法自动获得的游戏内状态。

## 6. 开发阶段与子对话总览

| 阶段            | 子对话 | 规模 | 依赖       | 完成后的用户可见功能                                                        |
| --------------- | ------ | ---- | ---------- | --------------------------------------------------------------------------- |
| M0 规划         | C0     | S    | 无         | 技术栈、范围、架构、验收标准确定                                            |
| M1 基础与视觉   | C1     | L    | C0         | 应用可启动，设计系统和四个可点击静态界面                                    |
| M2 本地库与启动 | C2     | L    | C1         | 添加目录、扫描、游戏库、搜索筛选                                            |
| M2 本地库与启动 | C3     | M    | C2         | 作品详情、封面、启动配置、实际启动                                          |
| M3 元数据       | C4     | M    | C3         | VNDB/Bangumi 搜索、匹配、导入元数据                                         |
| M3 元数据       | C5     | M    | C4         | Steam、多源合并、冲突处理、批量刮削                                         |
| M4 时长与大屏   | C6     | L    | C3         | 自动记录时长、统计页、会话修正（已完成）                                    |
| M4 时长与大屏   | C7     | M    | C6         | 独立大屏窗口、图标分类栏、竖版海报架、手柄导航、从大屏启动（已实现，待 G5） |
| M5 产品化       | C8     | M    | C5、C6、C7 | 首页、收藏集、设置、引导和全局搜索                                          |
| M5 产品化       | C9     | M    | C8         | 性能/安全/打包/更新/发布候选                                                |

建议串行执行。C4 与 C6 在 C3 完成后理论上可以并行，但只有在不同 worktree、写集不重叠时才这样做；否则仍按 C4 → C5 → C6 → C7 串行。

## 7. 子对话详情

### C0 — 规划与技术选型（已完成）

**目标**：把产品范围、技术栈、架构边界和后续对话切成可执行单元。

**产出**：`docs/DEVELOPMENT_PLAN.md`、`docs/STATUS.md`。

**完成标准**：后续每个对话都能只读这两个文档开始工作，且不需要重新讨论技术栈。

### C1 — 基础工程、设计系统与可点击壳

**规模**：L  
**依赖**：C0  
**目标**：让 Tauri 应用真正跑起来，并先确定视觉质量，不接数据库和真实刮削。  
**当前状态**：已完成；工程骨架、设计系统、应用壳、Home/Library/Detail/Big Screen、Stats/Settings 和技术探针已完成，G2 已确认视觉基线。

**工作**

1. 用 pnpm 创建 Tauri 2 + React 19 + TypeScript + Vite 工程；配置严格 tsconfig、ESLint、Prettier、Rustfmt、Clippy。
2. 配置窗口：合理默认尺寸和最小尺寸、启动时先隐藏、前端 ready 后再显示、开发工具、应用标识和图标占位。
3. 建立 `src/design-system`：颜色/间距/圆角/阴影/动效 token，字体子集与 fallback，基础 Button、IconButton、Surface、Cover、Tag、Toolbar、EmptyState、Toast、FocusRing。
4. 建立应用壳：左侧导航、顶部栏、路由、窗口拖拽区和键盘焦点样式。
5. 写 `docs/DESIGN.md`，提出并比较 3 个视觉方向；G1 已选择“游戏启动器”；确认新配色和逐页设想后再实现主界面。
6. 用 mock 数据完成 Home、Library、Detail、Big Screen 四个静态界面；使用真实比例的封面和下版权占位图，封面必须体现 Galgame/AVG 游戏身份。
7. 做一个技术探针：Tauri 第二窗口、全屏、Gamepad API 读取是否可用；只验证能力，不完成大屏功能。
8. 在 1080p、1920×1080、4K、150% 缩放下截图，自我 critique，修正溢出、焦点和层级问题。

**完成的功能**

- 桌面应用可启动、可关闭、可导航。
- 四个界面可点击切换，视觉系统一致。
- 键盘焦点、reduced motion、空状态和错误状态有明确样式。
- 第二窗口和手柄能力有结论。
- 界面不出现无法自动获得的游戏内进度或商店用语。

**验收**

- `pnpm lint`、`pnpm typecheck`、`pnpm test`、`cargo fmt --check`、`cargo clippy -- -D warnings` 通过。
- `pnpm tauri dev` 正常打开，无白屏和控制台错误。
- 四个界面截图通过设计 review；用户确认视觉方向。
- 窗口尺寸、启动显示、键盘导航和 reduced motion 可用。

**不包含**：SQLite、扫描、真实刮削、真实启动、时长统计。

**主要产出**：`src/app/**`、`src/design-system/**`、`docs/DESIGN.md`、`src-tauri/tauri.conf.json`。

### C2 — SQLite、目录扫描与真实游戏库

**规模**：L  
**依赖**：C1  
**目标**：把静态游戏库变成真实的本地数据，用户可以添加目录并管理作品。
**当前状态**：已完成；SQLite/WAL/FTS5、目录扫描、候选确认、真实游戏库、搜索/筛选/排序、重复扫描去重、汉化/语言版本 exe 识别、移出库后的扫描排除与手动导入、重启持久化已接入。

**工作**

1. 建立 SQLite 连接、迁移、WAL、FTS5 和数据库路径；先建 works/releases/local_copies 和基础 settings。
2. 实现目录选择、递归扫描、候选 exe 识别、忽略规则、去重和扫描取消。
3. 设计候选确认流程：一个目录可能只有一个主程序，也可能有多个版本；用户必须能确认主 exe 和显示名。
4. 实现游戏库查询命令：分页、搜索、排序、状态筛选；为后续大批量数据留索引。
5. 把 Library 页接真实数据，加入导入向导、扫描进度、空状态、失败重试和右键操作。
6. 建 fixture 目录和扫描测试；对日文/中文路径、深层目录、重复目录做覆盖。
7. 确保大游戏库使用虚拟列表和缩略图占位，不一次性渲染所有封面。

**完成的功能**

- 用户添加一个或多个扫描根目录。
- 应用扫描 exe、显示候选、确认后写入数据库。
- 游戏库可搜索、筛选、排序、重新扫描。
- 关闭再打开应用后库仍在。

**验收**

- 用至少 100 个 fixture 条目验证扫描、去重和取消。
- 日文路径、空格路径、深层路径都能正确写入。
- 搜索和筛选在 5,000 条记录下保持可交互。
- 数据迁移和扫描单元测试通过。

**不包含**：在线元数据、封面下载、启动器和时长统计。

**主要产出**：`src-tauri/migrations/**`、`src-tauri/src/db/**`、`src-tauri/src/commands/library.rs`、`src/features/library/**`。

### C3 — 作品详情、图片缓存与启动器

**规模**：M  
**依赖**：C2  
**目标**：用户能查看作品详情、设置封面和启动配置，并从应用启动作品。
**当前状态**：已完成；真实详情资料编辑、手动/本地封面缓存、启动配置、路径校验、Windows Job Object 进程树跟踪、启动/退出/停止状态和无效路径提示已接入。

**工作**

1. 完成 Detail 页：标题别名、发行信息、标签、安装路径、封面、用户游玩状态和来源占位。
2. 建 assets 表和缓存目录；支持手动选封面、发现本地图片、生成 WebP 缩略图、失效回退。
3. 建 launch_profiles；支持 exe、工作目录、参数、环境变量、Locale Emulator/NTLEA 包装器、显示器选择。
4. 用 Rust `Command` 和参数数组启动，验证路径、避免 shell 注入；用 Job Object 跟踪进程树。
5. 实现启动成功/失败/退出的 UI 状态；启动成功后回到详情或首页的“最近启动”卡片。
6. 使用 dummy exe 和日文/中文路径做启动测试；验证错误提示不会暴露敏感路径。

**完成的功能**

- 用户从游戏库进入作品详情。
- 用户设置或更换封面，列表使用缩略图。
- 用户保存启动配置并实际启动作品。
- 启动失败时能看到可操作的错误。

**验收**

- 含空格、中文、日文和长路径的 exe 能启动。
- 工作目录和参数正确传递；包装器路径校验有效。
- 无效 exe、权限错误、缺失工作目录都有清晰错误。
- 封面缓存和 fallback 在断网/删图时不崩。

**不包含**：在线刮削、自动时长统计、大屏。

**主要产出**：`src/features/work-detail/**`、`src-tauri/src/launcher/**`、`src-tauri/src/assets.rs`、`src-tauri/migrations/**`。

### C4 — 元数据 Provider 框架、VNDB 与 Bangumi

**规模**：M  
**依赖**：C3  
**当前状态**：已完成；Provider 框架、VNDB/Bangumi 搜索与导入、字段 claim/锁定和来源优先级已接入。  
**目标**：建立可扩展的来源适配器，并完成两个 API 来源的搜索、匹配和导入。

**工作**

1. 定义 `MetadataProvider` trait、标准搜索结果、候选详情、字段 claim 和错误类型。
2. 建 `source_records`、`metadata_claims`；保存原始响应、来源 ID、抓取时间和字段来源。
3. 建 HTTP 客户端：User-Agent、超时、重试、退避、每源限速、缓存和取消。
4. 接入 VNDB API v2 和 Bangumi OpenAPI；把标题、别名、简介、开发商、发行日期、标签、封面和关联作品映射到统一模型。
5. 实现搜索/匹配 UI：候选封面、标题、年份、开发商、来源徽标；支持按日文/中文/英文标题搜索。
6. 实现字段合并预览：默认填空白和未锁定字段；用户手动编辑过的字段不被覆盖。
7. 用固定 JSON fixture 做 Provider 测试；断网、404、限流和格式变化不能拖垮应用。
8. 建来源注册表与优先级设置：顺序和启停持久化；后续来源只需注册适配器，搜索结果和默认字段优先值按顺序工作。

**完成的功能**

- 从作品详情发起 VNDB/Bangumi 搜索。
- 选择候选并导入标题、简介、封面、标签等元数据。
- 每个字段能追溯到来源；断网或来源失败不影响本地库。
- 设置页可调整来源顺序和启停；结果按优先级排列，手动/锁定字段受到保护。

**验收**

- 两个来源的 fixture 测试通过。
- 中文/日文/英文标题均能搜索到候选。
- 手动字段和已锁定字段在重新导入时保持不变。
- 任务进度可见，可取消；失败有重试。
- 来源顺序调整后，搜索排列和字段合并默认优先级同步变化。

**不包含**：额外 HTML 来源；Steam、批量队列和复杂冲突已在 C5 完成。

**主要产出**：`src-tauri/src/metadata/**`、`src-tauri/migrations/**`、`src/features/work-detail/**`、`src/features/settings/**`。

#### C4 完成记录

- 完成日期：2026-11-15；分支：`codex/c4-metadata-providers`。
- 数据层：`20261115000400_c4_metadata.sql` 新增 `metadata_providers`、`source_records`、`metadata_claims`；Provider 顺序和启停持久化，详情响应缓存 24 小时。
- Provider：Rust `MetadataProvider` trait、VNDB API v2、Bangumi OpenAPI、Kungal / NextMoe Catalog 和 Hikarinagi；统一搜索结果、候选详情、字段 claim、错误和取消；HTTP 客户端包含 User-Agent、超时、重试/退避、按来源限速和大小限制。Kungal 可匿名读取 Catalog；Hikarinagi 使用 `catalog:read` 令牌。
- UI：详情页“来源与字段”支持按全部来源或单来源搜索、候选封面/标题/年份/开发商/来源徽标、字段差异预览、选择性导入、封面导入、字段来源账本和锁定/解锁；设置页支持来源上移/下移、启停和后续适配器自动出现。
- 保护：手动编辑写入 `manual` locked claim；导入跳过锁定字段，默认只选空白且未锁定字段；已有手动/本地封面默认保留。
- 验证：Provider fixture 测试、优先级/启停测试、锁定字段跳过测试、真实 Tauri 窗口联合搜索（VNDB 在 Bangumi 前）、VNDB 字段导入、锁定简介后 Bangumi 导入不覆盖、在线封面下载/缩略图缓存、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`cargo fmt --check`、`cargo clippy -- -D warnings`、`cargo test`。
- OAuth：loopback + state + PKCE、DPAPI 加密、系统代理、账号状态/断开、访问令牌读取和 refresh token 轮换；NextMoe/Kungal、Bangumi 与 Hikarinagi 均已完成真实浏览器授权和 token 交换。
- 已知边界：OAuth 已接入 NextMoe/Kungal、Bangumi 和 Hikarinagi 的授权页/回调/token/DPAPI 存储，三者均已完成真实登录验证。Hikarinagi 数据源需要 `catalog:read`；已连接账号直接复用访问令牌，未连接时可用 `clientSecret` 换取应用级令牌。OAuth 凭据从 `MIYU_OAUTH_CONFIG`、数据目录 `oauth/providers.json` 或 `tmp/oauth/providers.json` 读取，不进入前端或 Git。搜索候选和封面来自在线来源；详情缓存不等于离线元数据镜像。

### C5 — Steam、多源合并与批量刮削

**规模**：M  
**依赖**：C4  
**目标**：让多源刮削成为真正可用的产品功能，而不是单次 API 调用演示。
**当前状态**：已完成；Steam Store、Steam 库自动嗅探、多源合并、字段级/全局优先级、冲突处理、封面画廊和两阶段批量队列均已接入。

**工作**

1. 增加 Steam Store 适配器；支持手动输入 AppID 或商店 URL，谨慎限速并缓存。
2. 实现字段级来源优先级、冲突列表和“采用此值/锁定/解锁”操作。
3. 完成批量刮削队列：并发上限、来源状态、进度、暂停/取消、失败重试和局部成功。
4. 增加封面候选画廊：选择、下载、缓存和原图/缩略图分离。
5. 明确更新语义：默认只填空字段和未锁定字段；应用前展示 diff，不静默覆盖。
6. 详情页增加来源面板和重新刮削入口；游戏库支持批量选择。
7. 测试合并规则、限速、失败恢复和锁定字段保护。

**完成的功能**

- 同一作品可同时看到 VNDB、Bangumi、Steam 的候选值。
- 用户能处理冲突、锁定字段、批量刮削并选择封面。
- 批量任务失败可局部重试，不影响已完成作品。

**验收**

- 三个来源的字段冲突可复现并可解决。
- 锁定字段在所有更新路径中保持不变。
- 批量 50 个条目时 UI 仍可操作，进度准确。
- 来源限流和 429 处理有测试。

**不包含**：EGS/Getchu/DLsite、插件 SDK、云端元数据服务。

**主要产出**：`src-tauri/src/metadata/steam.rs`、`src-tauri/src/metadata/merge.rs`、`src-tauri/src/steam_library.rs`、`src-tauri/migrations/20261115000600_c5_metadata_merge.sql`、`20261115000800_steam_library.sql`、`src/features/metadata/**`、`src/features/library/SteamLibraryDialog.tsx`、`src/features/settings/FieldPrioritySettings.tsx`。

### C6 — 自动时长统计与统计页

**规模**：L  
**依赖**：C3  
**当前状态**：已完成；`play_sessions`、Job Object 进程观察、前台宽限、心跳与异常恢复、会话修正、真实统计页均已接入。
**目标**：用户启动作品后自动产生可靠会话，并在统计页看到总时长和历史。

**工作**

1. 实现 Windows 进程观察器：枚举进程、前台窗口、可执行路径和进程树；用安装路径匹配 local copy。
2. 设计会话状态机：未开始 → 运行中 → 已结束；30 秒心跳；短时间 alt-tab 宽限；启动器进程不作为游玩时间。
3. 处理程序崩溃/重启：用最后心跳截断悬挂会话；避免重复会话和重复计时。
4. 增加 play_sessions 迁移、查询命令、事件和手动修正（修改、删除、补录）。
5. 做 Stats 页：总时长、近 7/30 天、热力图、单作品时长、最近会话。
6. 用 dummy 进程和可注入时钟做单元测试；用真实 exe 做一次端到端启动验证。

**完成的功能**

- 从应用启动游戏后自动记录开始和结束。
- 关闭游戏后，详情页和统计页更新总时长。
- 用户可以修正错误会话。
- 应用重启后不会永久保留悬挂会话。

**验收**

- 不会按进程名误匹配多个 `Game.exe`；路径和 local copy 判断正确。
- 前台/后台逻辑符合设定；不会重复计数。
- 模拟时钟、崩溃恢复、手动修正有测试。
- 统计查询在 10,000 条会话下可用。

**不包含**：成就、路线进度、游戏内覆盖层、云同步。

**主要产出**：`src-tauri/src/tracking/**`、`src-tauri/src/commands.rs`、`src-tauri/migrations/20261115000700_c6_play_sessions.sql`、`src/features/stats/**`、`src/features/work-detail/SessionHistory.tsx`。

#### C6 完成记录

- 数据层：`20261115000700_c6_play_sessions.sql` 新增 `play_sessions`，保存开始/结束/最后心跳、有效秒数、结束原因、来源、PID、exe 路径、备注和修正标记；每个本地副本最多一条未结束会话，并提供作品、开始时间和未结束心跳索引。
- 会话引擎：Rust `tracking` 模块使用 Job Object 查询游戏进程树，按完整 exe 路径识别真正主程序；包装器和初始化进程不计时。Steam 导入的作品若先启动短转交进程、再由 Steam 以新 PID 启动实际游戏，会通过 Toolhelp 和完整 exe 路径重新附着，并能结束作业对象外的实际进程。每 2 秒观察进程和前台，每 30 秒心跳，失去前台超过 90 秒暂停累计，回到前台继续同一会话。
- 恢复：异常退出后启动时按 `last_heartbeat_at` 截断未结束会话；正常关闭窗口通过 `CloseRequested` 结算为 `app_closed`。结算写入只作用于 `ended_at IS NULL`，避免重复事件产生重复时长。
- IPC 与统计：新增 `sessions_list`、`session_create`、`session_update`、`session_delete`、`stats_get`；作品列表用会话聚合秒数和分钟数，详情返回真实记录；统计覆盖累计、近 7/30 天、本周启动、84 天热力图、作品排行和最近会话。
- UI：统计页改为真实数据并支持本周/本月/今年/全部范围；作品详情支持补录、修正和删除会话，短会话按秒显示，明确区分手动、已修正、正常退出、手动停止和异常恢复。Steam 来源在游戏库封面、列表和详情中显示明确标记及 AppID。
- 验证：前端 Vitest 覆盖统计范围切换和补录；Rust 覆盖计时宽限、暂停恢复、会话心跳/结算、手动 CRUD、异常恢复、正常关闭、Job Object 进程树、路径规范化与 10,000 条会话统计。真实 Tauri 窗口验证直接启动、包装器启动、手动停止、模拟崩溃恢复和统计/补录修正删除；截图覆盖 1440×900、1920×1080、150% 缩放和 4K。
- 已知边界：只统计从 MiyuManager 启动且能准确匹配本地副本的游戏，不接管资源管理器或 Steam 客户端直接启动的游戏；热力图按会话开始日期归档；应用异常退出后的最长未落盘时长为一个心跳周期。

### C7 — 电视大屏与手柄导航

**规模**：M  
**依赖**：C6  
**目标**：提供独立的 10-foot 大屏体验，能在电视上用手柄浏览和启动作品。

**状态**：实现完成，待 G5 确认；物理手柄与多显示器仍未实机验证。

**工作**

1. 实现独立 Tauri 窗口：选择显示器、无边框全屏、启动时隐藏、前端 ready 后显示、退出回主窗口。
2. 设计大屏专用布局：纯图标分类栏、全宽主视觉、2:3 竖版海报架、较大焦点环、无 hover 依赖；不显示“最近入库”。
3. 实现手柄输入和键盘 fallback：D-pad/左摇杆移动、A 确认、B 返回、Y 游戏菜单、Start 控制菜单、LB/RB 切换区域，X 不分配。
4. 建立焦点管理器，处理网格、横向列表、详情抽屉和弹窗；焦点丢失时能回到合理位置。
5. 用预模糊封面/渐变色做环境背景，控制 4K 下的图片解码和动画成本；支持 reduced motion。
6. 从大屏启动作品并返回大屏；鼠标静止后隐藏光标。
7. 在 WebView2 中验证 Gamepad API；如果不可靠，用 Rust XInput 轮询作为备选并事件回传。

**完成的功能**

- 用户从设置打开大屏模式到指定显示器。
- 手柄和键盘能完整浏览、打开作品、启动并返回。
- 1080p/4K 下层级和可读性正常。

**验收**

- 手柄映射和焦点路径有手动检查表。
- 4K、150% 缩放、无鼠标操作可用。
- 没有横向滚动条、文字截断或不可达按钮。
- 大屏启动失败能返回并提示。

**不包含**：远程串流、手机遥控、第二屏 companion app。

**主要产出**：`src/features/bigscreen/**`、`src-tauri/src/bigscreen.rs`、`src/lib/bigscreen-api.ts`。

### C8 — 首页、收藏集、设置与首次启动

**规模**：M  
**依赖**：C5、C6、C7  
**目标**：把各功能串成日常可用的完整产品，并补齐首次启动体验。

**工作**

1. 首页：最近启动 hero、最近游玩、最近加入、收藏、想玩清单；无数据时引导添加目录。
2. 收藏集：创建、重命名、排序、添加/移除作品、封面显示；暂不做复杂规则引擎。
3. 全局搜索：Ctrl+K 搜索作品、别名、标签、收藏集；支持键盘操作和最近搜索。
4. 设置：扫描目录、来源顺序、网络/代理、Locale Emulator 默认值、数据目录、外观、减少动效、更新检查。
5. 首次启动向导：目录 → 扫描 → 确认 exe → 选择来源 → 完成；可跳过来源。
6. 统一空状态、加载状态、错误恢复、toast 和 destructive action 确认。
7. 用可访问性/UX 检查清单做一轮审查，修复键盘、焦点、对比度和长文本问题。

**完成的功能**

- 新用户能完成首次配置并进入游戏库。
- 首页和收藏集使用真实数据。
- 设置可以改变扫描、来源和行为；全局搜索可用。
- 产品从“功能集合”变成连贯的日常工具。

**验收**

- 清空数据目录后首次启动流程可完成。
- 首页各模块在无数据/少量/大量数据下都有合理状态。
- 收藏集和设置持久化；全局搜索键盘可用。
- 可访问性审查无阻塞级问题。

**不包含**：主题市场、插件、云备份、复杂规则收藏集。

**主要产出**：`src/features/home/**`、`src/features/collections/**`、`src/features/settings/**`、`src/features/onboarding/**`。

### C9 — 硬化、性能、打包与发布候选

**规模**：M  
**依赖**：C8  
**目标**：把产品做成可安装、可升级、可诊断、可回归的 Windows 发布候选。

**工作**

1. 全局错误边界、结构化日志、崩溃记录、数据库备份/恢复和迁移安全检查。
2. 收紧 Tauri capability/CSP；验证没有远程导航、任意 shell 或越权文件访问。
3. 做性能基准：10,000 条作品、5,000 张封面缩略图、冷启动、大屏 4K、内存和安装包大小。
4. 完成 QA 矩阵：Windows 10/11、1080p/4K/150%、中文/日文路径、离线、断网、限流、手柄、异常退出。
5. 打包 NSIS/MSI，配置图标、版本、隐私说明、更新检查和签名流程；没有证书时明确标记未签名。
6. 建立发布脚本和回归清单；Rust 单元/集成测试、前端 Vitest、Playwright 截图和 Tauri 冒烟测试。
7. 写 README、用户指南、故障排查和发布说明；整理已知问题。

**完成的功能**

- 用户能干净安装、启动、导入、刮削、启动、计时和使用大屏。
- 应用能备份/恢复数据库，出错时可诊断。
- 有明确版本号、安装包和发布说明。

**验收**

- 干净 Windows 环境安装/卸载通过，数据不丢失。
- 离线仍可用本地库、启动和统计。
- 性能目标达成或在发布说明中记录偏差。
- 所有自动化检查和手动发布清单通过。

**不包含**：正式代码签名证书采购、应用商店上架、自动灰度发布系统。

**主要产出**：`scripts/release/**`、`.github/workflows/**`（如启用 CI）、`docs/RELEASE.md`、打包配置。

## 8. 每个子对话的固定工作协议

每轮对话按同一顺序执行，避免上下文膨胀和顺手改无关功能：

1. 读取 `docs/DEVELOPMENT_PLAN.md` 和 `docs/STATUS.md`，确认本轮编号、依赖和范围。
2. 先给出 3–7 条本轮实施计划、预计改动文件和验收方式；不要直接大改。
3. 只修改本轮范围内的文件；发现需要跨阶段的设计变更时，先记录到 `docs/STATUS.md` 的“待决策”。
4. 实现一个可运行的最小垂直切片，再做必要的补全；不要先写大量无入口的抽象。
5. 运行本轮验收命令；UI 变更必须截 1440×900、1920×1080 和至少一种大屏/缩放尺寸。
6. 更新 `docs/STATUS.md`：状态、完成项、证据、遗留问题、下一轮入口。
7. 最终报告必须包含：变更文件、完成功能、验证结果、未完成/风险、下一轮建议。

每个子对话对应一个可回滚的 commit/PR，建议分支命名：

- `codex/c1-foundation-ui`
- `codex/c2-library-import`
- `codex/c3-detail-launch`
- `codex/c4-metadata-providers`
- `codex/c5-metadata-merge`
- `codex/c6-playtime-stats`
- `codex/c7-bigscreen`
- `codex/c8-product-shell`
- `codex/c9-release-candidate`

若某个 L 对话超出上下文或改动过大，按“工作项 1–4”和“工作项 5–8”拆成同一编号的 a/b 两轮，验收标准不变。

### 每轮开场模板

把下面这段直接发给新的 Codex 对话，替换 `C{N}` 即可：

```text
执行 C{N}。先读取 docs/DEVELOPMENT_PLAN.md 和 docs/STATUS.md，只做 C{N} 的范围。
先输出本轮计划、预计改动文件和验收方式，再实施。
完成后运行验收命令，更新 docs/STATUS.md，并报告变更文件、完成功能、测试结果、风险与下一轮入口。
不要提前做下一对话。
```

C1 第一次进入时，先只做工程初始化和 `docs/DESIGN.md` 的方向提案，不要直接写四个页面；用户确认视觉方向后再继续。

## 9. 质量门槛

每个对话结束至少运行：

```bash
pnpm lint
pnpm typecheck
pnpm test
cargo fmt --check
cargo clippy -- -D warnings
cargo test
```

UI 变更额外要求：

- Playwright 或手动截图覆盖 1440×900、1920×1080、3840×2160 和 150% 缩放。
- 键盘走查：Tab、Shift+Tab、Enter、Space、Escape、方向键。
- reduced motion 下没有阻塞操作的动画。
- 真实长标题、日文标题、无封面、加载失败和空列表。
- 不出现无法自动获得的游戏内进度、商店用语或电子书用语。

数据变更额外要求：

- 迁移可从空库和上一版 fixture 库执行。
- 事务失败不会留下半成品记录。
- 重扫、批处理、取消和重试可重复执行。

性能目标（目标值，不是承诺值）：

- 安装包 ≤ 60 MB，不含可选离线 WebView2。
- 10,000 条作品的书库首屏可交互，滚动目标 60fps。
- 搜索响应 ≤ 100ms（本地 SSD、已建索引）。
- 冷启动目标 ≤ 2.5s（典型 Windows 11 桌面）。
- 大屏 1080p 手柄导航无明显掉帧。

## 10. 风险与需要用户确认的节点

| 风险/节点                       | 影响                  | 处理                                                  | 所属对话 |
| ------------------------------- | --------------------- | ----------------------------------------------------- | -------- |
| WebView2 Gamepad API 行为不一致 | 大屏手柄不可用        | C1 先做探针；C7 可用 Rust XInput 备选                 | C1/C7    |
| 泛化 `Game.exe` 导致计错        | 时长统计错误          | 路径 + local copy + 进程树匹配；手动修正              | C6       |
| HTML 来源频繁变化/限流          | 刮削失败              | API 优先、适配器隔离、fixture、退避和缓存             | C4/C5    |
| CJK 字体体积                    | 安装包变大、首屏闪字  | 子集化、fallback、只打包必要字重                      | C1       |
| 大游戏库 DOM/图片过多           | 滚动掉帧、内存升高    | 虚拟列表、缩略图、懒加载、content-visibility          | C2/C9    |
| 数据库迁移/写坏                 | 用户库丢失            | WAL、迁移测试、启动备份、恢复入口                     | C2/C9    |
| WebView2 版本差异               | 样式/行为不一致       | 目标 Win10/11；C9 加入运行时检测                      | C1/C9    |
| 签名和更新链路                  | 发布受阻              | C9 先做未签名安装包，签名作为独立决策                 | C9       |
| 误解“进度”能力                  | UI 造假或用户期望落空 | v1 不读取游戏内进度；只显示会话、时长、用户状态和备注 | C1/C6    |

需要用户确认的节点：

- **G1**：已完成；A 已选，“深夜游戏盒”配色与逐页设想已确认。
- **G2**：已完成；C1 四个静态界面已确认后进入数据层。
- **G3**：已完成；C3 默认直接启动，不捆绑/不自动下载 Locale Emulator 或 NTLEA；按作品可选包装器 exe 和参数数组。
- **G4**：已完成；字段级默认优先级 + 全局顺序开关，手动/锁定优先，采用/锁定/解锁分离，批量默认 `only_if_empty`。
- **G5**：C7 大屏布局和手柄映射确认。
- **G6**：C9 安装包、签名、便携版和更新策略确认。

## 11. v1 之后的候选方向

- 增加 EGS、Getchu、DLsite 和更多本地化来源。
- 用户手动维护的路线/角色完成度、攻略笔记和剧透隐藏（明确标注为手动数据）。
- 存档扫描、备份、恢复和版本对比。
- 插件 SDK、社区主题和来源适配器分发。
- 云同步、跨设备库同步和 WebDAV。
- Android/Steam Deck 客户端。
- 画廊模式、截图管理和音乐/语音资源浏览。

这些方向不进入 v1 的实现对话，避免核心体验被扩展性拖慢。
