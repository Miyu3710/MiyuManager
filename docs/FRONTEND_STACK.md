# 前端组件与依赖选型

> 状态：C8 已完成；C2 已接入 TanStack Query、TanStack Virtual 和 Tauri dialog；C3 详情/启动表单已接入 React Hook Form + Zod；C4/C5 元数据搜索、合并、冲突、字段优先级、批量队列、事件进度和封面画廊复用 TanStack Query；C6 统计页和会话 CRUD 复用 TanStack Query 与 Tauri 事件；C8 全局搜索使用 Radix Dialog + combobox/listbox，收藏集和首次启动使用 Radix Dialog，不新增前端依赖；Motion、cmdk 仍待页面需要时加入并锁定版本
>
> 日期：2026-11-15  
> 目标：为 MiyuManager 的桌面与大屏界面建立一致的组件、图标、动画和交互规范

## 结论

采用“**少依赖、行为与视觉分离**”的组合，不为了一两个组件引入整套 UI 框架：

| 领域           | 选择                                             | 理由                                                                            |
| -------------- | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| 无样式行为组件 | Radix Primitives（`radix-ui`）                   | 已有 React 19 兼容修复；Dialog、Popover、Menu、Tooltip、Tabs、Switch 等行为成熟 |
| 备选行为组件   | Base UI（`@base-ui/react`）                      | 由 Radix、MUI、Floating UI 团队参与；React 17+；API 较新，先不替换 Radix        |
| 无障碍参考     | React Aria Components                            | 交互与国际化基础扎实；目前仍是 alpha，作为规范参考与备选                        |
| 图标           | Lucide React + 自绘品牌/游戏图形                 | tree-shakable、TypeScript、线性风格统一；主视觉不依赖通用图标                   |
| 微动效         | CSS transition / animation                       | 颜色、hover、press、focus 等高频交互优先 CSS                                    |
| 复杂动效       | Motion（`motion/react`）                         | 支持 React 18.2+；适合共享元素、布局变化、弹窗进出和可中断动画                  |
| 组件变体       | class-variance-authority + tailwind-merge + clsx | 明确 variant/size，避免页面里堆叠条件类名                                       |
| 命令面板       | 自建 Radix Dialog + combobox/listbox             | C8 已用于 Ctrl+K；结果数量有限，自己管理键盘和焦点更直接                        |
| 通知           | Sonner                                           | 已使用；支持 React 19                                                           |
| 虚拟列表       | TanStack Virtual                                 | 书库、搜索结果和大屏列表复用                                                    |
| 表单           | React Hook Form + Zod                            | 启动配置、来源、扫描目录和设置表单                                              |
| 测试           | Vitest + React Testing Library + Playwright      | 组件行为、截图和 Tauri 冒烟分开                                                 |

暂不引入：GSAP、React Spring、完整 MUI、Ant Design、Chakra UI、shadcn/ui 默认主题、第二套线性图标库。

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

- 层级：`primary`（标签红，启动/确认）、`quiet`（边框，次级操作）、`ghost`（无底色，导航/工具）、`danger`（删除、覆盖）。
- 尺寸：28 / 34 / 40px 高三档；图标按钮 28 / 32 / 36px。
- 状态：hover、active、focus-visible、disabled、loading；按压反馈 100–160ms。
- 焦点环：2px 状态薄荷，偏移 2px；深色底上不使用低对比红色焦点环。

### Surface

- `panel`：列表、侧栏、会话面板。
- `raised`：需要浮起的弹层、封面包装。
- `outline`：只靠 1px 边界分组，不堆阴影。
- 圆角按层级区分：封面 2px、面板 4px、弹层 6px；不把所有卡片做成同一圆角。

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
- 页面切换最多一次编排，不逐卡入场；reduced motion 下移除位移和缩放。
- 动画优先 `transform` / `opacity`；不用 `transition: all`。

## 页面依赖计划

- **Home**：TanStack Query、Motion（仅主视觉编排）、Lucide、Sonner。
- **游戏库**：TanStack Virtual、Radix DropdownMenu/Select/Tooltip、cva、TanStack Query。
- **作品详情**：Radix Tabs/Popover/Dialog、Motion（封面/面板）、RHF + Zod（启动配置）、TanStack Query + Tauri 事件（元数据搜索、进度、取消和字段导入）。
- **统计与游玩记录**：TanStack Query、Tauri `play-session` 事件、原生日期时间输入；图表使用 CSS Grid 绘制 84 天热力图，不引入图表库。
- **大屏**：自建 focus manager、Radix 基础行为、Motion（焦点移动/抽屉）、Gamepad API 或 Rust XInput。
- **设置**：RHF + Zod、Radix Switch/Select/RadioGroup、Sonner、TanStack Query（来源顺序/启停）。
- **首次启动**：Radix Dialog/Progress、TanStack Query、Motion（步骤切换）。
- **全局搜索与收藏集**：Radix Dialog、combobox/listbox、TanStack Query；C8 已落地，不引入 cmdk。

## 版本与验证清单

正式实现前需要做：

1. 安装 `motion`、`cmdk`（cva 与 tailwind-merge 已安装），确认 React 19 peer dependency 与 pnpm 锁文件。
2. 检查 Motion 在 WebView2 中的 `layout` / shared element 性能，必要时退回 CSS。
3. 验证 Radix Dialog/Popover 在自定义 Tauri 标题栏和 `decorations: false` 窗口里的焦点恢复。
4. 检查 cmdk 与中文输入法组合、Ctrl+K 和 Escape。
5. 检查 Lucide tree-shaking 后包体；避免动态图标全量导入。
6. 检查 150% / 200% 缩放下的焦点环、弹层边界和字体回退。

## 来源

- Radix Primitives releases: https://www.radix-ui.com/primitives/docs/overview/releases
- Base UI overview: https://base-ui.com/react/overview/about
- React Aria Components: https://react-spectrum.adobe.com/react-aria/react-aria-components.html
- Motion for React: https://motion.dev/docs/react
- Motion installation: https://motion.dev/docs/react-installation
- cmdk: https://github.com/dip/cmdk
- Lucide for React: https://lucide.dev/guide/react/
