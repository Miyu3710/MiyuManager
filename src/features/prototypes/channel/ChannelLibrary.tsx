import { ChevronDown, LayoutGrid, List, Play, Search, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { CoverArt } from "../../../design-system/components/CoverArt";
import { statusLabels, works } from "../data";
import type { PlayStatus } from "../types";

type Filter = "all" | PlayStatus;

const filters: { id: Filter; label: string; count: number }[] = [
  { id: "all", label: "全部游戏", count: 128 },
  { id: "reading", label: "在玩", count: 34 },
  { id: "queued", label: "想玩", count: 51 },
  { id: "finished", label: "已通关", count: 38 },
  { id: "paused", label: "搁置", count: 5 },
];

export function ChannelLibrary() {
  const [filter, setFilter] = useState<Filter>("all");
  const visible = filter === "all" ? works : works.filter((work) => work.status === filter);

  return (
    <div className="channel-library">
      <header className="channel-library__head">
        <div>
          <p className="channel-kicker">GAME LIBRARY / 128 GAMES</p>
          <h1>游戏库</h1>
          <p>按入库时间排序 · 全部为本地游戏</p>
        </div>
        <div className="channel-library__tools">
          <label className="channel-search">
            <Search size={12} strokeWidth={1.6} />
            <input aria-label="搜索游戏" placeholder="搜索游戏、会社、角色" />
          </label>
          <button type="button" className="channel-tool">
            <SlidersHorizontal size={12} strokeWidth={1.6} />
            筛选
          </button>
          <button type="button" className="channel-tool">
            <ChevronDown size={12} strokeWidth={1.6} />
            按最近启动
          </button>
          <span className="channel-view">
            <button type="button" aria-label="封面视图" aria-pressed="true">
              <LayoutGrid size={13} strokeWidth={1.5} />
            </button>
            <button type="button" aria-label="列表视图">
              <List size={13} strokeWidth={1.5} />
            </button>
          </span>
        </div>
      </header>

      <div className="channel-tabs" role="group" aria-label="游戏状态筛选">
        {filters.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
            <span>{item.count}</span>
          </button>
        ))}
      </div>

      <div className="channel-grid">
        {visible.map((work, index) => (
          <Link to={`/prototype/channel/work/${work.id}`} className="channel-tile" key={work.id}>
            <div className="channel-tile__still">
              <div className="channel-tile__backdrop" aria-hidden="true">
                <CoverArt work={work} />
              </div>
              <div className="channel-tile__poster">
                <CoverArt work={work} />
              </div>
              <span className="channel-tile__no">{String(index + 1).padStart(2, "0")}</span>
              <span className={`channel-tile__status channel-tile__status--${work.status}`}>
                {statusLabels[work.status]}
              </span>
              <div className="channel-tile__osd">
                <span>上次游玩 · {work.lastPlayed}</span>
                <b>{work.title}</b>
              </div>
              <span className="channel-tile__play">
                <Play size={13} fill="currentColor" strokeWidth={0} />
              </span>
            </div>
            <div className="channel-tile__copy">
              <p>{work.originalTitle}</p>
              <div className="channel-tile__meta">
                <span>{work.developer}</span>
                <span>{work.engine}</span>
                <span>{work.year}</span>
                <em>{work.playtime}</em>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="channel-empty">
          <p>这个分类暂时没有游戏。</p>
          <button type="button" onClick={() => setFilter("all")}>
            返回全部游戏
          </button>
        </div>
      ) : null}
    </div>
  );
}
