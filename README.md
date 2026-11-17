<div align="center">

![MiyuManager 应用图标](https://gist.githubusercontent.com/Miyu3710/7265e9ed4bd2945f025838756e5d26c6/raw/miyu-manager-128.svg)

</div>

# MiyuManager

MiyuManager 是一个本地优先的 Windows Galgame / AVG 游戏库管理器。它把本地安装、启动配置、元数据、游玩记录和收藏集中在一个桌面应用里，并提供适合电视和手柄的大屏模式。

## 功能

- **游戏库**：扫描本地目录或导入 Steam 库，识别可执行文件并显示语言版本提示。
- **启动管理**：保存工作目录、启动参数和环境变量，可选启用 Locale Emulator 与 Magpie。
- **元数据**：从 VNDB、Bangumi、Kungal、Hikarinagi 和 Steam 搜索、比较并合并作品信息与封面。
- **游玩记录**：按实际启动会话统计时长，支持补录、收藏集和 `Ctrl+K` 全局搜索。
- **大屏与数据安全**：电视大屏支持手柄操作；SQLite 数据库支持在线备份与恢复，并提供诊断日志。

## 快速开始

需要 Windows、WebView2 Runtime、Node.js 24+、pnpm 11+ 和 Rust 1.100+。

```powershell
pnpm install
pnpm tauri dev
```

`pnpm dev` 只启动浏览器预览，使用 mock 数据；需要真实数据库、扫描和启动游戏时请使用 `pnpm tauri dev`。

首次启动会进入向导：选择包含游戏主程序的目录、确认可执行文件，再按需启用元数据来源。

## 数据与配置

数据默认保存在 `%APPDATA%\MiyuManager`。开发或测试时可以用 `MIYU_DATA_DIR` 指向独立目录：

```powershell
$env:MIYU_DATA_DIR = "$PWD\tmp\dev-data"
pnpm tauri dev
```

“设置 → 数据与关于”可以备份或恢复数据库，并查看完整性、迁移和日志状态。OAuth 客户端配置从数据目录的 `oauth/providers.json` 或 `MIYU_OAUTH_CONFIG` 读取，访问令牌使用 Windows DPAPI 加密保存；不要把 `providers.json` 提交到仓库。

## 开发与检查

前端使用 React、TypeScript 和 Vite，桌面端为 Tauri 2 + Rust，数据保存在 SQLite。

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 浏览器预览（mock 数据） |
| `pnpm tauri dev` | 桌面应用 |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm test` | Vitest 测试 |
| `pnpm build` | 类型检查与生产构建 |

提交前运行完整检查：

```powershell
pnpm release:check
```

该命令依次执行前端 lint、类型检查、测试、构建，以及 `cargo fmt --check`、`cargo clippy -- -D warnings` 和 `cargo test`。

## 构建安装包

```powershell
pnpm release:build   # MSI + NSIS
pnpm release:exe     # 仅 release EXE
```

产物和 SHA-256 清单写入 `outputs/release/<版本>/`。MSI/NSIS 构建需要 WiX/NSIS，或允许 Tauri 联网下载打包器；当前 0.1.0 安装包未签名。

## 文档

- [用户指南](docs/USER_GUIDE.md)
- [发布说明](docs/RELEASE_NOTES.md)
- [开发计划](docs/DEVELOPMENT_PLAN.md)
- [项目状态](docs/STATUS.md)
- [故障排查](docs/TROUBLESHOOTING.md)

MiyuManager 管理的是可启动的游戏，不读取存档、章节、路线、成就或游戏内进度。
