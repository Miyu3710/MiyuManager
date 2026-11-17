# MiyuManager QA 矩阵

> 本表记录 C9 发布候选的验证状态。`通过` 表示当前工作树或已保存证据满足条件；`待验证` 表示需要实体设备、第二台系统或发布环境。

| 范围   | 用例                                                         | 当前状态             | 证据或缺口                                                                 |
| ------ | ------------------------------------------------------------ | -------------------- | -------------------------------------------------------------------------- |
| 构建   | 前端 lint、类型检查、Vitest、生产构建                        | 通过                 | `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`                   |
| 后端   | Rustfmt、Clippy、Cargo 测试                                  | 通过                 | `scripts/release/check.ps1`；96 passed / 15 ignored                        |
| 数据   | 备份文件创建、SQLite 头校验、必需表校验                      | 通过                 | `database_maintenance` Rust 测试                                           |
| 数据   | 迁移前自动快照与最近 20 份快照清理                           | 通过                 | 启动路径与 Rust 测试                                                       |
| 数据   | 恢复前安全检查、暂存、重启后替换                             | 通过（单元 + Tauri） | `restores_a_snapshot_and_keeps_a_safety_copy`、`tauri-restore-result.json` |
| 数据   | 真实 Tauri 中创建备份并刷新健康状态                          | 通过                 | `probe:tauri:c9`；备份数从 1 增至 2                                        |
| 诊断   | 前端渲染异常回退、全局错误上报                               | 通过                 | `error-boundary.test.tsx`；53 项 Vitest 通过                               |
| 诊断   | C9 数据与说明界面截图                                        | 通过                 | `outputs/app/c9/diagnostics-ui/`；四档视口无横向溢出                       |
| 安全   | CSP、导航白名单、分窗口 capability                           | 通过                 | 真实 WebView2 CSP 响应头、`tauri.conf.json`、capabilities                  |
| 安全   | 无 shell 插件、无远程页面导航、http/https 外链交给系统浏览器 | 通过                 | capability 与 `security.rs` 测试                                           |
| 更新   | Tauri Updater、自动检查与设置页下载入口                      | 通过                 | `useAutomaticUpdates`、设置页探针、Tauri capability                        |
| 更新   | MSI/NSIS `.sig` 与 `latest.json`                             | 通过                 | `v0.2.2` Release；CI 签名；NSIS 直链与签名匹配                             |
| 更新   | GitHub Release 发布与远端 `latest.json`                      | 通过                 | `v0.2.2` Release、Actions `44112976670`；发布清单与校验文件已上传          |
| 更新   | 0.2.0 升级到 0.2.2                                           | 待验证               | 需要在一台已安装 0.2.0 的干净 Windows 环境执行下载与 passive 安装          |
| 数据   | Windows 检出迁移 SQL 保持 LF                                 | 通过                 | `.gitattributes`、`migration_files_must_keep_lf_line_endings`              |
| 启动   | 0.2.2 使用现有数据库副本启动                                 | 通过（本地构建）     | 真实数据库副本启动 5 秒，进程保持运行；CI 构建通过迁移 LF 测试             |
| 启动   | 前置启动器退出后的主程序识别与短会话记录                     | 通过（自动测试）     | Job Object 交接测试、短会话墙钟保底测试                                    |
| 性能   | 10,000 作品首屏、末页、搜索                                  | 通过                 | seed 1,583ms；首屏 87ms；搜索 63ms；末页 92ms                              |
| 性能   | 5,000 封面缩略图记录                                         | 通过                 | 同一次 ignored benchmark                                                   |
| 性能   | 冷启动、内存、安装包大小                                     | 部分                 | MSI 16.6 MiB、NSIS 15.1 MiB，均低于 60 MB；冷启动与内存待完整测量          |
| 分辨率 | 1440×900、1920×1080、3840×2160                               | 通过（历史截图）     | `outputs/app/`、`outputs/redesign-*`                                       |
| 缩放   | 150% 与多显示器                                              | 部分                 | 150% 历史截图；多显示器待 G5                                               |
| 输入   | 键盘 Tab/Enter/Escape/方向键                                 | 通过（历史）         | `scripts/probe-*`                                                          |
| 输入   | 物理手柄 A/B/Y/Start/LB/RB                                   | 待验证               | 当前机器无手柄                                                             |
| 路径   | 中文路径、日文路径、空格路径                                 | 通过（历史）         | C2/C3 fixture                                                              |
| 网络   | 离线、断网、限流                                             | 部分                 | 本地离线可用；限流退避已由 Provider 覆盖                                   |
| 系统   | 异常退出、会话恢复                                           | 通过（历史）         | C6 心跳恢复测试                                                            |
| 发布   | MSI/NSIS 生成与 SHA-256 清单                                 | 通过                 | `v0.2.2`；含 MSI、NSIS、两个 `.sig`、`latest.json`、发布清单和校验文件     |
| 发布   | 安装器结构与载荷                                             | 通过                 | MSI 元数据/载荷提取、NSIS 载荷提取与启动冒烟                               |
| 发布   | 签名状态                                                     | 已知限制             | 安装器为 NotSigned；更新载荷已有 Tauri minisign 签名                       |
| 发布   | 干净 Windows 安装/卸载                                       | 待验证               | 需干净 Win10/Win11 环境                                                    |
| 发布   | Release workflow                                             | 通过                 | Actions `44112976670` 完整通过并创建 `v0.2.2` Release                      |

## 必跑命令

```powershell
pnpm release:check
cargo test benchmark_ten_thousand_library -- --ignored --nocapture
pnpm release:build
pnpm probe:diagnostics-ui
# 启动带 --remote-debugging-port=9222 的 Tauri 窗口后：
pnpm probe:tauri:c9
pnpm probe:tauri:restore
pnpm probe:tauri:restore
```

## UI 走查

每个 UI 变更至少覆盖 1440×900、1920×1080、3840×2160 和 150% 缩放；检查长中文标题、日文原题、无封面、加载失败、空列表、键盘焦点和 reduced motion。截图保存在 `outputs/app/` 或对应 `outputs/redesign-*/` 目录。
