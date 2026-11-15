import { BarChart3, FolderHeart, HardDrive, Home, Library, Search, Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { WindowBar } from "../design-system/components/WindowBar";
import { useLibraryRoots, useLibrarySummary } from "../features/library/useLibrary";
import { GlobalSearchPalette } from "../features/search/GlobalSearchPalette";
import { useAppearance } from "./useAppearance";
import "./app-shell.css";

const navItems = [
  { to: "/", label: "首页", icon: Home, end: true },
  { to: "/library", label: "游戏库", icon: Library },
  { to: "/collections", label: "收藏集", icon: FolderHeart },
  { to: "/stats", label: "统计", icon: BarChart3 },
  { to: "/settings", label: "设置", icon: Settings2 },
];

const pageNames: Record<string, string> = {
  "/": "首页",
  "/library": "游戏库",
  "/collections": "收藏集",
  "/stats": "统计",
  "/settings": "设置",
};

export function AppShell() {
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const density = useAppearance((state) => state.density);
  const theme = useAppearance((state) => state.theme);
  const reduceMotion = useAppearance((state) => state.reduceMotion);
  const summary = useLibrarySummary();
  const roots = useLibraryRoots();

  useEffect(() => {
    document.documentElement.dataset.density = density;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.reduceMotion = String(reduceMotion);
  }, [density, reduceMotion, theme]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (location.pathname.startsWith("/work/") || pageNames[location.pathname]) {
      window.localStorage.setItem("miyu-last-route", location.pathname + location.search);
    }
  }, [location.pathname, location.search]);

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
      <WindowBar context={pageName} />
      <div className="app-shell">
        <aside className="app-rail">
          <NavLink to="/" className="app-brand" aria-label="MiyuManager 首页">
            <span className="app-brand__mark" aria-hidden="true">
              M
            </span>
            <span className="app-brand__copy">
              <b>MiyuManager</b>
              <small>GALGAME ARCHIVE</small>
            </span>
          </NavLink>

          <p className="app-rail__label">资料库</p>
          <nav className="app-nav" aria-label="主导航">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => (isActive ? "is-active" : "")}
                >
                  <Icon size={16} strokeWidth={1.5} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>

          <div className="app-rail__footer">
            <div className="app-rail__stats">
              <div>
                <b>{summary.data?.total ?? "—"}</b>
                <span>部作品</span>
              </div>
              <div>
                <b>{roots.data?.length ?? "—"}</b>
                <span>个目录</span>
              </div>
            </div>
            <div className="app-rail__local">
              <i aria-hidden="true" />
              <span>本地数据</span>
            </div>
          </div>
        </aside>

        <main className="app-main" id="main-content" tabIndex={-1}>
          <header className="app-topbar">
            <button
              ref={searchTriggerRef}
              type="button"
              className="app-search"
              onClick={() => setSearchOpen(true)}
              aria-label="打开全局搜索"
            >
              <Search size={14} strokeWidth={1.6} />
              <span className="app-search__label">搜索游戏、别名、标签或收藏集</span>
              <kbd>Ctrl K</kbd>
            </button>
            <div className="app-topbar__meta" aria-label="本地游戏库状态">
              <HardDrive size={14} strokeWidth={1.6} />
              <span>{summary.data?.total ?? "—"} 部作品</span>
              <i aria-hidden="true" />
              <span>离线可用</span>
            </div>
          </header>

          <div className="app-page">
            <Outlet />
          </div>
        </main>
      </div>
      <GlobalSearchPalette
        open={searchOpen}
        onOpenChange={(open) => {
          setSearchOpen(open);
          if (!open) {
            window.requestAnimationFrame(() => searchTriggerRef.current?.focus());
          }
        }}
      />
    </div>
  );
}
