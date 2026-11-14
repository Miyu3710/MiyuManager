import { ChevronDown, Grid2X2, List, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { CoverArt } from "../../../design-system/components/CoverArt";
import { statusLabels, works } from "../data";
import type { PlayStatus } from "../types";

type Filter = "all" | PlayStatus;

const statusFilters: { id: Filter; label: string; count: number }[] = [
  { id: "all", label: "全部游戏", count: 128 },
  { id: "reading", label: "在玩", count: 34 },
  { id: "queued", label: "想玩", count: 51 },
  { id: "finished", label: "已通关", count: 38 },
  { id: "paused", label: "搁置", count: 5 },
];

export function ArchiveLibrary() {
  const [filter, setFilter] = useState<Filter>("all");
  const visible = filter === "all" ? works : works.filter((work) => work.status === filter);

  return (
    <div className="archive-library">
      <header className="archive-page-head">
        <div>
          <p className="archive-kicker">游戏库 / GAME LIBRARY</p>
          <h1>游戏库</h1>
          <p>128 部游戏。按最近整理排序，当前显示 {visible.length} 条。</p>
        </div>
        <div className="archive-view">
          <button type="button" aria-pressed="true">
            <Grid2X2 size={13} strokeWidth={1.5} />
            封面
          </button>
          <button type="button" aria-pressed="false">
            <List size={13} strokeWidth={1.5} />
            目录
          </button>
        </div>
      </header>

      <div className="archive-library__layout">
        <aside className="archive-filter-panel">
          <div className="archive-filter-group">
            <header>
              <h2>游玩状态</h2>
              <SlidersHorizontal size={12} strokeWidth={1.5} />
            </header>
            {statusFilters.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
              >
                <span>{item.label}</span>
                <em>{item.count}</em>
              </button>
            ))}
          </div>
          <div className="archive-filter-group">
            <header>
              <h2>发售年份</h2>
            </header>
            <button type="button">
              <span>2025</span>
              <em>8</em>
            </button>
            <button type="button">
              <span>2024</span>
              <em>21</em>
            </button>
            <button type="button">
              <span>2023</span>
              <em>17</em>
            </button>
            <button type="button">
              <span>2022 及更早</span>
              <em>82</em>
            </button>
          </div>
          <div className="archive-filter-note">
            <span>库说明</span>
            <p>按工作目录、可执行文件和来源记录去重。重复条目会归入同一作品。</p>
          </div>
        </aside>

        <section className="archive-catalog">
          <div className="archive-catalog__bar">
            <span>
              显示 {visible.length} / 128
              <i>·</i>
              全部为本地游戏
            </span>
            <button type="button">
              按最近启动
              <ChevronDown size={12} strokeWidth={1.6} />
            </button>
          </div>
          <div className="archive-catalog__grid">
            {visible.map((work) => (
              <Link
                to={`/prototype/archive/work/${work.id}`}
                className="archive-book"
                key={work.id}
              >
                <div className="archive-book__object">
                  <CoverArt work={work} />
                  <span className="archive-book__no">{work.catalogNo}</span>
                </div>
                <div className="archive-book__meta">
                  <div className="archive-book__statusline">
                    <span className={`archive-item-status archive-item-status--${work.status}`}>
                      {statusLabels[work.status]}
                    </span>
                    <em>{work.playtime}</em>
                  </div>
                  <h3>{work.title}</h3>
                  <p>{work.originalTitle}</p>
                  <span className="archive-book__credit">
                    {work.developer} · {work.year}
                  </span>
                  <span className="archive-book__tech">
                    {work.engine} · {work.ageRating}
                  </span>
                  <span className="archive-book__last">上次 {work.lastPlayed}</span>
                </div>
              </Link>
            ))}
          </div>

          {visible.length === 0 ? (
            <div className="archive-empty">
              <p>这个分类下没有游戏。</p>
              <button type="button" onClick={() => setFilter("all")}>
                返回全部游戏
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
