# MiyuManager 项目状态

> 最后更新：2026-11-15  
> 当前阶段：C4 已完成；C5 尚未启动  
> 计划文件：`docs/DEVELOPMENT_PLAN.md`  
> 设计提案：`docs/DESIGN.md`

## 当前状态

| 子对话                                | 状态   | 完成内容 / 证据                                                                                                                        |
| ------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| C0 规划与技术选型                     | 已完成 | 技术栈、范围、架构、数据模型、质量门槛和子对话拆分已写入 `docs/DEVELOPMENT_PLAN.md`                                                    |
| C1 基础工程、设计系统与可点击壳       | 已完成 | 设计系统、应用壳、Home/Library/Detail/Big Screen、Stats/Settings 和探针已完成；2026-11-15 通过 G2 视觉确认                             |
| C2 SQLite、目录扫描与真实游戏库       | 已完成 | SQLite/WAL/FTS5、目录扫描、候选确认、汉化 exe 识别、扫描排除/手动导入、真实游戏库、搜索筛选排序、持久化和 5,000 条查询已接入；详见下文 |
| C3 作品详情、图片缓存与启动器         | 已完成 | 真实详情编辑、封面缓存/发现、启动配置、包装器、路径校验、Job Object 启动跟踪与运行状态已接入；详见下文                                 |
| C4 Metadata Provider、VNDB 与 Bangumi | 已完成 | Provider 框架、来源优先级、VNDB/Bangumi 搜索与导入、字段 claim/锁定、封面下载、来源账本和 OAuth 账号连接已接入；详见下文               |
| C5 Steam、多源合并与批量刮削          | 未开始 | 依赖 C4                                                                                                                                |
| C6 自动时长统计与统计页               | 未开始 | 依赖 C3；可与 C4/C5 在不同 worktree 并行                                                                                               |
| C7 电视大屏与手柄导航                 | 未开始 | 依赖 C6                                                                                                                                |
| C8 首页、收藏集、设置与首次启动       | 未开始 | 依赖 C5、C6、C7                                                                                                                        |
| C9 硬化、性能、打包与发布候选         | 未开始 | 依赖 C8                                                                                                                                |

## 已锁定的决策

- Windows 10 22H2 / Windows 11，x64 优先。
- Tauri 2 + Rust + React 19 + TypeScript + Vite + SQLite。
- pnpm 作为唯一包管理器。
- Work → Release → LocalCopy 数据模型。
- 数据默认位于 `%APPDATA%\MiyuManager`。
- v1 UI 使用简体中文；代码预留 i18n，日文/英文不阻塞 v1。
- 默认不发送遥测数据。
- v1 不开放第三方插件市场。

### 2026-11-14 定位校正

- 产品是本地 **Galgame / AVG 电子游戏库管理器**，不是电子书、视频或影视资料管理器。
- 产品不是游戏商店；界面不使用店长、营业中、新入荷、发售表等商店语汇。
- 管理器不读取游戏内进度、章节、路线、存档或成就，也不伪造百分比进度。
- 可显示的数据：本地安装、启动配置、启动次数、累计时长、最近启动、安装大小、用户状态/评分/收藏/备注、可追溯元数据。
- 视觉方向已从“私人放映室 / 电影档案库”调整为“游戏启动器 / 游戏收藏架 / 游玩频道”。
- G1 已选择 **A 游戏启动器**；B/C 保留为对照，不再作为主方向。
- A 的视觉母题确定为“深夜游戏盒”：墨蓝 #081521、盒面奶油 #F3EAD8、标签红 #D94B3D、状态薄荷 #8FD3C1、数据黄铜 #D9A441。
- 组件、图标、动画选型记录在 docs/FRONTEND_STACK.md；逐页设想记录在 docs/PAGE_VISIONS.md。

## 当前环境

- Node `v24.22.0`
- pnpm `11.25.0`
- Rust `1.100.0`
- WebView2 Runtime `157.0.4341.46`
- Git 仓库已有 C1 基线提交；C2 在 `codex/c2-library-import` 分支完成；C3 在 `codex/c3-detail-launch` 分支完成；C4 在 `codex/c4-metadata-providers` 分支完成

## C4 本轮产出

- 数据层：`src-tauri/migrations/20261115000400_c4_metadata.sql`；新增 `metadata_providers`、`source_records`、`metadata_claims`，保存 Provider 顺序/启停、原始响应、字段值、来源 ID、抓取时间和锁定状态。详情响应缓存 24 小时。
- Provider：`src-tauri/src/metadata/**`；`MetadataProvider` trait、VNDB API v2、Bangumi OpenAPI、统一搜索结果/候选详情/字段 claim/错误/取消；HTTP 客户端包含 User-Agent、18 秒超时、3 次退避重试、按来源限速、响应大小限制和取消。
- 来源优先级：设置页支持上移/下移和启停，顺序持久化到 SQLite；搜索按优先级排列，字段预览的默认选中按候选来源与已有 claim 的优先级判断。后续新增来源只需注册适配器并自动出现在设置页。
- 搜索与导入 UI：`src/features/work-detail/MetadataPanel.tsx`；详情页“来源与字段”支持全部来源或单来源搜索、候选封面/标题/年份/开发商/来源徽标、字段差异预览、选择性导入、封面导入、来源账本和锁定/解锁。
- 字段保护：手动编辑通过 `work_update` 写入 `manual` locked claim；导入跳过锁定字段，默认只选空白且未锁定字段；已有手动/本地封面默认保留；锁定字段在重新导入时保持原值。
- 封面：在线候选封面可下载到现有资产缓存，生成 WebP 缩略图；资产来源标记 `online`，详情页区分手动/本地/在线封面。
- OAuth：`src-tauri/src/oauth/**`、`20261115000500_oauth.sql`；支持系统浏览器 + 本机环回回调、state、PKCE、token 交换、Windows DPAPI 加密存储、账号状态和断开连接。NextMoe/Kungal 与 Bangumi 已用真实账号完成授权验证；Hikarinagi 授权页和回调已完成，但当前应用被识别为机密客户端，需要控制台切换为 public client 或补充 secret。
- OAuth 设置：`src/features/settings/OAuthAccounts.tsx`；设置页显示三个来源的配置/连接状态、账号名、scope，并提供连接、断开、重新读取和导入 `providers.json`。凭据从 `MIYU_OAUTH_CONFIG`、数据目录 `oauth/providers.json` 或开发目录 `tmp/oauth/providers.json` 读取，不进入前端或 Git；开发构建会额外查找仓库根目录的 `tmp/oauth/providers.json`，配置保存后即时生效，不需要重启。
- 验证：Provider fixture 测试、优先级/启停测试、锁定字段跳过测试、OAuth 配置读取/导入测试、真实 Tauri 窗口联合搜索（VNDB 在 Bangumi 前）、VNDB 字段导入、锁定简介后 Bangumi 导入不覆盖、在线封面下载和缩略图缓存。
- 证据：`outputs/app/c4/1440x900/`、`1920x1080/`、`150pct-1280x720/`、`4k/`，包含 `01-sources-empty.png`、`02-search-results.png`、`03-preview.png`、`04-imported.png`、`04b-locked.png`、`05-settings-priority.png`、`06-oauth-accounts.png`。

### C4 已知边界

- OAuth 登录已接入 NextMoe/Kungal、Bangumi 和 Hikarinagi 的授权流程；NextMoe/Kungal 与 Bangumi 已完成真实登录。Hikarinagi 当前 token 交换返回 `client authentication failed`，需要在开发者控制台把应用切换为 public client，或提供 clientSecret；这不影响公开目录数据和其余来源。
- 不包含 Steam、批量全库刮削、复杂多源冲突 UI、自动匹配和额外 HTML 来源；这些留到 C5。
- 搜索结果和候选封面来自在线来源；只为详情响应做 24 小时缓存，不构成离线元数据镜像。断网时本地库、详情和启动仍可用，但搜索会失败并给出重试。
- VNDB 的关联作品只在候选详情展示，不自动建立本地作品关系或合并作品。
- 锁定是字段级：锁定后该字段的所有 claim 都跳过导入；暂不提供逐 claim 选择“采用此值/解锁”的冲突处理界面。
- 搜索一次只导入一个候选；字段预览默认只选空白且未锁定字段，非空字段需要用户显式勾选。
- 浏览器预览使用固定 mock 候选；真实网络搜索、封面下载和 SQLite 写入只在 Tauri 窗口可用。

## C3 本轮产出

- 数据层：`src-tauri/migrations/20261115000300_c3_detail_launch.sql`；新增 `assets`、`launch_profiles`、`works.tags_json`、`local_copies.last_launched_at` 和 `launch_count`。C2 数据库迁移测试通过。
- 详情资料：`work_update` 支持标题、原题、别名、简介、年份、开发商/发行商、版本、语言、发行日期、标签、状态、评分、收藏和备注；重新扫描不会覆盖用户手动修改的标题。
- 封面资产：`src-tauri/src/assets.rs`；手动选择图片、在游戏目录及常见封面子目录发现候选、原图缓存、WebP 缩略图、SHA-256 校验和、旧文件替换、清除封面和缺失回退。
- 封面读取：Tauri 自定义只读协议 `miyu-asset://`（Windows 为 `http://miyu-asset.localhost/...`），只允许读取数据目录 `assets` 下的文件；列表加载缩略图，详情使用原图。
- 启动配置：`launch_config_save` / `launch_config_validate`；支持 exe、工作目录、参数数组、环境变量、可选包装器 exe 与参数、显示器偏好和全屏偏好；路径变更会同步本地副本。
- 启动器：`src-tauri/src/launcher/**`；使用 `std::process::Command` 参数数组启动，不经过 shell；Windows Job Object 跟踪进程树；启动、运行、退出、停止状态通过 `launch-state` 事件回传。
- UI：`src/features/work-detail/**`；真实详情、编辑资料弹窗（焦点管理、Tab 循环、Escape）、封面操作、启动配置表单、路径校验结果、运行/退出状态、无效路径反馈和来源占位。
- 首页和设置：首页“启动游戏”接入真实启动；设置页启动器分区说明按作品配置包装器，不再显示 C3 待接入。
- 证据：`outputs/app/c3/01-detail-cover.png`、`02-detail-launch.png`、`03-detail-edit.png`、`04-launch-running.png`、`05-launch-exited.png`、`06-library-thumbnail.png`、`07-invalid-path.png`、`08-cover-fallback.png`、`probe.log`。浏览器尺寸截图已重新生成到 `outputs/app/1440x900/`、`1920x1080/`、`150pct-1280x720/` 和 `4k/`，包含 `02-detail`、`02b-detail-launch`、`02c-detail-edit`。

### C3 已知边界

- 自动游玩会话、累计时长和统计页仍在 C6；C3 只记录启动次数和最近启动时间，不生成 `play_sessions`。
- 封面只支持手动选择和本地发现，不支持在线封面候选或 VNDB/Bangumi/Steam 下载；来源面板仍为本地占位。
- 包装器是通用模型：用户选择 exe 并填写参数，参数后接游戏 exe 与游戏参数；不内置 Locale Emulator/NTLEA，不自动检测安装路径，不提供 profile 选择器。
- 显示器与全屏偏好只保存并展示，不强制移动游戏窗口；实际窗口放置留给大屏/后续阶段。
- 启动状态保存在内存中，应用重启后不会恢复“正在运行”；进程树跟踪只在本次应用运行期间有效。关闭管理器不会强制结束游戏（Job Object 未设置 kill-on-close）。
- 多本地副本目前仍以主副本作为详情和启动对象；多副本管理不在 C3。
- 封面缓存文件在移除作品时不会随作品记录自动清理；记录级清理和备份在 C9。
- 浏览器预览不写入封面缓存、不启动本地程序；这些操作只在 Tauri 窗口可用。

## C2 本轮产出

- 数据层：`src-tauri/migrations/20261115000100_initial.sql`、`20261115000200_scan_exclusions.sql`、`src-tauri/src/db.rs`；SQLite WAL、外键、迁移、FTS5 trigram、works/releases/local_copies/user_entries/scan_roots/scan_exclusions/settings 和索引。
- 数据库默认 `%APPDATA%\MiyuManager\miyumanager.sqlite3`；开发/测试可用 `MIYU_DATA_DIR` 指向独立目录。
- 扫描器：`src-tauri/src/scan.rs`；递归扫描、忽略规则、候选评分、每目录最多 5 个候选、进度事件、取消、中文/日文/空格/深层路径、按规范化 exe 路径去重、目录大小估算。
- 汉化/语言版本：识别 `_zh`、`_chs`、`_cht`、`_cn`、`_sc`、`_tc`、`_jp`、`_ja`、`_en`、`_patch` 等后缀，作为同一主程序的候选并适当加分，用户可在确认页选择。
- 扫描排除：从库中移除作品时写入 `scan_exclusions`；普通扫描按 exe 和/或工作目录跳过，游戏库“手动导入”可强制包含并清除排除。Settings 可查看和恢复单个排除项。
- IPC：`src-tauri/src/commands.rs`；library_query/get、set_status/set_favorite、remove_work、roots list/remove、scan_start/cancel、import_candidates、app_info。
- UI：`src/features/library/**`；原生目录选择、扫描进度、候选确认、可编辑显示名、选择/取消选择、导入；游戏库搜索、状态筛选、排序、封面/列表、右键状态/收藏/移除、虚拟列表与滚动加载、空/错误/加载状态。
- 详情与首页：真实扫描作品可进入最小详情页；Home 使用真实库数据，空库显示首次导入引导；Settings 显示真实扫描根目录、SQLite 路径和版本。
- 去重：重新扫描把已入库候选标为“已在库中”，导入同一 exe 更新已有记录；移除只删管理记录，不删除游戏文件。
- 预览：浏览器 `pnpm dev` 使用 mock 数据；Tauri 窗口使用真实 SQLite。
- 性能与分包：Library/Detail/Stats/Settings/Big Screen 已 lazy split；主包约 377 KB（gzip 115.1 KB）。

### C2 已知边界

- C2 阶段封面仍是标题排印占位；C3 已补充手动/本地封面缓存，C4 已补充 VNDB/Bangumi 在线封面和元数据，Steam 与复杂多源冲突留到 C5。
- C2 阶段详情页只展示本地安装与启动路径；C3 已补上启动配置、路径校验和真实启动。
- `play_sessions` 尚未建表；统计页仍是 C1 视觉占位，C6 接入真实会话。
- C2 阶段 `install_status` 只写 installed；C3 已补充 exe/工作目录校验和 missing 状态。
- 5,000 条数据的 Rust 查询与 Tauri 首屏/滚动加载已验证；未做完整 5,000 条连续滚到手底的性能基准。
- 语言/汉化后缀是启发式；标题本身以 `_zh`、`_sc` 等结尾的 exe 也可能被标记为语言版本，确认页可以取消。
- 排除按 exe 路径和工作目录同时生效；同一目录下的多个 exe 会被视为同一游戏，恢复时一起恢复。
- 扫描排除与手动导入已通过 Rust 测试和浏览器预览验证；尚未在 Tauri 实机窗口完整走一遍“移除→重扫→手动导入”。

## C1 视觉基线（已完成）

- Tauri 2 + React 19 + TypeScript + Vite 工程已初始化，包名为 `miyumanager`。
- 严格 tsconfig、ESLint 9、Prettier、Rustfmt、Clippy 已配置。
- 默认窗口 1440×900，最小 1120×720，无系统装饰条，启动时隐藏，前端 ready 后显示。
- 主应用自定义窗口栏：应用标识、上下文、最小化/最大化/关闭；Tauri 窗口权限已配置。
- 正式路由：`#/`（首页）、`#/library`（游戏库）、`#/work/:id`（详情）、`#/stats`、`#/settings`、`#/big-screen`。
- 设计系统：语义 token、密度变量、Button、IconButton、Surface、Tag、EmptyState、Cover、WindowBar；主题与布局都可以通过 CSS 变量重写。
- 外观设置：舒适/紧凑密度切换、减少动效、主题 token 预览；状态写入 localStorage。
- 技术探针：大屏第二窗口、全屏 API、Gamepad API、键盘焦点和 reduced motion。
- A 游戏启动器已经成为主应用；B/C 原型保留为对照，入口在 `#/design-prototypes`。
- A/B/C 的历史原型路由仍可访问：`#/prototype/screening`、`#/prototype/archive`、`#/prototype/channel`。
- C1 时主应用页面使用同一组本地 mock 数据；C2 已把 Home、Library、Detail 和 Settings 接到真实 SQLite 与扫描流程。
- 封面为程序生成的 Galgame 风格占位图，包含角色剪影、包装盒和日文原题；不是真实作品封面。
- 原型总览：`#/design-prototypes`，按 1 / 2 / 3 可快速打开。
- A 使用“深夜游戏盒”配色：墨蓝、盒面奶油、标签红、状态薄荷、数据黄铜。
- 主应用截图：`outputs/app/1440x900/`、`outputs/app/1920x1080/`、`outputs/app/150pct-1280x720/`、`outputs/app/4k/`。
- 焦点与 reduced motion 证据：`outputs/app/probes/`。
- 可读性与圆角修订：弱文本透明度提高到 0.64 以上，主界面功能文字最小 11px；控件 10px、卡片 16px、面板 18px、主视觉 24px 的圆角分层已应用到 Home、游戏库、详情、统计、设置和大屏。
- 大屏矮窗口适配：高度不超过 820px 时隐藏底部游戏架，优先保留主视觉和启动操作；不超过 960px 时隐藏手柄提示，解决按钮与提示重叠。

## 验证记录

已通过：

### C4

- `pnpm lint`、`pnpm typecheck`、`pnpm test`（10 个前端测试，新增元数据搜索/导入和来源排序测试）、`pnpm build`、`pnpm format:check`。
- `cargo fmt --check`、`cargo clippy -- -D warnings`、`cargo test`（37 个 Rust 测试；30 个通过，7 个需要网络或人工授权的 live 测试默认忽略）。
- 网络 smoke：`cargo test live_provider_smoke -- --ignored` 通过；VNDB/Bangumi 联合搜索、详情解析均返回真实数据。
- 网络导入 smoke：`cargo test live_search_priority_and_cover_import -- --ignored` 通过；VNDB 结果优先于 Bangumi，在线封面下载、原图和 WebP 缩略图写入成功。
- OAuth smoke：`live_nextmoe_login_persists_account` 与 `live_bangumi_login_persists_account` 通过；真实浏览器同意授权后 token 交换成功、账号写入内存库。`live_hikarinagi_login_persists_account` 已完成浏览器授权和回调，但 token 端点返回 `client authentication failed`，需要把 Hikarinagi 应用切换为 public client。
- OAuth 配置 smoke：真实开发版窗口从仓库 `tmp/oauth/providers.json` 自动读取配置，设置页显示“OAuth 配置已读取”和文件路径，三个来源均显示“未连接”且连接按钮可用；`reads_config_from_data_directory` 和 `installs_config_and_reloads_it_immediately` 覆盖数据目录读取和设置页导入。
- 实际 Tauri 窗口（`MIYU_DATA_DIR=tmp/c4-appdata-1`）：在作品详情“来源与字段”搜索“月影”得到 29 条候选，VNDB 12 条在前、Bangumi 17 条在后；选择 VNDB 候选导入 4 个空白字段；锁定简介后切换 Bangumi 候选，预览显示“已锁定”且不可勾选，导入只应用到未锁定字段，简介保持 VNDB 值。
- SQLite 证据：`metadata_claims` 中 VNDB 的 `aliases`、`description`、`publisher`、`release_date` 有来源和时间；`description` 的 `locked=1`；Bangumi 只写入了未锁定的 `developer`。
- 截图证据：`outputs/app/c4/1440x900/`、`1920x1080/`、`150pct-1280x720/`、`4k/`；所有尺寸无横向溢出，4K 来源面板已完成加载；设置页来源顺序、启停和 OAuth 账号卡可用。
- 主包约 392.52 KB（gzip 119.69 KB）；详情页 lazy chunk 约 165.02 KB（gzip 49.03 KB）。

### C3

- `pnpm lint`、`pnpm typecheck`、`pnpm test`（7 个前端测试）、`pnpm build`。
- `cargo fmt --check`、`cargo clippy -- -D warnings`、`cargo test`（16 个 Rust 测试）。
- `pnpm tauri build --debug --no-bundle` 成功，生产资源构建未报错。
- C3 迁移测试：在只应用 C2 两个迁移、且已有 works/releases/local_copies 数据的数据库上继续迁移成功；默认 tags 为空、launch_count 为 0、无封面和启动配置。
- 资产测试：PNG 原图缓存、WebP 缩略图生成、尺寸校验、静态资产协议读取、封面清除和路径穿越拒绝。
- 详情编辑测试：标题、原题、别名、简介、年份、开发商/发行商、版本、语言、发行日期、标签、状态、评分、收藏和备注写入；年份/日期/评分边界校验；重新扫描不覆盖手动标题。
- 启动配置测试：保存参数/环境变量/包装器/显示器偏好；exe 和工作目录路径校验；无效路径报告不误改已有 install_status；`record_launch_started` 写入最近启动时间和启动次数。
- 实际 Tauri 窗口（`MIYU_DATA_DIR=tmp/c3-appdata`）：导入带空格、中文、日文的 `game_zh.exe`；发现并应用本地封面；原图 600×900、缩略图 480×720；`miyu-asset` 协议在详情和游戏库中返回 200。
- 实际 Tauri 启动：直接启动 dummy exe，`launch_state.jobTracked=true`；dummy 写回参数 `--window`、`--test-cjk 路径`、环境变量 `MIYU_C3=1`、`LOCALE=zh-CN` 和工作目录；退出码 0，详情页显示“已退出 · 退出码 0”。
- 包装器验证：选择自定义 wrapper.exe，填写 `-runas` / `profile test`；wrapper 收到游戏 exe 和游戏参数，并成功启动游戏；清理包装器配置后恢复直接启动。
- 停止验证：运行中点击“停止游戏”，`TerminateJobObject` 结束进程树，`launch_state` 返回 null。
- 错误与回退：不存在的 exe、不存在的包装器均显示可操作校验结果；删除封面原图和缩略图后重新打开详情，回退到标题排印封面。
- 截图证据：`outputs/app/c3/01-detail-cover.png`、`02-detail-launch.png`、`03-detail-edit.png`、`04-launch-running.png`、`05-launch-exited.png`、`06-library-thumbnail.png`、`07-invalid-path.png`、`08-cover-fallback.png`、`probe.log`。
- 浏览器截图：`outputs/app/1440x900/`、`1920x1080/`、`150pct-1280x720/`、`4k/` 已包含 `02-detail`、`02b-detail-launch`、`02c-detail-edit`；所有尺寸无横向溢出，4K 详情页已确认完成加载而非骨架屏。
- 主包约 381.97 KB（gzip 116.28 KB）；详情页 lazy chunk 约 151.33 KB（gzip 45.46 KB）。

### C2

- `pnpm typecheck`、`pnpm lint`、`pnpm test`（当前 8 个前端测试）、`pnpm build`。
- 修复扫描确认弹窗复选框和入库名称编辑读取已释放事件对象导致的 `event.currentTarget` 空引用崩溃；浏览器回归点击 60 次复选框并改名，弹窗保持可用；新增 `scan-dialog` 回归测试。
- `cargo fmt --check`、`cargo clippy -- -D warnings`、`cargo test`（8 个 Rust 测试）。
- 汉化/语言版本测试：`game_zh.exe`、`game_CHS.exe` 与原版一起成为候选，并带“语言/汉化版本”提示和加分。
- 扫描排除测试：移出作品写入排除表；默认扫描跳过，`include_excluded` 手动扫描重新包含；再次导入会清除排除。
- 浏览器预览验证：移除一部后游戏库 10→9，Settings 显示 1 个扫描排除，手动导入弹窗带“手动导入”标记。
- 扫描测试：100 个 fixture 游戏、中文/日文标题、空格路径、深层目录、忽略 `_CommonRedist`/`vcredist`/辅助 exe、取消标志。
- 查询测试：5,000 条作品的分页查询、状态计数和 FTS5/模糊搜索；搜索结果与状态筛选均通过。
- Tauri 实际窗口（`MIYU_DATA_DIR=tmp/c2-appdata-1`）：系统目录选择器选择夹具目录，扫描到 10 个候选/12 个目录；确认导入 10 部；重新扫描显示 10 个“已在库中”、导入按钮禁用；右键标记“在玩”后计数更新；关闭并重启后仍有 10 部作品、1 个扫描目录和 1 部在玩。
- Tauri 实际窗口（`MIYU_DATA_DIR=tmp/c2-appdata-5000`）：5,000 部作品、5 个状态各 1,000 部；首屏只渲染 120 条，拉动滚动条后加载到 240 条，未崩溃。
- 截图证据：`outputs/app/c2/00-scan-progress*.png`、`01-scan-review*.png`、`02-library-after-import*.png`、`03-manual-import*.png`（1440×900 与 1280×720）；弹窗在视口内，候选列表在弹窗内部滚动，无控制台错误。
- 主应用截图已重新生成到 `outputs/app/1440x900/`、`1920x1080/`、`150pct-1280x720/` 和 `4k/`；Library 页无横向溢出。
- 主包 377.25 KB（gzip 115.09 KB），Library/Detail/Stats/Settings/Big Screen 已按路由拆分。

### C1 视觉基线

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`（原型总览、主应用首页和游戏库搜索烟测）
- `pnpm build`
- Vite 主包约 493 KB（gzip 151 KB）；历史原型路由已 lazy split，主包不再触发 500 KB 警告。
- `pnpm tauri build --debug --no-bundle`（生产资源打包成功）
- `cargo fmt --check`
- `cargo clippy -- -D warnings`
- `cargo check`
- 截图尺寸检查：1440×900 和 1920×1080 均无横向溢出；游戏库页面允许纵向滚动。
- 150%（1280×720 CSS / 1.5 DPR）和 4K 首页截图：无横向溢出；较矮窗口允许纵向滚动。
- 字号探针：1440×900 与 1280×720 下，六个主路由的功能文字最小 11px（排除封面装饰排版）；未发现低于 11px 的主界面标签。
- 大屏 1280×720 截图重测：主标题、简介、启动按钮和最近游玩列表完整可见，底部游戏架按高度规则隐藏。
- `pnpm tauri dev` 主应用实际窗口打开，无白屏；自定义标题栏和导航可用。
- 第二窗口探针：`MIYU_PROBE_WINDOW=1` 启动后窗口清单出现 `MiyuManager` 与 `MiyuManager · 大屏模式` 两个窗口。
- 全屏探针：`MIYU_PROBE_FULLSCREEN=1` 输出 `set=Ok(()), is_fullscreen=Ok(true)`。
- Gamepad API：WebView2/Chromium 157 中 `navigator.getGamepads` 存在；当前未连接手柄（0 个），实际手柄映射留到 C7。
- 键盘走查：Tab 焦点可见；大屏方向键移动后焦点卡片为第 3 张且 outline 可见。
- 外观探针：密度切换写入 `data-density="compact"`；减少动效写入 `data-reduce-motion="true"`，动画时长降至 0.01ms 级别。
- A 新配色已通过 TypeScript、ESLint、Vitest 和 Vite build；Tauri debug 构建可生成可执行文件。

验收结果：

- G2 已完成：用户确认当前 Home、游戏库、详情、统计、设置和大屏视觉基线。
- 视觉基线不是冻结规范：配色、主题、密度和布局仍集中在 token 与页面 CSS 中，后续可以继续修改。
- C2 已完成：真实目录扫描、候选确认、SQLite 入库、搜索/筛选/排序、重复扫描去重和重启持久化均已验证。
- C2 的视觉验收采用真实扫描数据和占位封面；C3 已补充手动/本地封面缓存，C4 已补充 VNDB/Bangumi 在线封面和元数据。

C2/C3 不再扩展；已知边界见上文，C4 及之后内容不在本对话范围。

## C2 完成记录

- 完成日期：2026-11-15
- 提交：`24d1b36`（SQLite、目录扫描、候选确认与真实游戏库）；`7f706de`（汉化/语言 exe 识别、扫描排除与手动导入）
- 结论：C2 已完成，具有可运行实现和自动化/预览验收证据；本对话停在 C2，不进入 C3。

## C3 完成记录

- 完成日期：2026-11-15
- 分支：`codex/c3-detail-launch`
- 提交：`71be766`（作品详情、封面缓存、启动配置与启动器）
- 结论：C3 已完成；详情编辑、封面缓存/发现、启动配置、包装器、路径校验、真实启动、Job Object 跟踪和运行状态均有自动化或实际窗口证据。

## C4 完成记录

- 完成日期：2026-11-15
- 分支：`codex/c4-metadata-providers`
- 结论：C4 已完成；Provider 框架、VNDB/Bangumi 搜索与字段导入、来源优先级、字段 claim/锁定、在线封面缓存、来源账本和 OAuth 账号连接均有自动化或实际窗口证据。

## 下一轮入口

C4 已完成，本对话到此结束，不启动 C5。若后续另开对话并明确要求 C5，再按以下入口执行：

1. C5 处理 Steam、多源字段冲突、字段级优先级和批量刮削；本轮不修改 C5 范围。
2. C5 开始前确认 G4 的多源字段优先级和冲突处理语义；C4 的 Provider 顺序、字段锁定和手动 claim 必须继续受保护。
3. 只有用户明确要求进入 C5 时，才开始 Steam、批量队列和复杂冲突 UI。
4. 继续调整 C4 视觉或来源设置时，按 token/密度/布局修正，并同步更新 `docs/DESIGN.md` 与 `outputs/app/c4/` 截图证据。

## 待决策与风险

- G1：已完成；A 已选，“深夜游戏盒”配色和逐页设想已确认。
- G2：已完成；当前视觉基线已确认，后续修改不改变 C1 验收结论。
- G3：已完成；默认直接启动，不捆绑/不自动下载 Locale Emulator 或 NTLEA；按作品可选包装器 exe 和参数数组。
- G4：C5 多源冲突和字段优先级。
- G5：C7 大屏布局和手柄映射。
- G6：C9 安装包、签名、便携版和更新策略。
- C3 封面只支持手动选择和本地发现；C4 已补充在线封面下载和 VNDB/Bangumi 元数据，Steam 和复杂多源冲突仍留到 C5。
- C3 的显示偏好只保存，不强制移动游戏窗口；实际窗口放置留到后续阶段。
- C3 启动状态只在内存中，应用重启后不会恢复正在运行的进程；关闭管理器不会强制结束游戏。
- 统计页仍是 C1 mock 视觉占位；`play_sessions` 表和真实会话在 C6 接入。
- 4K、150% 缩放和 1440/1920 截图已覆盖主路由；C3 详情、启动配置、编辑弹窗和游戏库缩略图已覆盖。扫描弹窗的 4K 单独手测仍属于 C9 回归范围。
- Hikarinagi OAuth 还需要在控制台切换为 public client（或补 clientSecret）；NextMoe/Kungal 与 Bangumi 已完成真实登录。OAuth 配置和 DPAPI 已接入，不依赖明文令牌文件。

当前没有阻塞项。Hikarinagi 的剩余动作是控制台把应用改为 public client；其余公开来源搜索和已完成的 OAuth 连接不受影响。

## 更新规则

每个子对话结束必须更新本文件的状态、证据、遗留问题和下一轮入口。没有验收证据的对话不能标记为“已完成”。
