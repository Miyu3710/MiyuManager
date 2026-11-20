import {
  ArrowLeft,
  BarChart3,
  ArrowUpRight,
  FolderHeart,
  Home,
  Images,
  Library,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
} from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { WindowBar } from "../design-system/components/WindowBar";
import { CoverArt } from "../design-system/components/CoverArt";
import { Hint } from "../design-system/components/Hint";
import {
  useLibraryRoots,
  useLibrarySummary,
  useRecentPlayed,
} from "../features/library/useLibrary";
import { GlobalSearchPalette } from "../features/search/GlobalSearchPalette";
import { getBigScreenState, openBigScreen } from "../lib/bigscreen-api";
import { formatRelativeDate } from "../lib/format";
import { libraryItemToGame } from "../lib/library-api";
import { workLinkState, workOriginForPath } from "../lib/work-navigation";
import { GlobalContextMenu } from "./GlobalContextMenu";
import { HOME_SEARCH_FOCUS_EVENT } from "./global-search-events";
import { useAppearance } from "./useAppearance";
import { usePreferences } from "./usePreferences";
import "./app-shell.css";

const navGroups = [
  {
    label: "浏览",
    items: [
      { to: "/", label: "首页", icon: Home, end: true },
      { to: "/library", label: "游戏库", icon: Library },
      { to: "/screenshots", label: "图库", icon: Images },
    ],
  },
  {
    label: "整理",
    items: [
      { to: "/collections", label: "收藏集", icon: FolderHeart },
      { to: "/stats", label: "统计", icon: BarChart3 },
    ],
  },
];

const pageNames: Record<string, string> = {
  "/": "首页",
  "/library": "游戏库",
  "/screenshots": "图库",
  "/collections": "收藏集",
  "/stats": "统计",
  "/settings": "设置",
};

function NavItem({
  to,
  label,
  icon: Icon,
  end,
  reduceMotion,
  collapsed,
}: {
  to: string;
  label: string;
  icon: typeof Home;
  end?: boolean;
  reduceMotion: boolean;
  collapsed: boolean;
}) {
  const item = (
    <NavLink to={to} end={end} className="app-nav__item">
      {({ isActive }) => (
        <>
          <span className="app-nav__surface" aria-hidden="true">
            {isActive ? (
              <motion.span
                className="app-nav__active"
                layoutId="app-nav-active"
                transition={
                  reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 460, damping: 38 }
                }
              />
            ) : null}
          </span>
          <Icon className="app-nav__icon" size={21} strokeWidth={1.85} />
          <span className="app-nav__label">{label}</span>
          <span className="app-nav__pip" aria-hidden="true" />
        </>
      )}
    </NavLink>
  );

  return (
    <Hint label={label} side="right" sideOffset={12} disabled={!collapsed}>
      {item}
    </Hint>
  );
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const searchReturnFocusRef = useRef<HTMLElement | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const previousPathnameRef = useRef(location.pathname);
  const bigScreenOpeningRef = useRef(false);
  const density = useAppearance((state) => state.density);
  const contentWidth = useAppearance((state) => state.contentWidth);
  const theme = useAppearance((state) => state.theme);
  const reduceMotion = useAppearance((state) => state.reduceMotion);
  const railCollapsed = useAppearance((state) => state.railCollapsed);
  const toggleRail = useAppearance((state) => state.toggleRail);
  const prefersReducedMotion = useReducedMotion();
  const summary = useLibrarySummary();
  const roots = useLibraryRoots();
  const recent = useRecentPlayed(1);
  const preferences = usePreferences();
  const motionOff = reduceMotion || Boolean(prefersReducedMotion);
  const recentItem = recent.data?.items[0] ?? null;

  const openSearch = useCallback(() => {
    searchReturnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSearchOpen(true);
  }, []);

  const openBigScreenMode = useCallback(async () => {
    if (bigScreenOpeningRef.current) {
      return;
    }
    if (!isTauri()) {
      navigate("/big-screen");
      return;
    }
    bigScreenOpeningRef.current = true;
    try {
      const state = await getBigScreenState();
      const opened = await openBigScreen(state.display ?? 0);
      if (opened.message) {
        toast(opened.message);
      }
      toast.success("已打开大屏模式");
    } catch (error) {
      toast.error(String(error));
    } finally {
      bigScreenOpeningRef.current = false;
    }
  }, [navigate]);

  const goBack = useCallback(() => {
    const historyIndex = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (historyIndex > 0) {
      navigate(-1);
      return;
    }
    navigate("/");
  }, [navigate]);
  const historyIndex = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  const canGoBack = historyIndex > 0 || location.pathname !== "/";

  useEffect(() => {
    document.documentElement.dataset.density = density;
    document.documentElement.dataset.contentWidth = contentWidth;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.reduceMotion = String(reduceMotion);
  }, [contentWidth, density, reduceMotion, theme]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (location.pathname === "/") {
          window.dispatchEvent(new Event(HOME_SEARCH_FOCUS_EVENT));
        } else {
          openSearch();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [location.pathname, openSearch]);

  useEffect(() => {
    if (location.pathname.startsWith("/work/") || pageNames[location.pathname]) {
      window.localStorage.setItem("miyu-last-route", location.pathname + location.search);
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    const pathnameChanged = previousPathnameRef.current !== location.pathname;
    previousPathnameRef.current = location.pathname;
    if (!pathnameChanged) {
      return;
    }
    const hasDeepLink = new URLSearchParams(location.search).has("focus") || Boolean(location.hash);
    if (hasDeepLink) {
      return;
    }
    const page = pageRef.current;
    if (page) {
      if (typeof page.scrollTo === "function") {
        page.scrollTo({ top: 0 });
      } else {
        page.scrollTop = 0;
      }
    }
  }, [location.hash, location.pathname, location.search]);

  const pageName = location.pathname.startsWith("/work/")
    ? "游戏详情"
    : location.pathname.startsWith("/collections/")
      ? "收藏集"
      : (pageNames[location.pathname] ?? "首页");

  return (
    <div className="app-window app-root">
      <a className="app-skip-link" href="#main-content">
        跳到主要内容
      </a>
      <WindowBar
        context={pageName}
        closeBehavior={preferences.data?.closeBehavior ?? "tray"}
        onOpenBigScreen={() => void openBigScreenMode()}
      />
      <div className="app-shell">
        <aside className={railCollapsed ? "app-rail is-collapsed" : "app-rail"} id="app-rail">
          <div className="app-rail__brand-row">
            <Hint label="返回" side="right" sideOffset={12} disabled={!railCollapsed}>
              <button type="button" className="app-rail__back" onClick={goBack} aria-label="返回">
                <ArrowLeft size={19} strokeWidth={1.9} />
                <span>返回</span>
              </button>
            </Hint>
          </div>

          <nav className="app-nav" aria-label="主导航">
            {navGroups.map((group) => (
              <div className="app-nav__group" key={group.label}>
                <p className="app-rail__label">{group.label}</p>
                {group.items.map((item) => (
                  <NavItem
                    key={item.to}
                    {...item}
                    reduceMotion={motionOff}
                    collapsed={railCollapsed}
                  />
                ))}
              </div>
            ))}
          </nav>

          <div className="app-rail__bottom">
            {recentItem ? (
              <div className="app-rail__resume">
                <p className="app-rail__resume-label">最近游玩</p>
                <Link
                  to={"/work/" + recentItem.workId}
                  state={workLinkState(workOriginForPath(location))}
                  className="app-rail__resume-card"
                >
                  <span className="app-rail__resume-cover">
                    <CoverArt work={libraryItemToGame(recentItem)} />
                  </span>
                  <span className="app-rail__resume-copy">
                    <b>{recentItem.title}</b>
                    <small>
                      {recentItem.lastPlayedAt
                        ? formatRelativeDate(recentItem.lastPlayedAt)
                        : "尚未启动"}
                    </small>
                  </span>
                  <ArrowUpRight size={13} strokeWidth={1.8} />
                </Link>
              </div>
            ) : null}

            <div className="app-rail__footer">
              <div className="app-rail__stats">
                <div>
                  <span>馆藏</span>
                  <b>{summary.data?.total ?? "—"}</b>
                </div>
                <div>
                  <span>目录</span>
                  <b>{roots.data?.length ?? "—"}</b>
                </div>
              </div>
              <Hint
                label={railCollapsed ? "展开侧栏" : "收起侧栏"}
                side="right"
                sideOffset={12}
                disabled={!railCollapsed}
              >
                <button
                  type="button"
                  className="app-rail__collapse"
                  onClick={toggleRail}
                  aria-controls="app-rail"
                  aria-expanded={!railCollapsed}
                >
                  {railCollapsed ? (
                    <PanelLeftOpen size={20} strokeWidth={1.85} />
                  ) : (
                    <PanelLeftClose size={20} strokeWidth={1.85} />
                  )}
                  <span>{railCollapsed ? "展开侧栏" : "收起侧栏"}</span>
                </button>
              </Hint>
              <Hint label="设置" side="right" sideOffset={12} disabled={!railCollapsed}>
                <NavLink to="/settings" className="app-rail__settings">
                  {({ isActive }) => (
                    <>
                      <Settings2 size={20} strokeWidth={1.85} />
                      <span>设置</span>
                      <i className={isActive ? "is-active" : ""} aria-hidden="true" />
                    </>
                  )}
                </NavLink>
              </Hint>
            </div>
          </div>
        </aside>

        <main className="app-main" id="main-content" tabIndex={-1}>
          <div className="app-page" ref={pageRef}>
            <motion.div
              className="app-page__view"
              key={location.pathname}
              initial={motionOff ? false : { opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            >
              <Outlet />
            </motion.div>
          </div>
        </main>
      </div>
      <GlobalSearchPalette
        open={searchOpen}
        onOpenChange={(open) => {
          setSearchOpen(open);
          if (!open) {
            window.requestAnimationFrame(() => searchReturnFocusRef.current?.focus());
          }
        }}
      />
      <GlobalContextMenu
        key={location.pathname + location.search}
        canGoBack={canGoBack}
        onBack={goBack}
        onSearch={openSearch}
      />
    </div>
  );
}
