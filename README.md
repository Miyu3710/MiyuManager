# MiyuManager

本地优先的 Windows Galgame / AVG 游戏库管理器。目标是把作品、发行版本、本地安装副本、启动配置、元数据来源、游玩会话和用户状态组织成一套适合视觉小说的桌面与大屏体验。

**C4：元数据 Provider、VNDB 与 Bangumi 已完成**。主应用已经可以完成本地目录扫描、候选确认和入库，在作品详情页编辑资料、缓存封面、保存启动配置和真实启动游戏；现在还可以按来源优先级搜索 VNDB 与 Bangumi、预览候选、导入字段和封面，并保留字段来源和锁定状态。G1 已选择 **A 游戏启动器**，G2 已确认“深夜游戏盒”视觉基线。Steam、复杂多源冲突、自动时长统计和大屏体验尚未接入，下一阶段是 C5。

## 环境

- Node 24+
- pnpm 11+
- Rust 1.100+
- WebView2 Runtime

## 开发

```bash
pnpm install
pnpm dev          # 浏览器预览
pnpm tauri dev    # Tauri 桌面窗口
```

## 检查

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build

cd src-tauri
cargo fmt --check
cargo clippy -- -D warnings
cargo test
```

## 原型

- `#/`：首页。
- `#/library`：游戏库。
- `#/work/:id`：作品详情。
- `#/stats`：游玩统计。
- `#/settings`：设置与技术探针。
- `#/big-screen`：大屏模式。
- `#/design-prototypes`：B/C 原型对照。

## 本地库

- 数据库默认位于 %APPDATA%\MiyuManager\miyumanager.sqlite3，启用 SQLite WAL、迁移和 FTS5。
- 在游戏库点击“添加目录”，选择包含游戏主程序的文件夹；扫描会列出 exe 候选、建议名称、工作目录和大小。
- 汉化或语言版本 exe（如 game_zh.exe、game_CHS.exe、game_cht.exe、game_patch.exe）会和原版一起列为候选，并带语言版本提示。
- 确认候选后写入 Work → Release → LocalCopy；重复扫描会按规范化后的 exe 路径去重，已入库候选会标记“已在库中”。
- 游戏库支持搜索、状态筛选、排序、封面/列表切换和右键状态操作；关闭再打开应用后数据保留。
- 从库中移除的作品会写入扫描排除表；普通扫描会跳过，需要重新加入时在游戏库使用“手动导入”选择该游戏目录。
- 扫描器只读取目录、文件名和大小，不修改游戏目录；当前不读取游戏内进度、存档或成就。
- 作品详情页支持编辑标题、原题、别名、简介、年份、开发商/发行商、版本、语言、标签、状态、评分和备注；资料写入 SQLite。
- 支持手动选择封面或在游戏目录附近发现常见封面图片；原图与 WebP 缩略图缓存在数据目录，列表只加载缩略图，缓存文件被删除时回退到标题排印封面。
- 启动配置保存 exe、工作目录、参数数组、环境变量、可选包装器（Locale Emulator/NTLEA 一类工具）和显示器偏好；启动不经过 shell。
- 真实启动使用 Windows Job Object 跟踪进程树，详情页显示运行/退出状态和退出码；自动会话和累计时长留给 C6。
- 元数据来源支持 VNDB API v2 和 Bangumi OpenAPI：可从详情页搜索、查看候选、预览字段差异并导入标题、别名、简介、年份、标签、开发商、发行商、发行日期和封面。
- 来源优先级保存在 SQLite，可在设置页调整顺序和启停；搜索结果按优先级排列，导入默认只填空白且未锁定字段，手动编辑会自动留下锁定记录。每个字段保留来源、来源 ID 和抓取时间，详情响应缓存 24 小时。
- 账号连接已接入 OAuth：NextMoe/Kungal 使用 public client + PKCE，Bangumi 使用 OAuth 2.0；Hikarinagi 已接入授权码 + PKCE，但当前应用需要在控制台切换为 public client（或补充 clientSecret）后才能完成 token 交换。
- OAuth 凭证从 `MIYU_OAUTH_CONFIG`、数据目录 `oauth/providers.json` 或开发目录 `tmp/oauth/providers.json` 读取；access/refresh token 使用 Windows DPAPI 加密后写入 SQLite，不写入日志或前端。

开发或测试时可以用 MIYU_DATA_DIR 指向独立的数据目录，避免写入日常数据：

    $env:MIYU_DATA_DIR = "D:\Projects\MiyuManager\tmp\dev-data"
    pnpm tauri dev

## OAuth 配置

账号连接从 `MIYU_OAUTH_CONFIG` 指向的 JSON、数据目录 `oauth/providers.json`（默认 `%APPDATA%\MiyuManager\oauth\providers.json`）或开发目录 `tmp/oauth/providers.json` 读取。文件包含各来源的 `clientId`、可选 `clientSecret`、`redirectUri` 和 `scopes`，不要提交到 Git。

- NextMoe/Kungal：public client + PKCE，回调 `http://127.0.0.1/callback`，不需要 secret。
- Bangumi：OAuth 2.0，需要 client secret 和已注册的 `http://127.0.0.1:39123/callback`。
- Hikarinagi：授权码 + PKCE；控制台需要把应用设为 public client，并启用 `openid`、`profile`、`offline_access`，回调 `http://127.0.0.1:39124/callback`。

access token 和 refresh token 使用 Windows DPAPI 加密后写入 SQLite；应用不会把密码或 token 写进日志或前端。

主应用截图保存在 `outputs/app/1440x900/`、`1920x1080/`、`150pct-1280x720/` 和 `4k/`；C2 扫描确认与导入证据在 `outputs/app/c2/`；C3 详情、封面、启动配置和真实启动证据在 `outputs/app/c3/`；C4 搜索、预览、导入和来源优先级证据在 `outputs/app/c4/`；焦点与 reduced-motion 证据在 `outputs/app/probes/`。

## 产品边界

MiyuManager 管理的是可启动的 Galgame / AVG 电子游戏，不是电子书、视频或游戏商店。管理器不读取游戏内进度、章节、路线、存档或成就；界面只展示本地安装、启动配置、时长、最近启动、用户状态/评分/备注和可追溯元数据。

浏览器预览（pnpm dev）使用本地 mock 数据演示空库之外的状态；Tauri 窗口使用真实 SQLite。规划与状态见 [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md)、[docs/DESIGN.md](docs/DESIGN.md)、[docs/PAGE_VISIONS.md](docs/PAGE_VISIONS.md)、[docs/FRONTEND_STACK.md](docs/FRONTEND_STACK.md) 和 [docs/STATUS.md](docs/STATUS.md)。
