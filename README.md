# MiyuManager

本地优先的 Windows Galgame / AVG 游戏库管理器。目标是把作品、发行版本、本地安装副本、启动配置、元数据来源、游玩会话和用户状态组织成一套适合视觉小说的桌面与大屏体验。

当前处于 **C1：基础工程、设计系统与可点击壳**。主应用已经可以启动，G1 已选择 **A 游戏启动器**，并实现“深夜游戏盒”配色；数据库、扫描、真实刮削、启动和时长统计尚未接入。

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

主应用截图保存在 `outputs/app/1440x900/`、`1920x1080/`、`150pct-1280x720/` 和 `4k/`；焦点与 reduced-motion 证据在 `outputs/app/probes/`。

## 产品边界

MiyuManager 管理的是可启动的 Galgame / AVG 电子游戏，不是电子书、视频或游戏商店。管理器不读取游戏内进度、章节、路线、存档或成就；界面只展示本地安装、启动配置、时长、最近启动、用户状态/评分/备注和可追溯元数据。

规划与状态见 [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md)、[docs/DESIGN.md](docs/DESIGN.md)、[docs/PAGE_VISIONS.md](docs/PAGE_VISIONS.md)、[docs/FRONTEND_STACK.md](docs/FRONTEND_STACK.md) 和 [docs/STATUS.md](docs/STATUS.md)。
