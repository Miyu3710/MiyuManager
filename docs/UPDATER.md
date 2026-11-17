# 自动更新与发布流程

## 更新源

```text
https://github.com/Miyu3710/MiyuManager/releases/latest/download/latest.json
```

Windows 使用 `windows-x86_64` 平台项和 NSIS `setup.exe` 更新载荷。Tauri Updater 会在安装前校验 `.sig`；签名不匹配时不会继续。

## 密钥

- 公钥已经写入 `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey`。
- 私钥与密码保存在仓库外的用户目录，并已写入 GitHub Actions Secrets：`TAURI_SIGNING_PRIVATE_KEY`、`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。
- 私钥必须另外备份。丢失私钥后，已经安装 0.2.0 及以后版本的用户无法验证后续更新。
- 不要把私钥、密码、`.pfx`、OAuth `providers.json` 或云签名令牌提交到仓库。

## 本地签名构建

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "C:\path\to\miyumanager.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "密码"
pnpm release:build
```

`outputs/release/<version>/` 应包含：

- MSI 和 NSIS 安装包。
- 两个安装包的 `.sig` 更新签名。
- `latest.json`、`release-manifest.json`、`SHA256SUMS.txt`。

## GitHub Release

1. 同步提升 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 的版本。
2. 更新 `docs/RELEASE_NOTES.md`。
3. 运行 `pnpm release:check`，提交并推送 `main`。
4. 创建并推送与版本一致的 tag，例如 `v0.2.1`。
5. `.github/workflows/release.yml` 会在 Windows Runner 构建、签名并创建或更新 GitHub Release。

工作流上传 `.sig`、`latest.json`、MSI 和 NSIS。默认使用 NSIS 作为 Windows 更新载荷。

## 验收

发布后确认：

1. `releases/latest/download/latest.json` 可以匿名访问，版本号和 URL 正确。
2. 下载的 `setup.exe` 与 `latest.json.signature` 能通过 Tauri 更新器校验。
3. 已安装上一版本在设置页能发现新版本并显示说明。
4. 下载、passive 安装和自动重启完成，数据库与用户文件保留。
5. 安装器本身的 Authenticode 状态在发布页明确说明。
