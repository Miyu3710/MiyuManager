# MiyuManager 项目状态

> 最后更新：2026-11-15  
> 当前阶段：C8 实现完成；首页、收藏集、全局搜索、设置和首次启动已接入真实 SQLite，并完成“樱纸档案”视觉统一。C7 大屏仍待 G5 确认；手柄实机与多显示器仍待验证。下一轮为 C9
>
> 计划文件：`docs/DEVELOPMENT_PLAN.md`  
> 设计提案：`docs/DESIGN.md`

## 当前状态

| 子对话                                | 状态   | 完成内容 / 证据                                                                                                                            |
| ------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| C0 规划与技术选型                     | 已完成 | 技术栈、范围、架构、数据模型、质量门槛和子对话拆分已写入 `docs/DEVELOPMENT_PLAN.md`                                                        |
| C1 基础工程、设计系统与可点击壳       | 已完成 | 设计系统、应用壳、Home/Library/Detail/Big Screen、Stats/Settings 和探针已完成；2026-11-15 通过 G2 视觉确认                                 |
| C2 SQLite、目录扫描与真实游戏库       | 已完成 | SQLite/WAL/FTS5、目录扫描、候选确认、汉化 exe 识别、扫描排除/手动导入、真实游戏库、搜索筛选排序、持久化和 5,000 条查询已接入；详见下文     |
| C3 作品详情、图片缓存与启动器         | 已完成 | 真实详情编辑、封面缓存/发现、启动配置、包装器、路径校验、Job Object 启动跟踪与运行状态已接入；详见下文                                     |
| C4 Metadata Provider、VNDB 与 Bangumi | 已完成 | Provider 框架、来源优先级、VNDB/Bangumi 搜索与导入、字段 claim/锁定、封面下载、来源账本和 OAuth 账号连接已接入；详见下文                   |
| C5 Steam、多源合并与批量刮削          | 已完成 | Steam 来源、Steam 库自动嗅探、字段级/全局优先级、冲突采用/锁定、封面画廊、两阶段批量队列、暂停/取消/重试和局部成功已接入；详见下文         |
| C6 自动时长统计与统计页               | 已完成 | `play_sessions`、Job Object 会话观察、前台宽限、心跳恢复、真实统计页和会话补录/修正/删除已接入；详见下文                                   |
| C7 电视大屏与手柄导航                 | 待验收 | 正式 `bigscreen` 窗口、显示器选择、真实库、图标分类栏、竖版海报架、Y 菜单、Start 控制侧栏、启动/详情和焦点管理已接入；待 G5 确认；详见下文 |
| C8 首页、收藏集、设置与首次启动       | 已完成 | 真实首页、收藏集 CRUD/排序/作品增删、Ctrl+K 全局搜索、启动器/网络/数据设置、更新检查和首次启动向导已接入；详见下文                         |
| C9 硬化、性能、打包与发布候选         | 未开始 | 依赖 C8                                                                                                                                    |

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

### 2026-11-15 C8 视觉基线

- 主应用 token 在 C8 产品化时调整为“樱纸档案”：雾粉纸面 #F5EFEC、纸白表面 #FFFAF7、墨色侧栏 #2B2225、樱红 #B75D6C、灰绿状态 #587563、黄铜数据 #8C6935。保留 A 游戏启动器的信息结构，不改变产品方向。
- 圆角、阴影和表面层级收紧，浅纸面承载内容、深墨侧栏承载导航；设置页主题名同步为“樱纸档案”。
- 这次修订覆盖首页、游戏库、详情、统计、设置、收藏集、搜索和首次启动；旧 C7 大屏截图仍作为 G5 验收证据保留。

## 当前环境

- Node `v24.22.0`
- pnpm `11.25.0`
- Rust `1.100.0`
- WebView2 Runtime `157.0.4341.46`
- Git 仓库已有 C1 基线提交；C2 在 `codex/c2-library-import` 分支完成；C3 在 `codex/c3-detail-launch` 分支完成；C4 在 `codex/c4-metadata-providers` 分支完成；C5 在 `codex/c5-metadata-merge` 分支完成；C6 在 `codex/c6-playtime-stats` 分支完成；C7 在 `codex/c7-bigscreen` 分支完成实现，待 G5 确认；C8 在 `codex/c8-product-shell` 分支完成

## C8 本轮产出

- 数据层：`src-tauri/migrations/20261115000900_c8_collections.sql` 新增 `collections` 和 `collection_items`。收藏集名称不区分大小写唯一，支持手动排序；作品可属于多个收藏集。新增 `collections_list`、`collection_create`、`collection_rename`、`collection_delete`、`collection_reorder`、`collection_add_works` 和 `collection_remove_work`。`LibraryQuery` 增加 `favorite_only` 与 `collection_id`，游戏库查询可直接按收藏或收藏集过滤。
- 应用设置：`src-tauri/src/preferences.rs` 使用 SQLite `settings` 的 `app.preferences` 保存代理模式/地址、默认显示器、默认全屏、包装器默认路径与参数、可选更新清单地址和首次启动完成标记。`app_info` 增加目录数量和首次启动状态；新增 `preferences_get`、`preferences_update`、`onboarding_complete`、`open_data_dir`、`update_check`。
- 首页：`src/features/home/**` 使用真实 `library_query` 和 `play_sessions` 聚合。主视觉优先显示最近启动的作品，没有游玩记录时回退最近入库；下方显示最近启动、最近入库、收藏、想玩清单和累计/近 7 天/本周启动/收藏概览，并提供无库、加载骨架、错误重试和启动失败提示。
- 收藏集：`src/features/collections/**`；列表显示作品数量和封面栈，支持新建、重命名、删除和上下移动；详情支持从游戏库搜索并批量添加作品、移除作品和加载更多。封面来自真实 `assets` 缩略图，没有封面时使用分组图标，不伪造封面。
- 全局搜索：`src/features/search/GlobalSearchPalette.tsx`；Ctrl+K 打开命令面板，搜索作品标题、原题、别名、标签、开发商/路径和收藏集名称。支持方向键、Enter、Escape、中文输入法组合输入、最近 6 条搜索和“在游戏库查看全部结果”；关闭后焦点返回顶栏搜索按钮。
- 设置：启动器默认值写入 SQLite，作品没有单独配置时用于新启动配置；网络支持跟随系统、直连和自定义 HTTP(S) 代理，元数据请求立即切换，OAuth 授权在下次启动后使用新代理；数据与关于可打开数据目录、查看数据库和版本，并读取可选 JSON 更新清单。移除了无行为的“忽略规则编辑”和“备份”占位按钮。
- 首次启动：`src/features/onboarding/**` 和 `#/onboarding`；欢迎 → 目录扫描 → 确认主程序与显示名 → 可选来源 → 完成。选择来源步骤可以跳过；启用/停用沿用 Provider 持久化命令。空数据目录启动时自动进入向导，已有作品库或已完成标记的时候不强制重复。
- 视觉与交互统一：主应用 token 调整为“樱纸档案”浅纸面/墨色侧栏/樱红体系，降低圆角与阴影强度；新增 `ConfirmDialog` 统一替换全部 `window.confirm`，补充跳转到主要内容链接、焦点返回、搜索和弹窗焦点管理、底部左侧 toast、加载骨架和错误恢复。
- 验证：`pnpm format:check`、`pnpm typecheck`、`pnpm lint`、`pnpm test`（9 个文件 / 29 passed）、`pnpm build`；`cargo fmt --check`、`cargo clippy -- -D warnings`、`cargo test`（65 passed / 10 ignored）。真实 Tauri 使用 `MIYU_DATA_DIR=tmp/c8-appdata` 从空目录启动，扫描 10 部 fixture 游戏并导入；SQLite 确认收藏集“深夜推荐”包含 2 部作品；自定义代理保存后退回系统代理；关闭重启后直接回到上次的 `#/settings`，没有重复首次启动，收藏集与偏好仍在。
- 可访问性：`scripts/probe-c8-a11y.mjs` 验证首个 Tab 为“跳到主要内容”、Ctrl+K 搜索获得焦点并可用方向键、Escape 关闭后焦点回到顶栏搜索、收藏集弹窗自动聚焦名称输入、网络设置跳转、减少动效后 `data-reduced-motion=true`；结果在 `outputs/app/c8/probes/a11y-result.json`。
- 证据：`outputs/app/c8/1440x900/`、`1920x1080/`、`150pct-1280x720/`、`4k/`，包含首页、全局搜索、收藏集、收藏集详情、启动器/网络/数据设置和首次启动各步骤；实际 Tauri 窗口截图 `outputs/app/c8/tauri-collections.png`、`tauri-collection-detail.png`、`tauri-settings.png`、`tauri-home.png`、`tauri-search.png`、`tauri-onboarding.png` 和结构化结果 `tauri-c8-result.json`；`outputs/app/c8/probes/` 保存键盘与 reduced-motion 证据；`outputs/app/redesign/` 保存全路由视觉统一后的整页截图。

### C8 已知边界

- 首次启动只在“未完成引导且作品库为空”时自动出现；如果用户在导入作品后、点击完成前关闭应用，下次会按已有作品库处理，不再强制进入向导。已有 C2–C7 数据升级时也不会被重新引导。
- 来源步骤的启用/停用复用既有 Provider 命令；本轮真实 Tauri 走通的是“稍后设置来源”路径，来源开关的持久化由既有 Rust 测试覆盖。
- 全局搜索每次最多展示 8 部作品；收藏集名称在已加载的收藏集列表中过滤。最近搜索保存在 WebView localStorage，不写入 SQLite。
- 代理设置只影响元数据 HTTP 客户端当前实例；OAuth 服务在应用启动时创建，因此账号授权要等下次启动才使用新代理。
- 更新检查只读取可选的 JSON 清单（`version` / `notes` / `url`），不下载、不安装，也不验证签名；没有配置更新源时明确显示开发构建状态。安装包与更新链路属于 C9。
- 数据目录目前只提供查看和打开，不在前端直接复制或迁移数据库；备份、恢复和迁移检查属于 C9。外观偏好继续存放在 WebView localStorage，其余应用设置写入 SQLite。
- 收藏集支持手动排序和作品增删，不包含规则引擎、自动同步或云端收藏集。没有封面资源的收藏集只显示分组图标。
- C7 的 G5 仍未确认；物理手柄和多显示器仍需实机复测。C8 没有重做大屏布局。

## C7 本轮产出

- 独立窗口：`src-tauri/src/bigscreen.rs`；新增 `bigscreen_open`、`bigscreen_close`、`bigscreen_move`、`bigscreen_state`、`bigscreen_open_detail`。窗口标签 `bigscreen`，路由 `#/big-screen`，前端挂载后显示；无边框全屏，显示器选择写入 SQLite `settings` 的 `bigscreen.display`，无效显示器回退主屏并返回提示。打开时隐藏主窗口，关闭时恢复并聚焦；详情入口关闭大屏并在主窗口打开 `#/work/{id}`。
- 大屏页面：`src/features/bigscreen/**`；使用真实作品、分类、游玩状态、累计时长和最近会话数据。左侧为纯图标分类栏（最近启动、在玩、想玩、已完成、搁置、收藏、全部游戏），垂直居中，不显示文字或计数；主视觉左侧显示状态、标题、原题、简介、标签和启动/详情，右侧显示 2:3 封面；底部为横向海报架，只显示 2:3 海报，不显示标题、开发商或入库时间。大屏不展示“最近入库”。
- 输入：`useBigScreenInput.ts`、`useBigScreenFocus.ts`；A 确认、B 返回、Y 游戏菜单、Start 控制菜单、LB/RB 切换区域，X 未分配。D-pad/左摇杆移动，键盘方向键/Enter/Escape/C/M/Tab 提供完整替代；焦点按分类栏、主视觉、海报架分区域记忆，关闭菜单/抽屉后回到触发项。鼠标静止后隐藏光标，支持 reduced motion。
- 菜单：Y 在当前位置打开游戏菜单（启动/停止、查看详情、收藏、游玩状态子菜单、关闭）；Start 从右侧打开控制菜单（显示器、手柄状态、按键说明、刷新游戏库、返回主窗口）。B/Escape 只逐层返回，根界面不会退出大屏；退出入口只放在控制菜单。
- 设置：`SettingsPage` 新增“电视大屏”，可选择显示器、查看手柄连接状态、打开大屏和查看简短键位提示。
- 验证：`pnpm typecheck`、`pnpm lint`、`pnpm test`（8 个文件 / 26 passed）、`pnpm build`、`pnpm format:check`；`cargo fmt --check`、`cargo clippy -- -D warnings`、`cargo test`（62 passed / 10 ignored）。实际 Tauri 窗口在当前 2560×1440（125%）屏幕上以 2048×1152 CSS 全屏打开；7 个图标分类渲染正常，“全部游戏”切换后聚焦首张海报；真实 dummy 游戏从大屏启动并结算为 10 秒 `exited` 会话；“游戏详情”关闭大屏并把主窗口导航到 `#/work/2`；设置页打开/关闭大屏正常。当前机器未连接物理手柄，且只有一个显示器，因此手柄实机映射和多显示器移动尚未验证。
- 证据：`outputs/app/c7/1440x900/`、`1920x1080/`、`150pct-1280x720/`、`4k/`（`01-bigscreen`、`02-game-menu`、`03-control`、`04-detail-drawer`）；实际 Tauri 截图 `outputs/app/c7/tauri-bigscreen-final.png`、`tauri-category-all.png`、`tauri-game-menu-final.png`、`tauri-control-final.png`、`tauri-detail-drawer.png`、`tauri-main-detail.png`、`tauri-settings-bigscreen.png`、`tauri-launch-running.png`、`tauri-launch-finished.png`；结构化结果 `tauri-probe.json`、`tauri-launch-real.json`、`tauri-categories.json`。

### C7 已知边界

- Gamepad API 在 WebView2 中可用，但本机没有物理手柄，A/B/Y/Start/LB/RB 的实机映射仍未验证；键盘路径已完整走查。
- 本机只有一个显示器，显示器选择和切换的移动逻辑只有主屏回退路径有实际窗口证据，多显示器仍需外接屏幕复测。
- 大屏分类栏只显示图标，分类名称通过 `aria-label` 和悬浮提示提供；不显示每个分类的作品数量，避免在 10-foot 视图里堆叠文字。
- 打开大屏会隐藏主窗口；“游戏详情”会关闭大屏并回到主窗口，不在大屏内打开完整详情页。启动/停止、收藏和状态修改直接写回现有 SQLite 数据。
- 游戏架海报使用 2:3 竖版比例，横幅封面会被裁切；没有单独的文字标签，作品识别依赖海报和主视觉。

## C6 本轮产出

- 数据层：`src-tauri/migrations/20261115000700_c6_play_sessions.sql`；`play_sessions` 保存本地副本、启动 ID、状态、开始/结束/最后心跳、有效时长、结束原因、来源、PID、exe 路径、备注和修正标记。部分唯一索引保证一个本地副本最多一条未结束会话；作品/开始时间和未结束心跳各有索引。
- 会话引擎：`src-tauri/src/tracking/**`；Job Object 查询完整游戏进程树，按规范化 exe 路径识别主程序；包装器不计时。Steam 导入的游戏如果先启动短转交进程、再由 Steam 以新 PID 启动真正主程序，会按完整 exe 路径重新附着到作业对象外的游戏进程，并在退出后结算。每 2 秒观察进程与前台窗口，每 30 秒心跳；失去前台超过 90 秒后暂停有效时长，回到游戏继续同一会话；单次 tick 有时长上限，系统时间变化不会直接改变累计值。
- 启动与结算：`launcher` 不再只等待初始子进程，而是由观察任务在游戏进程树结束后结算；直接启动、包装器启动、Steam 转交、手动停止和退出码均保留。Steam 转交后的游戏 PID 会回传给启动管理器，因此“停止游戏”可以结束作业对象外的实际主程序。正常关闭主窗口把未结束会话结算为 `app_closed`，异常退出由下次启动按最后心跳截断为 `recovered`。
- IPC 与统计：新增 `sessions_list`、`session_create`、`session_update`、`session_delete`、`stats_get`。作品列表通过 `play_sessions` 聚合秒数和分钟数；统计返回累计、近 7/30 天、本周启动、84 天热力图、作品排行和最近会话。
- UI：`StatsPage` 不再读取 mock，支持本周/本月/今年/全部范围；12 周热力图按开始日期聚合。作品详情“游玩记录”显示真实会话，支持补录、修正和删除；短会话按秒显示，状态区分计时中、后台暂停、正常退出、手动停止和异常恢复。Steam 导入的作品在游戏库封面和详情标签中显示 `Steam` / `Steam 库 · AppID`，列表视图的来源列也显示 `Steam · 本地安装`。
- 验证：前端 Vitest 覆盖统计范围切换和分页外补录；Rust 覆盖前台宽限/暂停恢复、会话心跳与结算、手动 CRUD、异常恢复、正常关闭、Job Object 进程树、Toolhelp 外部进程发现/终止、Steam 转交路径、路径规范化及 10,000 条会话统计。真实 Tauri 窗口验证直接启动、包装器启动、手动停止、模拟崩溃恢复、统计页和补录/修正/删除；GINKA AppID 2536840 实际启动后建立运行会话，关闭游戏后结算为 16 秒，停止游戏也能结束作业对象外的 PID。
- 证据：`outputs/app/c6/1440x900/`、`1920x1080/`、`150pct-1280x720/`、`4k/`；实际 Tauri 截图 `outputs/app/c6/tauri-running-final.png`、`tauri-sessions.png`、`tauri-stats.png`、`tauri-manual-stop.png`；GINKA Steam 转交证据在 `outputs/app/c6/steam-ginka/`，包含运行会话、游戏库 Steam 标记、详情 AppID、正常退出和手动停止后的游玩记录。

### C6 已知边界

- Steam 导入的游戏可以从 MiyuManager 启动后重新附着到 Steam 转交的进程；不接管用户在 Steam 客户端、资源管理器或其它启动器中直接启动、且 MiyuManager 没有对应启动请求的进程。
- 有效时长按游戏进程仍在运行计算；失去前台超过 90 秒后停止累计，因此游戏一直显示在前台但用户离开时仍可能计为游玩。
- 应用崩溃时最多丢失一个 30 秒心跳周期；崩溃后若游戏仍继续运行，重启应用不会重新接管该进程，只把旧会话截断并在界面标为异常恢复。
- 包装器如果创建 breakaway 进程或绕过 Job Object，主程序可能无法被识别；Steam 转交会按完整 exe 路径查找，若实际游戏使用与导入记录不同的目录或 exe，仍需重新选择主程序。无法识别时会在 60 秒后报告启动失败，不会把包装器时间误记到作品。
- 12 周热力图按会话开始日期归档，跨午夜会话不会拆分到两个日期；会话时间为本地输入，数据库保存 UTC，有效时长本身不受时区变化影响。

### 2026-11-15 最大化布局修正

- 移除 Home、Library、Stats、Detail、Settings 的固定 `max-width`。窗口最大化后页面按 `.app-main` 的实际宽度伸展；游戏库的虚拟列表继续通过 `ResizeObserver` 重算列数。
- 实际 Tauri 窗口在当前 2560×1440（125% 缩放）屏幕上从 1440×900 最大化到 2048×1104 CSS 像素：主内容区由 1236px 增至 1844px，首页内容宽 1174px → 1792px，游戏库 5 列 → 6 列；统计、详情和设置也铺满可用区域，页面 `scrollWidth` 始终不超过视口。
- `outputs/app/c6/maximized/` 保存最大化后的首页和游戏库截图；`outputs/app/c6/1440x900/`、`1920x1080/`、`150pct-1280x720/`、`4k/` 已按新布局重新生成，桌面和 4K 缩放均无横向溢出。

## C5 本轮产出

- 数据层：`src-tauri/migrations/20261115000600_c5_metadata_merge.sql`、`20261115000800_steam_library.sql`；新增 `metadata_field_priorities`，保存每个字段的来源顺序；`settings` 增加 `metadata.field_priority_global` 开关；`local_copies` 增加 `steam_app_id` 和索引。旧库迁移通过。
- Steam：`src-tauri/src/metadata/steam.rs`；支持名称搜索、AppID、`store.steampowered.com/app/...` 商店链接，过滤原声带/画集/漫画等附加内容，解析中英文发售日期、开发商、发行商、简介、类型标签，提供 600×900 封面、横幅和胶囊图。请求按来源限速、缓存详情并处理 429/重试；真实测试 AppID 324160 通过。
- Steam 库扫描：`src-tauri/src/steam_library.rs`；从 Windows 注册表定位 Steam，读取 `libraryfolders.vdf`（兼容新版对象和旧版数字键格式）及每个库的 `appmanifest_*.acf`，过滤 Steamworks/Proton/运行库等附加项，再以 6 层深度扫描安装目录寻找 exe。游戏库提供“扫描 Steam 库”入口，支持扫描进度、取消、逐项改选显示名称和主程序、已入库标记；新增 `local_copies.steam_app_id`，详情页显示 Steam AppID，多源合并对 Steam 直接按 AppID 读取详情，不再依赖标题匹配。
- 来源优先级：设置页支持全局来源顺序、字段级顺序，以及“全部字段跟随全局来源顺序”开关。字段开关持久化；打开后所有字段使用全局顺序，字段级覆盖保留但暂不生效，关闭后恢复。全局顺序缺失字段时按来源能力过滤，新增来源会自动出现。
- 合并与冲突：`src-tauri/src/metadata/merge.rs`；按标题/别名/年份相似度为每个启用的来源选最可能的候选，聚合同一字段的多个来源值，默认只勾选空白且未锁定字段；支持逐字段改选、采用来源值、锁定/解锁。手动/锁定 claim 始终优先，字段账本显示冲突徽标、来源、时间和“采用此值”。
- 封面：合并预览和手动搜索都改为图片画廊；支持封面、横幅、胶囊图，显示来源和类型。选择哪张图就下载哪张，原图与 WebP 缩略图缓存；已有封面默认不选，锁定封面跳过。每个来源最多展示 4 张、总计最多 12 张。
- 批量刮削：`src/features/metadata/BatchScrapeDialog.tsx`、`src-tauri/src/commands.rs`；游戏库多选后两阶段执行（匹配提案 → 确认应用）。支持来源选择、每部作品状态、总进度、暂停/继续、取消、失败项重试和局部成功；应用时再次检查锁定和空字段，`only_if_empty` 防止提案生成后值变化被覆盖；封面为可选项。
- UI：`src/features/metadata/MergePanel.tsx`、`FieldPrioritySettings.tsx`、`BatchScrapeDialog.tsx`；详情页新增多源合并工作台，设置页新增字段优先级/全局开关，游戏库新增批量选择条，来源账本新增封面缩略图和冲突处理。
- 验证：`pnpm lint`、`pnpm typecheck`、`pnpm test`（18 passed，含 50 条提案、失败项重试和 Steam 库对话框）、`pnpm build`、`pnpm format:check`；`cargo fmt --check`、`cargo clippy -- -D warnings`、`cargo test`（含 Steam VDF/清单、真实 Steam 库探测和本地 429 退避重试测试）。主包约 407.86 KB（gzip 123.50 KB），详情页 lazy chunk 约 175.91 KB（gzip 51.74 KB）。Steam live AppID/详情测试通过。实际 Tauri 窗口（`MIYU_DATA_DIR=tmp/c5-appdata`）匹配 VNDB v4、Bangumi 13、NextMoe 86、Steam 324160，应用 6 个字段和 1 张封面；Bangumi 日期导入后采用 Steam 值并锁定；批量 1 部作品应用 6 个字段和封面；暂停、取消路径可用；批量失败项重试入口通过 Vitest 验证；手动选择 Steam 横幅后缓存原图 460×215 和 WebP 缩略图；全局字段优先级开关写入 SQLite 并即时生效。另用 `MIYU_DATA_DIR=tmp/steam-appdata` 真实扫描本机 `D:\Steam`/`E:\SteamLibrary`，发现 28 部游戏、26 部有 exe 候选；导入 CLANNAD 后保存 AppID 324160，详情显示 Steam 行，多源合并直接匹配 Steam #324160。
- 证据：`outputs/app/c5/1440x900/`、`1920x1080/`、`150pct-1280x720/`、`4k/`，包含 `01-merge-preview`、`01b-merge-covers`、`01c-manual-cover-gallery`、`02-field-priorities`、`02b-field-priorities-global`、`03-library-selection`、`04-batch-setup`、`05-batch-review`；实际 Tauri 截图 `tauri-merge-preview.png`、`tauri-conflict-adopt.png`、`tauri-batch-review.png`、`tauri-batch-done.png`、`tauri-batch-paused.png`、`tauri-steam-appid.png`、`tauri-steam-scanning.png`、`tauri-steam-review.png`、`tauri-steam-review-clean.png`、`tauri-steam-done.png`、`tauri-steam-detail.png`、`tauri-manual-cover-gallery.png`、`tauri-global-priority.png`、`tauri-ledger-cover.png`。

### C5 已知边界

- Steam Store 的搜索和应用详情接口不是正式稳定 API；商店名称/日期会随语言和区域变化，原题可能只得到本地化名称。失败会作为单来源错误展示，其他来源继续。
- 批量提案保存在内存中，应用重启会丢失未应用的队列；任务不跨重启继续。
- 自动匹配为每个来源取一个最高相似度候选，默认勾选要求置信度 ≥ 0.6；低于阈值仍可在合并预览中手动选择，但批量默认跳过。没有多候选自动合并或人工逐 claim 冲突向导。
- 批量只按作品标题/原题/别名搜索，不读取游戏内信息；来源限速决定 50 部作品需要较长时间，UI 保持可操作。
- 封面画廊有 4/来源、12/总数上限；选择非主封面会下载对应图片，但来源记录仍以 URL 形式保存，不在账本中直接展示 URL。
- Steam 库扫描只读取目录、清单和 exe，不解析 Steam 启动参数/包装器，也不通过 `steam://` 启动；Steam 游戏仍使用本应用的启动配置。扫描深度为 6 层、单应用最多 80,000 条目，极深目录可能找不到 exe，可手动选择目录补充。
- 没有 EGS/Getchu/DLsite、定时批次、后台队列持久化、云端元数据服务或插件 SDK。

## C4 本轮产出

- 数据层：`src-tauri/migrations/20261115000400_c4_metadata.sql`；新增 `metadata_providers`、`source_records`、`metadata_claims`，保存 Provider 顺序/启停、原始响应、字段值、来源 ID、抓取时间和锁定状态。详情响应缓存 24 小时。
- Provider：`src-tauri/src/metadata/**`；`MetadataProvider` trait、VNDB API v2、Bangumi OpenAPI、统一搜索结果/候选详情/字段 claim/错误/取消；HTTP 客户端包含 User-Agent、18 秒超时、3 次退避重试、按来源限速、响应大小限制和取消。
- 来源扩展：Kungal / NextMoe Catalog（匿名读取 `/v2/catalog/works`，映射标题、原题、别名、简介、年份、公司、标签、发行日期、关联作品和多封面）与 Hikarinagi（`/v3/search`、`/v3/galgames/{id}`、`/v3/galgames/{id}/producers`，需要 `catalog:read` Bearer 令牌，映射标题、原题、别名、简介、开发商、发行商、标签、发行日期和封面）。Hikarinagi 优先使用已连接账号的访问令牌，过期时刷新并保存轮换后的 refresh token；配置 `clientSecret` 时也可用 `client_credentials` 应用级令牌。
- 来源优先级：设置页支持上移/下移和启停，顺序持久化到 SQLite；搜索按优先级排列，字段预览的默认选中按候选来源与已有 claim 的优先级判断。后续新增来源只需注册适配器并自动出现在设置页。
- 搜索与导入 UI：`src/features/work-detail/MetadataPanel.tsx`；详情页“来源与字段”支持全部来源或单来源搜索、候选封面/标题/年份/开发商/来源徽标、字段差异预览、选择性导入、封面导入、来源账本和锁定/解锁。
- 字段保护：手动编辑通过 `work_update` 写入 `manual` locked claim；导入跳过锁定字段，默认只选空白且未锁定字段；已有手动/本地封面默认保留；锁定字段在重新导入时保持原值。
- 封面：在线候选封面可下载到现有资产缓存，生成 WebP 缩略图；资产来源标记 `online`，详情页区分手动/本地/在线封面。
- OAuth：`src-tauri/src/oauth/**`、`20261115000500_oauth.sql`；支持系统浏览器 + 本机环回回调、state、PKCE、token 交换、Windows DPAPI 加密存储、账号状态、断开连接、访问令牌读取和 refresh token 轮换。NextMoe/Kungal、Bangumi 与 Hikarinagi 均已用真实账号完成授权验证。
- OAuth 设置：`src/features/settings/OAuthAccounts.tsx`；设置页显示三个来源的配置/连接状态、账号名、scope，并提供连接、断开、重新读取和导入 `providers.json`。凭据从 `MIYU_OAUTH_CONFIG`、数据目录 `oauth/providers.json` 或开发目录 `tmp/oauth/providers.json` 读取，不进入前端或 Git；开发构建会额外查找仓库根目录的 `tmp/oauth/providers.json`，配置保存后即时生效，不需要重启。
- 验证：Provider fixture 测试、优先级/启停测试、锁定字段跳过测试、OAuth 配置读取/导入测试、真实 Tauri 窗口联合搜索（VNDB 在 Bangumi 前）、VNDB 字段导入、锁定简介后 Bangumi 导入不覆盖、在线封面下载和缩略图缓存。Kungal 在线 smoke 返回真实候选和详情；Hikarinagi 使用本机已连接账号实测搜索返回 20 条候选，CLANNAD 详情含开发商 Key、发行商、11 个标签和封面。
- 证据：`outputs/app/c4/1440x900/`、`1920x1080/`、`150pct-1280x720/`、`4k/`，包含 `01-sources-empty.png`、`02-search-results.png`、`03-preview.png`、`04-imported.png`、`04b-locked.png`、`05-settings-priority.png`、`06-oauth-accounts.png`。

### C4 已知边界

- OAuth 登录已接入 NextMoe/Kungal、Bangumi 和 Hikarinagi 的授权流程，三者均已完成真实登录。Hikarinagi 数据源需要 `catalog:read`：已连接账号会直接复用访问令牌；未连接时可在 `providers.json` 配置 `clientSecret` 使用应用级令牌。
- 不包含 Steam、批量全库刮削、复杂多源冲突 UI、自动匹配和额外 HTML 来源；这些已在 C5 补齐（额外 HTML 来源仍不在 v1）。
- 搜索结果和候选封面来自在线来源；只为详情响应做 24 小时缓存，不构成离线元数据镜像。断网时本地库、详情和启动仍可用，但搜索会失败并给出重试。
- VNDB 的关联作品只在候选详情展示，不自动建立本地作品关系或合并作品。
- 锁定是字段级：锁定后该字段的所有 claim 都跳过导入；C5 已补上逐 claim“采用此值”和冲突处理界面。
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

- C3 当时只记录启动次数和最近启动时间；C6 已补上 `play_sessions`、自动累计时长和统计页。
- 封面只支持手动选择和本地发现；C4/C5 已补充在线封面候选、下载和画廊。
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

- C2 阶段封面仍是标题排印占位；C3 已补充手动/本地封面缓存，C4 已补充 VNDB/Bangumi 在线封面和元数据，C5 已补充 Steam、多源冲突和批量刮削。
- C2 阶段详情页只展示本地安装与启动路径；C3 已补上启动配置、路径校验和真实启动。
- C2 时 `play_sessions` 尚未建表，统计页仍是 C1 视觉占位；C6 已接入真实会话。
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

### C8

- `pnpm format:check`、`pnpm typecheck`、`pnpm lint`、`pnpm test`（9 个文件 / 29 passed）、`pnpm build`；`cargo fmt --check`、`cargo clippy -- -D warnings`、`cargo test`（65 passed / 10 ignored）。
- Rust 覆盖收藏集创建/重名拒绝/改名/排序/作品增删/封面栈、`collection_id` 和收藏过滤、5,000 条分页、旧 C2 库迁移、偏好读写和代理 URL 校验；版本比较测试覆盖带 `v` 前缀。
- 真实 Tauri（`MIYU_DATA_DIR=tmp/c8-appdata`）从空目录进入首次启动，扫描 `tmp/c2-fixtures/library` 得到 10 个候选并全部导入；来源步骤选择“稍后设置来源”后可完成并进入游戏库。
- SQLite 实查：`collections` 有“深夜推荐”，`collection_items` 有 2 条作品记录；`app.preferences` 保存 `onboardingCompleted=true`。自定义代理保存后切换回“跟随系统”，两次写入均可读回。
- 关闭并重启后直接打开上次的 `#/settings`，没有重复首次启动；作品库、收藏集和偏好仍在。
- `scripts/probe-c8-a11y.mjs`：首个 Tab 聚焦跳转链接，Ctrl+K 聚焦搜索框，方向键切换结果，Escape 关闭后焦点回到“打开全局搜索”，收藏集弹窗焦点落在名称输入，网络分区可跳转，减少动效后 `data-reduced-motion=true`；无控制台错误。
- `outputs/app/c8/1440x900/`、`1920x1080/`、`150pct-1280x720/`、`4k/` 共 48 张流程截图，全部无横向溢出；`outputs/app/c8/probes/` 包含 4 张可访问性证据；`outputs/app/redesign/` 包含主路由和弹窗的统一视觉截图。
- 构建主包 `dist/assets/index-*.js` 约 467.54 KB（gzip 142.69 KB），收藏集、首次启动和设置均为独立 lazy chunk；未引入新的运行时依赖。

### C7

- `pnpm typecheck`、`pnpm lint`、`pnpm test`（8 个文件 / 26 passed）、`pnpm build`、`pnpm format:check`；`cargo fmt --check`、`cargo clippy -- -D warnings`、`cargo test`（62 passed / 10 ignored）。
- 实际 Tauri 窗口（`MIYU_DATA_DIR=tmp/c7-appdata`）打开 `bigscreen` 窗口，2048×1152 CSS 无边框全屏；关闭后主窗口恢复。设置页显示器选择和“在电视上打开”可用，关闭大屏后按钮状态复位。
- 分类探针确认 7 个纯图标项渲染正常、`railText` 为空、标签只在 `aria-label`；点击“全部游戏”后分类切换并聚焦首张海报。底部书架为 2:3 竖版海报，没有标题/开发商文字，页面没有“最近入库”。
- Y/右键菜单显示启动/停止、查看详情、收藏、游玩状态和关闭；Start 控制侧栏显示显示器、手柄状态、按键说明、刷新游戏库和返回主窗口；B/Escape 在根界面不退出。
- 真实 dummy 游戏从大屏启动，运行中显示“停止游戏”，退出后生成 10 秒 `exited` 会话；“游戏详情”关闭大屏并把主窗口导航到 `#/work/2`。
- 16 张浏览器截图和实际窗口截图覆盖 1440×900、1920×1080、150%（1280×720 CSS）和 4K；均无横向溢出。当前没有物理手柄，Gamepad API 返回 0 个设备。

### C6

- `pnpm lint`、`pnpm typecheck`、`pnpm test`（18 passed，新增统计范围切换与补录表单）、`pnpm build`、`pnpm format:check`。
- `cargo fmt --check`、`cargo clippy -- -D warnings`、`cargo test`（62 passed / 10 ignored，新增计时宽限、暂停恢复、会话 CRUD、异常恢复、正常关闭、Job Object 进程树、Toolhelp 外部进程发现/终止、Steam 转交、范围筛选和 10,000 条统计测试）。
- 实际 Tauri 窗口（`MIYU_DATA_DIR=tmp/c6-appdata`）直接启动 12 秒 dummy 游戏，生成 `running` → `ended` / `exited` 会话，时长 10–12 秒；换成包装器启动后同样只生成一条会话，`exe_path` 指向游戏主程序而不是包装器。
- 本机 GINKA AppID 2536840 通过实际 Tauri 窗口启动：短转交进程退出后，Steam 以新 PID 启动 `GINKA.exe`；观察器按完整路径重新附着，界面显示计时中，关闭游戏后生成 16 秒 `exited` 会话并清空运行状态。再次启动后点击“停止游戏”返回 true，作业对象外的 GINKA 进程被结束，会话结算为 `manual_stop`。
- 实际窗口手动停止正在运行的游戏，会话在约 2 秒内结算为 `endReason=manual_stop`，`launch_state` 清空；以 `WM_CLOSE` 正常关闭主窗口时，正在运行的第 10 条会话结算为 `endReason=app_closed`。另用强制结束进程验证崩溃恢复。
- 模拟崩溃：停止应用后插入一条 `status=running`、`last_heartbeat_at` 为 1 分钟前的会话；重启后启动恢复把 `ended_at` 截断到该心跳，`end_reason=recovered`，时长保持 45 秒，再次启动不重复恢复。
- 实际窗口调用 `session_create` / `session_update` / `session_delete`：补录 30 分钟、修正为 45 分钟、删除后统计归零；统计页显示真实累计、近 7 天、本周启动、84 天热力图、作品排行和最近会话。
- 界面截图覆盖 `outputs/app/c6/1440x900/`、`1920x1080/`、`150pct-1280x720/`、`4k/`，包含统计页、作品游玩记录和补录表单；所有尺寸无横向溢出，84 个热力图单元均加载。
- 主包约 412.45 KB（gzip 124.86 KB）；统计页 chunk 约 6.32 KB（gzip 2.51 KB），详情页 chunk 约 180.56 KB（gzip 53.02 KB）。

### C4

- `pnpm lint`、`pnpm typecheck`、`pnpm test`（10 个前端测试，新增元数据搜索/导入和来源排序测试）、`pnpm build`、`pnpm format:check`。
- `cargo fmt --check`、`cargo clippy -- -D warnings`、`cargo test`（49 个 Rust 测试；41 个通过，8 个需要网络或人工授权的 live 测试默认忽略）。
- 网络 smoke：`cargo test live_provider_smoke -- --ignored` 通过；VNDB、Bangumi、Kungal 联合搜索和详情解析均返回真实数据。
- 网络导入 smoke：`cargo test live_search_priority_and_cover_import -- --ignored` 通过；VNDB 结果优先于 Bangumi，在线封面下载、原图和 WebP 缩略图写入成功。
- OAuth smoke：`live_nextmoe_login_persists_account`、`live_bangumi_login_persists_account` 与 `live_hikarinagi_login_persists_account` 均通过；真实浏览器同意授权后 token 交换成功、账号写入内存库。
- OAuth 配置 smoke：真实开发版窗口从仓库 `tmp/oauth/providers.json` 自动读取配置，设置页显示“OAuth 配置已读取”和文件路径，三个来源均显示“已连接”；`reads_config_from_data_directory` 和 `installs_config_and_reloads_it_immediately` 覆盖数据目录读取和设置页导入。
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

## C5 完成记录

- 完成日期：2026-11-15
- 分支：`codex/c5-metadata-merge`
- 结论：C5 已完成；Steam 来源、字段级/全局来源优先级、冲突采用/锁定、封面画廊、两阶段批量队列、暂停/取消/重试、`only_if_empty` 保护和 50 条提案 UI 均有自动化或实际窗口证据。

## C6 完成记录

- 完成日期：2026-11-15
- 分支：`codex/c6-playtime-stats`
- 提交：`6ae57f9`（Steam 库扫描并行完成时一并提交了 C6 工作树）；`3bf2d93`（会话编辑后同步最近游玩时间）。
- 结论：C6 已完成；`play_sessions`、Job Object 进程树观察、前台宽限、心跳恢复、真实统计页、会话补录/修正/删除和 10,000 条统计查询均有自动化或实际窗口证据。

## C4 完成记录

- 完成日期：2026-11-15
- 分支：`codex/c4-metadata-providers`
- 结论：C4 已完成；Provider 框架、VNDB/Bangumi 搜索与字段导入、来源优先级、字段 claim/锁定、在线封面缓存、来源账本和 OAuth 账号连接均有自动化或实际窗口证据。

## 下一轮入口

C8 已完成，下一轮进入 C9：

1. C9 处理错误边界、结构化日志、崩溃记录、数据库备份/恢复和迁移安全检查。
2. 收紧 Tauri capability/CSP，验证没有远程导航、任意 shell 或越权文件访问；补安装包、版本、更新清单和发布脚本。
3. 做 10,000 作品、5,000 封面缩略图、冷启动、大屏 4K、内存和安装包的基准；完成 Windows 10/11、1080p/4K/150%、中文/日文路径、离线/断网/限流、手柄和异常退出 QA 矩阵。
4. G5 仍待确认：有物理手柄时复测 A/B/Y/Start/LB/RB 和摇杆重复节奏；有第二块显示器时复测窗口移动与主窗口恢复。
5. 继续调整首页、收藏集或设置时，保持 `play_sessions` 和 `collections` 为事实来源，并同步更新 `docs/DESIGN.md`、`docs/PAGE_VISIONS.md` 与 `outputs/app/c8/` 截图。

## 待决策与风险

- G1：已完成；A 已选，“深夜游戏盒”配色和逐页设想已确认。
- G2：已完成；当前视觉基线已确认，后续修改不改变 C1 验收结论。
- G3：已完成；默认直接启动，不捆绑/不自动下载 Locale Emulator 或 NTLEA；按作品可选包装器 exe 和参数数组。
- G4：已完成；字段级默认优先级 + 全局顺序开关，手动/锁定优先，导入默认 `only_if_empty`，采用/锁定/解锁分离。
- G5：C7 实现已完成，待确认当前大屏布局、纯图标分类栏、竖版海报架和按键映射；物理手柄与多显示器验证仍待补齐。
- G6：C9 安装包、签名、便携版和更新策略。
- C8 的首次启动只在未完成引导且作品库为空时自动出现；中途导入后退出会按已有库处理。
- C8 的更新检查只读可选 JSON 清单，不下载或安装；数据目录只支持打开，备份/恢复/迁移留给 C9。
- C8 的代理切换对元数据即时生效，OAuth 授权需重启应用；全局搜索最近记录保存在 WebView localStorage。
- C3 封面只支持手动选择和本地发现；C4/C5 已补充在线封面下载、多源元数据、Steam、封面画廊和批量刮削。
- C3 的显示偏好只保存，不强制移动游戏窗口；实际窗口放置留到后续阶段。
- C3 启动状态只在内存中，应用重启后不会恢复正在运行的进程；关闭管理器不会强制结束游戏。
- C6 的自动计时只覆盖从 MiyuManager 启动的游戏；外部启动、breakaway 包装器进程和一直保持前台但无人操作的情况仍可能漏记或误记。
- 热力图按会话开始日期归档；跨午夜会话不会拆分到两天。应用异常退出最多丢失一个 30 秒心跳周期。
- 4K、150% 缩放和 1440/1920 截图已覆盖主路由；C3 详情、启动配置、编辑弹窗和游戏库缩略图已覆盖。扫描弹窗的 4K 单独手测仍属于 C9 回归范围。
- NextMoe/Kungal、Bangumi 与 Hikarinagi 均已完成真实登录；OAuth 配置和 DPAPI 已接入，不依赖明文令牌文件。

当前没有阻塞项。

## 更新规则

每个子对话结束必须更新本文件的状态、证据、遗留问题和下一轮入口。没有验收证据的对话不能标记为“已完成”。
