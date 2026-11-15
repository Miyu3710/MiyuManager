import {
  Database,
  Gamepad2,
  Globe2,
  Monitor,
  Palette,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Tv,
  Wifi,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../../design-system/components/Button";
import { ConfirmDialog } from "../../design-system/components/ConfirmDialog";
import { Tag } from "../../design-system/components/Tag";
import { useAppearance } from "../../app/useAppearance";
import { useInvalidatePreferences, usePreferences } from "../../app/usePreferences";
import { formatRelativeDate } from "../../lib/format";
import { removeLibraryRoot, removeScanExclusion } from "../../lib/library-api";
import { getBigScreenState, openBigScreen } from "../../lib/bigscreen-api";
import { cn } from "../../lib/cn";
import { MetadataSourceSettings } from "./MetadataSourceSettings";
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

const settingsSections = [
  { id: "library-settings", label: "游戏库", icon: Database },
  { id: "source-settings", label: "元数据来源", icon: Globe2 },
  { id: "launcher-settings", label: "启动器", icon: Monitor },
  { id: "network-settings", label: "网络", icon: Wifi },
  { id: "bigscreen-settings", label: "大屏模式", icon: Tv },
  { id: "appearance-settings", label: "外观", icon: Palette },
  { id: "probe-settings", label: "技术探针", icon: ShieldCheck },
  { id: "data-settings", label: "数据与关于", icon: SlidersHorizontal },
];

function readGamepadState() {
  const supported = typeof navigator !== "undefined" && "getGamepads" in navigator;
  return {
    supported,
    count: supported ? navigator.getGamepads().filter((pad) => pad !== null).length : 0,
  };
}

export function SettingsPage() {
  const navigate = useNavigate();
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
  const reduceMotion = useAppearance((state) => state.reduceMotion);
  const setReduceMotion = useAppearance((state) => state.setReduceMotion);
  const [gamepadSupported, setGamepadSupported] = useState(() => readGamepadState().supported);
  const [gamepadCount, setGamepadCount] = useState(() => readGamepadState().count);
  const [selectedDisplay, setSelectedDisplay] = useState<number | null>(null);
  const [confirmRoot, setConfirmRoot] = useState<{ id: number; path: string } | null>(null);
  const [removingRoot, setRemovingRoot] = useState(false);
  const [bigScreenBusy, setBigScreenBusy] = useState(false);
  const [activeSection, setActiveSection] = useState(settingsSections[0]?.id ?? "");
  const activeDisplay = selectedDisplay ?? bigScreenState.data?.display ?? 0;

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
      const threshold = (scroller?.getBoundingClientRect().top ?? 0) + 170;
      let current = settingsSections[0]?.id ?? "";
      for (const section of settingsSections) {
        const element = document.getElementById(section.id);
        if (element && element.getBoundingClientRect().top <= threshold) {
          current = section.id;
        }
      }
      setActiveSection(current);
    };
    const target: HTMLElement | Window = scroller ?? window;
    update();
    target.addEventListener("scroll", update, { passive: true });
    return () => target.removeEventListener("scroll", update);
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
      <header className="settings-head">
        <div>
          <h1>设置</h1>
        </div>
        <Tag tone="status">本机</Tag>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="设置分区">
          {settingsSections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={activeSection === id ? "is-active" : undefined}
              aria-current={activeSection === id ? "location" : undefined}
              onClick={() => {
                setActiveSection(id);
                document.getElementById(id)?.scrollIntoView({
                  behavior: reduceMotion ? "auto" : "smooth",
                  block: "start",
                });
              }}
            >
              <Icon size={14} strokeWidth={1.5} /> {label}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          <section id="library-settings" className="settings-section">
            <header>
              <div>
                <h2>游戏库</h2>
              </div>
              <Button variant="secondary" size="sm" onClick={() => navigate("/library?import=1")}>
                添加目录
              </Button>
            </header>
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
                    <b className="settings-path" title={root.path}>
                      {root.path}
                    </b>
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
                  个已从库中移除的游戏；默认扫描跳过，手动导入可重新加入。
                </span>
              </div>
              <Tag tone="muted">{exclusions.data?.length ?? 0} 个</Tag>
            </div>
            {exclusions.data?.slice(0, 5).map((entry) => (
              <div className="settings-row" key={entry.exeKey}>
                <div>
                  <b className="settings-path" title={entry.exePath}>
                    {entry.exePath}
                  </b>
                  <span>
                    {entry.reason === "removed_from_library" ? "已从库中移除" : entry.reason}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void restoreExclusion(entry.exeKey)}
                >
                  恢复扫描
                </Button>
              </div>
            ))}
            {exclusions.data && exclusions.data.length > 5 ? (
              <p className="settings-hint">还有 {exclusions.data.length - 5} 个排除项未展开。</p>
            ) : null}
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

          <section id="source-settings" className="settings-section">
            <header>
              <div>
                <h2>元数据来源</h2>
              </div>
            </header>
            <MetadataSourceSettings />
          </section>

          <section id="launcher-settings" className="settings-section">
            <header>
              <div>
                <h2>启动器</h2>
              </div>
            </header>
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

          <section id="network-settings" className="settings-section">
            <header>
              <div>
                <h2>网络</h2>
              </div>
              <Wifi size={15} strokeWidth={1.5} />
            </header>
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

          <section id="bigscreen-settings" className="settings-section">
            <header>
              <div>
                <h2>电视大屏</h2>
              </div>
              <Tag tone={bigScreenState.data?.open ? "status" : "muted"}>
                {bigScreenState.data?.open ? "已打开" : "未打开"}
              </Tag>
            </header>
            <div className="settings-row">
              <div>
                <b>显示器</b>
              </div>
              <select
                className="settings-select"
                value={activeDisplay}
                onChange={(event) => setSelectedDisplay(Number(event.target.value))}
                aria-label="大屏显示器"
              >
                {(monitors.data ?? []).length === 0 ? (
                  <option value={0}>正在读取显示器…</option>
                ) : (
                  (monitors.data ?? []).map((monitor) => (
                    <option key={monitor.index} value={monitor.index}>
                      {monitor.name}，{monitor.width} × {monitor.height}，
                      {Math.round(monitor.scaleFactor * 100)}%
                    </option>
                  ))
                )}
              </select>
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
            <p className="settings-hint">A 确认 / B 返回 / Y 游戏菜单 / START 控制 / LB/RB 区域</p>
          </section>

          <section id="appearance-settings" className="settings-section">
            <header>
              <div>
                <h2>外观</h2>
              </div>
            </header>
            <div className="settings-theme">
              <div className="settings-theme__card">
                <div className="settings-theme__swatches">
                  <i style={{ background: "#F5EFEC" }} />
                  <i style={{ background: "#2B2225" }} />
                  <i style={{ background: "#B75D6C" }} />
                  <i style={{ background: "#587563" }} />
                  <i style={{ background: "#8C6935" }} />
                </div>
                <div>
                  <b>樱纸档案</b>
                  <span>雾粉纸面 / 墨色侧栏 / 樱红</span>
                </div>
                <Tag tone="status">使用中</Tag>
              </div>
            </div>
            <div className="settings-row">
              <div>
                <b>界面密度</b>
                <span>影响导航宽度、封面间距和工具栏高度。</span>
              </div>
              <div className="settings-segmented">
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
                <b>减少动效</b>
                <span>保留状态反馈，移除位移和缩放。</span>
              </div>
              <button
                type="button"
                className={cn("settings-switch", reduceMotion && "is-on")}
                aria-pressed={reduceMotion}
                onClick={() => setReduceMotion(!reduceMotion)}
              >
                <span />
              </button>
            </div>
          </section>

          <section id="probe-settings" className="settings-section">
            <header>
              <div>
                <h2>技术探针</h2>
              </div>
              <Tag tone="data">DEV</Tag>
            </header>
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

          <section id="data-settings" className="settings-section">
            <header>
              <div>
                <h2>数据与关于</h2>
              </div>
              <SlidersHorizontal size={15} strokeWidth={1.5} />
            </header>
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
