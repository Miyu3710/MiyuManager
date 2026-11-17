# 公开仓库检查清单

> 当前仓库仍为私有。以下清单用于决定是否公开，以及公开前需要处理的事项。

## 已完成

| 项目 | 状态 |
| --- | --- |
| AI 生成、个人自用、不收费、不保证维护声明 | 已加入 [NOTICE.md](../NOTICE.md) 和 README |
| ReinaManager、Playnite 灵感来源 | 已加入 README 感谢名单和 [NOTICE.md](../NOTICE.md) |
| 个人非商业使用许可 | 已加入 [LICENSE](../LICENSE)（保守方案） |
| 第三方组件、字体、图标、截图声明 | 已加入 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) |
| 字体 OFL 许可证全文 | 已加入 [licenses/OFL-1.1.txt](../licenses/OFL-1.1.txt) |
| 隐私说明 | 已加入 [PRIVACY.md](PRIVACY.md) |
| 安全漏洞报告方式 | 已加入 [SECURITY.md](../SECURITY.md) |
| 贡献政策 | 已加入 [CONTRIBUTING.md](../CONTRIBUTING.md) |

## 公开前必须确认

1. **README 截图**
   当前截图来自作者实际游戏库，包含 `E:\SteamLibrary\...` 等本地路径和真实游戏封面。公开前应换成 mock 数据截图，或至少打码本地路径，并确认封面展示权限。截图托管在 gist，README 公开后 raw URL 也会被访问。

2. **个人路径清理**
   `src/lib/library-api.ts` 等预览/fixture 数据中有 `E:\h\Gal\...`、`E:\SteamLibrary\...` 等路径。公开前替换为 `C:\Games\...` 或通用示例路径。

3. **Git 历史检查**
   当前工作树未发现明显的 OAuth 令牌或私钥；公开前仍应使用 GitHub Secret Scanning、`gitleaks` 或 `git log -p` 检查全部历史，确认没有提交过 `providers.json`、令牌、账号信息或个人路径。

4. **第三方图标**
   `public/bangumi-icon.png`、`kungal-icon.png`、`hikarinagi-icon.svg`、`tauri.svg`、`vite.svg` 是第三方商标或标识。保留时需要归属声明；如果不想处理商标问题，替换为自制图标或删除未使用文件。当前 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) 已做文字说明，但没有取得额外授权。

5. **字体许可证随安装包分发**
   项目打包了 Noto Sans SC、Noto Serif SC 和 Manrope，采用 SIL OFL 1.1。仓库中已有许可证全文，但还需要确认 MSI/NSIS/关于页或安装目录包含该文本。

6. **安装包签名**
   当前 MSI 和 NSIS 均未签名，公开下载会触发 SmartScreen 警告。建议使用代码签名证书；如果暂时不签名，发布页和 README 要明确说明。

7. **第三方 API 条款**
   Bangumi 吐槽读取使用 `next.bgm.tv/p1/subjects/{id}/comments`，这是站点内部接口，可能变更或受限。VNDB、Bangumi、Kungal、Hikarinagi、Steam 也各有自己的 API 条款、速率限制和隐私政策。公开前确认调用方式符合条款，并准备接口失败时的降级。

8. **AI 生成内容审查**
   确认应用图标没有明显模仿现有角色或商标；检查 AI 生成代码是否包含来源不明的整段代码；保留人工修改和测试记录。AI 生成内容的版权状态在不同司法辖区可能不同，必要时应咨询专业人士。

9. **联系与下架渠道**
   当前使用 GitHub Security Advisory 作为私下联系入口。若仓库公开后可能收到商标、图标或截图权利人的请求，建议在仓库资料中增加一个专门的联系方式，或明确说明通过 Security Advisory 联系。

10. **内容提示**
    元数据可能包含成人向作品。若仓库面向公众，建议在 README 增加年龄/内容提示，并说明本项目不包含游戏本体或成人内容。

## 建议的仓库设置

- 当前仓库为 Private；Description 已填写，Homepage 和 Topics 为空，Issues/Projects 开启，Wiki/Discussions 关闭。
- 当前私有免费仓库上，Secret Scanning、Dependabot、Private vulnerability reporting 和分支保护不可用或未开启；公开后立即在 Settings → Code security and analysis 和 Branches 中启用。
- LICENSE 推送后 GitHub 才会识别；自定义个人非商业许可可能显示为 Other，需在 README 中明确说明。
- 填写仓库描述、主页和 topics，明确“个人自用、不收费、不保证维护”。
- 启用 Secret Scanning、Dependabot alerts、Private vulnerability reporting。
- 保护 `main` 分支，限制 GitHub Actions 权限。
- 如果不接受贡献，关闭 Issues/PR 或在 [CONTRIBUTING.md](../CONTRIBUTING.md) 中写明；保留安全报告入口。
- 发布页上传 MSI/NSIS、`release-manifest.json`、`SHA256SUMS.txt`，标注未签名和系统要求。
- 在 README 链接 [PRIVACY.md](PRIVACY.md)、[SECURITY.md](../SECURITY.md) 和 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。
- 可选：添加 CODE_OF_CONDUCT、Issue 模板、SBOM 或完整依赖许可证清单。
