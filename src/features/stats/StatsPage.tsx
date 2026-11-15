import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Clock3, Flame, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "../../design-system/components/EmptyState";
import { Tag } from "../../design-system/components/Tag";
import { formatPlaytimeSeconds } from "../../lib/format";
import type { PlaySessionWithWork, StatsPeriod } from "../../lib/library-types";
import { useStats } from "../library/useLibrary";
import { cn } from "../../lib/cn";
import "./stats.css";

const periods: { id: StatsPeriod; label: string }[] = [
  { id: "week", label: "本周" },
  { id: "month", label: "本月" },
  { id: "year", label: "今年" },
  { id: "all", label: "全部" },
];

function heatLevel(seconds: number, max: number): number {
  if (seconds <= 0) {
    return 0;
  }
  if (max <= 0) {
    return 1;
  }
  const ratio = seconds / max;
  if (ratio > 0.75) return 4;
  if (ratio > 0.45) return 3;
  if (ratio > 0.18) return 2;
  return 1;
}

function reasonLabel(reason: string | null): string {
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

function sessionStartedLabel(session: PlaySessionWithWork): string {
  return new Date(session.startedAt).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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

  if (stats.isPending) {
    return (
      <div className="stats-page">
        <EmptyState title="正在读取游玩统计" description="正在汇总本地 SQLite 中的游玩会话。" />
      </div>
    );
  }

  if (stats.isError || !stats.data) {
    return (
      <div className="stats-page">
        <EmptyState
          title="无法读取游玩统计"
          description={String(stats.error ?? "统计查询没有返回数据")}
        />
      </div>
    );
  }

  const data = stats.data;
  const maxDay = Math.max(...data.daily.map((day) => day.seconds), 1);
  const weekDelta = data.last7Seconds - data.previous7Seconds;

  return (
    <div className="stats-page">
      <header className="stats-head">
        <div>
          <p className="app-kicker">
            <span className="app-status-dot" />
            PLAY LOG / 游玩统计
          </p>
          <h1>游戏时间</h1>
          <p>来自本地启动器会话。长时间切到后台会暂停计时，不读取游戏内章节或成就。</p>
        </div>
        <Tag tone="status">本地会话</Tag>
      </header>

      <div className="stats-metrics">
        <article>
          <Timer size={15} strokeWidth={1.5} />
          <span>累计游玩</span>
          <b>{formatPlaytimeSeconds(data.allTimeSeconds)}</b>
          <em>来自 {data.allTimeSessions} 条已结算会话</em>
        </article>
        <article>
          <Clock3 size={15} strokeWidth={1.5} />
          <span>最近 7 天</span>
          <b>{formatPlaytimeSeconds(data.last7Seconds)}</b>
          <em>
            {weekDelta === 0
              ? "与前 7 天持平"
              : weekDelta > 0
                ? `比前 7 天多 ${formatPlaytimeSeconds(weekDelta)}`
                : `比前 7 天少 ${formatPlaytimeSeconds(Math.abs(weekDelta))}`}
          </em>
        </article>
        <article>
          <Flame size={15} strokeWidth={1.5} />
          <span>本周启动</span>
          <b>{data.currentWeekLaunches} 次</b>
          <em>
            {data.currentWeekGames} 部游戏 · 最近 30 天 {formatPlaytimeSeconds(data.last30Seconds)}
          </em>
        </article>
      </div>

      <div className="stats-period" role="tablist" aria-label="统计时间范围">
        {periods.map((entry) => (
          <button
            type="button"
            role="tab"
            aria-selected={period === entry.id}
            className={cn(period === entry.id && "is-active")}
            key={entry.id}
            onClick={() => setPeriod(entry.id)}
          >
            {entry.label}
          </button>
        ))}
        <span>
          {formatPlaytimeSeconds(data.rangeSeconds)} · {data.rangeLaunches} 条会话
        </span>
      </div>

      <div className="stats-layout">
        <section className="stats-heatmap">
          <header>
            <div>
              <h2>最近 12 周</h2>
              <p>按会话开始日期归档，颜色越亮，游玩时间越长。</p>
            </div>
            <span>
              较少 <i data-level="1" />
              <i data-level="2" />
              <i data-level="3" />
              <i data-level="4" /> 较多
            </span>
          </header>
          <div className="stats-heatmap__grid" aria-label="最近 12 周游玩热力图">
            {data.daily.map((day) => (
              <span
                key={day.date}
                data-level={heatLevel(day.seconds, maxDay)}
                title={`${day.date} · ${formatPlaytimeSeconds(day.seconds)}`}
              />
            ))}
          </div>
          <div className="stats-heatmap__months">
            <span>{data.daily[0]?.date.slice(5)}</span>
            <span>{data.daily[83]?.date.slice(5)}</span>
          </div>
        </section>

        <section className="stats-top">
          <header>
            <h2>游玩最多</h2>
            <Link to="/library">
              全部游戏 <ArrowUpRight size={12} strokeWidth={1.6} />
            </Link>
          </header>
          {data.topGames.length === 0 ? (
            <p className="stats-empty">这个时间范围内还没有已结算会话。</p>
          ) : (
            data.topGames.map((game, index) => (
              <Link to={`/work/${game.workId}`} className="stats-top__row" key={game.workId}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <b>{game.title}</b>
                  <em>{game.originalTitle}</em>
                </div>
                <strong>{formatPlaytimeSeconds(game.seconds)}</strong>
              </Link>
            ))
          )}
        </section>
      </div>

      <section className="stats-sessions">
        <header>
          <h2>最近会话</h2>
          <p>在作品详情的“游玩记录”中可以修改、删除或补录。</p>
        </header>
        <div className="stats-session-row stats-session-row--head">
          <span>游戏</span>
          <span>开始时间</span>
          <span>时长</span>
          <span>结束方式</span>
        </div>
        {data.recentSessions.length === 0 ? (
          <p className="stats-empty">还没有会话。从游戏库启动一部作品后会自动记录。</p>
        ) : (
          data.recentSessions.map((session) => (
            <Link
              to={`/work/${session.workId}?tab=sessions`}
              className="stats-session-row"
              key={session.id}
            >
              <span>
                <b>{session.workTitle}</b>
                <em>{session.originalTitle}</em>
              </span>
              <span>{sessionStartedLabel(session)}</span>
              <span>{formatPlaytimeSeconds(session.durationSec)}</span>
              <span>
                {reasonLabel(session.endReason)}
                {session.corrected ? " · 已修正" : ""}
              </span>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
