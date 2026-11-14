# MiyuManager

本地优先的 Windows Galgame / AVG 游戏库管理器。目标是把作品、发行版本、本地安装副本、启动配置、元数据来源、游玩会话和用户状态组织成一套适合视觉小说的桌面与大屏体验。

当前处于 **C2：SQLite、目录扫描与真实游戏库**。主应用已经可以启动并完成真实的本地目录扫描、候选确认和入库；G1 已选择 **A 游戏启动器**，G2 已确认“深夜游戏盒”视觉基线。在线元数据、封面下载、真实启动和时长统计尚未接入。

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
- 确认候选后写入 Work → Release → LocalCopy；重复扫描会按规范化后的 exe 路径去重，已入库候选会标记“已在库中”。
- 游戏库支持搜索、状态筛选、排序、封面/列表切换和右键状态操作；关闭再打开应用后数据保留。
- 扫描器只读取目录、文件名和大小，不修改游戏目录；当前不读取游戏内进度、存档或成就。

开发或测试时可以用 MIYU_DATA_DIR 指向独立的数据目录，避免写入日常数据：

    $env:MIYU_DATA_DIR = "D:\Projects\MiyuManager\tmp\dev-data"
    pnpm tauri dev

主应用截图保存在 `outputs/app/1440x900/`、`1920x1080/`、`150pct-1280x720/` 和 `4k/`；C2 扫描确认与导入证据在 `outputs/app/c2/`；焦点与 reduced-motion 证据在 `outputs/app/probes/`。

## 产品边界

MiyuManager 管理的是可启动的 Galgame / AVG 电子游戏，不是电子书、视频或游戏商店。管理器不读取游戏内进度、章节、路线、存档或成就；界面只展示本地安装、启动配置、时长、最近启动、用户状态/评分/备注和可追溯元数据。

浏览器预览（pnpm dev）使用本地 mock 数据演示空库之外的状态；Tauri 窗口使用真实 SQLite。规划与状态见 [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md)、[docs/DESIGN.md](docs/DESIGN.md)、[docs/PAGE_VISIONS.md](docs/PAGE_VISIONS.md)、[docs/FRONTEND_STACK.md](docs/FRONTEND_STACK.md) 和 [docs/STATUS.md](docs/STATUS.md)。
