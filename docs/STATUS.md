# MiyuManager 项目状态

> 最后更新：2026-11-15  
> 当前阶段：C1 已完成，G2 视觉基线已确认；C2 尚未启动  
> 计划文件：`docs/DEVELOPMENT_PLAN.md`  
> 设计提案：`docs/DESIGN.md`

## 当前状态

| 子对话                                | 状态   | 完成内容 / 证据                                                                                            |
| ------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| C0 规划与技术选型                     | 已完成 | 技术栈、范围、架构、数据模型、质量门槛和子对话拆分已写入 `docs/DEVELOPMENT_PLAN.md`                        |
| C1 基础工程、设计系统与可点击壳       | 已完成 | 设计系统、应用壳、Home/Library/Detail/Big Screen、Stats/Settings 和探针已完成；2026-11-15 通过 G2 视觉确认 |
| C2 SQLite、目录扫描与真实游戏库       | 未开始 | 依赖 C1                                                                                                    |
| C3 作品详情、图片缓存与启动器         | 未开始 | 依赖 C2                                                                                                    |
| C4 Metadata Provider、VNDB 与 Bangumi | 未开始 | 依赖 C3                                                                                                    |
| C5 Steam、多源合并与批量刮削          | 未开始 | 依赖 C4                                                                                                    |
| C6 自动时长统计与统计页               | 未开始 | 依赖 C3；可与 C4/C5 在不同 worktree 并行                                                                   |
| C7 电视大屏与手柄导航                 | 未开始 | 依赖 C6                                                                                                    |
| C8 首页、收藏集、设置与首次启动       | 未开始 | 依赖 C5、C6、C7                                                                                            |
| C9 硬化、性能、打包与发布候选         | 未开始 | 依赖 C8                                                                                                    |

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
- Git 仓库尚无提交

## C1 本轮产出

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
- 主应用页面使用同一组本地 mock 数据；数据库和扫描尚未接入。
- 封面为程序生成的 Galgame 风格占位图，包含角色剪影、包装盒和日文原题；不是真实作品封面。
- 原型总览：`#/design-prototypes`，按 1 / 2 / 3 可快速打开。
- A 使用“深夜游戏盒”配色：墨蓝、盒面奶油、标签红、状态薄荷、数据黄铜。
- 主应用截图：`outputs/app/1440x900/`、`outputs/app/1920x1080/`、`outputs/app/150pct-1280x720/`、`outputs/app/4k/`。
- 焦点与 reduced motion 证据：`outputs/app/probes/`。
- 可读性与圆角修订：弱文本透明度提高到 0.64 以上，主界面功能文字最小 11px；控件 10px、卡片 16px、面板 18px、主视觉 24px 的圆角分层已应用到 Home、游戏库、详情、统计、设置和大屏。
- 大屏矮窗口适配：高度不超过 820px 时隐藏底部游戏架，优先保留主视觉和启动操作；不超过 960px 时隐藏手柄提示，解决按钮与提示重叠。

## 验证记录

已通过：

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

待后续处理：

- 第二窗口内容在当前环境下未通过 CUA 视觉读取；窗口创建和路由已配置，下一轮可本地直接打开确认。
- 实际手柄连接和完整手柄映射留到 C7。

## 下一轮入口

C1 已完成，C2 尚未启动。后续继续调整视觉时，仍按以下原则处理：

1. 根据反馈修正 token、密度和页面布局；保留可回滚的改动。
2. 同步更新 `docs/DESIGN.md` 与截图证据。
3. 只有用户明确要求进入 C2 时，才开始 SQLite、目录扫描与真实游戏库。

## 待决策与风险

- G1：已完成；A 已选，“深夜游戏盒”配色和逐页设想已确认。
- G2：已完成；当前视觉基线已确认，后续修改不改变 C1 验收结论。
- G3：C3 启动器是否内置 Locale Emulator/NTLEA 默认配置。
- G4：C5 多源冲突和字段优先级。
- G5：C7 大屏布局和手柄映射。
- G6：C9 安装包、签名、便携版和更新策略。
- 当前原型封面为程序生成占位图，不代表最终美术质量；方向确认后需要接入真实封面或更完整的占位图集。

当前没有阻塞项。

## 更新规则

每个子对话结束必须更新本文件的状态、证据、遗留问题和下一轮入口。没有验收证据的对话不能标记为“已完成”。
