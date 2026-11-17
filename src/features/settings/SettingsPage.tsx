import {
  Database,
  Gamepad2,
  Globe2,
  ListFilter,
  Monitor,
  Palette,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Tv,
  UsersRound,
  Wifi,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../../design-system/components/Button";
import { ConfirmDialog } from "../../design-system/components/ConfirmDialog";
import { Hint } from "../../design-system/components/Hint";
import { PageHeader } from "../../design-system/components/PageHeader";
import { Tag } from "../../design-system/components/Tag";
import { useAppearance } from "../../app/useAppearance";
import { useInvalidatePreferences, usePreferences } from "../../app/usePreferences";
import { formatRelativeDate } from "../../lib/format";
import { removeLibraryRoot, removeScanExclusion } from "../../lib/library-api";
import { getBigScreenState, openBigScreen } from "../../lib/bigscreen-api";
import { cn } from "../../lib/cn";
import { useDeepLinkFocus } from "../../lib/use-deep-link-focus";
import { MetadataSourceSettings } from "./MetadataSourceSettings";
import { OAuthAccounts } from "./OAuthAccounts";
import { ScanExclusionsDialog } from "./ScanExclusionsDialog";
import { SettingsSelect } from "./SettingsSelect";
import {
  DataAndUpdateSection,
  LauncherDefaultsSection,
  NetworkSettingsSection,
} from "./PreferenceSections";
import {
  useAppInfo,
  useInvalidateLibrary,
  useLibraryRoots,
  useMonitors,
  useScanExclusions,
} from "../library/useLibrary";
import "./settings.css";
import "./settings-workspace.css";

const settingsGroups = [
  {
    id: "library-group",
    label: "资料库",
    items: [
      {
        id: "library-settings",
        label: "游戏库",
        icon: Database,
        description: "扫描根目录、排除项与本地识别规则。",
      },
      {
        id: "source-settings",
        label: "元数据来源",
        icon: Globe2,
        description: "来源顺序与字段优先级。",
      },
      {
        id: "account-settings",
        label: "账号与同步",
        icon: UsersRound,
        description: "平台账号、头像与资料同步。",
      },
    ],
  },
  {
    id: "runtime-group",
    label: "运行与连接",
    items: [
      {
        id: "launcher-settings",
        label: "启动器",
        icon: Monitor,
        description: "显示器、全屏，以及 Locale Emulator 与 Magpie。",
      },
      {
        id: "network-settings",
        label: "网络",
        icon: Wifi,
        description: "元数据请求使用的代理方式。",
      },
      {
        id: "bigscreen-settings",
        label: "电视大屏",
        icon: Tv,
        description: "显示器、手柄与全屏入口。",
      },
    ],
  },
  {
    id: "appearance-group",
    label: "外观与显示",
    items: [
      {
        id: "appearance-settings",
        label: "外观",
        icon: Palette,
        description: "主题、密度、内容宽度与动效。",
      },
    ],
  },
  {
    id: "app-group",
    label: "应用",
    items: [
      {
        id: "probe-settings",
        label: "技术探针",
        icon: ShieldCheck,
        description: "验证运行环境与窗口能力。",
      },
      {
        id: "data-settings",
        label: "数据与关于",
        icon: SlidersHorizontal,
        description: "路径、版本与更新检查。",
      },
    ],
  },
];

const settingsSections = settingsGroups.flatMap((group) => group.items);

function readGamepadState() {
  const supported = typeof navigator !== "undefined" && "getGamepads" in navigator;
  return {
    supported,
    count: supported ? navigator.getGamepads().filter((pad) => pad !== null).length : 0,
  };
}

function SettingsSectionHeader({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Database;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="settings-section__head">
      <span className="settings-section__icon">
        <Icon size={17} strokeWidth={1.7} />
      </span>
      <div className="settings-section__copy">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action ? <div className="settings-section__action">{action}</div> : null}
    </header>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  useDeepLinkFocus();
  const invalidate = useInvalidateLibrary();
  const roots = useLibraryRoots();
  const appInfo = useAppInfo();
  const preferences = usePreferences();
  const invalidatePreferences = useInvalidatePreferences();
  const exclusions = useScanExclusions();
  const monitors = useMonitors();
  const bigScreenState = useQuery({
    queryKey: ["bigscreen-state"],
    queryFn: getBigScreenState,
    staleTime: 10_000,
  });
  const density = useAppearance((state) => state.density);
  const setDensity = useAppearance((state) => state.setDensity);
  const contentWidth = useAppearance((state) => state.contentWidth);
  const setContentWidth = useAppearance((state) => state.setContentWidth);
  const reduceMotion = useAppearance((state) => state.reduceMotion);
  const setReduceMotion = useAppearance((state) => state.setReduceMotion);
  const bigScreenHints = useAppearance((state) => state.bigScreenHints);
  const setBigScreenHints = useAppearance((state) => state.setBigScreenHints);
  const [gamepadSupported, setGamepadSupported] = useState(() => readGamepadState().supported);
  const [gamepadCount, setGamepadCount] = useState(() => readGamepadState().count);
  const [selectedDisplay, setSelectedDisplay] = useState<number | null>(null);
  const [confirmRoot, setConfirmRoot] = useState<{ id: number; path: string } | null>(null);
  const [removingRoot, setRemovingRoot] = useState(false);
  const [bigScreenBusy, setBigScreenBusy] = useState(false);
  const [activeSection, setActiveSection] = useState(settingsSections[0]?.id ?? "");
  const manualSectionRef = useRef<string | null>(null);
  const activeDisplay = selectedDisplay ?? bigScreenState.data?.display ?? 0;
  const bigScreenMonitorOptions =
    (monitors.data ?? []).length === 0
      ? [{ value: "0", label: "正在读取显示器…" }]
      : (monitors.data ?? []).map((monitor) => ({
          value: String(monitor.index),
          label: monitor.name,
          detail:
            String(monitor.width) +
            " × " +
            String(monitor.height) +
            " · " +
            Math.round(monitor.scaleFactor * 100) +
            "%",
        }));

  const removeRoot = (rootId: number, path: string) => {
    setConfirmRoot({ id: rootId, path });
  };

  const confirmRemoveRoot = async () => {
    if (!confirmRoot) {
      return;
    }
    setRemovingRoot(true);
    try {
      await removeLibraryRoot(confirmRoot.id);
      invalidate();
      setConfirmRoot(null);
      toast.success("已移除扫描目录");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setRemovingRoot(false);
    }
  };

  const restoreExclusion = async (exeKey: string) => {
    try {
      await removeScanExclusion(exeKey);
      invalidate();
      toast.success("已恢复扫描；下次重新扫描时可以再次发现它");
    } catch (error) {
      toast.error(String(error));
    }
  };

  const refreshGamepads = () => {
    const state = readGamepadState();
    setGamepadSupported(state.supported);
    setGamepadCount(state.count);
  };

  useEffect(() => {
    const update = () => {
      const state = readGamepadState();
      setGamepadSupported(state.supported);
      setGamepadCount(state.count);
    };
    window.addEventListener("gamepadconnected", update);
    window.addEventListener("gamepaddisconnected", update);
    return () => {
      window.removeEventListener("gamepadconnected", update);
      window.removeEventListener("gamepaddisconnected", update);
    };
  }, []);

  useEffect(() => {
    const scroller = document.querySelector<HTMLElement>(".app-page");
    const update = () => {
      if (manualSectionRef.current) {
        return;
      }
      const threshold = (scroller?.getBoundingClientRect().top ?? 0) + 170;
      let current = settingsSections[0]?.id ?? "";
      let closestTop = Number.NEGATIVE_INFINITY;
      for (const section of settingsSections) {
        const element = document.getElementById(section.id);
        const top = element?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
        if (element && top <= threshold && top > closestTop) {
          current = section.id;
          closestTop = top;
        }
      }
      setActiveSection(current);
    };
    const target: HTMLElement | Window = scroller ?? window;
    const clearManual = () => {
      manualSectionRef.current = null;
    };
    update();
    target.addEventListener("scroll", update, { passive: true });
    target.addEventListener("wheel", clearManual, { passive: true });
    target.addEventListener("touchstart", clearManual, { passive: true });
    target.addEventListener("pointerdown", clearManual, { passive: true });
    window.addEventListener("keydown", clearManual);
    return () => {
      target.removeEventListener("scroll", update);
      target.removeEventListener("wheel", clearManual);
      target.removeEventListener("touchstart", clearManual);
      target.removeEventListener("pointerdown", clearManual);
      window.removeEventListener("keydown", clearManual);
    };
  }, []);

  const openBigScreenWindow = async () => {
    if (!isTauri()) {
      navigate("/big-screen");
      return;
    }
    setBigScreenBusy(true);
    try {
      const state = await openBigScreen(activeDisplay);
      if (state.message) {
        toast(state.message);
      }
      toast.success("已打开大屏模式");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBigScreenBusy(false);
    }
  };

  const enterFullscreen = async () => {
    if (!isTauri()) {
      toast("全屏模式只在 Tauri 桌面窗口中可用。");
      return;
    }
    await getCurrentWindow().setFullscreen(true);
  };

  return (
    <div className="settings-page">
      <PageHeader
        title="设置"
        description="扫描、来源、账号与显示。所有设置保存在本机。"
        actions={
          <div className="settings-head__status">
            <i aria-hidden="true" />
            <span>本机数据</span>
            {appInfo.data?.version ? <Tag tone="muted">v{appInfo.data.version}</Tag> : null}
          </div>
        }
      />

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="设置分区">
          {settingsGroups.map((group) => (
            <div className="settings-nav__group" key={group.id}>
              <p className="settings-nav__label">{group.label}</p>
              {group.items.map(({ id, label, icon: Icon, description }) => {
                const isActive = activeSection === id;
                return (
                  <Hint key={id} label={description} side="right" sideOffset={12}>
                    <button
                      type="button"
                      className={isActive ? "is-active" : undefined}
                      aria-current={isActive ? "location" : undefined}
                      onClick={() => {
                        manualSectionRef.current = id;
                        setActiveSection(id);
                        document.getElementById(id)?.scrollIntoView({
                          behavior: reduceMotion ? "auto" : "smooth",
                          block: "start",
                        });
                      }}
                    >
                      {isActive ? (
                        <motion.span
                          className="settings-nav__active"
                          layoutId="settings-nav-active"
                          transition={
                            reduceMotion
                              ? { duration: 0 }
                              : { type: "spring", stiffness: 430, damping: 38 }
                          }
                        />
                      ) : null}
                      <Icon size={18} strokeWidth={1.75} />
                      <span>{label}</span>
                    </button>
                  </Hint>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="settings-content">
          <div className="settings-group-label">资料库</div>
          <section id="library-settings" className="settings-section settings-section--full">
            <SettingsSectionHeader
              icon={Database}
              title="游戏库"
              description="扫描根目录、排除项与本地识别规则。"
              action={
                <Button variant="secondary" size="sm" onClick={() => navigate("/library?import=1")}>
                  添加目录
                </Button>
              }
            />
            {roots.isPending ? (
              <div className="settings-row">
                <div>
                  <b>扫描根目录</b>
                  <span>正在读取本地数据库…</span>
                </div>
                <Tag tone="muted">读取中</Tag>
              </div>
            ) : roots.isError ? (
              <div className="settings-row">
                <div>
                  <b>扫描根目录</b>
                  <span>{String(roots.error)}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void roots.refetch()}>
                  重试
                </Button>
              </div>
            ) : roots.data.length === 0 ? (
              <div className="settings-row">
                <div>
                  <b>扫描根目录</b>
                  <span>尚未添加。添加后会扫描可执行文件并让你确认主程序。</span>
                </div>
                <Button variant="secondary" size="sm" onClick={() => navigate("/library?import=1")}>
                  选择目录
                </Button>
              </div>
            ) : (
              roots.data.map((root) => (
                <div className="settings-row" key={root.id}>
                  <div>
                    <Hint label={root.path} side="right" sideOffset={10}>
                      <b className="settings-path">{root.path}</b>
                    </Hint>
                    <span>
                      {root.lastScannedAt
                        ? "上次扫描 " + formatRelativeDate(root.lastScannedAt)
                        : "尚未扫描"}
                    </span>
                  </div>
                  <div className="settings-row__actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate("/library?scanRoot=" + encodeURIComponent(root.path))}
                    >
                      重新扫描
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void removeRoot(root.id, root.path)}
                    >
                      移除
                    </Button>
                  </div>
                </div>
              ))
            )}
            <div className="settings-row">
              <div>
                <b>扫描排除</b>
                <span>
                  {exclusions.data?.length ?? 0}
                  个已从库中移除的游戏；默认扫描跳过，恢复后会重新进入扫描。
                </span>
              </div>
              <ScanExclusionsDialog entries={exclusions.data ?? []} onRestore={restoreExclusion}>
                <Button variant="secondary" size="sm">
                  <ListFilter size={13} />
                  管理排除项
                  <span className="settings-count">{exclusions.data?.length ?? 0}</span>
                </Button>
              </ScanExclusionsDialog>
            </div>
            <div className="settings-row">
              <div>
                <b>扫描规则</b>
                <span>
                  跳过临时目录、运行库、卸载器和常见非游戏可执行文件；本轮不开放自定义规则。
                </span>
              </div>
              <Tag tone="muted">内置</Tag>
            </div>
          </section>

          <section id="source-settings" className="settings-section settings-section--full">
            <SettingsSectionHeader
              icon={Globe2}
              title="元数据来源"
              description="来源顺序与字段优先级。"
            />
            <MetadataSourceSettings />
          </section>

          <section id="account-settings" className="settings-section settings-section--full">
            <SettingsSectionHeader
              icon={UsersRound}
              title="账号与同步"
              description="平台账号、头像与资料同步。"
            />
            <OAuthAccounts />
          </section>

          <div className="settings-group-label">运行与连接</div>
          <section id="launcher-settings" className="settings-section settings-section--full">
            <SettingsSectionHeader
              icon={Monitor}
              title="启动器"
              description="显示器、全屏，以及 Locale Emulator 与 Magpie。"
            />
            {preferences.data ? (
              <LauncherDefaultsSection
                preferences={preferences.data}
                monitors={monitors.data ?? []}
                onSaved={invalidatePreferences}
              />
            ) : (
              <div className="settings-row">
                <div>
                  <b>启动器默认值</b>
                  <span>{preferences.isError ? String(preferences.error) : "正在读取设置…"}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void preferences.refetch()}>
                  重试
                </Button>
              </div>
            )}
          </section>

          <section id="network-settings" className="settings-section settings-section--full">
            <SettingsSectionHeader
              icon={Wifi}
              title="网络"
              description="元数据请求使用的代理方式。"
            />
            {preferences.data ? (
              <NetworkSettingsSection
                preferences={preferences.data}
                onSaved={invalidatePreferences}
              />
            ) : (
              <div className="settings-row">
                <div>
                  <b>代理设置</b>
                  <span>正在读取设置…</span>
                </div>
              </div>
            )}
          </section>

          <section id="bigscreen-settings" className="settings-section settings-section--full">
            <SettingsSectionHeader
              icon={Tv}
              title="电视大屏"
              description="显示器、手柄与全屏入口。"
              action={
                <Tag tone={bigScreenState.data?.open ? "status" : "muted"}>
                  {bigScreenState.data?.open ? "已打开" : "未打开"}
                </Tag>
              }
            />
            <div className="settings-row">
              <div>
                <b>显示器</b>
              </div>
              <SettingsSelect
                ariaLabel="大屏显示器"
                menuLabel="选择显示器"
                value={String(activeDisplay)}
                options={bigScreenMonitorOptions}
                onChange={(value) => setSelectedDisplay(Number(value))}
              />
            </div>
            <div className="settings-row">
              <div>
                <b>手柄</b>
              </div>
              <div className="settings-row__actions">
                <Tag tone={gamepadCount > 0 ? "status" : "muted"}>
                  <Gamepad2 size={12} strokeWidth={1.7} />
                  {gamepadCount > 0 ? "已连接" : "未连接"}
                </Tag>
                <Button variant="ghost" size="sm" onClick={refreshGamepads}>
                  <RefreshCw size={13} strokeWidth={1.6} /> 重新检测
                </Button>
              </div>
            </div>
            <div className="settings-row">
              <div>
                <b>按键提示</b>
                <span>在大屏底部显示手柄与翻页提示。</span>
              </div>
              <button
                type="button"
                className={cn("settings-switch", bigScreenHints && "is-on")}
                aria-pressed={bigScreenHints}
                aria-label="大屏按键提示"
                onClick={() => setBigScreenHints(!bigScreenHints)}
              >
                <span />
              </button>
            </div>
            <div className="settings-row">
              <div>
                <b>打开大屏</b>
              </div>
              <Button
                variant="primary"
                size="sm"
                disabled={bigScreenBusy}
                onClick={() => void openBigScreenWindow()}
              >
                <Tv size={14} strokeWidth={1.7} />
                {bigScreenBusy ? "正在打开…" : "在电视上打开"}
              </Button>
            </div>
            <p className="settings-hint">
              A 显示启动 / B 返回 / Y 游戏菜单 / START 控制 / LB/RB 分类
            </p>
          </section>

          <div className="settings-group-label">外观与显示</div>
          <section
            id="appearance-settings"
            className="settings-section settings-section--full settings-section--appearance"
          >
            <SettingsSectionHeader
              icon={Palette}
              title="外观"
              description="主题、密度、内容宽度与动效。"
            />
            <div className="settings-theme">
              <div className="settings-theme__preview" aria-hidden="true">
                <span className="settings-theme__rail">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="settings-theme__canvas">
                  <i className="settings-theme__hero" />
                  <i className="settings-theme__bar" />
                </span>
              </div>
              <div className="settings-theme__meta">
                <b>樱粉工作台</b>
                <span>樱粉侧栏 / 雾粉纸面 / 樱粉按钮</span>
                <div className="settings-theme__swatches" aria-hidden="true">
                  <i style={{ background: "#FC84A5" }} />
                  <i style={{ background: "#FFF3F6" }} />
                  <i style={{ background: "#FFF4F7" }} />
                  <i style={{ background: "#F46D96" }} />
                  <i style={{ background: "#2D2025" }} />
                </div>
              </div>
              <Tag tone="status">使用中</Tag>
            </div>
            <div className="settings-row">
              <div>
                <b>界面密度</b>
                <span>影响导航宽度、封面间距和工具栏高度。</span>
              </div>
              <div className="settings-segmented" role="group" aria-label="界面密度">
                <button
                  type="button"
                  aria-pressed={density === "comfortable"}
                  onClick={() => setDensity("comfortable")}
                >
                  舒适
                </button>
                <button
                  type="button"
                  aria-pressed={density === "compact"}
                  onClick={() => setDensity("compact")}
                >
                  紧凑
                </button>
              </div>
            </div>
            <div className="settings-row">
              <div>
                <b>内容宽度</b>
                <span>标准保留居中阅读列；铺满让主内容跟随窗口。</span>
              </div>
              <div className="settings-segmented" role="group" aria-label="内容宽度">
                <button
                  type="button"
                  aria-pressed={contentWidth === "standard"}
                  onClick={() => setContentWidth("standard")}
                >
                  标准
                </button>
                <button
                  type="button"
                  aria-pressed={contentWidth === "full"}
                  onClick={() => setContentWidth("full")}
                >
                  铺满
                </button>
              </div>
            </div>
            <div className="settings-row">
              <div>
                <b>减少动效</b>
                <span>保留状态反馈，移除位移和缩放。</span>
              </div>
              <button
                type="button"
                className={cn("settings-switch", reduceMotion && "is-on")}
                aria-pressed={reduceMotion}
                aria-label="减少动效"
                onClick={() => setReduceMotion(!reduceMotion)}
              >
                <span />
              </button>
            </div>
          </section>

          <div className="settings-group-label">应用</div>
          <section id="probe-settings" className="settings-section settings-section--third">
            <SettingsSectionHeader
              icon={ShieldCheck}
              title="技术探针"
              description="验证运行环境与窗口能力。"
              action={<Tag tone="data">DEV</Tag>}
            />
            <div className="settings-row">
              <div>
                <b>Gamepad API</b>
                <span>
                  {gamepadSupported
                    ? `浏览器支持，已连接 ${gamepadCount} 个手柄`
                    : "当前环境不提供 Gamepad API"}
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={refreshGamepads}>
                <RefreshCw size={13} strokeWidth={1.6} /> 重新检测
              </Button>
            </div>
            <div className="settings-row">
              <div>
                <b>全屏</b>
                <span>验证 Tauri 窗口全屏 API；Escape 或关闭按钮返回。</span>
              </div>
              <Button variant="secondary" size="sm" onClick={() => void enterFullscreen()}>
                进入全屏
              </Button>
            </div>
          </section>

          <section id="data-settings" className="settings-section settings-section--wide">
            <SettingsSectionHeader
              icon={SlidersHorizontal}
              title="数据与关于"
              description="路径、版本与更新检查。"
            />
            {preferences.data ? (
              <DataAndUpdateSection
                appInfo={appInfo.data}
                preferences={preferences.data}
                onSaved={invalidatePreferences}
              />
            ) : (
              <div className="settings-row">
                <div>
                  <b>应用设置</b>
                  <span>正在读取设置…</span>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
      <ConfirmDialog
        open={confirmRoot !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmRoot(null);
          }
        }}
        title={"移除扫描目录？"}
        description={
          <>
            <span className="settings-path">{confirmRoot?.path}</span>
            <br />
            已入库的游戏会保留，只停止后续扫描这个目录。
          </>
        }
        confirmLabel="移除目录"
        busy={removingRoot}
        onConfirm={() => void confirmRemoveRoot()}
      />
    </div>
  );
}
