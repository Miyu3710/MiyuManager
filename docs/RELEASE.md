# MiyuManager 发布手册

> 当前版本：0.2.0  
> 发布形态：Windows x64，MSI + NSIS 当前用户安装  
> 签名状态：安装器未做 Authenticode 签名；自动更新载荷已使用独立 Tauri 更新密钥签名

## 发布前检查

在仓库根目录运行：

```powershell
pnpm release:check
```

脚本依次执行前端 lint、类型检查、Vitest、生产构建，以及 Rustfmt、Clippy 和 Cargo 测试。任何一步失败都会停止。UI 变更仍需按 `docs/QA_MATRIX.md` 补齐截图和键盘走查。

数据设置页截图：

```powershell
pnpm dev --host 127.0.0.1
pnpm probe:diagnostics-ui
```

真实 Tauri WebView 检查需要在启动打包程序时设置 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`，然后运行 `pnpm probe:tauri:c9`。探针会验证生产 CSP、数据库健康、在线备份和 1440×900 下的页面溢出。

数据库恢复端到端探针使用同一远程调试窗口运行 `pnpm probe:tauri:restore`。它会在隔离数据目录创建快照、修改设置、恢复并等待应用重启，再确认设置回退和数据库完整性。

## 构建安装包

自动更新构建必须提供更新签名私钥：

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "C:\path\to\miyumanager.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "私钥密码"
```

然后运行：

```powershell
pnpm release:build
```

脚本先执行发布检查，再运行 `pnpm tauri build`。产物从 `src-tauri/target/release/bundle/` 复制到 `outputs/release/<version>/`，同时生成 `release-manifest.json`、`SHA256SUMS.txt` 和 `latest.json`。

在没有 WiX/NSIS 工具或无法联网下载打包器时，可以运行 `pnpm release:exe` 生成仅可执行文件发布包；清单会标记 `packageMode: executable-only`，不能替代正式安装验收。

当前配置生成：

- MSI：适合受管环境；安装范围由 WiX 默认值决定。
- NSIS：当前用户安装，不要求管理员权限。
- 未包含离线 WebView2；安装器会按 Tauri 配置引导或使用已安装的 WebView2。

## 0.2.0 产物

| 文件                              |             大小 | SHA-256                                                            |
| --------------------------------- | ---------------: | ------------------------------------------------------------------ |
| `MiyuManager_0.2.0_x64_en-US.msi` | 17,391,616 bytes | `beb1f6f7b9fd176ee5ea4aec3065413414b95eb8024a28a4a55d1ba1093db489` |
| `MiyuManager_0.2.0_x64-setup.exe` | 15,785,027 bytes | `77ccf7fcc99ab7f51d47a5b432b9600d9300e5682de9850e9d7e45596e26d655` |

MSI 使用 WiX 3.14 生成，`ALLUSERS=1`，安装到 Program Files；NSIS 使用当前用户安装模式。两份安装器均未做 Authenticode 签名；对应的 `.sig` 是 Tauri Updater 更新签名，`latest.json` 使用 NSIS 签名。实际安装/卸载仍应在干净 Windows 10 22H2 与 Windows 11 环境完成。

## 版本与自动更新

`package.json`、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json` 的版本必须一致。当前更新端点为：

```text
https://github.com/Miyu3710/MiyuManager/releases/latest/download/latest.json
```

`.sig` 文件包含 Tauri Updater 的最小签名，`latest.json` 中必须原样嵌入其中内容。Windows 平台键为 `windows-x86_64`，优先使用 NSIS `setup.exe` 作为更新载荷。

应用启动后每 24 小时检查一次更新；“设置 → 数据与关于”也提供手动检查和下载安装。更新安装使用 Windows passive 模式，下载完成后自动进入安装器并重启。

推送形如 `v0.2.0` 的 tag 会触发 `.github/workflows/release.yml`。工作流使用 GitHub Actions Secrets 中的 `TAURI_SIGNING_PRIVATE_KEY` 与 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 构建、签名、上传安装器，并生成 Release 的 `latest.json`。

自动更新签名不能替代 Windows Authenticode：前者保证更新载荷来自本项目，后者决定 SmartScreen 和发布者身份。

未签名构建必须在发布说明和下载页明确标注，不能依赖 SmartScreen 的“未知发布者”提示作为用户告知。

## 安装与卸载验收

在干净的 Windows 10 22H2 与 Windows 11 x64 环境分别执行：

1. 安装 NSIS 包，确认开始菜单、卸载项和应用图标。
2. 从空数据目录启动，完成引导并导入至少一部本地游戏。
3. 确认数据库位于 `%APPDATA%\MiyuManager\miyumanager.sqlite3`，日志位于 `logs/`，备份位于 `backups/`。
4. 配置启动器、元数据来源和代理，重启后确认设置保留。
5. 卸载后确认应用二进制被移除，用户数据目录保留；再次安装能读取原有数据库。
6. 在断网状态下验证本地库、启动、会话记录和统计仍然工作。

## 备份与恢复

“设置 → 数据与关于 → 立即备份”使用 SQLite 在线快照，不会直接复制 WAL 中的半成品页。恢复流程会：

1. 以只读方式检查 SQLite 文件头、`PRAGMA quick_check` 和必需数据表。
2. 在 `backups/` 生成 `pre-restore-*` 安全快照。
3. 把备份暂存为 `.miyu-restore-pending.sqlite3`，应用重启后在打开数据库前替换当前文件。
4. 下次启动若有待执行迁移，再生成 `pre-migration-*` 快照。

备份只包含数据库，不包含游戏目录和封面缓存文件；恢复后如果封面缓存被手动清理，界面会回退到标题排印封面。

## 回滚

保留上一个可安装版本和对应 SHA-256。安装失败时先卸载当前版本，再安装上一版本；不要删除 `%APPDATA%\MiyuManager`。数据库迁移后的旧数据库可能会被新版本升级，正式发布后应使用恢复快照回退，而不是直接用旧安装器打开新数据库。
