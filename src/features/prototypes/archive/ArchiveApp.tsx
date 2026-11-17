import { Plus, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { WindowBar } from "../components/WindowBar";
import type { PrototypePage, Work } from "../types";
import { ArchiveDetail } from "./ArchiveDetail";
import { ArchiveHome } from "./ArchiveHome";
import { ArchiveLibrary } from "./ArchiveLibrary";
import "../archive.css";

interface ArchiveAppProps {
  page: PrototypePage;
  work: Work;
}

export function ArchiveApp({ page, work }: ArchiveAppProps) {
  const base = "/prototype/archive";

  return (
    <div className="app-window archive-root">
      <WindowBar context="游戏收藏架" />
      <header className="archive-header">
        <Link to={base} className="archive-brand" aria-label="MiyuManager 游戏收藏架首页">
          <span className="archive-brand__word">MIYU</span>
          <span className="archive-brand__copy">
            <b>GAME SHELF</b>
            <em>MiyuManager 游戏收藏</em>
          </span>
        </Link>

        <nav className="archive-nav" aria-label="主导航">
          <Link to={base} aria-current={page === "home" ? "page" : undefined}>
            首页
          </Link>
          <Link
            to={`${base}/library`}
            aria-current={page === "library" || page === "detail" ? "page" : undefined}
          >
            游戏库
          </Link>
          <button type="button">统计</button>
          <button type="button">设置</button>
        </nav>

        <div className="archive-header__actions">
          <span className="archive-open">
            <i />
            离线可用
          </span>
          <label className="archive-search">
            <Search size={13} strokeWidth={1.6} />
            <input aria-label="搜索游戏" placeholder="搜索游戏 / 会社 / 角色" />
          </label>
          <button type="button" className="archive-add">
            <Plus size={13} strokeWidth={1.7} />
            添加游戏
          </button>
        </div>
      </header>

      <div className="archive-imprint">
        <span>库中 128 部游戏</span>
        <span>本周游玩 6.4 小时</span>
        <span>最后整理 11 月 12 日</span>
      </div>

      <main className="archive-main">
        {page === "home" && <ArchiveHome />}
        {page === "library" && <ArchiveLibrary />}
        {page === "detail" && <ArchiveDetail work={work} />}
      </main>
    </div>
  );
}
