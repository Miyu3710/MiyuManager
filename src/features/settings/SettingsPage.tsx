import {
  Database,
  Monitor,
  Palette,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../../design-system/components/Button";
import { Tag } from "../../design-system/components/Tag";
import { useAppearance } from "../../app/useAppearance";
import { formatRelativeDate } from "../../lib/format";
import { removeLibraryRoot, removeScanExclusion } from "../../lib/library-api";
import { cn } from "../../lib/cn";
import { MetadataSourceSettings } from "./MetadataSourceSettings";
import {
  useAppInfo,
  useInvalidateLibrary,
  useLibraryRoots,
  useScanExclusions,
} from "../library/useLibrary";
import "./settings.css";

const settingsSections = [
  { id: "library-settings", label: "游戏库", icon: Database },
  { id: "source-settings", label: "元数据来源", icon: Sparkles },
  { id: "launcher-settings", label: "启动器", icon: Monitor },
  { id: "appearance-settings", label: "外观", icon: Palette },
  { id: "probe-settings", label: "技术探针", icon: ShieldCheck },
  { id: "data-settings", label: "数据与备份", icon: SlidersHorizontal },
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
  const exclusions = useScanExclusions();
  const density = useAppearance((state) => state.density);
  const setDensity = useAppearance((state) => state.setDensity);
  const reduceMotion = useAppearance((state) => state.reduceMotion);
  const setReduceMotion = useAppearance((state) => state.setReduceMotion);
  const [gamepadSupported, setGamepadSupported] = useState(() => readGamepadState().supported);
  const [gamepadCount, setGamepadCount] = useState(() => readGamepadState().count);
  const [probeState, setProbeState] = useState("尚未打开");

  const removeRoot = async (rootId: number, path: string) => {
    const confirmed = window.confirm(
      "移除扫描目录“" + path + "”？已入库的游戏会保留，只停止后续扫描这个目录。",
    );
    if (!confirmed) {
      return;
    }
    try {
      await removeLibraryRoot(rootId);
      invalidate();
      toast.success("已移除扫描目录");
    } catch (error) {
      toast.error(String(error));
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

  const openBigScreenProbe = async () => {
    if (!isTauri()) {
      toast("第二窗口只在 Tauri 桌面窗口中可用。");
      return;
    }
    try {
      await invoke("open_bigscreen_probe");
      setProbeState("已请求打开第二窗口");
    } catch (error) {
      setProbeState("打开失败");
      toast(String(error));
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
          <p className="app-kicker">
            <span className="app-status-dot" />
            SETTINGS / 设置
          </p>
          <h1>设置</h1>
          <p>库、来源、启动器、外观和数据都从这一页管理。</p>
        </div>
        <Tag tone="status">离线可用</Tag>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="设置分区">
          {settingsSections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() =>
                document.getElementById(id)?.scrollIntoView({
                  behavior: reduceMotion ? "auto" : "smooth",
                  block: "start",
                })
              }
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
                <p>管理扫描根目录、忽略规则和入库策略。</p>
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
                <b>忽略规则</b>
                <span>临时目录、压缩包、非游戏可执行文件</span>
              </div>
              <Button variant="ghost" size="sm">
                编辑
              </Button>
            </div>
          </section>

          <section id="source-settings" className="settings-section">
            <header>
              <div>
                <h2>元数据来源</h2>
                <p>来源只提供元数据，字段可以锁定和手动校正。</p>
              </div>
            </header>
            <MetadataSourceSettings />
          </section>

          <section id="launcher-settings" className="settings-section">
            <header>
              <div>
                <h2>启动器</h2>
                <p>这些是新建启动配置时的默认值。</p>
              </div>
            </header>
            <div className="settings-row">
              <div>
                <b>默认显示器</b>
                <span>按作品在详情页选择；全局默认值将在 C8 接入。</span>
              </div>
              <Tag tone="muted">按作品</Tag>
            </div>
            <div className="settings-row">
              <div>
                <b>Locale Emulator / NTLEA</b>
                <span>在作品详情页选择包装器 exe 和参数；不捆绑、不自动下载。</span>
              </div>
              <Tag tone="status">按作品配置</Tag>
            </div>
          </section>

          <section id="appearance-settings" className="settings-section">
            <header>
              <div>
                <h2>外观</h2>
                <p>主题和密度通过语义 token 控制，页面组件不硬编码颜色。</p>
              </div>
            </header>
            <div className="settings-theme">
              <div className="settings-theme__card">
                <div className="settings-theme__swatches">
                  <i style={{ background: "#081521" }} />
                  <i style={{ background: "#F3EAD8" }} />
                  <i style={{ background: "#D94B3D" }} />
                  <i style={{ background: "#8FD3C1" }} />
                  <i style={{ background: "#D9A441" }} />
                </div>
                <div>
                  <b>深夜游戏盒</b>
                  <span>当前主题 · 墨蓝 / 奶油 / 标签红</span>
                </div>
                <Tag tone="status">使用中</Tag>
              </div>
              <p className="settings-hint">
                新增主题时只需增加一组语义 token；组件和页面布局不需要改。
              </p>
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
                <p>只验证 C1 能力，不完成大屏和手柄功能。</p>
              </div>
              <Tag tone="data">DEV</Tag>
            </header>
            <div className="settings-row">
              <div>
                <b>Gamepad API</b>
                <span>
                  {gamepadSupported
                    ? `浏览器支持 · 已连接 ${gamepadCount} 个手柄`
                    : "当前环境不提供 Gamepad API"}
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={refreshGamepads}>
                <RefreshCw size={13} strokeWidth={1.6} /> 重新检测
              </Button>
            </div>
            <div className="settings-row">
              <div>
                <b>第二窗口 / 大屏</b>
                <span>{probeState}。大屏窗口使用独立 WebView。</span>
              </div>
              <Button variant="secondary" size="sm" onClick={() => void openBigScreenProbe()}>
                打开探针
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
                <h2>数据与备份</h2>
                <p>本地 SQLite 已启用 WAL 和迁移；备份、恢复和数据目录迁移会在 C9 接入。</p>
              </div>
              <SlidersHorizontal size={15} strokeWidth={1.5} />
            </header>
            <div className="settings-row">
              <div>
                <b>数据库</b>
                <span className="settings-path" title={appInfo.data?.dbPath}>
                  {appInfo.data?.dbPath ?? "正在读取…"}
                </span>
              </div>
              <Tag tone="status">SQLite · WAL</Tag>
            </div>
            <div className="settings-row">
              <div>
                <b>数据目录</b>
                <span className="settings-path" title={appInfo.data?.dataDir}>
                  {appInfo.data?.dataDir ?? "正在读取…"}
                </span>
              </div>
              <Tag tone="muted">本机</Tag>
            </div>
            <div className="settings-row">
              <div>
                <b>版本</b>
                <span>{appInfo.data?.version ?? "—"}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toast("数据库备份与恢复将在 C9 接入。")}
              >
                备份
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
