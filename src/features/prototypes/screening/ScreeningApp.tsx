import { BarChart3, Bell, Home, Library, Search, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";
import { WindowBar } from "../components/WindowBar";
import type { PrototypePage, Work } from "../types";
import { ScreeningDetail } from "./ScreeningDetail";
import { ScreeningHome } from "./ScreeningHome";
import { ScreeningLibrary } from "./ScreeningLibrary";
import "../screening.css";

interface ScreeningAppProps {
  page: PrototypePage;
  work: Work;
}

const pageNames: Record<PrototypePage, string> = {
  home: "首页",
  library: "游戏库",
  detail: "游戏详情",
};

export function ScreeningApp({ page, work }: ScreeningAppProps) {
  const base = "/prototype/screening";

  return (
    <div className="app-window screening-root">
      <WindowBar context="游戏启动器" />
      <div className="screening-shell">
        <aside className="screening-rail">
          <Link to={base} className="screening-brand" aria-label="MiyuManager 首页">
            <img
              className="screening-brand__mark"
              src="/miyu-manager.png"
              alt=""
              aria-hidden="true"
            />
            <span className="screening-brand__copy">
              <b>MIYU</b>
              <small>游戏启动器</small>
            </span>
          </Link>

          <nav className="screening-nav" aria-label="主导航">
            <Link to={base} aria-current={page === "home" ? "page" : undefined}>
              <Home size={16} strokeWidth={1.5} />
              <span>首页</span>
              <em>01</em>
            </Link>
            <Link
              to={`${base}/library`}
              aria-current={page === "library" || page === "detail" ? "page" : undefined}
            >
              <Library size={16} strokeWidth={1.5} />
              <span>游戏库</span>
              <em>02</em>
            </Link>
            <button type="button">
              <BarChart3 size={16} strokeWidth={1.5} />
              <span>统计</span>
              <em>03</em>
            </button>
            <button type="button">
              <Settings2 size={16} strokeWidth={1.5} />
              <span>设置</span>
              <em>04</em>
            </button>
          </nav>

          <div className="screening-rail__footer">
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
            <div className="screening-rail__profile">
              <span>R</span>
              <div>
                <b>Rin</b>
                <small>本地游戏库</small>
              </div>
            </div>
          </div>
        </aside>

        <main className="screening-main">
          <header className="screening-topbar">
            <div className="screening-crumb">
              <span>游戏启动器</span>
              <span>/</span>
              <b>{pageNames[page]}</b>
            </div>
            <label className="screening-search">
              <Search size={14} strokeWidth={1.6} />
              <input aria-label="搜索游戏" placeholder="搜索游戏、会社、角色" />
              <kbd>Ctrl K</kbd>
            </label>
            <button type="button" className="screening-icon" aria-label="通知">
              <Bell size={16} strokeWidth={1.5} />
              <i />
            </button>
            <span className="screening-avatar">R</span>
          </header>

          <div className="screening-page">
            {page === "home" && <ScreeningHome />}
            {page === "library" && <ScreeningLibrary />}
            {page === "detail" && <ScreeningDetail work={work} />}
          </div>
        </main>
      </div>
    </div>
  );
}
