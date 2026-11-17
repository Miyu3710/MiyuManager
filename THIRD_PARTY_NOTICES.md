# 第三方组件与素材声明

本项目使用了第三方软件、字体、图标和公开数据源。它们各自遵循其权利人的许可证或服务条款，不包含在 MiyuManager 的个人非商业使用许可中。

## 运行时与前端依赖

| 组件 | 许可证 |
| --- | --- |
| Tauri 2、`@tauri-apps/api`、`@tauri-apps/cli` | MIT OR Apache-2.0 |
| React、React DOM | MIT |
| React Router | MIT |
| Vite | MIT |
| Tailwind CSS | MIT |
| Radix UI | MIT |
| TanStack Query | MIT |
| Zustand | MIT |
| React Hook Form、`@hookform/resolvers` | MIT |
| Zod | MIT |
| Sonner | MIT |
| Motion | MIT |
| Lucide | ISC |
| class-variance-authority | Apache-2.0 |
| clsx、tailwind-merge | MIT |

完整的 JavaScript 依赖和版本见 `package.json`、`pnpm-lock.yaml`；可用 `pnpm licenses list` 查看许可证明细。Rust 依赖见 `src-tauri/Cargo.lock`，各 crate 的许可证以其 crates.io 页面为准，主要为 MIT、Apache-2.0、BSD 和 MPL-2.0。

## 字体

本项目打包了以下字体：

- Noto Sans SC Variable
- Noto Serif SC Variable
- Manrope Variable

它们采用 SIL Open Font License 1.1。许可证全文见 [licenses/OFL-1.1.txt](licenses/OFL-1.1.txt)。发布安装包时也应保留该许可证文本。

## 图标与商标

`public/` 中的 Bangumi、Kungal、Hikarinagi 图标，以及 Tauri、Vite 标识，分别属于其各自权利人，仅用于识别对应平台或技术。本项目与这些平台没有隶属或背书关系。

MiyuManager 的应用图标由 AI 生成。如果权利人认为该图标与现有作品构成实质性相似，请通过 [SECURITY.md](SECURITY.md) 中的私下渠道联系。

## 游戏封面与截图

README 中的界面截图包含游戏封面，版权归对应游戏开发商、发行商或权利方所有。截图仅用于展示 MiyuManager 的界面，不构成本项目对游戏素材的授权，也不代表与游戏权利方存在合作或背书关系。游戏本体、存档和商业封面资源不包含在本仓库中。

## 公开数据与接口

元数据来自 VNDB、Bangumi、Kungal、Hikarinagi、Steam 等公开或用户授权访问的服务。使用这些服务时需遵守其各自的 API 条款、速率限制和隐私政策。本项目不保证这些接口持续可用或返回结果准确。

## 下架与更正

如果你是权利人，认为仓库中的图标、截图、商标或文本侵犯了你的权利，请通过 [SECURITY.md](SECURITY.md) 中的私下联系渠道联系，并附上具体文件和权利说明。我们会尽快核查并处理。
