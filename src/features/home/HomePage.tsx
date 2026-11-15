import { FolderHeart, FolderPlus, Library, ListPlus, Play, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../../design-system/components/Button";
import { CoverArt } from "../../design-system/components/CoverArt";
import { EmptyState } from "../../design-system/components/EmptyState";
import { Tag } from "../../design-system/components/Tag";
import { formatBytes, formatPlaytimeSeconds, formatRelativeDate } from "../../lib/format";
import { statusLabels } from "../../lib/game-data";
import { libraryItemToGame, startWork } from "../../lib/library-api";
import type { LibraryItem } from "../../lib/library-types";
import {
  useFavoriteGames,
  useInvalidateLibrary,
  useLibrarySummary,
  useQueuedGames,
  useRecentAdded,
  useRecentPlayed,
  useStats,
} from "../library/useLibrary";
import "./home.css";

function WorkTile({ item, compact = false }: { item: LibraryItem; compact?: boolean }) {
  const game = libraryItemToGame(item);
  const playtimeSeconds = item.playtimeSeconds ?? item.playtimeMinutes * 60;
  const playtimeLabel =
    playtimeSeconds > 0 ? formatPlaytimeSeconds(playtimeSeconds) : "尚未记录时长";
  return (
    <Link
      to={"/work/" + item.workId}
      className={compact ? "home-tile home-tile--compact" : "home-tile"}
    >
      <CoverArt work={game} />
      <div className="home-tile__copy">
        <h3>{item.title}</h3>
        <p>{item.originalTitle || item.developer || "本地副本"}</p>
        <span className="home-tile__meta">
          <span className={`home-tile__status is-${item.status}`}>{statusLabels[item.status]}</span>
          <span>{playtimeLabel}</span>
          {item.lastPlayedAt ? <span>{formatRelativeDate(item.lastPlayedAt)}</span> : null}
        </span>
      </div>
    </Link>
  );
}

function HomeSkeleton() {
  return (
    <div className="home-page home-skeleton" aria-label="正在读取本地游戏库" aria-busy="true">
      <div className="home-skeleton__hero" />
      <div className="home-skeleton__row">
        {[0, 1, 2, 3].map((index) => (
          <div className="home-skeleton__card" key={index} />
        ))}
      </div>
      <div className="home-skeleton__row is-short">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div className="home-skeleton__cover" key={index} />
        ))}
      </div>
    </div>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const recentPlayed = useRecentPlayed(8);
  const recentAdded = useRecentAdded(8);
  const favorites = useFavoriteGames(6);
  const queued = useQueuedGames(5);
  const summary = useLibrarySummary();
  const stats = useStats("all");
  const invalidate = useInvalidateLibrary();
  const [launchBusy, setLaunchBusy] = useState(false);

  const featuredItem = recentPlayed.data?.items[0] ?? recentAdded.data?.items[0];
  const featured = useMemo(
    () => (featuredItem ? libraryItemToGame(featuredItem) : undefined),
    [featuredItem],
  );
  const total = summary.data?.total ?? recentAdded.data?.total ?? 0;
  const featuredPlaytimeSeconds = featuredItem
    ? (featuredItem.playtimeSeconds ?? featuredItem.playtimeMinutes * 60)
    : 0;
  const lastSession = stats.data?.recentSessions.find(
    (session) => session.workId === featuredItem?.workId,
  );
  const recentItems = (recentPlayed.data?.items ?? []).filter(
    (item) => item.workId !== featuredItem?.workId,
  );
  const recentShown = (
    recentItems.length > 0 ? recentItems : (recentPlayed.data?.items ?? [])
  ).slice(0, 4);
  const addedShown = (recentAdded.data?.items ?? [])
    .filter((item) => item.workId !== featuredItem?.workId)
    .slice(0, 6);

  const handleLaunch = async () => {
    if (!featuredItem) {
      return;
    }
    setLaunchBusy(true);
    try {
      await startWork(featuredItem.workId);
      invalidate();
      toast.success("游戏进程已启动");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setLaunchBusy(false);
    }
  };

  const loading = recentAdded.isPending || recentPlayed.isPending;
  if (loading && !featuredItem) {
    return <HomeSkeleton />;
  }

  if (recentAdded.isError && recentPlayed.isError) {
    return (
      <div className="home-page">
        <EmptyState
          title="无法读取游戏库"
          description={String(recentAdded.error ?? recentPlayed.error)}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void recentAdded.refetch();
                void recentPlayed.refetch();
                void summary.refetch();
              }}
            >
              重试
            </Button>
          }
        />
      </div>
    );
  }

  if (!featuredItem || !featured) {
    return (
      <div className="home-page">
        <EmptyState
          className="home-empty"
          icon={<Library size={19} strokeWidth={1.5} />}
          title="把本地游戏收进一个库"
          description="选择一个包含游戏的文件夹，扫描并确认主程序。"
          action={
            <Button variant="primary" size="sm" onClick={() => navigate("/library?import=1")}>
              <FolderPlus size={14} strokeWidth={1.8} />
              选择游戏目录
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="home-hero__copy">
          <p className="home-hero__eyebrow">
            {featuredItem.lastPlayedAt ? "上次游玩" : "最近入库"}，
            {featuredItem.lastPlayedAt
              ? formatRelativeDate(featuredItem.lastPlayedAt)
              : formatRelativeDate(featuredItem.addedAt)}
          </p>
          <h1>{featured.title}</h1>
          {featured.originalTitle ? (
            <p className="home-hero__original">
              {featured.originalTitle}
              {featured.romaji ? <span>{featured.romaji}</span> : null}
            </p>
          ) : null}
          {featured.description ? <p className="home-hero__desc">{featured.description}</p> : null}
          <div className="home-tags">
            {featured.tags.slice(0, 4).map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
            {featuredItem.favorite ? <Tag tone="status">收藏</Tag> : null}
            {featured.ageRating !== "未标记" ? <Tag tone="data">{featured.ageRating}</Tag> : null}
          </div>
          <div className="home-meta">
            <span>{featured.developer || "开发商未记录"}</span>
            <i />
            <span>{featured.edition || "Windows 本地版"}</span>
            {featuredItem.steamAppId ? (
              <>
                <i />
                <span>Steam {featuredItem.steamAppId}</span>
              </>
            ) : null}
          </div>
          <div className="home-actions">
            <Button variant="primary" disabled={launchBusy} onClick={() => void handleLaunch()}>
              <Play size={14} fill="currentColor" strokeWidth={0} />
              {launchBusy ? "正在启动…" : "启动游戏"}
            </Button>
            <Button variant="secondary" onClick={() => navigate("/work/" + featured.id)}>
              游戏详情
            </Button>
          </div>
          <div className="home-hero__facts" aria-label="这部作品的游玩概览">
            <div>
              <span>累计游玩</span>
              <b>{formatPlaytimeSeconds(featuredPlaytimeSeconds)}</b>
            </div>
            <div>
              <span>启动次数</span>
              <b>{featuredItem.launchCount}</b>
            </div>
            <div>
              <span>安装大小</span>
              <b>{formatBytes(featuredItem.sizeBytes)}</b>
            </div>
            <div>
              <span>上次会话</span>
              <b>{lastSession ? formatPlaytimeSeconds(lastSession.durationSec) : "—"}</b>
            </div>
          </div>
        </div>

        <figure className="home-hero__poster">
          <CoverArt work={featured} />
          <figcaption>
            <span>
              {featured.catalogNo} / {featured.year ?? "年份未知"}
            </span>
            <span>
              {featuredItem.lastPlayedAt ? "上次游玩" : "入库"}{" "}
              {featuredItem.lastPlayedAt
                ? formatRelativeDate(featuredItem.lastPlayedAt)
                : formatRelativeDate(featuredItem.addedAt)}
            </span>
          </figcaption>
        </figure>
      </section>

      <section className="home-databar" aria-label="游戏库概览">
        <div>
          <span>本地库</span>
          <b>{total}</b>
          <em>部游戏</em>
        </div>
        <div>
          <span>近 7 天</span>
          <b>{formatPlaytimeSeconds(stats.data?.last7Seconds ?? 0)}</b>
          <em>游玩时长</em>
        </div>
        <div>
          <span>本周启动</span>
          <b>{stats.data?.currentWeekLaunches ?? 0}</b>
          <em>次</em>
        </div>
        <div>
          <span>收藏</span>
          <b>{favorites.data?.total ?? 0}</b>
          <em>部作品</em>
        </div>
        <Link to="/stats" className="home-databar__link">
          查看统计
        </Link>
      </section>

      {recentShown.length > 0 ? (
        <section className="home-section">
          <header className="home-section__head">
            <h2>最近启动</h2>
            <Link to="/library?sort=last_played_desc">全部游戏</Link>
          </header>
          <div className="home-recent">
            {recentShown.map((item) => (
              <WorkTile item={item} key={item.workId} />
            ))}
          </div>
        </section>
      ) : null}

      {addedShown.length > 0 ? (
        <section className="home-section">
          <header className="home-section__head">
            <h2>最近入库</h2>
            <Link to="/library">管理游戏库</Link>
          </header>
          <div className="home-added">
            {addedShown.map((item) => (
              <WorkTile item={item} compact key={item.workId} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="home-board">
        <div className="home-board__column">
          <header className="home-section__head">
            <h2>收藏</h2>
            <Link to="/library?favorite=1">查看全部</Link>
          </header>
          {favorites.data?.items.length ? (
            <div className="home-board__grid">
              {favorites.data.items.slice(0, 4).map((item) => (
                <WorkTile item={item} compact key={item.workId} />
              ))}
            </div>
          ) : (
            <div className="home-section__empty">
              <Star size={15} strokeWidth={1.5} />
              <p>还没有收藏。游戏库右键或在详情页把作品加入收藏。</p>
              <Link to="/library">去游戏库</Link>
            </div>
          )}
        </div>
        <div className="home-board__column">
          <header className="home-section__head">
            <h2>想玩清单</h2>
            <Link to="/library?status=queued">查看全部</Link>
          </header>
          {queued.data?.items.length ? (
            <div className="home-queue">
              {queued.data.items.slice(0, 4).map((item) => (
                <Link to={"/work/" + item.workId} key={item.workId}>
                  <span>
                    <b>{item.title}</b>
                    <small>{item.developer || "开发商未记录"}</small>
                  </span>
                  <Tag tone="muted">想玩</Tag>
                </Link>
              ))}
            </div>
          ) : (
            <div className="home-section__empty">
              <ListPlus size={15} strokeWidth={1.5} />
              <p>想玩清单还空着。在游戏库右键作品，把状态改为“想玩”。</p>
              <Link to="/library">去游戏库</Link>
            </div>
          )}
        </div>
      </section>

      <section className="home-collections-link">
        <div>
          <FolderHeart size={16} strokeWidth={1.6} />
          <span>
            <b>收藏集</b>
            <small>按自己的主题整理作品。</small>
          </span>
        </div>
        <Link to="/collections">打开收藏集</Link>
      </section>
    </div>
  );
}
