import { ChevronDown, Grid2X2, List, Plus, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../../design-system/components/Button";
import { CoverArt } from "../../design-system/components/CoverArt";
import { EmptyState } from "../../design-system/components/EmptyState";
import { Tag } from "../../design-system/components/Tag";
import type { GameStatus } from "../../lib/game-data";
import { games, statusLabels } from "../../lib/game-data";
import { cn } from "../../lib/cn";
import "./library.css";

type Filter = "all" | GameStatus;
type ViewMode = "grid" | "list";

const filters: { id: Filter; label: string; count: number }[] = [
  { id: "all", label: "全部", count: 128 },
  { id: "playing", label: "在玩", count: 34 },
  { id: "queued", label: "想玩", count: 51 },
  { id: "finished", label: "已通关", count: 38 },
  { id: "paused", label: "搁置", count: 5 },
];

export function LibraryPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const normalizedQuery = query.trim().toLowerCase();
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<ViewMode>("grid");

  const visible = games.filter((game) => {
    const matchesFilter = filter === "all" || game.status === filter;
    const haystack =
      `${game.title} ${game.originalTitle} ${game.developer} ${game.tags.join(" ")}`.toLowerCase();
    return matchesFilter && (!normalizedQuery || haystack.includes(normalizedQuery));
  });

  return (
    <div className="library-page">
      <header className="library-head">
        <div>
          <p className="app-kicker">
            <span className="app-status-dot" />
            游戏库 / GAME LIBRARY
          </p>
          <h1>游戏库</h1>
          <p className="library-head__summary">
            128 部游戏 · 34 部在玩 · 本周 6.4 小时
            {query ? ` · 搜索“${query}”` : ""}
          </p>
        </div>
        <div className="library-head__actions">
          <Button variant="secondary" size="sm">
            <SlidersHorizontal size={14} strokeWidth={1.5} />
            筛选
          </Button>
          <Button variant="primary" size="sm">
            <Plus size={14} strokeWidth={1.8} />
            添加目录
          </Button>
        </div>
      </header>

      <div className="library-toolbar">
        <div className="library-filters" role="group" aria-label="游玩状态筛选">
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
              <span>{item.count}</span>
            </button>
          ))}
        </div>
        <div className="library-view-tools">
          <button type="button" className="library-sort">
            按最近启动
            <ChevronDown size={13} strokeWidth={1.6} />
          </button>
          <span className="library-view-toggle">
            <button
              type="button"
              aria-label="封面视图"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              <Grid2X2 size={14} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              aria-label="列表视图"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <List size={14} strokeWidth={1.5} />
            </button>
          </span>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="没有找到游戏"
          description="换一个标题、会社或标签，或者清除当前筛选条件。"
          action={
            <Button variant="secondary" size="sm" onClick={() => setFilter("all")}>
              查看全部游戏
            </Button>
          }
        />
      ) : view === "grid" ? (
        <div className="library-grid">
          {visible.map((game) => (
            <Link to={`/work/${game.id}`} className="library-card" key={game.id}>
              <div className="library-card__cover">
                <CoverArt work={game} />
                <span className={cn("library-status", `library-status--${game.status}`)}>
                  {statusLabels[game.status]}
                </span>
              </div>
              <div className="library-card__meta">
                <h3>{game.title}</h3>
                <p>{game.originalTitle}</p>
                <span>
                  {game.developer} <i>·</i> {game.year}
                </span>
                <span className="library-card__tech">
                  {game.engine} · {game.ageRating}
                </span>
                <span className="library-card__last">
                  {game.playtime} · 上次 {game.lastPlayed}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="library-list" role="list">
          {visible.map((game) => (
            <Link to={`/work/${game.id}`} className="library-row" role="listitem" key={game.id}>
              <CoverArt work={game} />
              <div className="library-row__title">
                <h3>{game.title}</h3>
                <p>{game.originalTitle}</p>
              </div>
              <span>{game.developer}</span>
              <span>{game.engine}</span>
              <span>{game.playtime}</span>
              <span>上次 {game.lastPlayed}</span>
              <Tag
                tone={
                  game.status === "playing"
                    ? "status"
                    : game.status === "finished"
                      ? "data"
                      : "neutral"
                }
              >
                {statusLabels[game.status]}
              </Tag>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
