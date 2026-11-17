# MiyuManager 故障排查

## 应用启动后停在加载页

1. 打开数据目录下的 `logs/`，查看 `miyumanager.jsonl` 最后几条记录。
2. 如果出现 `database_open_failed`，先关闭应用，把最近一份 `backups/pre-migration-*.sqlite3` 改名保留，再用设置页或手动复制方式恢复。
3. 如果刚恢复过数据库，确认主数据库旁边没有残留的 `-wal` 和 `-shm` 文件；恢复流程会自动清理它们。

## 数据库恢复后没有变化

恢复命令会先校验 SQLite 文件头和必需数据表，把快照暂存到数据目录并自动重启；重启后、打开数据库前再完成替换。若窗口没有重启，打开日志搜索 `database_restore_staged` 或 `database_restore_failed`；不要继续写入数据，保留 `pre-restore-*.sqlite3` 和原备份。

## 更新检查失败

应用从 `https://github.com/Miyu3710/MiyuManager/releases/latest/download/latest.json` 检查更新。确认网络可以访问 GitHub；代理设置目前主要作用于元数据和 OAuth，不会转发 Tauri Updater 下载。

如果提示签名校验失败，不要绕过校验。删除已下载的临时更新并等待发布页重新上传 `latest.json` 与 `.sig` 文件；更新私钥丢失后不能继续向已安装用户发布更新。

如果下载完成但安装器没有出现，检查 Windows SmartScreen、安全软件拦截和安装器日志。当前安装器没有 Authenticode 代码签名。

## 游戏启动失败

详情页会显示失败的路径和可操作提示。检查：

- 可执行文件和工作目录仍然存在。
- 中文、日文和空格路径没有被错误改写。
- Locale Emulator 或 Magpie 的路径与参数在设置页正确。
- 安全软件没有阻止 Job Object 进程跟踪。

## 时长没有记录

只有从 MiyuManager 启动的游戏会自动计时。外部启动、包装器 breakaway 进程或窗口一直保持前台但无操作的情况可能不准确；可以在作品详情中补录或修正会话。

## 大屏手柄无效

在设置 → 电视大屏确认 Gamepad API 和连接状态。键盘方向键、Enter、Escape、C、M、Tab、Q/E 和 PageUp/PageDown 提供替代路径。
