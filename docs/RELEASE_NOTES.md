# MiyuManager 0.2.0

首个带自动更新能力的公开版本。

## 新增

- 接入 Tauri Updater：启动后每 24 小时检查 GitHub Release，并在设置页显示版本、说明、下载进度和安装入口。
- 更新包使用独立的 Tauri 更新签名校验；下载完成后由你确认安装与重启。
- GitHub Actions 在推送 `v*` 标签时构建 MSI/NSIS、生成 `latest.json` 并上传到对应 Release。
- 首个公开版本包含此前的 Bangumi 同步、启动行为设置，以及 C8/C9 的本地库、元数据、统计、大屏、备份恢复和诊断功能。

## 安装

- 支持 Windows 10 22H2 / Windows 11 x64。
- MSI 与 NSIS 安装包暂未使用 Authenticode 代码签名，首次下载可能出现 SmartScreen 提示。
- 自动更新载荷由 Tauri 更新密钥独立签名，安装前会校验签名。

当前版本是自动更新基线；从下一版本开始，已安装的 0.2.0 可以直接在设置页检查和安装更新。
