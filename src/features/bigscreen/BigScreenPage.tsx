import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import {
  AlertTriangle,
  ArrowLeft,
  Gamepad2,
  Info,
  Loader2,
  Play,
  RefreshCw,
  Square,
  Tv,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAppearance } from "../../app/useAppearance";
import { CoverArt } from "../../design-system/components/CoverArt";
import {
  closeBigScreen,
  getBigScreenState,
  moveBigScreen,
  openBigScreenDetail,
} from "../../lib/bigscreen-api";
import { cn } from "../../lib/cn";
import { formatBytes, formatPlaytimeSeconds, formatRelativeDate } from "../../lib/format";
import {
  getLaunchState,
  libraryItemToGame,
  setLibraryFavorite,
  setLibraryStatus,
  startWork,
  stopWork,
} from "../../lib/library-api";
import type { LaunchSnapshot, LibraryItem, LibraryStatus } from "../../lib/library-types";
import { useInvalidateLibrary, useMonitors } from "../library/useLibrary";
import { BigScreenGameMenu } from "./BigScreenGameMenu";
import { BigScreenControlMenu } from "./BigScreenControlMenu";
import { BigScreenDetailDrawer } from "./BigScreenDetailDrawer";
import {
  bigScreenCategories,
  bigScreenCategoryLabel,
  type BigScreenCategory,
} from "./bigscreenCategories";
import { bigScreenStatusLabel } from "./bigScreenStatus";
import { useBigScreenData } from "./useBigScreenData";
import { useBigScreenFocus } from "./useBigScreenFocus";
import { useBigScreenInput, type BigScreenAction } from "./useBigScreenInput";
import "./bigscreen.css";

interface MenuAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Overlay =
  | { kind: "game"; item: LibraryItem; anchor: MenuAnchor; view: "main" | "status" }
  | { kind: "drawer"; item: LibraryItem }
  | { kind: "control" };

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function BigScreenPage() {
  const navigate = useNavigate();
  const [category, setCategory] = useState<BigScreenCategory>("recent");
  const [selectedWorkId, setSelectedWorkId] = useState<number | null>(null);
  const pendingShelfFocus = useRef(false);
  const data = useBigScreenData(category);
  const monitorsQuery = useMonitors();
  const bigScreenState = useQuery({
    queryKey: ["bigscreen-state"],
    queryFn: getBigScreenState,
    staleTime: 10_000,
  });
  const invalidate = useInvalidateLibrary();
  const queryClient = useQueryClient();
  const reduceMotion = useAppearance((state) => state.reduceMotion);

  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [menuFocusTarget, setMenuFocusTarget] = useState("menu-launch");
  const [runningWorkId, setRunningWorkId] = useState<number | null>(null);
  const [busyWorkId, setBusyWorkId] = useState<number | null>(null);
  const [busyDisplay, setBusyDisplay] = useState<number | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [selectedDisplay, setSelectedDisplay] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [cursorHidden, setCursorHidden] = useState(false);
  const restoreFocusRef = useRef<string | null>(null);
  const cursorTimer = useRef<number | null>(null);

  const scope = overlay ? (overlay.kind === "game" ? "game-menu" : overlay.kind) : "root";
  const { rootRef, activeKey, setActiveKey, focusKey, move, switchZone } = useBigScreenFocus(scope);
  const monitors = monitorsQuery.data ?? [];
  const activeDisplay = selectedDisplay ?? bigScreenState.data?.display ?? null;
  const hero = data.items.find((item) => item.workId === selectedWorkId) ?? data.items[0] ?? null;
  const categoryLabel = bigScreenCategoryLabel(category);
  const clock = useMemo(() => formatClock(now), [now]);

  const invalidateAll = useCallback(() => {
    invalidate();
    void queryClient.invalidateQueries({ queryKey: ["bigscreen-state"] });
  }, [invalidate, queryClient]);

  const bumpCursor = useCallback(() => {
    setCursorHidden(false);
    if (cursorTimer.current !== null) {
      window.clearTimeout(cursorTimer.current);
    }
    cursorTimer.current = window.setTimeout(() => setCursorHidden(true), 3_000);
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => setCursorHidden(true), 3_000);
    cursorTimer.current = initialTimer;
    const onMove = () => bumpCursor();
    window.addEventListener("mousemove", onMove);
    window.addEventListener("pointerdown", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("pointerdown", onMove);
      if (cursorTimer.current !== null) {
        window.clearTimeout(cursorTimer.current);
        cursorTimer.current = null;
      }
    };
  }, [bumpCursor]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!launchError) {
      return;
    }
    const timer = window.setTimeout(() => setLaunchError(null), 12_000);
    return () => window.clearTimeout(timer);
  }, [launchError]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    const register = <T,>(eventName: string, handler: (payload: T) => void) => {
      void listen<T>(eventName, (event) => {
        if (!disposed) {
          handler(event.payload);
        }
      }).then((unlisten) => {
        if (disposed) {
          unlisten();
        } else {
          unlisteners.push(unlisten);
        }
      });
    };

    register<LaunchSnapshot>("launch-state", (payload) => {
      if (payload.state === "running") {
        setRunningWorkId(payload.workId);
      } else if (payload.state === "exited") {
        setRunningWorkId((current) => (current === payload.workId ? null : current));
        invalidateAll();
      }
    });
    register("play-session", () => invalidateAll());

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [invalidateAll]);

  const currentItem = (): LibraryItem | null => {
    const active = document.activeElement as HTMLElement | null;
    const workId = Number(active?.dataset.workId);
    if (Number.isFinite(workId) && workId > 0) {
      return data.items.find((item) => item.workId === workId) ?? null;
    }
    return hero;
  };

  const anchorForActive = (): MenuAnchor => {
    const active = document.activeElement as HTMLElement | null;
    const rect = active?.getBoundingClientRect();
    if (rect && (rect.width > 0 || rect.height > 0)) {
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    }
    return {
      x: Math.max(24, window.innerWidth / 2 - 120),
      y: Math.max(24, window.innerHeight / 2 - 100),
      width: 0,
      height: 0,
    };
  };

  const checkRunning = (item: LibraryItem) => {
    void getLaunchState(item.workId)
      .then((state) => {
        setRunningWorkId((current) => {
          if (state?.state === "running") {
            return item.workId;
          }
          return current === item.workId ? null : current;
        });
      })
      .catch(() => undefined);
  };

  const openGameMenu = (item: LibraryItem, anchor: MenuAnchor, restoreKey?: string | null) => {
    if (overlay) {
      return;
    }
    restoreFocusRef.current = restoreKey ?? activeKey;
    setMenuFocusTarget("menu-launch");
    setLaunchError(null);
    setOverlay({ kind: "game", item, anchor, view: "main" });
    checkRunning(item);
  };

  const openDrawer = (item: LibraryItem, restoreKey?: string | null) => {
    if (!overlay) {
      restoreFocusRef.current = restoreKey ?? activeKey;
    }
    setLaunchError(null);
    setOverlay({ kind: "drawer", item });
    checkRunning(item);
  };

  const openControl = () => {
    if (!overlay) {
      restoreFocusRef.current = activeKey;
    }
    if (activeDisplay === null && monitors[0]) {
      setSelectedDisplay(monitors[0].index);
    }
    setLaunchError(null);
    setOverlay({ kind: "control" });
  };

  const selectCategory = (id: BigScreenCategory) => {
    if (id === category) {
      setSelectedWorkId(data.items[0]?.workId ?? null);
      return;
    }
    setCategory(id);
    setSelectedWorkId(null);
    setLaunchError(null);
    pendingShelfFocus.current = true;
  };

  useEffect(() => {
    if (!pendingShelfFocus.current || overlay) {
      return;
    }
    const first = data.items[0];
    if (!first) {
      if (!data.loading) {
        pendingShelfFocus.current = false;
      }
      return;
    }
    pendingShelfFocus.current = false;
    const timer = window.setTimeout(() => focusKey(`shelf-${first.workId}`), 0);
    return () => window.clearTimeout(timer);
  }, [data.items, data.loading, focusKey, overlay]);

  const closeOverlay = () => {
    setOverlay(null);
  };

  useEffect(() => {
    if (overlay) {
      return;
    }
    const key = restoreFocusRef.current;
    if (!key) {
      return;
    }
    restoreFocusRef.current = null;
    const timer = window.setTimeout(() => focusKey(key), 0);
    return () => window.clearTimeout(timer);
  }, [overlay, focusKey]);

  const overlayFocusKey =
    overlay?.kind === "game"
      ? menuFocusTarget
      : overlay?.kind === "drawer"
        ? overlay.item.installStatus === "missing"
          ? "drawer-desktop"
          : "drawer-launch"
        : overlay?.kind === "control"
          ? "control-display-0"
          : null;

  useEffect(() => {
    if (!overlayFocusKey) {
      return;
    }
    const timer = window.setTimeout(() => focusKey(overlayFocusKey), 0);
    return () => window.clearTimeout(timer);
  }, [overlayFocusKey, focusKey]);

  useEffect(() => {
    if (overlay || activeKey || data.loading || data.error) {
      return;
    }
    const timer = window.setTimeout(() => focusKey(hero ? "hero-launch" : "category-recent"), 0);
    return () => window.clearTimeout(timer);
  }, [activeKey, focusKey, data.error, data.loading, overlay, hero]);

  const activateFocused = () => {
    const active = document.activeElement as HTMLElement | null;
    if (active?.hasAttribute("data-bigscreen-focus")) {
      active.click();
    }
  };

  const launch = async (item: LibraryItem) => {
    if (busyWorkId !== null) {
      return;
    }
    setBusyWorkId(item.workId);
    setLaunchError(null);
    try {
      if (runningWorkId === item.workId) {
        await stopWork(item.workId);
        setRunningWorkId(null);
        toast.success("已停止 " + item.title);
      } else {
        await startWork(item.workId);
        setRunningWorkId(item.workId);
        toast.success("已启动 " + item.title);
        setOverlay(null);
      }
      invalidateAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLaunchError(message);
      toast.error("启动失败：" + message);
    } finally {
      setBusyWorkId(null);
    }
  };

  const toggleFavorite = async (item: LibraryItem) => {
    if (busyWorkId !== null) {
      return;
    }
    setBusyWorkId(item.workId);
    try {
      await setLibraryFavorite(item.workId, !item.favorite);
      toast.success(item.favorite ? "已取消收藏" : "已收藏 " + item.title);
      invalidateAll();
      setOverlay(null);
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyWorkId(null);
    }
  };

  const changeStatus = async (item: LibraryItem, status: LibraryStatus) => {
    if (busyWorkId !== null) {
      return;
    }
    setBusyWorkId(item.workId);
    try {
      await setLibraryStatus(item.workId, status);
      toast.success("已标记为 " + bigScreenStatusLabel(status));
      invalidateAll();
      setOverlay(null);
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyWorkId(null);
    }
  };

  const openDesktopDetail = async (item: LibraryItem) => {
    setOverlay(null);
    try {
      await openBigScreenDetail(item.workId);
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : String(error));
    }
  };

  const returnMain = async () => {
    try {
      await closeBigScreen();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
    if (!isTauri()) {
      navigate("/");
    }
  };

  const selectDisplay = async (index: number) => {
    if (busyDisplay !== null) {
      return;
    }
    setBusyDisplay(index);
    setSelectedDisplay(index);
    try {
      const state = await moveBigScreen(index);
      setSelectedDisplay(state.display ?? index);
      if (state.message) {
        toast(state.message);
      }
      toast.success("已切换到大屏显示器 " + (index + 1));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyDisplay(null);
    }
  };

  const refresh = async () => {
    await data.refetch();
    toast.success("已刷新本地库");
  };

  const handleAction = (action: BigScreenAction) => {
    bumpCursor();
    if (action === "control") {
      if (overlay?.kind === "control") {
        closeOverlay();
      } else {
        openControl();
      }
      return;
    }

    if (action === "back") {
      if (overlay?.kind === "game" && overlay.view === "status") {
        setMenuFocusTarget("menu-status");
        setOverlay({ ...overlay, view: "main" });
      } else if (overlay) {
        closeOverlay();
      } else {
        focusKey(hero ? "hero-launch" : "category-recent");
      }
      return;
    }

    if (action === "menu") {
      if (overlay?.kind === "game") {
        closeOverlay();
      } else if (!overlay) {
        const item = currentItem();
        if (item) {
          openGameMenu(item, anchorForActive());
        }
      }
      return;
    }

    if (overlay) {
      if (action === "confirm") {
        activateFocused();
      } else if (action !== "prevZone" && action !== "nextZone") {
        move(action);
      }
      return;
    }

    if (action === "prevZone" || action === "nextZone") {
      switchZone(action === "nextZone" ? "next" : "prev");
      return;
    }
    if (action === "confirm") {
      activateFocused();
      return;
    }
    move(action);
  };

  const gamepad = useBigScreenInput({
    enabled: true,
    onAction: handleAction,
    onActivity: bumpCursor,
  });

  const handleContextMenu = (event: ReactMouseEvent, item: LibraryItem) => {
    event.preventDefault();
    event.stopPropagation();
    const key = (event.currentTarget as HTMLElement).dataset.bigscreenFocus ?? null;
    if (key) {
      setActiveKey(key);
    }
    openGameMenu(item, { x: event.clientX, y: event.clientY, width: 0, height: 0 }, key);
  };

  const heroGame = hero ? libraryItemToGame(hero) : null;
  const heroPlaytime = hero
    ? formatPlaytimeSeconds(hero.playtimeSeconds ?? hero.playtimeMinutes * 60)
    : "";
  const heroRunning = hero ? runningWorkId === hero.workId : false;
  const heroBusy = hero ? busyWorkId === hero.workId : false;
  const rootClass = cn(
    "bigscreen-root",
    reduceMotion && "is-reduced-motion",
    cursorHidden && "is-cursor-hidden",
  );

  return (
    <div className={rootClass} ref={rootRef}>
      {heroGame?.coverUrl ? (
        <div
          className="bigscreen-ambient"
          style={{ backgroundImage: `url(${heroGame.coverUrl})` }}
          aria-hidden="true"
        />
      ) : null}
      <div className="bigscreen-ambient__scrim" aria-hidden="true" />
      <header className="bigscreen-topbar">
        <div className="bigscreen-brand">
          <span>MIYU</span>
          <em>LOCAL LIBRARY</em>
        </div>
        <div className="bigscreen-topbar__status">
          <span>
            <i className="app-status-dot" />
            本地 · {data.loading ? "读取中" : `${data.libraryCount} 部`}
          </span>
          <span>
            本周 {data.stats.data ? formatPlaytimeSeconds(data.stats.data.rangeSeconds) : "—"}
          </span>
          <span className="bigscreen-topbar__pad">
            {gamepad.connected ? (
              <Gamepad2 size={15} strokeWidth={1.7} />
            ) : (
              <Tv size={15} strokeWidth={1.7} />
            )}
            {gamepad.connected ? "手柄已连接" : "键盘模式"}
          </span>
          <span className="bigscreen-topbar__clock">{clock}</span>
        </div>
      </header>

      <main className="bigscreen-main">
        <div className="bigscreen-layout">
          <nav className="bigscreen-rail" aria-label="大屏分类">
            <div className="bigscreen-rail__list">
              {bigScreenCategories.map(({ id, label, icon: Icon }) => {
                const key = "category-" + id;
                const current = category === id;
                return (
                  <button
                    key={id}
                    type="button"
                    className={cn("bigscreen-rail__item", current && "is-active")}
                    aria-current={current ? "page" : undefined}
                    aria-label={label}
                    title={label}
                    data-bigscreen-focus={key}
                    data-bigscreen-zone="categories"
                    data-category-id={id}
                    tabIndex={activeKey === key ? 0 : -1}
                    onFocus={() => setActiveKey(key)}
                    onClick={() => selectCategory(id)}
                  >
                    <Icon size={18} strokeWidth={1.7} />
                  </button>
                );
              })}
            </div>
          </nav>

          <div className="bigscreen-content">
            {data.loading ? (
              <div className="bigscreen-state" role="status" aria-live="polite">
                <Loader2 className="bigscreen-spin" size={30} strokeWidth={1.6} />
                <h1>正在读取本地库</h1>
              </div>
            ) : data.error ? (
              <div className="bigscreen-state" role="alert">
                <AlertTriangle size={30} strokeWidth={1.6} />
                <h1>读取本地库失败</h1>
                <p>{data.error instanceof Error ? data.error.message : String(data.error)}</p>
                <div className="bigscreen-state__actions">
                  <button
                    type="button"
                    className="bigscreen-action bigscreen-action--primary"
                    data-bigscreen-focus="error-retry"
                    data-bigscreen-zone="hero"
                    tabIndex={activeKey === "error-retry" ? 0 : -1}
                    onFocus={() => setActiveKey("error-retry")}
                    onClick={() => void data.refetch()}
                  >
                    <RefreshCw size={19} strokeWidth={1.8} />
                    重试
                  </button>
                  <button
                    type="button"
                    className="bigscreen-action bigscreen-action--ghost"
                    data-bigscreen-focus="error-return"
                    data-bigscreen-zone="hero"
                    tabIndex={activeKey === "error-return" ? 0 : -1}
                    onFocus={() => setActiveKey("error-return")}
                    onClick={() => void returnMain()}
                  >
                    <ArrowLeft size={19} strokeWidth={1.8} />
                    返回主窗口
                  </button>
                </div>
              </div>
            ) : !hero ? (
              <div className="bigscreen-state bigscreen-state--empty">
                <Tv size={34} strokeWidth={1.4} />
                <h1>{data.libraryCount === 0 ? "本地库为空" : `${categoryLabel}暂无作品`}</h1>
                <div className="bigscreen-state__actions">
                  {category !== "all" && data.libraryCount > 0 ? (
                    <button
                      type="button"
                      className="bigscreen-action bigscreen-action--primary"
                      data-bigscreen-focus="empty-all"
                      data-bigscreen-zone="hero"
                      tabIndex={activeKey === "empty-all" ? 0 : -1}
                      onFocus={() => setActiveKey("empty-all")}
                      onClick={() => selectCategory("all")}
                    >
                      查看全部游戏
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="bigscreen-action bigscreen-action--primary"
                      data-bigscreen-focus="empty-return"
                      data-bigscreen-zone="hero"
                      tabIndex={activeKey === "empty-return" ? 0 : -1}
                      onFocus={() => setActiveKey("empty-return")}
                      onClick={() => void returnMain()}
                    >
                      <ArrowLeft size={19} strokeWidth={1.8} />
                      返回主窗口
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <section
                  className="bigscreen-hero"
                  aria-label={categoryLabel + "：" + hero.title}
                  onContextMenu={(event) => handleContextMenu(event, hero)}
                >
                  <div className="bigscreen-hero__copy">
                    <p className="bigscreen-hero__kicker">
                      <span className="app-status-dot" />
                      {bigScreenStatusLabel(hero.status)}
                    </p>
                    <h1>{hero.title}</h1>
                    {hero.originalTitle ? (
                      <p className="bigscreen-hero__original">{hero.originalTitle}</p>
                    ) : null}
                    <p className="bigscreen-hero__desc">{hero.description || "暂无简介"}</p>
                    {hero.tags.length > 0 ? (
                      <div className="bigscreen-hero__tags">
                        {hero.tags.slice(0, 4).map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    ) : null}
                    <div className="bigscreen-hero__data">
                      <span>
                        <b>{heroPlaytime}</b>累计
                      </span>
                      <i />
                      <span>
                        <b>{hero.launchCount}</b>次启动
                      </span>
                      <i />
                      <span>
                        <b>
                          {hero.lastPlayedAt ? formatRelativeDate(hero.lastPlayedAt) : "尚未启动"}
                        </b>
                      </span>
                      <i />
                      <span>
                        <b>{formatBytes(hero.sizeBytes)}</b>安装
                      </span>
                    </div>
                    <div className="bigscreen-hero__actions">
                      <button
                        type="button"
                        className="bigscreen-action bigscreen-action--primary"
                        data-bigscreen-focus="hero-launch"
                        data-bigscreen-zone="hero"
                        data-work-id={hero.workId}
                        tabIndex={activeKey === "hero-launch" ? 0 : -1}
                        disabled={heroBusy || hero.installStatus === "missing"}
                        onFocus={() => setActiveKey("hero-launch")}
                        onClick={() => void launch(hero)}
                      >
                        {heroBusy ? (
                          <Loader2 className="bigscreen-spin" size={19} />
                        ) : heroRunning ? (
                          <Square size={18} fill="currentColor" strokeWidth={0} />
                        ) : (
                          <Play size={20} fill="currentColor" strokeWidth={0} />
                        )}
                        {hero.installStatus === "missing"
                          ? "安装缺失"
                          : heroRunning
                            ? "停止游戏"
                            : "启动游戏"}
                      </button>
                      <button
                        type="button"
                        className="bigscreen-action bigscreen-action--secondary"
                        data-bigscreen-focus="hero-detail"
                        data-bigscreen-zone="hero"
                        data-work-id={hero.workId}
                        tabIndex={activeKey === "hero-detail" ? 0 : -1}
                        onFocus={() => setActiveKey("hero-detail")}
                        onClick={() => openDrawer(hero)}
                      >
                        <Info size={19} strokeWidth={1.8} />
                        游戏详情
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="bigscreen-hero__cover"
                    aria-label={"查看 " + hero.title + " 详情"}
                    data-bigscreen-focus="hero-cover"
                    data-bigscreen-zone="hero"
                    data-work-id={hero.workId}
                    tabIndex={activeKey === "hero-cover" ? 0 : -1}
                    onFocus={() => setActiveKey("hero-cover")}
                    onClick={() => openDrawer(hero)}
                    onContextMenu={(event) => handleContextMenu(event, hero)}
                  >
                    <CoverArt work={heroGame!} />
                  </button>
                </section>

                <section className="bigscreen-shelf" aria-label={categoryLabel}>
                  <header className="bigscreen-shelf__head">
                    <div>
                      <span>{categoryLabel}</span>
                    </div>
                    <span>{data.items.length} 部</span>
                  </header>
                  <div className="bigscreen-shelf__row">
                    {data.items.map((item) => {
                      const key = "shelf-" + item.workId;
                      const game = libraryItemToGame(item);
                      return (
                        <button
                          key={item.workId}
                          type="button"
                          className={cn(
                            "bigscreen-card",
                            hero.workId === item.workId && "is-selected",
                          )}
                          aria-label={item.title}
                          data-bigscreen-focus={key}
                          data-bigscreen-zone="shelf"
                          data-work-id={item.workId}
                          tabIndex={activeKey === key ? 0 : -1}
                          onFocus={() => {
                            setActiveKey(key);
                            setSelectedWorkId(item.workId);
                          }}
                          onClick={() => openDrawer(item)}
                          onContextMenu={(event) => handleContextMenu(event, item)}
                        >
                          <CoverArt work={game} />
                        </button>
                      );
                    })}
                  </div>
                </section>
              </>
            )}
          </div>
        </div>

        {launchError ? (
          <div className="bigscreen-error" role="alert">
            <AlertTriangle size={18} strokeWidth={1.8} />
            <p>{launchError}</p>
            <button
              type="button"
              className="bigscreen-icon-button"
              aria-label="关闭错误提示"
              data-bigscreen-focus="error-close"
              data-bigscreen-zone="hero"
              tabIndex={activeKey === "error-close" ? 0 : -1}
              onFocus={() => setActiveKey("error-close")}
              onClick={() => setLaunchError(null)}
            >
              ×
            </button>
          </div>
        ) : null}

        <footer className="bigscreen-hint">
          <div className="bigscreen-hint__keys">
            <span>
              <b>A</b> 确认
            </span>
            <span>
              <b>B</b> 返回
            </span>
            <span>
              <b>Y</b> 游戏菜单
            </span>
            <span>
              <b>START</b> 控制
            </span>
            <span>
              <b>LB/RB</b> 区域
            </span>
          </div>
        </footer>
      </main>

      {overlay?.kind === "game" ? (
        <BigScreenGameMenu
          item={overlay.item}
          anchor={overlay.anchor}
          view={overlay.view}
          running={runningWorkId === overlay.item.workId}
          busy={busyWorkId === overlay.item.workId}
          activeKey={activeKey}
          onFocusKey={setActiveKey}
          onLaunch={() => void launch(overlay.item)}
          onOpenDetail={() => openDrawer(overlay.item)}
          onToggleFavorite={() => void toggleFavorite(overlay.item)}
          onOpenStatus={() => {
            setMenuFocusTarget("menu-status-back");
            setOverlay({ ...overlay, view: "status" });
          }}
          onSetStatus={(status) => void changeStatus(overlay.item, status)}
          onBackFromStatus={() => {
            setMenuFocusTarget("menu-status");
            setOverlay({ ...overlay, view: "main" });
          }}
          onClose={closeOverlay}
        />
      ) : null}

      {overlay?.kind === "drawer" ? (
        <BigScreenDetailDrawer
          item={overlay.item}
          running={runningWorkId === overlay.item.workId}
          busy={busyWorkId === overlay.item.workId}
          activeKey={activeKey}
          onFocusKey={setActiveKey}
          onLaunch={() => void launch(overlay.item)}
          onOpenDesktop={() => void openDesktopDetail(overlay.item)}
          onClose={closeOverlay}
        />
      ) : null}

      {overlay?.kind === "control" ? (
        <BigScreenControlMenu
          monitors={monitors}
          selectedDisplay={activeDisplay}
          gamepad={gamepad}
          activeKey={activeKey}
          busyDisplay={busyDisplay}
          onFocusKey={setActiveKey}
          onSelectDisplay={(index) => void selectDisplay(index)}
          onRefresh={() => void refresh()}
          onReturnMain={() => void returnMain()}
          onClose={closeOverlay}
        />
      ) : null}
    </div>
  );
}
