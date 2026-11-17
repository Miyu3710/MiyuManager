# Windows 代码签名说明

> Tauri Updater 的 minisign 更新签名与 Windows Authenticode 代码签名是两套独立机制。前者保护自动更新包，本项目已配置；后者保护 EXE/MSI/NSIS 的发布者身份，当前仍待证书。

MiyuManager 目前生成 MSI 和 NSIS 两种安装包，二者都未签名。公开分发前，建议至少给下面三个文件签名：

- `miyumanager.exe`（应用主程序）
- `MiyuManager_<version>_x64_en-US.msi`
- `MiyuManager_<version>_x64-setup.exe`

只签安装器、不签主程序，仍然可能在启动或安装过程中触发 SmartScreen 或安全软件提示。签名后使用 SHA-256 和 RFC 3161 时间戳，保证证书过期后签名仍然有效。

## 可选方式

| 方式                              | 适合场景                 | 大致成本                            | 备注                                                                        |
| --------------------------------- | ------------------------ | ----------------------------------- | --------------------------------------------------------------------------- |
| OV 代码签名证书                   | 个人或小团队公开分发     | 约几百美元/年                       | 需要 CA 身份核验；私钥通常放在硬件令牌或云 HSM 中，SmartScreen 信誉需要积累 |
| EV 代码签名证书                   | 希望更强身份可信度       | 通常高于 OV                         | 核验更严格；对 SmartScreen 声誉可能有帮助，但不保证立即无警告               |
| Azure Trusted Signing             | 想在 CI 中自动签名       | 按 Azure 订阅计费                   | 微软托管短时证书，SignTool/CI 集成方便；需要符合当前资格和地区要求          |
| 云 HSM 签名服务                   | 不想在 CI 里插 USB Token | 证书费 + 服务费                     | DigiCert KeyLocker、SSL.com eSigner、Sectigo、GlobalSign 等；密钥不离开 HSM |
| SignPath.io / SignPath Foundation | 公开开源项目             | Foundation 对符合条件的开源项目免费 | 适合 GitHub Actions；需要申请并被接受                                       |
| Certum Open Source Code Signing   | 低成本开源签名           | 相对低                              | 面向开源项目，通常需要硬件令牌或云签名；以 Certum 当前政策为准              |
| 自签名证书                        | 本机测试、内部分发       | 免费                                | Windows 和 SmartScreen 不信任，不能用于公开下载                             |
| Microsoft Store / MSIX            | 通过商店分发             | 按商店政策                          | 由商店签名，但不是当前的 MSI/NSIS 流程，需要改打包和发布方式                |

## 推荐顺序

1. **公开开源、预算优先**：先看 SignPath Foundation 和 Certum Open Source 是否符合资格。
2. **想省去 USB Token、在 CI 中自动签名**：Azure Trusted Signing 或云 HSM 服务。
3. **通用商业分发**：OV 证书通常够用；如果更在意身份可信度和品牌，再考虑 EV。
4. **只在本地测试**：自签名证书即可，但不要把它当作公开分发的签名。

证书价格和资格会变化，购买前以 CA 或微软当前页面为准。

## Tauri 配置

如果使用本机证书存储（USB Token 或已安装的证书），可在 `src-tauri/tauri.conf.json` 的 `bundle.windows` 中配置：

```json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": "证书的 SHA-1 指纹",
      "digestAlgorithm": "sha256",
      "timestampUrl": "http://timestamp.digicert.com"
    }
  }
}
```

如果使用云签名或自定义 HSM 工具，使用 `signCommand` 接入签名 CLI：

```json
{
  "bundle": {
    "windows": {
      "signCommand": "你的签名工具 sign --file %1"
    }
  }
}
```

不要把 `.pfx`、证书密码、HSM PIN 或云签名令牌提交到仓库。CI 中使用仓库 Secrets 或 OIDC 联合身份。

## 手动签名与验证

使用 Windows SDK 的 `signtool` 手动签名：

```powershell
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /sha1 <证书指纹> path	omiyumanager.exe
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /sha1 <证书指纹> path	oMiyuManager_0.1.0_x64_en-US.msi
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /sha1 <证书指纹> path	oMiyuManager_0.1.0_x64-setup.exe
```

验证：

```powershell
signtool verify /pa /v path	omiyumanager.exe
signtool verify /pa /v path	oMiyuManager_0.1.0_x64_en-US.msi
signtool verify /pa /v path	oMiyuManager_0.1.0_x64-setup.exe
```

也可以在 PowerShell 中查看 Authenticode 状态：

```powershell
Get-AuthenticodeSignature path	omiyumanager.exe | Format-List
```

## 注意

- 新证书不等于立刻没有 SmartScreen 警告；信誉需要时间积累，EV 也只是通常更有帮助。
- 签名前先完成 release 构建，再对最终产物签名；不要在签名后重新打包覆盖文件。
- 发布页同时提供 `SHA256SUMS.txt`，让用户能核对下载文件。
- 如果暂时不签名，README 和发布页应明确标注“未签名”，并说明 SmartScreen 提示属于预期行为。
