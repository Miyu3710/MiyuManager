import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { AlertTriangle, ArrowLeft, Loader2, Play, RefreshCw, Square, Tv } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAppearance } from "../../app/useAppearance";
import { CoverArt } from "../../design-system/components/CoverArt";
import { quitApp } from "../../lib/app-api";
import { syncBangumiProgress } from "../../lib/bangumi-api";
import { closeBigScreen, openBigScreenDetail } from "../../lib/bigscreen-api";
import { cn } from "../../lib/cn";
import { formatBytes, formatPlaytimeSeconds, formatRelativeDate } from "../../lib/format";
import {
  assetUrl,
  getLaunchState,
  libraryItemToGame,
  setLibraryFavorite,
  setLibraryStatus,
  startWork,
  stopWork,
} from "../../lib/library-api";
import type { LaunchSnapshot, LibraryItem, LibraryStatus } from "../../lib/library-types";
import { useInvalidateLibrary } from "../library/useLibrary";
import { BigScreenGameMenu } from "./BigScreenGameMenu";
import { BigScreenControlMenu } from "./BigScreenControlMenu";
import { BigScreenSearch } from "./BigScreenSearch";
import {
  adjacentCategory,
  bigScreenCategories,
  bigScreenCategoryLabel,
  type BigScreenCategory,
} from "./bigscreenCategories";
import { bigScreenStatusLabel } from "./bigScreenStatus";
import { useBigScreenData } from "./useBigScreenData";
import { useBigScreenFocus } from "./useBigScreenFocus";
import { useBigScreenInput, type BigScreenAction } from "./useBigScreenInput";
import { useCoverAccent } from "./useCoverAccent";
import "./bigscreen.css";

interface MenuAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Overlay =
  | { kind: "game"; item: LibraryItem; anchor: MenuAnchor; view: "main" | "status" }
  | { kind: "control"; view: "menu" | "quit" }
  | { kind: "search" };

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
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const pendingShelfFocus = useRef(false);
  const pendingRootFocus = useRef<string | null>(null);
  const data = useBigScreenData(category, deferredSearchQuery);
  const invalidate = useInvalidateLibrary();
  const reduceMotion = useAppearance((state) => state.reduceMotion);
  const showBigScreenHints = useAppearance((state) => state.bigScreenHints);
  const setBigScreenHints = useAppearance((state) => state.setBigScreenHints);

  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [controlClosing, setControlClosing] = useState(false);
  const [searchClosing, setSearchClosing] = useState(false);
  const [menuFocusTarget, setMenuFocusTarget] = useState("menu-launch");
  const [runningWorkId, setRunningWorkId] = useState<number | null>(null);
  const [busyWorkId, setBusyWorkId] = useState<number | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launchWorkId, setLaunchWorkId] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [cursorHidden, setCursorHidden] = useState(false);
  const restoreFocusRef = useRef<string | null>(null);
  const cursorTimer = useRef<number | null>(null);
  const controlCloseTimer = useRef<number | null>(null);
  const searchCloseTimer = useRef<number | null>(null);
  const suppressCategorySelectRef = useRef(false);

  const scope = overlay
    ? overlay.kind === "game"
      ? "game-menu"
      : overlay.kind === "search"
        ? "search"
        : "control"
    : "root";
  const { rootRef, activeKey, setActiveKey, focusKey, move, switchZone } = useBigScreenFocus(scope);
  const hero = data.items.find((item) => item.workId === selectedWorkId) ?? data.items[0] ?? null;
  const launchRevealed = Boolean(hero && launchWorkId === hero.workId);
  const activeSearch = deferredSearchQuery.trim();
  const categoryLabel = activeSearch
    ? `“${activeSearch}”的搜索结果`
    : bigScreenCategoryLabel(category);
  const clock = useMemo(() => formatClock(now), [now]);

  const invalidateAll = useCallback(() => {
    invalidate();
  }, [invalidate]);

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
    return () => {
      if (controlCloseTimer.current !== null) {
        window.clearTimeout(controlCloseTimer.current);
        controlCloseTimer.current = null;
      }
      if (searchCloseTimer.current !== null) {
        window.clearTimeout(searchCloseTimer.current);
        searchCloseTimer.current = null;
      }
    };
  }, []);

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

  const openControl = () => {
    if (controlCloseTimer.current !== null) {
      window.clearTimeout(controlCloseTimer.current);
      controlCloseTimer.current = null;
    }
    setControlClosing(false);
    if (!overlay) {
      restoreFocusRef.current = activeKey;
    }
    setLaunchError(null);
    setOverlay({ kind: "control", view: "menu" });
  };

  const openSearch = () => {
    if (overlay || launchRevealed) {
      return;
    }
    if (searchCloseTimer.current !== null) {
      window.clearTimeout(searchCloseTimer.current);
      searchCloseTimer.current = null;
    }
    setSearchClosing(false);
    restoreFocusRef.current = activeKey;
    setLaunchError(null);
    setOverlay({ kind: "search" });
  };

  const selectCategory = (id: BigScreenCategory, focusShelf = false) => {
    setSearchQuery("");
    pendingShelfFocus.current = focusShelf;
    if (id === category) {
      if (focusShelf) {
        setLaunchWorkId(null);
        setSelectedWorkId(data.items[0]?.workId ?? null);
      }
      return;
    }
    setLaunchWorkId(null);
    setCategory(id);
    setSelectedWorkId(null);
    setLaunchError(null);
  };

  const focusCategory = (id: BigScreenCategory) => {
    setActiveKey("category-" + id);
    if (suppressCategorySelectRef.current) {
      suppressCategorySelectRef.current = false;
      return;
    }
    selectCategory(id);
  };

  const cycleCategory = (direction: -1 | 1) => {
    setSearchQuery("");
    const next = adjacentCategory(category, direction);
    if (next === category) {
      return;
    }
    const fromSidebar = Boolean(activeKey?.startsWith("category-"));
    pendingShelfFocus.current = !fromSidebar;
    setLaunchWorkId(null);
    setCategory(next);
    setSelectedWorkId(null);
    setLaunchError(null);
    const nextFocus = fromSidebar ? "category-" + next : null;
    pendingRootFocus.current = nextFocus;
    setActiveKey(nextFocus);
  };

  useEffect(() => {
    const row = rootRef.current?.querySelector<HTMLElement>(".bigscreen-shelf__row");
    if (row) {
      row.scrollLeft = 0;
    }
  }, [category, rootRef]);

  useEffect(() => {
    const key = pendingRootFocus.current;
    if (!key || overlay || launchRevealed) {
      return;
    }
    pendingRootFocus.current = null;
    const timer = window.setTimeout(() => focusKey(key), 0);
    return () => window.clearTimeout(timer);
  }, [focusKey, launchRevealed, overlay]);

  const revealLaunch = (item?: LibraryItem) => {
    const target = item ?? hero;
    if (!target || overlay) {
      return;
    }
    setSelectedWorkId(target.workId);
    setLaunchWorkId(target.workId);
    setActiveKey("hero-launch");
  };

  const dismissLaunch = () => {
    const target = launchWorkId ?? hero?.workId;
    const nextFocus = target ? "shelf-" + target : "category-" + category;
    pendingRootFocus.current = nextFocus;
    setLaunchWorkId(null);
    setActiveKey(nextFocus);
  };

  useEffect(() => {
    if (!pendingShelfFocus.current || overlay) {
      return;
    }
    const first = data.items[0];
    if (!first) {
      if (!data.loading) {
        pendingShelfFocus.current = false;
        const fallback = "category-" + category;
        const timer = window.setTimeout(() => focusKey(fallback), 0);
        return () => window.clearTimeout(timer);
      }
      return;
    }
    pendingShelfFocus.current = false;
    const timer = window.setTimeout(() => focusKey(`shelf-${first.workId}`), 0);
    return () => window.clearTimeout(timer);
  }, [category, data.items, data.loading, focusKey, overlay]);

  const closeOverlay = () => {
    if (overlay?.kind === "control") {
      if (controlCloseTimer.current !== null) {
        return;
      }
      const reduceSystemMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion || reduceSystemMotion) {
        setControlClosing(false);
        setOverlay(null);
        return;
      }
      setControlClosing(true);
      controlCloseTimer.current = window.setTimeout(() => {
        controlCloseTimer.current = null;
        setControlClosing(false);
        setOverlay(null);
      }, 240);
      return;
    }
    if (overlay?.kind === "search") {
      if (searchCloseTimer.current !== null) {
        return;
      }
      if (activeSearch) {
        const result = data.items.find((item) => item.workId === selectedWorkId) ?? data.items[0];
        if (result) {
          restoreFocusRef.current = "shelf-" + result.workId;
        } else if (!data.loading && category !== "all" && data.libraryCount > 0) {
          restoreFocusRef.current = "empty-all";
        } else {
          restoreFocusRef.current = "category-" + category;
        }
      }
      const reduceSystemMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion || reduceSystemMotion) {
        setSearchClosing(false);
        setOverlay(null);
        return;
      }
      setSearchClosing(true);
      searchCloseTimer.current = window.setTimeout(() => {
        searchCloseTimer.current = null;
        setSearchClosing(false);
        setOverlay(null);
      }, 240);
      return;
    }
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

    suppressCategorySelectRef.current = true;
    const timer = window.setTimeout(() => {
      focusKey(key);
      window.setTimeout(() => {
        suppressCategorySelectRef.current = false;
      }, 0);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      suppressCategorySelectRef.current = false;
    };
  }, [overlay, focusKey]);

  const overlayFocusKey =
    overlay?.kind === "game"
      ? menuFocusTarget
      : overlay?.kind === "search"
        ? "search-key-1"
        : overlay?.kind === "control"
          ? overlay.view === "quit"
            ? "control-quit-cancel"
            : "control-back"
          : null;

  useEffect(() => {
    if (!overlayFocusKey) {
      return;
    }
    const timer = window.setTimeout(() => focusKey(overlayFocusKey), 0);
    return () => window.clearTimeout(timer);
  }, [overlayFocusKey, focusKey]);

  useEffect(() => {
    if (!launchRevealed || overlay) {
      return;
    }
    const timer = window.setTimeout(() => focusKey("hero-launch"), 0);
    return () => window.clearTimeout(timer);
  }, [focusKey, launchRevealed, overlay]);

  useEffect(() => {
    if (overlay || activeKey || data.loading || data.error) {
      return;
    }
    const first = data.items[0];
    const target = first ? "shelf-" + first.workId : "category-recent";
    const timer = window.setTimeout(() => focusKey(target), 0);
    return () => window.clearTimeout(timer);
  }, [activeKey, data.error, data.items, data.loading, focusKey, overlay]);

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
      try {
        const outcome = await syncBangumiProgress(item.workId);
        if (outcome.status === "synced") {
          toast.success(outcome.message);
        }
      } catch (error) {
        toast.error("Bangumi 同步失败：" + String(error));
      }
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

  const toggleHints = () => {
    setBigScreenHints(!showBigScreenHints);
    closeOverlay();
  };

  const quit = async () => {
    try {
      await quitApp();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const refresh = async () => {
    await data.refetch();
    toast.success("已刷新本地库");
  };

  const pageShelf = (direction: -1 | 1) => {
    if (launchRevealed) {
      return;
    }
    const row = rootRef.current?.querySelector<HTMLElement>(".bigscreen-shelf__row");
    if (!row) {
      return;
    }
    const cards = Array.from(row.querySelectorAll<HTMLElement>(".bigscreen-card"));
    if (cards.length === 0) {
      return;
    }

    const first = cards[0];
    if (!first) {
      return;
    }
    const gap = Number.parseFloat(getComputedStyle(row).columnGap || "0") || 0;
    const step = first.getBoundingClientRect().width + gap;
    if (step <= 0) {
      return;
    }
    const perPage = Math.max(1, Math.floor((row.clientWidth + gap) / step));
    const focusedCard = (document.activeElement as HTMLElement | null)?.closest(
      ".bigscreen-card",
    ) as HTMLElement | null;
    const focusedIndex = focusedCard ? cards.indexOf(focusedCard) : -1;
    const firstVisible = cards.findIndex(
      (card) => card.offsetLeft - first.offsetLeft >= row.scrollLeft - 1,
    );
    const currentIndex = focusedIndex >= 0 ? focusedIndex : Math.max(0, firstVisible);
    const targetIndex = Math.max(0, Math.min(cards.length - 1, currentIndex + direction * perPage));
    const target = cards[targetIndex];
    if (!target) {
      return;
    }
    row.scrollTo({
      left: target.offsetLeft - first.offsetLeft,
      behavior: reduceMotion ? "auto" : "smooth",
    });

    if (focusedIndex >= 0) {
      target.focus({ preventScroll: true });
      const key = target.dataset.bigscreenFocus ?? null;
      const workId = Number(target.dataset.workId);
      setActiveKey(key);
      if (Number.isFinite(workId)) {
        setSelectedWorkId(workId);
      }
    }
  };

  const handleAction = (action: BigScreenAction) => {
    bumpCursor();
    if (searchCloseTimer.current !== null) {
      return;
    }
    if (controlCloseTimer.current !== null) {
      return;
    }
    if (action === "search") {
      if (overlay?.kind === "search") {
        closeOverlay();
      } else {
        openSearch();
      }
      return;
    }
    if (overlay?.kind === "search") {
      if (action === "backspace") {
        setSearchQuery((current) => current.slice(0, -1));
        return;
      }
      if (action === "menu") {
        setSearchQuery((current) => (current + " ").slice(0, 48));
        return;
      }
      if (action === "nextCategory") {
        setSearchQuery("");
        return;
      }
      if (
        action === "control" ||
        action === "prevPage" ||
        action === "nextPage" ||
        action === "prevCategory" ||
        action === "prevZone" ||
        action === "nextZone"
      ) {
        return;
      }
    }
    if (action === "backspace") {
      return;
    }
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
      } else if (overlay?.kind === "control" && overlay.view === "quit") {
        setOverlay({ ...overlay, view: "menu" });
      } else if (overlay) {
        closeOverlay();
      } else if (launchRevealed) {
        dismissLaunch();
      } else {
        const fallback = hero ? "shelf-" + hero.workId : "category-recent";
        focusKey(activeKey ?? fallback);
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
      } else if (
        action !== "prevZone" &&
        action !== "nextZone" &&
        action !== "prevCategory" &&
        action !== "nextCategory" &&
        action !== "prevPage" &&
        action !== "nextPage"
      ) {
        move(action);
      }
      return;
    }

    if (action === "prevCategory" || action === "nextCategory") {
      cycleCategory(action === "nextCategory" ? 1 : -1);
      return;
    }
    // While the launch action is showing, the D-pad stays on it: LB/RB is the
    // only way to change category (Tab still moves zones for keyboard users).
    if (launchRevealed) {
      if (
        action === "up" ||
        action === "down" ||
        action === "left" ||
        action === "right" ||
        action === "prevPage" ||
        action === "nextPage"
      ) {
        return;
      }
    }
    if (action === "prevZone" || action === "nextZone") {
      switchZone(action === "nextZone" ? "next" : "prev");
      return;
    }
    if (action === "prevPage" || action === "nextPage") {
      pageShelf(action === "nextPage" ? 1 : -1);
      return;
    }
    if (action === "confirm") {
      activateFocused();
      return;
    }
    move(action);
  };

  useBigScreenInput({
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

  const heroThumbnailUrl = hero ? assetUrl(hero.coverThumbPath) : null;
  const heroImageUrl = hero
    ? (assetUrl(hero.coverHeroPath) ?? assetUrl(hero.coverPath) ?? assetUrl(hero.coverThumbPath))
    : null;
  const heroGame = hero
    ? {
        ...libraryItemToGame(hero),
        coverUrl: heroImageUrl,
      }
    : null;
  const imageAccent = useCoverAccent(heroThumbnailUrl, heroGame?.cover ?? null);
  const heroPlaytime = hero
    ? formatPlaytimeSeconds(hero.playtimeSeconds ?? hero.playtimeMinutes * 60)
    : "";
  const heroRunning = hero ? runningWorkId === hero.workId : false;
  const heroBusy = hero ? busyWorkId === hero.workId : false;
  const heroEdition = hero?.catalogNo ? "目录 " + hero.catalogNo : "";
  const primaryHint = launchRevealed
    ? "启动游戏"
    : activeKey?.startsWith("shelf-")
      ? "显示启动"
      : "确认";
  const rootClass = cn(
    "bigscreen-root",
    reduceMotion && "is-reduced-motion",
    cursorHidden && "is-cursor-hidden",
    launchRevealed && "is-launch-revealed",
    !showBigScreenHints && "is-hints-hidden",
  );
  const rootStyle = { "--bs-image-accent": imageAccent } as CSSProperties;

  return (
    <div className={rootClass} ref={rootRef} style={rootStyle} data-bigscreen-skin="blush-poster">
      {heroGame ? (
        <div className="bigscreen-backdrop" aria-hidden="true">
          <div
            className="bigscreen-backdrop__ambient"
            key={"ambient-" + (hero?.workId ?? "current")}
          >
            <CoverArt work={heroGame} />
          </div>
          <div className="bigscreen-backdrop__print" key={"print-" + (hero?.workId ?? "current")}>
            <CoverArt work={heroGame} />
          </div>
        </div>
      ) : null}
      <div className="bigscreen-scrim" aria-hidden="true" />

      <header className="bigscreen-topbar">
        <div className="bigscreen-topbar__status">
          <span className="bigscreen-topbar__clock">
            <b>{clock}</b>
          </span>
        </div>
      </header>

      <main className="bigscreen-main">
        <div className="bigscreen-layout">
          <aside className="bigscreen-rail" aria-label="大屏导航">
            <div className="bigscreen-rail__brand">
              <img src="/miyu-manager.png" alt="" aria-hidden="true" />
            </div>
            <nav className="bigscreen-rail__list" aria-label="大屏分类">
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
                    onFocus={() => focusCategory(id)}
                    onClick={() => selectCategory(id)}
                  >
                    <Icon size={18} strokeWidth={1.7} />
                  </button>
                );
              })}
            </nav>
          </aside>

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
                <h1>
                  {data.libraryCount === 0
                    ? "本地库为空"
                    : activeSearch
                      ? "没有找到作品"
                      : `${categoryLabel}暂无作品`}
                </h1>
                {activeSearch ? <p>“{activeSearch}”</p> : null}
                <div className="bigscreen-state__actions">
                  {category !== "all" && data.libraryCount > 0 ? (
                    <button
                      type="button"
                      className="bigscreen-action bigscreen-action--primary"
                      data-bigscreen-focus="empty-all"
                      data-bigscreen-zone="hero"
                      tabIndex={activeKey === "empty-all" ? 0 : -1}
                      onFocus={() => setActiveKey("empty-all")}
                      onClick={() => selectCategory("all", true)}
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
                  data-enter
                  aria-label={categoryLabel + "：" + hero.title}
                  onContextMenu={(event) => handleContextMenu(event, hero)}
                >
                  <div className="bigscreen-hero__copy" key={hero.workId}>
                    <div className="bigscreen-hero__lead">
                      <div className="bigscreen-hero__main">
                        {heroEdition ? (
                          <p className="bigscreen-hero__kicker">{heroEdition}</p>
                        ) : null}
                        <h1>{hero.title}</h1>
                        {hero.originalTitle ? (
                          <p className="bigscreen-hero__original">{hero.originalTitle}</p>
                        ) : null}
                        <div className="bigscreen-hero__meta" aria-label="作品资料">
                          <span>{hero.developer || "开发商待补"}</span>
                          <span>{hero.year ?? "年份待补"}</span>
                          <span>{hero.edition || "标准版"}</span>
                          <span>{formatBytes(hero.sizeBytes)}</span>
                          <span>入库 {formatRelativeDate(hero.addedAt)}</span>
                        </div>
                        {hero.tags.length > 0 ? (
                          <div className="bigscreen-hero__tags">
                            {hero.tags.slice(0, 4).map((tag) => (
                              <span key={tag}>{tag}</span>
                            ))}
                          </div>
                        ) : null}
                        <div className="bigscreen-hero__summary">
                          <div
                            className="bigscreen-hero__summary-band"
                            style={
                              heroImageUrl
                                ? ({
                                    "--bs-summary-image": `url("${heroImageUrl}")`,
                                  } as CSSProperties)
                                : undefined
                            }
                          >
                            <span>简介</span>
                          </div>
                          <p className="bigscreen-hero__desc">{hero.description || "暂无简介"}</p>
                        </div>
                      </div>
                    </div>
                    <footer className="bigscreen-hero__footer">
                      <dl className="bigscreen-dossier" aria-label="作品记录">
                        <div className="bigscreen-dossier__item">
                          <dt>状态</dt>
                          <dd>
                            <i className={cn("bigscreen-status-dot", "is-" + hero.status)} />
                            {bigScreenStatusLabel(hero.status)}
                          </dd>
                        </div>
                        <div className="bigscreen-dossier__item">
                          <dt>累计游玩</dt>
                          <dd>{heroPlaytime}</dd>
                        </div>
                        <div className="bigscreen-dossier__item">
                          <dt>启动次数</dt>
                          <dd>
                            {hero.launchCount}
                            <small>次</small>
                          </dd>
                        </div>
                        <div className="bigscreen-dossier__item">
                          <dt>最近游玩</dt>
                          <dd>
                            {hero.lastPlayedAt ? formatRelativeDate(hero.lastPlayedAt) : "尚未启动"}
                          </dd>
                        </div>
                      </dl>
                      {launchRevealed ? (
                        <div className="bigscreen-hero__action-slot">
                          <button
                            type="button"
                            className="bigscreen-action bigscreen-action--primary bigscreen-action--launch"
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
                        </div>
                      ) : null}
                    </footer>
                  </div>
                </section>

                <section
                  className={cn("bigscreen-shelf", launchRevealed && "is-collapsed")}
                  aria-labelledby="bigscreen-shelf-title"
                  aria-hidden={launchRevealed || undefined}
                  inert={launchRevealed}
                >
                  <div className="bigscreen-shelf__inner">
                    <header className="bigscreen-shelf__head">
                      <div className="bigscreen-shelf__identity">
                        <span className="bigscreen-shelf__mark" aria-hidden="true" />
                        <h2 id="bigscreen-shelf-title">{categoryLabel}</h2>
                        <span
                          className="bigscreen-shelf__count"
                          key={`${category}-${data.items.length}`}
                        >
                          <b>{data.items.length}</b> 部作品
                        </span>
                      </div>
                    </header>
                    <div className="bigscreen-shelf__row" key={category}>
                      {data.items.map((item, index) => {
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
                            data-bigscreen-focus={launchRevealed ? undefined : key}
                            data-bigscreen-zone="shelf"
                            data-work-id={item.workId}
                            aria-current={hero.workId === item.workId ? "true" : undefined}
                            style={
                              {
                                "--bs-card-index": Math.min(index, 6),
                              } as CSSProperties
                            }
                            tabIndex={!launchRevealed && activeKey === key ? 0 : -1}
                            onFocus={() => {
                              setActiveKey(key);
                              setSelectedWorkId(item.workId);
                            }}
                            onClick={() => revealLaunch(item)}
                            onContextMenu={(event) => handleContextMenu(event, item)}
                          >
                            <CoverArt work={game} />
                          </button>
                        );
                      })}
                    </div>
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

        {showBigScreenHints ? (
          <footer className={cn("bigscreen-hint", launchRevealed && "is-launch")}>
            <div className="bigscreen-hint__keys">
              {launchRevealed ? (
                <>
                  <span>
                    <b>A</b> 启动游戏
                  </span>
                  <span>
                    <b>B</b> 收起
                  </span>
                  <span>
                    <b>Y</b> 游戏菜单
                  </span>
                  <span>
                    <b>START</b> 控制
                  </span>
                  <span>
                    <b>LB/RB</b> 分类
                  </span>
                </>
              ) : (
                <>
                  <span>
                    <b>A</b> {primaryHint}
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
                    <b>LB/RB</b> 分类
                  </span>
                  <span>
                    <b>LT/RT</b> 翻页
                  </span>
                  <span>
                    <b>SELECT</b> 搜索
                  </span>
                </>
              )}
            </div>
          </footer>
        ) : null}
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
          onOpenDetail={() => void openDesktopDetail(overlay.item)}
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

      {overlay?.kind === "control" ? (
        <BigScreenControlMenu
          activeKey={activeKey}
          closing={controlClosing}
          hintsVisible={showBigScreenHints}
          view={overlay.view}
          onFocusKey={setActiveKey}
          onRefresh={() => void refresh()}
          onToggleHints={toggleHints}
          onExitBigScreen={() => void returnMain()}
          onRequestQuit={() => setOverlay({ kind: "control", view: "quit" })}
          onCancelQuit={() => setOverlay({ kind: "control", view: "menu" })}
          onConfirmQuit={() => void quit()}
          onClose={closeOverlay}
        />
      ) : null}

      {overlay?.kind === "search" ? (
        <BigScreenSearch
          query={searchQuery}
          onQueryChange={setSearchQuery}
          closing={searchClosing}
          onClose={closeOverlay}
        />
      ) : null}
    </div>
  );
}
