<div align="center">

![MiyuManager 应用图标](https://gist.githubusercontent.com/Miyu3710/7265e9ed4bd2945f025838756e5d26c6/raw/miyu-manager-200.svg)

<h1>MiyuManager</h1>

![Status](https://img.shields.io/badge/status-release%20candidate-orange) ![Platform](https://img.shields.io/badge/platform-Windows-0078D4?logo=windows&logoColor=white) ![Version](https://img.shields.io/badge/version-0.2.1-blue) ![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)

<h5>一个本地优先的 Windows Galgame / AVG 游戏库管理器，正在开发中</h5>

<p><sub>个人自用项目 · 代码与图标由 AI 生成 · 不收费 · 不保证持续维护</sub></p>

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
- 🔄 **自动更新** — 从 GitHub Release 检查、下载并安装经过 Tauri 签名校验的新版本。

游玩记录来自实际启动会话，不读取存档、章节、路线、成就或游戏内进度。

## 界面

![首页](https://gist.githubusercontent.com/Miyu3710/22b021d9a97ae632b8a8d5530b6aa3a8/raw/home.svg)

![游戏库](https://gist.githubusercontent.com/Miyu3710/22b021d9a97ae632b8a8d5530b6aa3a8/raw/library.svg)

![游戏详情](https://gist.githubusercontent.com/Miyu3710/22b021d9a97ae632b8a8d5530b6aa3a8/raw/detail.svg)

![电视大屏](https://gist.githubusercontent.com/Miyu3710/22b021d9a97ae632b8a8d5530b6aa3a8/raw/bigscreen.svg)

_界面截图来自实际游戏库。_

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

产物、更新签名、`latest.json` 和 SHA-256 清单写入 `outputs/release/<版本>/`。安装包未使用 Authenticode 代码签名，自动更新载荷使用独立的 Tauri 更新密钥签名。发布版本见 [GitHub Releases](https://github.com/Miyu3710/MiyuManager/releases)。

## 数据与配置

数据默认保存在 `%APPDATA%\MiyuManager`。开发或测试时可以用 `MIYU_DATA_DIR` 指向独立目录：

```powershell
$env:MIYU_DATA_DIR = "$PWD\tmp\dev-data"
pnpm tauri dev
```

“设置 → 数据与关于”可以备份或恢复数据库，并查看完整性、迁移和日志状态。备份只保存数据库，不包含游戏文件和封面缓存。OAuth 凭据从 `MIYU_OAUTH_CONFIG` 或数据目录的 `oauth/providers.json` 读取，不进入 Git。开源后请按 [OAuth 配置](docs/OAUTH.md) 创建自己的应用；仓库只提供 [providers.example.json](providers.example.json) 模板，不要把填好的 `providers.json` 提交到 Git。

## 开发与贡献

本项目为个人项目，不保证回复、合并或持续维护。可以提交可复现的问题；安全漏洞请按 [SECURITY.md](SECURITY.md) 私下报告，贡献约定见 [CONTRIBUTING.md](CONTRIBUTING.md)。提交前运行完整检查：

```powershell
pnpm release:check
```

该命令依次执行前端 lint、类型检查、测试、构建，以及 `cargo fmt --check`、`cargo clippy -- -D warnings` 和 `cargo test`。

## 文档

- [用户指南](docs/USER_GUIDE.md)
- [发布说明](docs/RELEASE_NOTES.md)
- [自动更新与发布流程](docs/UPDATER.md)
- [项目状态](docs/STATUS.md)
- [故障排查](docs/TROUBLESHOOTING.md)
- [开发计划](docs/DEVELOPMENT_PLAN.md)
- [隐私说明](docs/PRIVACY.md)
- [OAuth 配置](docs/OAUTH.md)
- [公开仓库检查清单](docs/PUBLISHING.md)
- [Windows 代码签名](docs/SIGNING.md)

## 声明

- 本项目的代码、界面文案和应用图标由 AI 生成，可能存在错误、遗漏或不完整之处。
- 本项目仅供作者个人自用，不以任何形式收费，也不提供商业支持。
- 代码授权以 [MIT License](LICENSE) 为准；MIT 允许他人使用、修改和分发，但不代表作者提供支持或背书。
- 不保证持续更新、维护、兼容性或可用性；使用风险由使用者自行承担。
- 元数据可能包含成人向作品；本项目不包含游戏本体或成人内容。
- 与 VNDB、Bangumi、Kungal、Hikarinagi、Steam、Playnite、ReinaManager 等第三方无隶属或背书关系；第三方名称、图标、游戏封面和商标归其各自权利人所有。

完整说明见 [NOTICE.md](NOTICE.md)，第三方素材见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 感谢

- **[VNDB](https://vndb.org/)** — 视觉小说数据库
- **[Bangumi](https://bangumi.tv/)** — 番组计划
- **[Kungal](https://www.kungal.com/)** — 鲲 Galgame
- **[Hikarinagi](https://www.hikarinagi.org/)** — ACGN 社区
- **[Steam](https://store.steampowered.com/)** — 游戏库导入与元数据
- **[Locale Emulator](https://github.com/xupefei/Locale-Emulator)** — 转区启动
- **[Magpie](https://github.com/Blinue/Magpie)** — 窗口放大

### 灵感来源

- **[ReinaManager](https://github.com/huoshen80/ReinaManager)** — README 布局、设置工作台和界面组织灵感
- **[Playnite](https://playnite.link/)** — 游戏库管理、启动会话和大屏体验灵感

特别感谢这些平台提供的公共 API、数据和工具。

## 许可证

本项目采用 [MIT License](LICENSE)。第三方组件、字体、图标、商标和游戏素材不在此许可范围内，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
