# 前端组件与依赖选型

> 状态：C8 已完成；C2 已接入 TanStack Query、TanStack Virtual 和 Tauri dialog；C3 详情/启动表单已接入 React Hook Form + Zod；C4/C5 元数据搜索、合并、冲突、字段优先级、批量队列、事件进度和封面画廊复用 TanStack Query；C6 统计页和会话 CRUD 复用 TanStack Query 与 Tauri 事件；C8 全局搜索使用 Radix Dialog + combobox/listbox。2026-11-16 已完成 Atelier 产品界面层：Noto Sans SC 作为界面主字体，Noto Serif SC 负责标题，Manrope 负责数字；Radix、Lucide 与 Motion 继续作为唯一行为、图标和复杂动效来源；不引入第二套图标库或图表库
>
> 日期：2026-11-16
> 目标：为 MiyuManager 的桌面与大屏界面建立一致的组件、图标、动画和交互规范

## 结论

采用“**少依赖、行为与视觉分离**”的组合，不为了一两个组件引入整套 UI 框架：

| 领域           | 选择                                             | 理由                                                                            |
| -------------- | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| 无样式行为组件 | Radix Primitives（`radix-ui`）                   | 已有 React 19 兼容修复；Dialog、Popover、Menu、Tooltip、Tabs、Switch 等行为成熟 |
| 备选行为组件   | Base UI（`@base-ui/react`）                      | 由 Radix、MUI、Floating UI 团队参与；React 17+；API 较新，先不替换 Radix        |
| 无障碍参考     | React Aria Components                            | 交互与国际化基础扎实；目前仍是 alpha，作为规范参考与备选                        |
| 图标           | Lucide React + 自绘品牌/游戏图形                 | tree-shakable、TypeScript、线性风格统一；主视觉不依赖通用图标                   |
| 界面字体       | `@fontsource-variable/noto-sans-sc`              | 中文正文、标签和控件共享同一套字形，自托管保证离线与字号稳定                    |
| 展示字体       | `@fontsource-variable/noto-serif-sc`             | 中文游戏标题需要稳定的宋体气质；自托管避免依赖系统字体                          |
| 数字字体       | `@fontsource-variable/manrope`                   | 时长、次数和统计数字使用可变无衬线，支持 tabular 数字                           |
| 微动效         | CSS transition / animation                       | 颜色、hover、press、focus 等高频交互优先 CSS                                    |
| 复杂动效       | Motion（`motion/react`）                         | 已用于导航活动胶囊、主视觉封面揭示、数字计数与路由过渡；尊重减少动效            |
| 组件变体       | class-variance-authority + tailwind-merge + clsx | 明确 variant/size，避免页面里堆叠条件类名                                       |
| 命令面板       | 自建 Radix Dialog + combobox/listbox             | C8 已用于 Ctrl+K；结果数量有限，自己管理键盘和焦点更直接                        |
| 通知           | Sonner                                           | 已使用；支持 React 19                                                           |
| 虚拟列表       | TanStack Virtual                                 | 书库、搜索结果和大屏列表复用                                                    |
| 表单           | React Hook Form + Zod                            | 启动配置、来源、扫描目录和设置表单                                              |
| 测试           | Vitest + React Testing Library + Playwright      | 组件行为、截图和 Tauri 冒烟分开                                                 |

暂不引入：GSAP、React Spring、cmdk、完整 MUI、Ant Design、Chakra UI、shadcn/ui 默认主题、第二套线性图标库。

## 为什么不是别的方案

### Base UI

Base UI 很值得关注，组件 API 更开放，且支持 React 17+。但当前已经锁定 Radix Primitives，替换会带来一次没有用户价值的迁移。只有在 Radix 无法满足某个大屏焦点/抽屉交互时，才局部评估 Base UI。

### React Aria Components

无障碍和国际化基础最好，但当前仍标注为 alpha；桌面端大部分交互不需要它的全套 hooks。先以它的焦点和键盘原则作为审查清单，不把 alpha 组件作为主依赖。

### 其他图标库

Phosphor、Tabler、Iconoir 都可以做功能图标，但混用会破坏线宽和视觉节奏。Lucide 已覆盖菜单、播放、文件夹、显示器、设置等必要图标；Galgame 相关的品牌符号、状态徽章和包装标记由我们自己画 SVG。

### GSAP / React Spring

GSAP 适合复杂时间线，但不是 React 声明式状态的首选；React Spring 的弹簧 API 对当前交互过重。Motion 足以覆盖共享元素、弹窗和布局变化，简单反馈继续用 CSS。

## 组件规范草案

### Button

- 层级：`primary`（樱粉 `#f46d96` + 深梅文字 `#34202a`，启动/确认）、`secondary`（白底粉边，次级操作）、`ghost`（无底色，导航/工具）、`danger`（删除、覆盖）。
- 尺寸：32 / 40 / 44px 高三档；图标按钮 30 / 32 / 36px。
- 状态：hover、active、focus-visible、disabled、loading；按压反馈 100–160ms。
- 焦点环：2px `--color-focus`，偏移 2px；粉底侧栏使用深梅色焦点环。

### Surface

- `panel`：列表、侧栏、会话面板。
- `raised`：需要浮起的弹层、封面包装。
- `outline`：只靠 1px 边界分组，不堆阴影。
- 圆角按层级区分：封面 6px、控件 10px、卡片 14px、面板 18px、主视觉 26px、弹层 16px；胶囊只用于标签、搜索框和状态。

### Cover

- 2:3 比例，原始封面与 WebP 缩略图分离；列表只加载缩略图。
- 无封面 fallback：标题排印 + 作品编号，不用随机渐变。
- 游戏库卡片默认只显示封面、标题、状态和上次游玩；引擎、年龄分级和安装大小放在详情或可展开信息里。

### FocusRing

- 统一 `:focus-visible`；大屏使用 3px 外环 + 2px 内描边，保证 10-foot 距离可见。
- 不使用 `outline: none`，不依赖 hover。

### Motion

- 高频：press 120ms、hover 160ms、focus 120ms，只改颜色/透明度/2–4px 位移。
- 中等：弹层 180–240ms，从触发器方向进入；共享封面 220–280ms。
- 首页：导航活动胶囊使用 spring；主视觉内容一次淡入、封面一次裁切揭示；周节奏条与统计数字只播放一次；路由切换 240ms 淡入。
- 页面切换最多一次编排，不逐卡入场；reduced motion 下移除位移、缩放和裁切，只保留状态反馈。
- 动画优先 `transform` / `opacity`；不用 `transition: all`。

## 页面依赖计划

- **Home**：TanStack Query、Motion（主视觉推荐轮播、导航活动胶囊、路由淡入）、Lucide、Sonner；“继续游玩 / 最近入库”共用大封面书架网格，无卡片外壳；侧栏折叠状态持久化在 appearance store。主视觉轮播 7 秒自动切换，文字区右上角使用分段进度条与序号，悬停/聚焦/手动操作暂停，减少动效时关闭自动播放；背景轮廓海报同步缓慢放大。应用顶栏暂时移除，首页使用大标题 + 右侧搜索框，搜索由 Home 页头通过全局事件打开 Ctrl+K 面板。
- **游戏库**：TanStack Virtual、Radix DropdownMenu/Select/Tooltip、cva、TanStack Query；粉白胶囊筛选、圆角搜索/排序/视图控件、10px 圆角封面与状态覆盖层，批量选择复用同一张封面。
- **作品详情**：Radix Tabs/Popover/Dialog、Motion（封面舞台进入、页签面板切换）、RHF + Zod（启动配置）、TanStack Query + Tauri 事件（元数据搜索、进度、取消和字段导入）。页面采用封面舞台 + 正文双栏、最近游玩 / 本地安装数据条和白色分段页签。
- **统计与游玩记录**：TanStack Query、Tauri `play-session` 事件、原生日期时间输入；后端日级聚合保留 365 天，并混合游玩、首次入库与收藏集收录事件。前端使用自绘 SVG/CSS 绘制趋势、星期、时段、会话长度和 18 周热力图，不引入图表库；Motion 负责折线揭示与条形生长，图表提示统一使用应用内 React tooltip。
- **大屏**：自建 focus manager、Radix 基础行为、Motion（焦点移动/抽屉）、Gamepad API 或 Rust XInput。
- **设置**：RHF + Zod、Radix Switch/Select/RadioGroup、Sonner、TanStack Query（来源顺序/启停）。
- **设置页布局**：沿用 Radix、Sonner 和现有表单组件；新增分组索引、12 栏设置卡片网格、CSS 主题预览与 Motion 活动索引胶囊。字段优先级默认折叠，设置导航点击使用手动选中锁避免滚动监听覆盖。
- **设置页账号与排除项**：账号状态使用 Radix Query + 三列账号卡，展示头像、用户名、scope 能力与资料同步时间；扫描排除使用 Radix Dialog 的可搜索列表，恢复操作直接复用 `library_remove_scan_exclusion`。
- **首次启动**：页面式四步流程、TanStack Query 与 Motion（步骤切换）；不把首次启动伪装成层层叠加的模态框。
- **全局搜索与收藏集**：Radix Dialog、combobox/listbox、TanStack Query；C8 已落地，不引入 cmdk。
- **样式分层**：原型样式只在 `/design-prototypes` 与 `/prototype/:direction` 的分包加载，不再进入主界面首屏 CSS；主界面使用 token、共享组件和 Atelier 界面层。

## 版本与验证清单

当前状态：

1. `motion` 已安装并在首页、外壳中使用；React 19 peer dependency 与锁文件通过构建。
2. Noto Sans SC Variable、Noto Serif SC Variable 与 Manrope Variable 已自托管；字体 `@font-face` 声明按 unicode-range 分片加载。界面与控件优先 Noto Sans SC，标题优先 Noto Serif SC，数字优先 Manrope。
3. `PageHeader`、`Button`、`IconButton`、`Tag`、输入框和弹窗表面已共用 `tokens.css` / `components.css` / `atelier.css`；自定义扫描、Steam、批量刮削和资料编辑弹窗统一 portal 到 body，并通过 `useDialogFocus` 锁定焦点与恢复入口。Tauri 真机仍需逐项确认焦点环位置。
4. 自建 Ctrl+K 搜索继续使用 Radix Dialog + combobox/listbox，不引入 cmdk；中文输入法组合与 Escape 已有测试覆盖。
5. 检查 Lucide tree-shaking 后包体；静态导入保持 tree-shakable。
6. 已覆盖 1920、1440、1280（150%）、1120、820 和 390 宽度的溢出门槛检查；Tauri 150% / 200% 系统缩放下的焦点环、弹层边界和字体回退仍需目视回归。

## 来源

- Radix Primitives releases: https://www.radix-ui.com/primitives/docs/overview/releases
- Base UI overview: https://base-ui.com/react/overview/about
- React Aria Components: https://react-spectrum.adobe.com/react-aria/react-aria-components.html
- Motion for React: https://motion.dev/docs/react
- Motion installation: https://motion.dev/docs/react-installation
- cmdk: https://github.com/dip/cmdk
- Lucide for React: https://lucide.dev/guide/react/
