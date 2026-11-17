import { ArrowRight, ArrowUpRight, Clock3, FolderPlus, HardDrive, Play, Star } from "lucide-react";
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../../design-system/components/Button";
import { CoverArt } from "../../design-system/components/CoverArt";
import { EmptyState } from "../../design-system/components/EmptyState";
import { Hint } from "../../design-system/components/Hint";
import { PageHeader } from "../../design-system/components/PageHeader";
import { Tag } from "../../design-system/components/Tag";
import { HomeSearch } from "../search/HomeSearch";
import { WorkContextMenu } from "../library/WorkContextMenu";
import {
  useFavoriteGames,
  useInvalidateLibrary,
  useLibrarySummary,
  useQueuedGames,
  useRecentAdded,
  useRecentPlayed,
  useStats,
} from "../library/useLibrary";
import { formatBytes, formatPlaytimeSeconds, formatRelativeDate } from "../../lib/format";
import { statusLabels } from "../../lib/game-data";
import { libraryItemToGame, startWork } from "../../lib/library-api";
import type { LibraryItem } from "../../lib/library-types";
import { workLinkState, workOrigins } from "../../lib/work-navigation";
import "./home.css";

const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];
const homeDetailState = workLinkState(workOrigins.home);

function useCountUp(target: number) {
  const reduceMotion = useReducedMotion();
  const [value, setValue] = useState(target);

  useEffect(() => {
    if (reduceMotion || target <= 0) {
      const settle = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(settle);
    }
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 760);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduceMotion, target]);

  return value;
}

function playtimeOf(item: LibraryItem) {
  return item.playtimeSeconds ?? item.playtimeMinutes * 60;
}

function playActivity(item: LibraryItem) {
  const playtime = playtimeOf(item);
  return [
    playtime > 0 ? formatPlaytimeSeconds(playtime) : "尚未记录时长",
    item.lastPlayedAt ? "上次 " + formatRelativeDate(item.lastPlayedAt) : null,
  ]
    .filter(Boolean)
    .join("\u3000");
}

function addedActivity(item: LibraryItem) {
  const size = formatBytes(item.sizeBytes);
  return `${size === "—" ? "大小未知" : size}\u3000入库 ${formatRelativeDate(item.addedAt)}`;
}

function statusClass(item: LibraryItem) {
  return `is-${item.status}`;
}

function ShelfCard({
  item,
  activity,
  onContextMenu,
}: {
  item: LibraryItem;
  activity: string;
  onContextMenu: (event: ReactMouseEvent, item: LibraryItem) => void;
}) {
  const game = libraryItemToGame(item);

  return (
    <Link
      to={"/work/" + item.workId}
      state={homeDetailState}
      className="home-shelf-card"
      onContextMenu={(event) => onContextMenu(event, item)}
    >
      <span className="home-shelf-card__cover">
        <CoverArt work={game} />
      </span>
      <span className="home-shelf-card__copy">
        <span className="home-shelf-card__title">
          <b>{game.title}</b>
          {game.favorite ? (
            <span className="home-shelf-card__favorite" aria-label="已收藏">
              <Star size={11} fill="currentColor" strokeWidth={0} />
            </span>
          ) : null}
        </span>
        <small className="home-shelf-card__original">{game.originalTitle || "本地副本"}</small>
        <span className={`home-shelf-card__info ${statusClass(item)}`}>
          <span className="home-shelf-card__status-label">{statusLabels[item.status]}</span>
          <span aria-hidden="true"> · </span>
          {game.developer || "开发商未记录"}
          {game.year ? " · " + game.year : ""}
        </span>
        <span className="home-shelf-card__activity">{activity}</span>
      </span>
    </Link>
  );
}

function HomeSkeleton() {
  return (
    <div className="home-page home-skeleton" aria-label="正在读取本地游戏库" aria-busy="true">
      <HomeHeader />
      <div className="home-skeleton__hero">
        <div className="home-skeleton__copy">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="home-skeleton__cover" />
      </div>
      <div className="home-skeleton__ledger" />
      <div className="home-shelf">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div className="home-skeleton__card" key={index} />
        ))}
      </div>
    </div>
  );
}

function HomeHeader() {
  return <PageHeader title="首页" actions={<HomeSearch />} />;
}

export function HomePage() {
  const navigate = useNavigate();
  const recentPlayed = useRecentPlayed(8);
  const recentAdded = useRecentAdded(10);
  const favorites = useFavoriteGames(6);
  const queued = useQueuedGames(6);
  const summary = useLibrarySummary();
  const stats = useStats("all");
  const invalidate = useInvalidateLibrary();
  const [launchBusy, setLaunchBusy] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    item: LibraryItem;
    x: number;
    y: number;
  } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [carouselHovered, setCarouselHovered] = useState(false);
  const [carouselFocused, setCarouselFocused] = useState(false);
  const carouselProgress = useMotionValue(0);
  const reduceMotion = useReducedMotion();

  const recommendations = useMemo(() => {
    const pool = [
      ...(recentPlayed.data?.items.slice(0, 1) ?? []),
      ...(favorites.data?.items ?? []),
      ...(queued.data?.items ?? []),
      ...(recentAdded.data?.items ?? []),
    ];
    const seen = new Set<number>();
    const result: LibraryItem[] = [];
    for (const item of pool) {
      if (seen.has(item.workId)) {
        continue;
      }
      seen.add(item.workId);
      result.push(item);
      if (result.length === 4) {
        break;
      }
    }
    return result;
  }, [favorites.data, queued.data, recentAdded.data, recentPlayed.data]);

  const activeIndexSafe = recommendations.length ? activeIndex % recommendations.length : 0;
  const activeItem = recommendations[activeIndexSafe] ?? null;
  const leadItem = recommendations[0] ?? null;
  const activeGame = useMemo(
    () => (activeItem ? libraryItemToGame(activeItem) : undefined),
    [activeItem],
  );
  const total = summary.data?.total ?? recentAdded.data?.total ?? 0;
  const activePlaytimeSeconds = activeItem ? playtimeOf(activeItem) : 0;
  const lastSession = stats.data?.recentSessions.find(
    (session) => session.workId === activeItem?.workId,
  );
  const recentShown = (recentPlayed.data?.items ?? [])
    .filter((item) => item.workId !== leadItem?.workId)
    .slice(0, 6);
  const addedShown = (recentAdded.data?.items ?? [])
    .filter((item) => item.workId !== leadItem?.workId)
    .slice(0, 6);
  const favoriteShown = favorites.data?.items ?? [];

  const weekDays = useMemo(() => {
    const days = stats.data?.daily.slice(-7) ?? [];
    return days.map((day) => ({
      ...day,
      label: weekdayLabels[new Date(day.date + "T00:00:00").getDay()],
    }));
  }, [stats.data]);
  const maxWeek = Math.max(...weekDays.map((day) => day.seconds), 1);
  const weekDelta = (stats.data?.last7Seconds ?? 0) - (stats.data?.previous7Seconds ?? 0);
  const weekDeltaLabel = !stats.data
    ? "—"
    : weekDelta === 0
      ? "与前 7 天持平"
      : weekDelta > 0
        ? `比前 7 天多 ${formatPlaytimeSeconds(weekDelta)}`
        : `比前 7 天少 ${formatPlaytimeSeconds(Math.abs(weekDelta))}`;

  const countTotal = useCountUp(total);
  const countWeek = useCountUp(stats.data?.last7Seconds ?? 0);
  const countLaunches = useCountUp(stats.data?.currentWeekLaunches ?? 0);
  const countFavorites = useCountUp(favorites.data?.total ?? 0);
  const countAllTime = useCountUp(stats.data?.allTimeSeconds ?? 0);

  const autoplay =
    !reduceMotion &&
    !carouselHovered &&
    !carouselFocused &&
    !launchBusy &&
    recommendations.length > 1;

  useEffect(() => {
    if (reduceMotion) {
      carouselProgress.set(1);
      return;
    }
    if (!autoplay) {
      return;
    }
    carouselProgress.set(0);
    const controls = animate(carouselProgress, 1, {
      duration: 7,
      ease: "linear",
      onComplete: () => {
        carouselProgress.set(0);
        setActiveIndex((index) => (index + 1) % recommendations.length);
      },
    });
    return () => controls.stop();
  }, [activeIndexSafe, autoplay, carouselProgress, recommendations.length, reduceMotion]);

  const handleLaunch = async () => {
    if (!activeItem) {
      return;
    }
    setLaunchBusy(true);
    try {
      await startWork(activeItem.workId);
      invalidate();
      toast.success("游戏进程已启动");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setLaunchBusy(false);
    }
  };

  const openContextMenu = (event: ReactMouseEvent, item: LibraryItem) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ item, x: event.clientX, y: event.clientY });
  };

  const loading = recentAdded.isPending || recentPlayed.isPending;
  if (loading && !leadItem) {
    return <HomeSkeleton />;
  }

  if (recentAdded.isError && recentPlayed.isError) {
    return (
      <div className="home-page">
        <HomeHeader />
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

  if (!activeItem || !activeGame) {
    return (
      <div className="home-page">
        <HomeHeader />
        <section className="home-empty">
          <div className="home-empty__shelf" aria-hidden="true">
            <span />
            <span />
            <span />
            <i>+</i>
          </div>
          <h2>游戏架还空着</h2>
          <p>选一个包含游戏的文件夹，扫描并确认主程序。</p>
          <Button variant="primary" size="lg" onClick={() => navigate("/library?import=1")}>
            <FolderPlus size={16} strokeWidth={1.9} />
            选择游戏目录
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="home-page">
      <HomeHeader />
      <motion.section
        className={`home-hero${autoplay ? " is-autoplay" : ""}`}
        aria-label="推荐游戏"
        aria-roledescription="轮播"
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        onMouseEnter={() => setCarouselHovered(true)}
        onMouseLeave={() => setCarouselHovered(false)}
        onFocusCapture={() => setCarouselFocused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setCarouselFocused(false);
          }
        }}
      >
        <div className="home-hero__copy">
          <div className="home-hero__topline">
            <span className="home-hero__presence">
              <i aria-hidden="true" />
              {activeItem.lastPlayedAt ? "上次游玩" : "最近入库"}
              <b>{formatRelativeDate(activeItem.lastPlayedAt ?? activeItem.addedAt)}</b>
            </span>
            <div className="home-hero__carousel-meta">
              {recommendations.length > 1 ? (
                <div className="home-hero__progress" role="group" aria-label="推荐进度">
                  {recommendations.map((item, index) => (
                    <button
                      key={item.workId}
                      type="button"
                      className="home-hero__progress-segment"
                      aria-label={`第 ${index + 1} 个推荐：${item.title}`}
                      aria-pressed={index === activeIndexSafe}
                      onClick={() => {
                        setActiveIndex(index);
                        if (!reduceMotion) {
                          carouselProgress.set(0);
                        }
                      }}
                    >
                      <span className="home-hero__progress-track">
                        <motion.span
                          style={{
                            scaleX:
                              index < activeIndexSafe
                                ? 1
                                : index === activeIndexSafe
                                  ? carouselProgress
                                  : 0,
                          }}
                        />
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <motion.div
            key={activeItem.workId}
            className="home-hero__content"
            initial={reduceMotion ? false : { opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 id="home-featured-title" className="home-hero__title">
              {activeGame.title}
            </h2>
            <p className="home-hero__original">
              {activeGame.originalTitle && activeGame.originalTitle !== activeGame.title ? (
                <>
                  {activeGame.originalTitle}
                  {activeGame.romaji ? <span>{activeGame.romaji}</span> : null}
                </>
              ) : (
                <span aria-hidden="true">&nbsp;</span>
              )}
            </p>
            <p className="home-hero__desc">{activeGame.description || "\u00a0"}</p>

            <div className="home-hero__tags">
              {activeGame.tags.slice(0, 4).map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
              {activeItem.favorite ? <Tag tone="accent">收藏</Tag> : null}
              {activeGame.ageRating !== "未标记" ? (
                <Tag tone="data">{activeGame.ageRating}</Tag>
              ) : null}
            </div>

            <div className="home-hero__meta">
              <span>{activeGame.developer || "开发商未记录"}</span>
              <i aria-hidden="true" />
              <span>{activeGame.edition || "Windows 本地版"}</span>
              {activeItem.steamAppId ? (
                <>
                  <i aria-hidden="true" />
                  <span>Steam {activeItem.steamAppId}</span>
                </>
              ) : null}
            </div>

            <div className="home-hero__actions">
              <Button
                variant="primary"
                size="lg"
                className="home-launch"
                disabled={launchBusy}
                onClick={() => void handleLaunch()}
              >
                <Play size={15} fill="currentColor" strokeWidth={0} />
                {launchBusy ? "正在启动…" : "启动游戏"}
              </Button>
              <Link
                to={"/work/" + activeGame.id}
                state={homeDetailState}
                className="home-hero__detail"
              >
                查看资料
                <ArrowUpRight size={14} strokeWidth={1.8} />
              </Link>
            </div>

            <dl className="home-hero__facts" aria-label="这部作品的游玩概览">
              <div>
                <dt>累计游玩</dt>
                <dd>{formatPlaytimeSeconds(activePlaytimeSeconds)}</dd>
              </div>
              <div>
                <dt>启动次数</dt>
                <dd>{activeItem.launchCount}</dd>
              </div>
              <div>
                <dt>安装大小</dt>
                <dd>{formatBytes(activeItem.sizeBytes)}</dd>
              </div>
              <div>
                <dt>上次会话</dt>
                <dd>{lastSession ? formatPlaytimeSeconds(lastSession.durationSec) : "—"}</dd>
              </div>
            </dl>
          </motion.div>
        </div>

        <div
          className="home-hero__stage"
          onContextMenu={(event) => openContextMenu(event, activeItem)}
        >
          <motion.div
            key={`backdrop-${activeItem.workId}`}
            className="home-hero__backdrop"
            aria-hidden="true"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <CoverArt work={activeGame} />
          </motion.div>
          <Link
            to={"/work/" + activeGame.id}
            state={homeDetailState}
            className="home-hero__poster-link"
            aria-label={`查看《${activeGame.title}》详情`}
          >
            <motion.figure
              key={activeItem.workId}
              className="home-hero__poster"
              initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.975 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.46, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="home-hero__poster-mat">
                <div className="home-hero__poster-frame">
                  <CoverArt work={activeGame} />
                  <span className="home-hero__poster-glint" aria-hidden="true" />
                </div>
              </div>
            </motion.figure>
          </Link>
        </div>
      </motion.section>

      <section className="home-ledger" aria-label="最近游玩概览">
        <div className="home-ledger__pulse">
          <div className="home-ledger__headline">
            <span>最近 7 天</span>
            <b>{formatPlaytimeSeconds(countWeek)}</b>
            <em>{weekDeltaLabel}</em>
          </div>
          {weekDays.length > 0 ? (
            <p className="sr-only">
              最近 7 天每日游玩时长：
              {weekDays
                .map((day) => `${day.date.slice(5)} ${formatPlaytimeSeconds(day.seconds)}`)
                .join("；")}
            </p>
          ) : null}
          <div className="home-week" aria-hidden="true">
            {weekDays.length > 0
              ? weekDays.map((day, index) => (
                  <span className="home-week__day" key={day.date || index}>
                    <span className="home-week__track">
                      <Hint
                        label={
                          day.date ? `${day.date}，${formatPlaytimeSeconds(day.seconds)}` : "未记录"
                        }
                        side="top"
                      >
                        <motion.i
                          style={{
                            height: `${Math.max(5, (day.seconds / maxWeek) * 42)}px`,
                          }}
                          initial={reduceMotion ? false : { scaleY: 0 }}
                          animate={{ scaleY: 1 }}
                          transition={{
                            duration: 0.45,
                            delay: 0.08 + index * 0.035,
                            ease: [0.16, 1, 0.3, 1],
                          }}
                        />
                      </Hint>
                    </span>
                    <small>{day.label ?? "·"}</small>
                  </span>
                ))
              : null}
          </div>
        </div>
        <dl className="home-ledger__metrics">
          <div>
            <dt>馆藏</dt>
            <dd>{Math.round(countTotal)}</dd>
            <small>部作品</small>
          </div>
          <div>
            <dt>本周启动</dt>
            <dd>{Math.round(countLaunches)}</dd>
            <small>次</small>
          </div>
          <div>
            <dt>收藏</dt>
            <dd>{Math.round(countFavorites)}</dd>
            <small>部作品</small>
          </div>
          <div>
            <dt>累计游玩</dt>
            <dd className="is-time">{formatPlaytimeSeconds(countAllTime)}</dd>
          </div>
        </dl>
      </section>

      {recentShown.length > 0 ? (
        <section className="home-section" aria-labelledby="home-recent-title">
          <header className="home-section__head">
            <h2 id="home-recent-title">继续游玩</h2>
            <Link
              to="/library?sort=last_played_desc&focus=library-grid"
              className="home-section__more"
            >
              全部游戏
              <ArrowRight size={13} strokeWidth={1.8} />
            </Link>
          </header>
          <div className="home-shelf">
            {recentShown.map((item) => (
              <ShelfCard
                item={item}
                activity={playActivity(item)}
                onContextMenu={openContextMenu}
                key={item.workId}
              />
            ))}
          </div>
        </section>
      ) : null}

      {addedShown.length > 0 ? (
        <section className="home-section" aria-labelledby="home-added-title">
          <header className="home-section__head">
            <h2 id="home-added-title">最近入库</h2>
            <Link to="/library?focus=library-toolbar" className="home-section__more">
              管理游戏库
              <ArrowRight size={13} strokeWidth={1.8} />
            </Link>
          </header>
          <div className="home-shelf">
            {addedShown.map((item) => (
              <ShelfCard
                item={item}
                activity={addedActivity(item)}
                onContextMenu={openContextMenu}
                key={item.workId}
              />
            ))}
          </div>
        </section>
      ) : null}

      {favoriteShown.length > 0 ? (
        <section className="home-section" aria-labelledby="home-favorites-title">
          <header className="home-section__head">
            <h2 id="home-favorites-title">收藏</h2>
            <Link to="/library?favorite=1&focus=library-grid" className="home-section__more">
              全部收藏
              <ArrowRight size={13} strokeWidth={1.8} />
            </Link>
          </header>
          <div className="home-shelf">
            {favoriteShown.slice(0, 6).map((item) => (
              <ShelfCard
                item={item}
                activity={playActivity(item)}
                onContextMenu={openContextMenu}
                key={item.workId}
              />
            ))}
          </div>
        </section>
      ) : null}

      <footer className="home-footnote">
        <span>
          <HardDrive size={13} strokeWidth={1.7} /> 全部数据保存在本机
        </span>
        <span>
          <Clock3 size={13} strokeWidth={1.7} /> 游玩时长来自启动会话
        </span>
        <Link to="/stats">
          查看统计
          <ArrowRight size={13} strokeWidth={1.8} />
        </Link>
      </footer>
      <WorkContextMenu
        anchor={contextMenu}
        detailState={homeDetailState}
        onClose={() => setContextMenu(null)}
      />
    </div>
  );
}
