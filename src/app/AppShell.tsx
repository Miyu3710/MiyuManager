import { BarChart3, Bell, Home, Library, Search, Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button } from "../design-system/components/Button";
import { WindowBar } from "../design-system/components/WindowBar";
import { useAppearance } from "./useAppearance";
import "./app-shell.css";

const navItems = [
  { to: "/", label: "首页", index: "01", icon: Home, end: true },
  { to: "/library", label: "游戏库", index: "02", icon: Library },
  { to: "/stats", label: "统计", index: "03", icon: BarChart3 },
  { to: "/settings", label: "设置", index: "04", icon: Settings2 },
];

const pageNames: Record<string, string> = {
  "/": "首页",
  "/library": "游戏库",
  "/stats": "统计",
  "/settings": "设置",
};

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const density = useAppearance((state) => state.density);
  const theme = useAppearance((state) => state.theme);
  const reduceMotion = useAppearance((state) => state.reduceMotion);

  useEffect(() => {
    document.documentElement.dataset.density = density;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.reduceMotion = String(reduceMotion);
  }, [density, reduceMotion, theme]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const pageName = location.pathname.startsWith("/work/")
    ? "游戏详情"
    : (pageNames[location.pathname] ?? "首页");

  return (
    <div className="app-window app-root">
      <WindowBar context="本地游戏库" />
      <div className="app-shell">
        <aside className="app-rail">
          <NavLink to="/" className="app-brand" aria-label="MiyuManager 首页">
            <span className="app-brand__mark">M</span>
            <span className="app-brand__copy">
              <b>MIYU</b>
              <small>本地游戏库</small>
            </span>
          </NavLink>

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
                  <em>{item.index}</em>
                </NavLink>
              );
            })}
          </nav>

          <div className="app-rail__footer">
            <p>
              <span>库中</span>
              <b>128</b>
              <span>部游戏</span>
            </p>
            <p>
              <span>本周</span>
              <b>6.4</b>
              <span>小时</span>
            </p>
            <div className="app-rail__profile">
              <span>R</span>
              <div>
                <b>Rin</b>
                <small>本地资料库</small>
              </div>
            </div>
          </div>
        </aside>

        <main className="app-main">
          <header className="app-topbar">
            <div className="app-crumb">
              <span>本地游戏库</span>
              <span>/</span>
              <b>{pageName}</b>
            </div>
            <form
              className="app-search"
              onSubmit={(event) => {
                event.preventDefault();
                const trimmed = query.trim();
                navigate(trimmed ? `/library?q=${encodeURIComponent(trimmed)}` : "/library");
              }}
            >
              <Search size={14} strokeWidth={1.6} />
              <input
                ref={searchRef}
                aria-label="搜索游戏"
                placeholder="搜索游戏、会社、角色"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
              <kbd>Ctrl K</kbd>
            </form>
            <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
              添加目录
            </Button>
            <button type="button" className="app-icon-button" aria-label="通知">
              <Bell size={16} strokeWidth={1.5} />
              <i />
            </button>
            <span className="app-avatar">R</span>
          </header>

          <div className="app-page">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
