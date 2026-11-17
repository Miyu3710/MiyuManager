<div align="center">

![MiyuManager 应用图标](https://gist.githubusercontent.com/Miyu3710/7265e9ed4bd2945f025838756e5d26c6/raw/miyu-manager-200.svg)

<h1>MiyuManager</h1>

![Status](https://img.shields.io/badge/status-in%20development-orange) ![Platform](https://img.shields.io/badge/platform-Windows-0078D4?logo=windows&logoColor=white) ![Version](https://img.shields.io/badge/version-0.1.0-blue) ![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)

<h5>一个本地优先的 Windows Galgame / AVG 游戏库管理器，正在开发中</h5>

</div>

## 技术栈

桌面端 Tauri 2 + Rust，前端 React 19 + TypeScript + Vite + Tailwind CSS，数据存储 SQLite（SQLx）。

## 功能特性

- 📚 **本地游戏库** — 扫描本地目录或导入 Steam 库，识别主程序和语言版本。
- 🚀 **启动管理** — 保存工作目录、启动参数和环境变量，可联动 Locale Emulator 转区与 Magpie 放大。
- 🌐 **多源元数据** — 从 VNDB、Bangumi、Kungal、Hikarinagi 和 Steam 搜索、比较并合并作品信息与封面。
- 🏷️ **资料与收藏** — 编辑标题、原题、简介、标签、状态、评分和评价，用收藏集手动分组。
- ⏱️ **游玩记录** — 按实际启动会话统计时长，支持补录和修正；`Ctrl+K` 搜索作品、别名、标签和收藏集。
- 📺 **电视大屏** — 全屏浏览和启动游戏，支持手柄操作，适合从远处使用。
- 💾 **数据备份** — SQLite 在线备份与恢复，恢复前自动创建安全快照，并提供诊断日志。

游玩记录来自实际启动会话，不读取存档、章节、路线、成就或游戏内进度。

## 界面

![首页](docs/images/home.webp)

![游戏库](docs/images/library.webp)

![游戏详情](docs/images/detail.webp)

![电视大屏](docs/images/bigscreen.webp)

*界面截图使用示例数据。*

## 快速开始

需要 Windows 10/11、WebView2 Runtime、Node.js 24+、pnpm 11+ 和 Rust 1.100+。

```powershell
git clone https://github.com/Miyu3710/MiyuManager.git
cd MiyuManager
pnpm install
pnpm tauri dev
```

`pnpm dev` 只启动浏览器预览，使用 mock 数据；需要真实数据库、扫描和启动游戏时请使用 `pnpm tauri dev`。首次启动会进入向导：选择包含游戏主程序的目录、确认可执行文件，再按需启用元数据来源。

构建安装包：

```powershell
pnpm release:build   # MSI + NSIS
pnpm release:exe     # 仅 release EXE
```

产物和 SHA-256 清单写入 `outputs/release/<版本>/`。当前 0.1.0 安装包未签名。

## 数据与配置

数据默认保存在 `%APPDATA%\MiyuManager`。开发或测试时可以用 `MIYU_DATA_DIR` 指向独立目录：

```powershell
$env:MIYU_DATA_DIR = "$PWD\tmp\dev-data"
pnpm tauri dev
```

“设置 → 数据与关于”可以备份或恢复数据库，并查看完整性、迁移和日志状态。备份只保存数据库，不包含游戏文件和封面缓存。OAuth 凭据从 `MIYU_OAUTH_CONFIG` 或数据目录的 `oauth/providers.json` 读取，不进入 Git。

## 开发与贡献

欢迎提交 Issue 和 Pull Request。提交前运行完整检查：

```powershell
pnpm release:check
```

该命令依次执行前端 lint、类型检查、测试、构建，以及 `cargo fmt --check`、`cargo clippy -- -D warnings` 和 `cargo test`。

## 文档

- [用户指南](docs/USER_GUIDE.md)
- [发布说明](docs/RELEASE_NOTES.md)
- [项目状态](docs/STATUS.md)
- [故障排查](docs/TROUBLESHOOTING.md)
- [开发计划](docs/DEVELOPMENT_PLAN.md)

## 感谢

- **[VNDB](https://vndb.org/)** — 视觉小说数据库
- **[Bangumi](https://bangumi.tv/)** — 番组计划
- **[Kungal](https://www.kungal.com/)** — 鲲 Galgame
- **[Hikarinagi](https://www.hikarinagi.org/)** — ACGN 社区
- **[Steam](https://store.steampowered.com/)** — 游戏库导入与元数据
- **[Locale Emulator](https://github.com/xupefei/Locale-Emulator)** — 转区启动
- **[Magpie](https://github.com/Blinue/Magpie)** — 窗口放大

特别感谢这些平台提供的公共 API、数据和工具。

