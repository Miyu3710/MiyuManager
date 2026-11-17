import { Search } from "lucide-react";
import { Link } from "react-router-dom";
import { WindowBar } from "../components/WindowBar";
import type { PrototypePage, Work } from "../types";
import { ChannelDetail } from "./ChannelDetail";
import { ChannelHome } from "./ChannelHome";
import { ChannelLibrary } from "./ChannelLibrary";
import "../channel.css";

interface ChannelAppProps {
  page: PrototypePage;
  work: Work;
}

export function ChannelApp({ page, work }: ChannelAppProps) {
  const base = "/prototype/channel";

  return (
    <div className="app-window channel-root">
      <WindowBar context="游玩频道" />
      <header className="channel-header">
        <Link to={base} className="channel-brand" aria-label="MiyuManager 深夜频道首页">
          <span className="channel-brand__ch">CH 04</span>
          <span className="channel-brand__word">MIYU</span>
        </Link>
        <nav className="channel-nav" aria-label="主导航">
          <Link to={base} aria-current={page === "home" ? "page" : undefined}>
            首页
          </Link>
          <Link
            to={`${base}/library`}
            aria-current={page === "library" || page === "detail" ? "page" : undefined}
          >
            游戏库
          </Link>
          <button type="button">游玩记录</button>
          <button type="button">设置</button>
        </nav>
        <div className="channel-status">
          <span className="channel-live">
            <i />
            LOCAL
          </span>
          <time>23:18</time>
          <button type="button" className="channel-search-button" aria-label="搜索游戏">
            <Search size={14} strokeWidth={1.5} />
          </button>
        </div>
      </header>
      <div className="channel-ticker">
        <span>LAST PLAYED</span>
        <p>月影工房 · 昨晚 23:18</p>
        <span className="channel-ticker__spacer" />
        <span>GALGAME CHANNEL · 本周游玩 6.4 小时</span>
        <span className="channel-ticker__signal" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
      </div>

      <main className="channel-main">
        {page === "home" && <ChannelHome />}
        {page === "library" && <ChannelLibrary />}
        {page === "detail" && <ChannelDetail work={work} />}
      </main>
    </div>
  );
}
