import { ChevronDown, Grid2X2, List, Plus, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { CoverArt } from "../../../design-system/components/CoverArt";
import { statusLabels, works } from "../data";
import type { PlayStatus } from "../types";

type Filter = "all" | PlayStatus;

const filters: { id: Filter; label: string; count: number }[] = [
  { id: "all", label: "全部", count: 128 },
  { id: "reading", label: "在玩", count: 34 },
  { id: "queued", label: "想玩", count: 51 },
  { id: "finished", label: "已通关", count: 38 },
  { id: "paused", label: "搁置", count: 5 },
];

export function ScreeningLibrary() {
  const [filter, setFilter] = useState<Filter>("all");
  const visible = filter === "all" ? works : works.filter((work) => work.status === filter);

  return (
    <div className="screening-library">
      <header className="screening-library__head">
        <div>
          <p className="screening-kicker">
            <span className="status-dot" />
            游戏库 / GAME LIBRARY
          </p>
          <h1>游戏库</h1>
          <p className="screening-library__summary">128 部游戏 · 34 部在玩 · 本周 6.4 小时</p>
        </div>
        <div className="screening-library__actions">
          <button type="button" className="screening-button screening-button--quiet">
            <SlidersHorizontal size={14} strokeWidth={1.5} />
            筛选
          </button>
          <button
            type="button"
            className="screening-button screening-button--primary screening-button--small"
          >
            <Plus size={14} strokeWidth={1.8} />
            添加目录
          </button>
        </div>
      </header>

      <div className="screening-library__toolbar">
        <div className="screening-filter" role="group" aria-label="游玩状态筛选">
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
        <div className="screening-library__view">
          <button type="button" className="screening-sort">
            按最近游玩
            <ChevronDown size={13} strokeWidth={1.6} />
          </button>
          <span className="screening-view-toggle">
            <button type="button" aria-label="封面视图" aria-pressed="true">
              <Grid2X2 size={14} strokeWidth={1.5} />
            </button>
            <button type="button" aria-label="列表视图">
              <List size={14} strokeWidth={1.5} />
            </button>
          </span>
        </div>
      </div>

      <div className="screening-grid">
        {visible.map((work) => (
          <Link
            to={`/prototype/screening/work/${work.id}`}
            className="screening-grid__card"
            key={work.id}
          >
            <div className="screening-grid__cover">
              <CoverArt work={work} />
              <span className={`screening-status screening-status--${work.status}`}>
                {statusLabels[work.status]}
              </span>
            </div>
            <div className="screening-grid__meta">
              <h3>{work.title}</h3>
              <p>{work.originalTitle}</p>
              <span>
                {work.developer} <i>·</i> {work.year}
              </span>
              <span className="screening-grid__tech">
                {work.engine} · {work.ageRating}
              </span>
              <span className="screening-grid__last">
                {work.playtime} · 上次 {work.lastPlayed}
              </span>
            </div>
          </Link>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="screening-empty">
          <p>这个分类里还没有游戏。</p>
          <button type="button" onClick={() => setFilter("all")}>
            查看全部游戏
          </button>
        </div>
      ) : null}
    </div>
  );
}
