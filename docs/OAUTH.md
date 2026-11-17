# OAuth 配置与开源分发

`providers.json` 保存的是 OAuth **应用凭据**，不是用户令牌。应用凭据只用于让
MiyuManager 打开各平台的授权页；用户授权后的 access/refresh token 另存于本地
SQLite，并使用 Windows DPAPI 加密。

仓库只提供 [`providers.example.json`](../providers.example.json) 模板。不要把填好的
`providers.json` 提交到 Git；根目录的 `providers.json`、`tmp/` 和 `.env` 都已在
`.gitignore` 中排除。

## 其他用户的使用步骤

1. 复制 `providers.example.json` 为本地文件，例如：
   `%APPDATA%\MiyuManager\oauth\providers.json`。
2. 到各平台开发者页面创建 OAuth 应用，填入 `clientId`、`clientSecret`（仅需要时）
   和完全一致的 `redirectUri`。
3. 打开 MiyuManager → 设置 → 账号与同步 → 导入配置，选择这个 JSON 文件。
   应用会复制到数据目录并立即重新读取，不需要重启。
4. 在账号卡片中连接平台，完成系统浏览器授权。

源码运行时也可以把文件放在仓库的 `tmp/oauth/providers.json`，或通过
`MIYU_OAUTH_CONFIG` 指定绝对路径。安装版用户建议使用数据目录的
`oauth/providers.json` 或设置页的“导入配置”。

## 回调地址

当前后端只接受 `http://127.0.0.1` 环回地址，不能使用 `localhost` 或 HTTPS 回调。
`redirectUri` 必须与平台应用设置中的回调地址逐字一致，端口也必须一致；端口被占用时
换一个高位端口，并同步修改平台设置和 JSON。

示例模板使用：

| 来源             | 示例回调                          |
| ---------------- | --------------------------------- |
| Bangumi          | `http://127.0.0.1:39123/callback` |
| NextMoe / Kungal | `http://127.0.0.1:39122/callback` |
| Hikarinagi       | `http://127.0.0.1:39124/callback` |

这只是示例。平台已经注册了其他环回端口时，直接使用平台要求的地址。不要使用 80 等
需要管理员权限的端口；如果平台只允许固定端口，以平台设置为准。

## 各平台需要什么

| 来源             | 类型                        | 是否需要 clientSecret | 需要的 scope                                           |
| ---------------- | --------------------------- | --------------------- | ------------------------------------------------------ |
| Bangumi          | OAuth 2.0 授权码            | 是                    | `write:collection`（读取收藏/写游玩状态和吐槽）        |
| NextMoe / Kungal | OAuth 2.0 + PKCE 公共客户端 | 否                    | `openid profile catalog:read`                          |
| Hikarinagi       | OAuth 2.0 + PKCE 公共客户端 | 否                    | `openid profile offline_access catalog:read user:read` |

应用会在配置的 scopes 基础上补齐必需 scope；模板已经把当前需要的值写全。

> Bangumi 的授权地址当前不发送 `scope` 参数，`write:collection` 需要在 Bangumi 应用本身具备；
> 配置中的 scopes 主要用于本地状态显示。其他平台的 scope 会随授权请求发送。

- **Bangumi**：在 <https://bgm.tv/dev/app> 创建应用。当前实现不使用 PKCE，必须填写
  `clientSecret`；希望同步游玩状态或评价时，还需要 `write:collection`。用户授权页由
  `https://bgm.tv/oauth/authorize` 打开。
- **NextMoe / Kungal**：在 NextMoe 开发者平台创建 public client + PKCE 应用，不需要
  `clientSecret`；授权域名为 `account.nextmoe.com`。
- **Hikarinagi**：在 Hikarinagi 的账号/开发者入口创建 public client + PKCE 应用，
  不需要 `clientSecret`；回调由 `id.hikarinagi.org` 处理。

平台可能要求应用审核、填写隐私政策或限制回调域名；以各平台当前的开发者页面为准。

## 开源项目的三种分发方式

1. **每个用户自备应用凭据（推荐）**：仓库只放模板和本文档。没有共享密钥，也没有
   维护者服务器；缺点是首次配置需要几分钟。
2. **只公开 PKCE 公共客户端 ID**：NextMoe 和 Hikarinagi 的 clientId 不是秘密，维护者
   可以在文档或发布说明中提供一个公共客户端。用户仍然授权自己的账号，回调地址仍需
   注册。不要把任何 `clientSecret` 写进仓库。
3. **自建 OAuth 代理/中转服务**：可以隐藏 Bangumi 的 clientSecret，但会引入服务器、
   日志、可用性和信任成本；对本地优先的 MiyuManager 不作为默认方案。

不要把 Bangumi 的 clientSecret 打包进安装包。安装包和源码都会被下载者看到，
“打包后不可见”不是安全边界。

## 公开前检查

```powershell
git ls-files | Select-String 'providers.json$'
git log -p --all -- providers.json
```

另外用 GitHub Secret Scanning、`gitleaks` 或等价工具检查全部历史。一旦某个
clientSecret 进入历史，应该到平台轮换该密钥，而不是只删除当前文件。

## 常见问题

- **显示“没有找到 OAuth 配置”**：检查 JSON 顶层键是否为 `bangumi`、`nextmoe`、
  `hikarinagi`，并确认文件位于数据目录或已通过设置页导入。
- **授权页报 redirect_uri 不匹配**：把 JSON 中的 `redirectUri` 与平台应用设置逐字对齐，
  包括协议、`127.0.0.1`、端口和路径。
- **端口无法监听**：换一个高位端口，平台应用和 JSON 同时修改。
- **Bangumi 能登录但不能同步状态**：确认 Bangumi 应用本身具备 `write:collection`；
  如果应用权限刚调整过，断开后重新连接以获取新令牌。旧令牌可能没有这个权限。
- **Hikarinagi 提示需要登录**：确认使用的是 public client + PKCE 配置，并在设置页
  完成账号连接；不要依赖未连接状态下的应用级令牌。
