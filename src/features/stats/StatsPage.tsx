import { ArrowUpRight, Clock3, Flame, Timer } from "lucide-react";
import { Link } from "react-router-dom";
import { Tag } from "../../design-system/components/Tag";
import { games, totalPlaytime } from "../../lib/game-data";
import "./stats.css";

const totalHours = Math.floor(totalPlaytime / 60);
const totalMinutes = totalPlaytime % 60;
const heatmapValues = Array.from({ length: 84 }, (_, index) => (index * 37 + 13) % 5);

const topGames = [...games].sort((a, b) => b.playtimeMinutes - a.playtimeMinutes).slice(0, 5);

const recentSessions = games
  .flatMap((game) => game.sessions.map((session) => ({ ...session, game })))
  .slice(0, 6);

export function StatsPage() {
  return (
    <div className="stats-page">
      <header className="stats-head">
        <div>
          <p className="app-kicker">
            <span className="app-status-dot" />
            PLAY LOG / 游玩统计
          </p>
          <h1>游戏时间</h1>
          <p>
            当前仍是 C1 视觉占位；C6 接入启动器会话后显示真实统计，不包含游戏内路线或成就完成度。
          </p>
        </div>
        <Tag tone="muted">C6 接入真实会话</Tag>
      </header>

      <div className="stats-metrics">
        <article>
          <Timer size={15} strokeWidth={1.5} />
          <span>累计游玩</span>
          <b>
            {totalHours} 小时 {totalMinutes} 分
          </b>
          <em>来自 {games.reduce((sum, game) => sum + game.sessions.length, 0)} 条会话</em>
        </article>
        <article>
          <Clock3 size={15} strokeWidth={1.5} />
          <span>最近 7 天</span>
          <b>6 小时 24 分</b>
          <em>比上周多 1 小时 12 分</em>
        </article>
        <article>
          <Flame size={15} strokeWidth={1.5} />
          <span>本周启动</span>
          <b>9 次</b>
          <em>4 部游戏</em>
        </article>
      </div>

      <div className="stats-layout">
        <section className="stats-heatmap">
          <header>
            <div>
              <h2>最近 12 周</h2>
              <p>颜色越亮，游玩时间越长。</p>
            </div>
            <span>
              较少 <i />
              <i />
              <i />
              <i />
              <i /> 较多
            </span>
          </header>
          <div className="stats-heatmap__grid" aria-label="最近 12 周游玩热力图">
            {heatmapValues.map((value, index) => (
              <span
                key={index}
                data-level={value}
                title={`第 ${Math.floor(index / 7) + 1} 周 · 热度 ${value}`}
              />
            ))}
          </div>
        </section>

        <section className="stats-top">
          <header>
            <h2>游玩最多</h2>
            <Link to="/library">
              全部游戏 <ArrowUpRight size={12} strokeWidth={1.6} />
            </Link>
          </header>
          {topGames.map((game, index) => (
            <Link to={`/work/${game.id}`} className="stats-top__row" key={game.id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <b>{game.title}</b>
                <em>{game.originalTitle}</em>
              </div>
              <strong>{game.playtime}</strong>
            </Link>
          ))}
        </section>
      </div>

      <section className="stats-sessions">
        <header>
          <h2>最近会话</h2>
          <p>可以编辑、删除或补录。</p>
        </header>
        <div className="stats-session-row stats-session-row--head">
          <span>游戏</span>
          <span>开始时间</span>
          <span>时长</span>
          <span>结束方式</span>
        </div>
        {recentSessions.map((session) => (
          <Link
            to={`/work/${session.game.id}`}
            className="stats-session-row"
            key={`${session.game.id}-${session.id}`}
          >
            <span>
              <b>{session.game.title}</b>
              <em>{session.game.originalTitle}</em>
            </span>
            <span>
              {session.date} {session.time}
            </span>
            <span>{session.duration}</span>
            <span>{session.ended}</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
