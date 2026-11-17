import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BookmarkPlus,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Gamepad2,
  LibraryBig,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { CoverArt } from "../../design-system/components/CoverArt";
import { EmptyState } from "../../design-system/components/EmptyState";
import { PageHeader } from "../../design-system/components/PageHeader";
import { formatPlaytimeSeconds } from "../../lib/format";
import { assetUrl } from "../../lib/library-api";
import { workLinkState, workOrigins } from "../../lib/work-navigation";
import type {
  DailyPlaytime,
  PlaySessionWithWork,
  StatsActivityEvent,
  StatsActivityKind,
  StatsOverview,
  StatsPeriod,
} from "../../lib/library-types";
import { useStats } from "../library/useLibrary";
import {
  SessionLengthChart,
  TimeOfDayChart,
  TrendChart,
  WeekdayChart,
  type LengthBucket,
  type TimeBucket,
  type TrendPoint,
  type WeekdayTotal,
} from "./StatsCharts";
import { ChartTooltip, type ChartTip } from "./StatsTooltip";
import { formatCompactDuration, timeIcons } from "./stats-utils";
import { tipFromElement } from "./stats-tooltip-position";
import "./stats.css";

const periods: { id: StatsPeriod; label: string }[] = [
  { id: "week", label: "本周" },
  { id: "month", label: "本月" },
  { id: "year", label: "今年" },
  { id: "all", label: "全部" },
];

const periodLabels: Record<StatsPeriod, string> = {
  week: "本周",
  month: "本月",
  year: "今年",
  all: "全部",
};

type ActivityFilter = "all" | StatsActivityKind;

const activityFilters: { id: ActivityFilter; label: string; icon: LucideIcon }[] = [
  { id: "all", label: "全部", icon: Sparkles },
  { id: "play", label: "游玩", icon: Gamepad2 },
  { id: "import", label: "入库", icon: LibraryBig },
  { id: "collection", label: "收藏", icon: BookmarkPlus },
];

const activityKindMeta: Record<
  StatsActivityKind,
  { verb: string; label: string; icon: LucideIcon }
> = {
  play: { verb: "游玩了", label: "游玩", icon: Gamepad2 },
  import: { verb: "添加了", label: "入库", icon: LibraryBig },
  collection: { verb: "收录了", label: "收藏", icon: BookmarkPlus },
};

const weekdayLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const statsDetailState = workLinkState(workOrigins.stats);

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
}

function dateFromKey(value: string) {
  const [year = 1970, month = 1, day = 1] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatMonthDay(value: string) {
  const date = dateFromKey(value);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatFullDay(value: string) {
  const date = dateFromKey(value);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function weekdayLabel(value: string) {
  const index = (dateFromKey(value).getDay() + 6) % 7;
  return weekdayLabels[index];
}

function sumSeconds(days: DailyPlaytime[]) {
  return days.reduce((total, day) => total + day.seconds, 0);
}

function heatLevel(seconds: number, max: number) {
  if (seconds <= 0) return 0;
  const ratio = seconds / Math.max(max, 1);
  if (ratio > 0.72) return 4;
  if (ratio > 0.42) return 3;
  if (ratio > 0.16) return 2;
  return 1;
}

function reasonLabel(reason: string | null) {
  switch (reason) {
    case "exited":
      return "正常退出";
    case "manual_stop":
      return "手动停止";
    case "recovered":
      return "异常恢复";
    case "manual":
      return "手动补录";
    default:
      return "未记录";
  }
}

function clockLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function activityClock(event: StatsActivityEvent) {
  const startedAt = event.sessionStartedAt ?? event.occurredAt;
  if (event.kind !== "play" || !event.sessionEndedAt) return clockLabel(startedAt);
  const start = new Date(startedAt);
  const end = new Date(event.sessionEndedAt);
  const sameDay = dateKey(start) === dateKey(end);
  return sameDay
    ? `${clockLabel(startedAt)}–${clockLabel(event.sessionEndedAt)}`
    : `${clockLabel(startedAt)}–次日 ${clockLabel(event.sessionEndedAt)}`;
}

function relativeDayLabel(key: string) {
  const today = dateKey(new Date());
  const yesterday = dateKey(new Date(Date.now() - 86_400_000));
  if (key === today) return "今天";
  if (key === yesterday) return "昨天";
  return formatMonthDay(key);
}

function relativeDayMeta(key: string) {
  const today = dateKey(new Date());
  const yesterday = dateKey(new Date(Date.now() - 86_400_000));
  return key === today || key === yesterday
    ? `${formatMonthDay(key)} · ${weekdayLabel(key)}`
    : weekdayLabel(key);
}

function buildTrend(daily: DailyPlaytime[], period: StatsPeriod) {
  if (period === "week" || period === "month") {
    const count = period === "week" ? 7 : 30;
    const days = daily.slice(-count);
    return {
      points: days.map<TrendPoint>((day) => ({
        key: day.date,
        label: day.date.slice(5).replace("-", "/"),
        detail: formatFullDay(day.date),
        seconds: day.seconds,
      })),
      label: period === "week" ? "近 7 天" : "近 30 天",
      note: "按天汇总",
    };
  }

  const now = new Date();
  const byMonth = new Map<string, number>();
  for (const day of daily) {
    const key = day.date.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? 0) + day.seconds);
  }

  const months = period === "year" ? now.getMonth() + 1 : 12;
  const points: TrendPoint[] = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
    points.push({
      key,
      label: `${date.getMonth() + 1}月`,
      detail: `${date.getFullYear()}年${date.getMonth() + 1}月`,
      seconds: byMonth.get(key) ?? 0,
    });
  }
  return {
    points,
    label: period === "year" ? "今年" : "近 12 个月",
    note: "按月汇总",
  };
}

function buildWeekdays(days: DailyPlaytime[]): WeekdayTotal[] {
  const totals = weekdayLabels.map((label) => ({ key: label, label, seconds: 0 }));
  for (const day of days) {
    const index = (dateFromKey(day.date).getDay() + 6) % 7;
    const bucket = totals[index];
    if (bucket) bucket.seconds += day.seconds;
  }
  return totals;
}

function buildHeatmap(daily: DailyPlaytime[]) {
  const byDate = new Map(daily.map((day) => [day.date, day.seconds]));
  const today = new Date();
  const mondayOffset = (today.getDay() + 6) % 7;
  const weeks = 18;
  const totalDays = weeks * 7;
  const start = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - mondayOffset - (totalDays - 7),
  );
  const days = Array.from({ length: totalDays }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    const key = dateKey(date);
    return { date: key, seconds: byDate.get(key) ?? 0 };
  });
  return {
    days,
    max: Math.max(...days.map((day) => day.seconds), 1),
    startLabel: formatMonthDay(dateKey(start)),
    endLabel: formatMonthDay(
      dateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + totalDays - 1)),
    ),
  };
}

function buildStreaks(daily: DailyPlaytime[]) {
  let current = 0;
  for (let index = daily.length - 1; index >= 0; index -= 1) {
    const day = daily[index];
    if (!day || day.seconds <= 0) break;
    current += 1;
  }
  let longest = 0;
  let run = 0;
  for (const day of daily) {
    if (day.seconds > 0) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }
  return { current, longest };
}

function buildTimeBuckets(sessions: PlaySessionWithWork[]): TimeBucket[] {
  const buckets: TimeBucket[] = [
    {
      id: "morning",
      label: "清晨",
      hours: "05–11",
      seconds: 0,
      count: 0,
      tone: "tone-rose",
      icon: timeIcons.Sunrise,
    },
    {
      id: "afternoon",
      label: "午后",
      hours: "11–17",
      seconds: 0,
      count: 0,
      tone: "tone-coral",
      icon: timeIcons.Sun,
    },
    {
      id: "evening",
      label: "晚间",
      hours: "17–22",
      seconds: 0,
      count: 0,
      tone: "tone-brass",
      icon: timeIcons.Moon,
    },
    {
      id: "late",
      label: "深夜",
      hours: "22–05",
      seconds: 0,
      count: 0,
      tone: "tone-green",
      icon: timeIcons.MoonStar,
    },
  ];
  for (const session of sessions) {
    const hour = new Date(session.startedAt).getHours();
    const index =
      hour >= 5 && hour < 11 ? 0 : hour >= 11 && hour < 17 ? 1 : hour >= 17 && hour < 22 ? 2 : 3;
    const bucket = buckets[index];
    if (bucket) {
      bucket.seconds += session.durationSec;
      bucket.count += 1;
    }
  }
  return buckets;
}

function buildLengthBuckets(sessions: PlaySessionWithWork[]): LengthBucket[] {
  const buckets: LengthBucket[] = [
    { id: "short", label: "≤30 分", range: "短会话", count: 0, seconds: 0 },
    { id: "medium", label: "30–60 分", range: "一小时以内", count: 0, seconds: 0 },
    { id: "long", label: "1–2 小时", range: "沉浸一段", count: 0, seconds: 0 },
    { id: "deep", label: "2 小时+", range: "长会话", count: 0, seconds: 0 },
  ];
  for (const session of sessions) {
    const minutes = session.durationSec / 60;
    const index = minutes <= 30 ? 0 : minutes <= 60 ? 1 : minutes <= 120 ? 2 : 3;
    const bucket = buckets[index];
    if (bucket) {
      bucket.count += 1;
      bucket.seconds += session.durationSec;
    }
  }
  return buckets;
}

function groupActivities(events: StatsActivityEvent[]) {
  const groups = new Map<
    string,
    {
      key: string;
      events: StatsActivityEvent[];
      playSeconds: number;
      playCount: number;
      importCount: number;
      collectionCount: number;
    }
  >();
  for (const event of events) {
    const key = dateKey(new Date(event.occurredAt));
    const group = groups.get(key) ?? {
      key,
      events: [],
      playSeconds: 0,
      playCount: 0,
      importCount: 0,
      collectionCount: 0,
    };
    group.events.push(event);
    if (event.kind === "play") {
      group.playCount += 1;
      group.playSeconds += event.durationSec ?? 0;
    } else if (event.kind === "import") {
      group.importCount += 1;
    } else {
      group.collectionCount += 1;
    }
    groups.set(key, group);
  }
  return [...groups.values()];
}

function activityGroupSummary(group: ReturnType<typeof groupActivities>[number]) {
  const parts: string[] = [];
  if (group.playCount > 0) {
    parts.push(`${group.playCount} 次游玩 · ${formatPlaytimeSeconds(group.playSeconds)}`);
  }
  if (group.importCount > 0) parts.push(`${group.importCount} 部入库`);
  if (group.collectionCount > 0) parts.push(`${group.collectionCount} 次收藏`);
  return parts.join(" · ");
}

function ActivityEventRow({ event }: { event: StatsActivityEvent }) {
  const kind = activityKindMeta[event.kind];
  const Icon = kind.icon;
  const isPlay = event.kind === "play";
  const coverUrl = assetUrl(event.coverThumbPath) ?? assetUrl(event.coverPath);
  const subtitle =
    event.kind === "collection"
      ? `加入收藏集「${event.collectionName ?? "未命名收藏集"}」`
      : event.kind === "import"
        ? "首次收录到本地游戏库"
        : event.originalTitle || reasonLabel(event.endReason);

  return (
    <Link
      to={`/work/${event.workId}${isPlay ? "?tab=sessions&focus=detail-tabs" : ""}`}
      state={statsDetailState}
      className="stats-timeline__event"
    >
      <span className="stats-timeline__node" data-kind={event.kind} aria-hidden="true">
        <Icon size={13} strokeWidth={1.8} />
      </span>
      <span className="stats-timeline__cover">
        <CoverArt
          work={{
            title: event.workTitle,
            originalTitle: event.originalTitle,
            developer: event.workDeveloper ?? "",
            year: event.workYear,
            cover: event.previewCover ?? null,
            coverUrl,
          }}
          className="stats-timeline__cover-art"
        />
      </span>
      <span className="stats-timeline__copy">
        <span className="stats-timeline__action">
          <em>{kind.verb}</em>
          <b>{event.workTitle}</b>
        </span>
        <small className="stats-timeline__subtitle">{subtitle}</small>
        <span className="stats-timeline__details">
          <span className="stats-timeline__badge" data-kind={event.kind}>
            <Icon size={10} strokeWidth={2} />
            {kind.label}
          </span>
          <time dateTime={event.occurredAt}>{activityClock(event)}</time>
          {isPlay ? <span>{reasonLabel(event.endReason)}</span> : null}
          {event.corrected ? <span className="is-corrected">已修正</span> : null}
        </span>
      </span>
      <span className="stats-timeline__metric" data-kind={event.kind}>
        <b>{isPlay ? formatPlaytimeSeconds(event.durationSec ?? 0) : kind.label}</b>
        <small>{isPlay ? "游玩时长" : event.kind === "import" ? "首次收录" : "收藏集"}</small>
      </span>
      <ArrowUpRight size={14} strokeWidth={1.7} aria-hidden="true" />
    </Link>
  );
}

function StatsSkeleton() {
  return (
    <div className="stats-page stats-skeleton" aria-busy="true" aria-label="正在读取游玩统计">
      <div className="stats-skeleton__head" />
      <div className="stats-skeleton__summary">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} />
        ))}
      </div>
      <div className="stats-skeleton__primary">
        <div />
        <div />
      </div>
      <div className="stats-skeleton__row">
        {[0, 1, 2].map((index) => (
          <div key={index} />
        ))}
      </div>
    </div>
  );
}

export function StatsPage() {
  const [period, setPeriod] = useState<StatsPeriod>("all");
  const stats = useStats(period);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isTauri()) {
      return;
    }
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void listen("play-session", () => {
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
      void queryClient.invalidateQueries({ queryKey: ["library"] });
      void queryClient.invalidateQueries({ queryKey: ["library-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["work-sessions"] });
    })
      .then((unlisten) => {
        if (disposed) {
          unlisten();
        } else {
          cleanup = unlisten;
        }
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [queryClient]);

  if (stats.isPending && !stats.data) {
    return <StatsSkeleton />;
  }

  if (stats.isError && !stats.data) {
    return (
      <div className="stats-page">
        <EmptyState
          title="无法读取游玩统计"
          description={String(stats.error ?? "统计查询没有返回数据")}
        />
      </div>
    );
  }

  if (!stats.data) {
    return <StatsSkeleton />;
  }

  return <StatsContent data={stats.data} period={period} onPeriodChange={setPeriod} />;
}

function StatsContent({
  data,
  period,
  onPeriodChange,
}: {
  data: StatsOverview;
  period: StatsPeriod;
  onPeriodChange: (period: StatsPeriod) => void;
}) {
  const reduceMotion = useReducedMotion();
  const heatmapRef = useRef<HTMLDivElement>(null);
  const [heatTip, setHeatTip] = useState<ChartTip | null>(null);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [historyLimit, setHistoryLimit] = useState(10);

  const trend = useMemo(() => buildTrend(data.daily, period), [data.daily, period]);
  const trendTotal = trend.points.reduce((total, point) => total + point.seconds, 0);
  const trendPeak = trend.points.reduce(
    (peak, point) => (point.seconds > peak.seconds ? point : peak),
    trend.points[0] ?? { key: "", label: "—", detail: "—", seconds: 0 },
  );
  const rhythmWindow = period === "week" ? 7 : period === "month" ? 30 : 84;
  const rhythmDays = data.daily.slice(-rhythmWindow);
  const weekdayTotals = useMemo(() => buildWeekdays(rhythmDays), [rhythmDays]);
  const mostActiveWeekday = weekdayTotals.reduce(
    (best, day) => (day.seconds > best.seconds ? day : best),
    weekdayTotals[0] ?? { key: "", label: "—", seconds: 0 },
  );
  const heatmap = useMemo(() => buildHeatmap(data.daily), [data.daily]);
  const recentHeatWindow = data.daily.slice(-126);
  const activeHeatDays = recentHeatWindow.filter((day) => day.seconds > 0).length;
  const streak = useMemo(() => buildStreaks(recentHeatWindow), [recentHeatWindow]);
  const heatWeekdays = useMemo(() => buildWeekdays(recentHeatWindow), [recentHeatWindow]);
  const heatMostActive = heatWeekdays.reduce(
    (best, day) => (day.seconds > best.seconds ? day : best),
    heatWeekdays[0] ?? { key: "", label: "—", seconds: 0 },
  );
  const heatTotal = sumSeconds(recentHeatWindow);
  const heatDailyAverage = heatTotal / recentHeatWindow.length;
  const heatActiveAverage = activeHeatDays > 0 ? heatTotal / activeHeatDays : 0;
  const timeBuckets = useMemo(() => buildTimeBuckets(data.recentSessions), [data.recentSessions]);
  const lengthBuckets = useMemo(
    () => buildLengthBuckets(data.recentSessions),
    [data.recentSessions],
  );
  const recentAverage =
    data.recentSessions.length > 0
      ? data.recentSessions.reduce((total, session) => total + session.durationSec, 0) /
        data.recentSessions.length
      : 0;
  const topTimeBucket = timeBuckets.reduce(
    (best, bucket) => (bucket.seconds > best.seconds ? bucket : best),
    timeBuckets[0] ?? {
      id: "",
      label: "—",
      hours: "",
      seconds: 0,
      count: 0,
      tone: "tone-rose",
      icon: timeIcons.Sunrise,
    },
  );
  const weekDelta = data.last7Seconds - data.previous7Seconds;
  const last30 = sumSeconds(data.daily.slice(-30));
  const previous30 = sumSeconds(data.daily.slice(-60, -30));
  const monthDelta = last30 - previous30;
  const topMax = Math.max(...data.topGames.map((game) => game.seconds), 1);
  const sparkMax = Math.max(...data.daily.slice(-14).map((day) => day.seconds), 1);

  const activityCounts: Record<ActivityFilter, number> = {
    all: data.timeline.length,
    play: data.timeline.filter((event) => event.kind === "play").length,
    import: data.timeline.filter((event) => event.kind === "import").length,
    collection: data.timeline.filter((event) => event.kind === "collection").length,
  };
  const filteredActivity =
    activityFilter === "all"
      ? data.timeline
      : data.timeline.filter((event) => event.kind === activityFilter);
  const visibleActivity = filteredActivity.slice(0, historyLimit);
  const groupedActivity = groupActivities(visibleActivity);
  const hasMoreHistory = filteredActivity.length > visibleActivity.length;

  const weekdayWindowLabel =
    period === "week" ? "近 7 天" : period === "month" ? "近 30 天" : "近 12 周";
  const weekDeltaLabel =
    weekDelta === 0
      ? "与前 7 天持平"
      : weekDelta > 0
        ? `比前 7 天多 ${formatPlaytimeSeconds(weekDelta)}`
        : `比前 7 天少 ${formatPlaytimeSeconds(Math.abs(weekDelta))}`;
  const monthDeltaLabel =
    previous30 === 0
      ? last30 > 0
        ? "前 30 天无记录"
        : "与前 30 天持平"
      : monthDelta === 0
        ? "与前 30 天持平"
        : monthDelta > 0
          ? `比前 30 天多 ${formatPlaytimeSeconds(monthDelta)}`
          : `比前 30 天少 ${formatPlaytimeSeconds(Math.abs(monthDelta))}`;

  return (
    <div className="stats-page">
      <PageHeader
        title="统计"
        description="只统计从 MiyuManager 启动的会话。"
        actions={
          <div className="stats-head__controls">
            <div className="stats-period" role="tablist" aria-label="统计时间范围">
              {periods.map((entry) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={period === entry.id}
                  className={period === entry.id ? "is-active" : ""}
                  key={entry.id}
                  onClick={() => onPeriodChange(entry.id)}
                >
                  {period === entry.id ? (
                    <motion.span
                      className="stats-period__pill"
                      layoutId="stats-period-pill"
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : { type: "spring", stiffness: 430, damping: 36 }
                      }
                    />
                  ) : null}
                  <span>{entry.label}</span>
                </button>
              ))}
            </div>
            <span className="stats-range-summary">
              {periodLabels[period]} · {formatPlaytimeSeconds(data.rangeSeconds)} ·{" "}
              {data.rangeLaunches} 条会话
            </span>
          </div>
        }
      />

      <section className="stats-summary" aria-label="游玩概览">
        <div className="stats-summary__lead">
          <span>累计游玩</span>
          <b>{formatPlaytimeSeconds(data.allTimeSeconds)}</b>
          <em>{data.allTimeSessions} 次已结算会话</em>
          <div className="stats-summary__spark" aria-hidden="true">
            {data.daily.slice(-14).map((day) => (
              <i
                key={day.date}
                style={{
                  height: `${Math.max(day.seconds > 0 ? 12 : 4, (day.seconds / sparkMax) * 100)}%`,
                }}
              />
            ))}
          </div>
        </div>
        <div className="stats-summary__item">
          <span>最近 7 天</span>
          <b>{formatPlaytimeSeconds(data.last7Seconds)}</b>
          <em className={weekDelta > 0 ? "is-up" : weekDelta < 0 ? "is-down" : ""}>
            {weekDeltaLabel}
          </em>
        </div>
        <div className="stats-summary__item">
          <span>本周启动</span>
          <b>
            {data.currentWeekLaunches}
            <small>次</small>
          </b>
          <em>{data.currentWeekGames} 部作品</em>
        </div>
        <div className="stats-summary__item">
          <span>近 18 周活跃</span>
          <b>
            {activeHeatDays}
            <small>天</small>
          </b>
          <em>当前连续 {streak.current} 天</em>
        </div>
      </section>

      <div className="stats-primary">
        <section className="stats-card stats-trend">
          <header className="stats-card__head">
            <div>
              <h2>游玩趋势</h2>
              <p>
                {trend.label} · {formatPlaytimeSeconds(trendTotal)}
              </p>
            </div>
            <span className="stats-card__tag">{trend.note}</span>
          </header>
          <TrendChart points={trend.points} total={trendTotal} />
          <footer className="stats-trend__foot">
            <span>峰值 {formatPlaytimeSeconds(trendPeak.seconds)}</span>
            <span>日均 {formatPlaytimeSeconds(trendTotal / Math.max(1, trend.points.length))}</span>
            <span className={monthDelta > 0 ? "is-up" : monthDelta < 0 ? "is-down" : ""}>
              {monthDeltaLabel}
            </span>
          </footer>
        </section>

        <section className="stats-card stats-top">
          <header className="stats-card__head">
            <div>
              <h2>游玩最多</h2>
              <p>{periodLabels[period]}累计</p>
            </div>
            <Link to="/library?focus=library-grid" className="stats-card__link">
              全部
              <ArrowRight size={13} strokeWidth={1.8} />
            </Link>
          </header>
          {data.topGames.length === 0 ? (
            <p className="stats-chart-empty">当前范围还没有已结算会话</p>
          ) : (
            <div className="stats-top__list">
              {data.topGames.map((game, index) => (
                <Link
                  to={`/work/${game.workId}`}
                  state={statsDetailState}
                  className="stats-top__row"
                  key={game.workId}
                >
                  <span className="stats-top__rank">{String(index + 1).padStart(2, "0")}</span>
                  <span className="stats-top__copy">
                    <b>{game.title}</b>
                    <small>{game.originalTitle}</small>
                    <span className="stats-top__track">
                      <motion.span
                        style={{ scaleX: game.seconds / topMax }}
                        initial={reduceMotion ? false : { scaleX: 0 }}
                        animate={{ scaleX: game.seconds / topMax }}
                        transition={{
                          duration: 0.55,
                          delay: index * 0.05,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                      />
                    </span>
                  </span>
                  <strong>{formatCompactDuration(game.seconds)}</strong>
                  <ArrowUpRight size={14} strokeWidth={1.7} />
                </Link>
              ))}
            </div>
          )}
          <footer className="stats-top__foot">
            {data.rangeLaunches} 次会话 · {data.topGames.length} 部作品
          </footer>
        </section>
      </div>

      <div className="stats-triplet">
        <section className="stats-card stats-chart-card">
          <header className="stats-card__head">
            <div>
              <h2>星期节奏</h2>
              <p>{weekdayWindowLabel}</p>
            </div>
            <span className="stats-card__tag">按天</span>
          </header>
          <WeekdayChart totals={weekdayTotals} />
          <footer className="stats-card__foot">
            {mostActiveWeekday.seconds > 0
              ? `${mostActiveWeekday.label}最活跃 · ${formatPlaytimeSeconds(mostActiveWeekday.seconds)}`
              : "这段时间还没有活跃记录"}
          </footer>
        </section>

        <section className="stats-card stats-chart-card">
          <header className="stats-card__head">
            <div>
              <h2>游玩时段</h2>
              <p>按会话开始时间</p>
            </div>
            <span className="stats-card__tag">{data.recentSessions.length} 条</span>
          </header>
          <TimeOfDayChart buckets={timeBuckets} />
          <footer className="stats-card__foot">
            {topTimeBucket.seconds > 0
              ? `常见于${topTimeBucket.label} · ${topTimeBucket.hours}`
              : "当前范围还没有会话记录"}
          </footer>
        </section>

        <section className="stats-card stats-chart-card">
          <header className="stats-card__head">
            <div>
              <h2>会话长度</h2>
              <p>当前范围的会话样本</p>
            </div>
            <span className="stats-card__tag">{data.rangeLaunches} 次</span>
          </header>
          <SessionLengthChart buckets={lengthBuckets} averageSeconds={recentAverage} />
        </section>
      </div>

      <section className="stats-card stats-calendar">
        <header className="stats-card__head">
          <div>
            <h2>最近 18 周</h2>
            <p>
              {heatmap.startLabel} – {heatmap.endLabel}
            </p>
          </div>
          <span className="stats-card__tag">活跃 {activeHeatDays} 天</span>
        </header>
        <div className="stats-calendar__body">
          <div className="stats-heatmap" ref={heatmapRef}>
            <div className="stats-heatmap__chart">
              <div className="stats-heatmap__weekdays" aria-hidden="true">
                <span>一</span>
                <span />
                <span>三</span>
                <span />
                <span>五</span>
                <span />
                <span>日</span>
              </div>
              <div
                className="stats-heatmap__grid"
                role="img"
                aria-label={`最近 18 周游玩热力图，活跃 ${activeHeatDays} 天`}
                onPointerLeave={() => setHeatTip(null)}
              >
                {heatmap.days.map((day, index) => {
                  const direction = index % 7 < 2 ? "bottom" : "top";
                  return (
                    <span
                      key={day.date}
                      data-level={heatLevel(day.seconds, heatmap.max)}
                      onPointerEnter={(event) =>
                        setHeatTip(
                          tipFromElement(
                            heatmapRef.current,
                            event.currentTarget,
                            {
                              kicker: formatFullDay(day.date),
                              value: formatPlaytimeSeconds(day.seconds),
                              meta:
                                day.seconds > 0
                                  ? `${weekdayLabel(day.date)} · 已结算会话`
                                  : "没有已结算会话",
                            },
                            direction,
                          ),
                        )
                      }
                    />
                  );
                })}
              </div>
            </div>
            <div className="stats-heatmap__legend">
              <span>少</span>
              {[0, 1, 2, 3, 4].map((level) => (
                <i data-level={level} key={level} />
              ))}
              <span>多</span>
            </div>
            <ChartTooltip tip={heatTip} />
          </div>
          <dl className="stats-insights">
            <div>
              <dt>当前连续</dt>
              <dd>{streak.current} 天</dd>
            </div>
            <div>
              <dt>最长连续</dt>
              <dd>{streak.longest} 天</dd>
            </div>
            <div>
              <dt>日均</dt>
              <dd>{formatCompactDuration(heatDailyAverage)}</dd>
            </div>
            <div>
              <dt>活跃日均</dt>
              <dd>{formatCompactDuration(heatActiveAverage)}</dd>
            </div>
            <div className="stats-insights__wide">
              <dt>最活跃</dt>
              <dd>{heatMostActive.seconds > 0 ? heatMostActive.label : "—"}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="stats-card stats-history">
        <header className="stats-history__head">
          <div className="stats-history__title">
            <h2>历史动态</h2>
            <p>游玩、入库与收藏，按发生时间排列 · 当前范围最近 {data.timeline.length} 条</p>
          </div>
          <div className="stats-history__filters" role="group" aria-label="筛选历史动态">
            {activityFilters.map((filter) => {
              const Icon = filter.icon;
              return (
                <button
                  type="button"
                  key={filter.id}
                  className={activityFilter === filter.id ? "is-active" : ""}
                  aria-pressed={activityFilter === filter.id}
                  onClick={() => {
                    setActivityFilter(filter.id);
                    setHistoryLimit(10);
                  }}
                >
                  <Icon size={12.5} strokeWidth={1.8} />
                  <span>{filter.label}</span>
                  <small>{activityCounts[filter.id]}</small>
                </button>
              );
            })}
          </div>
        </header>

        {groupedActivity.length === 0 ? (
          <p className="stats-chart-empty">这个筛选下还没有动态</p>
        ) : (
          <div className="stats-timeline">
            {groupedActivity.map((group) => (
              <section className="stats-timeline__group" key={group.key}>
                <header className="stats-timeline__day">
                  <span className="stats-timeline__day-node" aria-hidden="true">
                    <CalendarDays size={12} strokeWidth={1.8} />
                  </span>
                  <span className="stats-timeline__day-copy">
                    <b>{relativeDayLabel(group.key)}</b>
                    <small>{relativeDayMeta(group.key)}</small>
                  </span>
                  <span className="stats-timeline__day-summary">{activityGroupSummary(group)}</span>
                </header>
                <div className="stats-timeline__events">
                  {group.events.map((event) => (
                    <ActivityEventRow event={event} key={event.id} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {hasMoreHistory || historyLimit > 10 ? (
          <div className="stats-history__actions">
            {historyLimit > 10 ? (
              <button
                type="button"
                className="stats-history__more is-muted"
                onClick={() => setHistoryLimit(10)}
              >
                收起
                <ChevronUp size={14} strokeWidth={1.8} />
              </button>
            ) : null}
            {hasMoreHistory ? (
              <button
                type="button"
                className="stats-history__more"
                onClick={() => setHistoryLimit((limit) => limit + 10)}
              >
                继续回看
                <span>还有 {filteredActivity.length - visibleActivity.length} 条动态</span>
                <ChevronDown size={14} strokeWidth={1.8} />
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
