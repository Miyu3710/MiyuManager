# MiyuManager 故障排查

## 应用启动后停在加载页

1. 打开数据目录下的 `logs/`，查看 `miyumanager.jsonl` 最后几条记录。
2. 如果出现 `database_open_failed`，先关闭应用，把最近一份 `backups/pre-migration-*.sqlite3` 改名保留，再用设置页或手动复制方式恢复。
3. 如果刚恢复过数据库，确认主数据库旁边没有残留的 `-wal` 和 `-shm` 文件；恢复流程会自动清理它们。

## 数据库恢复后没有变化

恢复命令会先校验 SQLite 文件头和必需数据表，把快照暂存到数据目录并自动重启；重启后、打开数据库前再完成替换。若窗口没有重启，打开日志搜索 `database_restore_staged` 或 `database_restore_failed`；不要继续写入数据，保留 `pre-restore-*.sqlite3` 和原备份。

## 更新检查失败

更新清单只支持 HTTP(S) JSON，字段为 `version`、`notes`、`url`。代理设置只影响元数据和更新检查；如果清单需要认证，应用不会发送账号 token。

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
