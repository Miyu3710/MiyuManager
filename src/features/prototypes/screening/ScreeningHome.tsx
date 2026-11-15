import { ArrowRight, ArrowUpRight, Clock3, Play } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CoverArt } from "../../../design-system/components/CoverArt";
import { continueWorks, featuredWork, recentWorks, statusLabels } from "../data";

export function ScreeningHome() {
  return (
    <div className="screening-home">
      <section className="screening-hero">
        <span className="screening-hero__kanji" aria-hidden="true">
          月
        </span>
        <div className="screening-hero__glow" aria-hidden="true" />
        <div className="screening-hero__copy">
          <p className="screening-kicker">
            <span className="status-dot" />
            上次游玩 · {featuredWork.lastPlayed}
          </p>
          <h1>{featuredWork.title}</h1>
          <p className="screening-hero__original">
            {featuredWork.originalTitle}
            <span>{featuredWork.romaji}</span>
          </p>
          <p className="screening-hero__desc">{featuredWork.description}</p>
          <div className="screening-tags">
            {featuredWork.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <div className="screening-game-meta">
            <span>{featuredWork.engine}</span>
            <i />
            <span>{featuredWork.ageRating}</span>
            <i />
            <span>{featuredWork.edition}</span>
          </div>
          <div className="screening-actions">
            <button
              type="button"
              className="screening-button screening-button--primary"
              onClick={() => toast("原型预览：启动功能在主应用作品详情页中提供。")}
            >
              <Play size={14} fill="currentColor" strokeWidth={0} />
              启动游戏
              <span>{featuredWork.edition}</span>
            </button>
            <Link
              to={`/prototype/screening/work/${featuredWork.id}`}
              className="screening-button screening-button--ghost"
            >
              游戏详情
              <ArrowUpRight size={14} strokeWidth={1.6} />
            </Link>
          </div>
          <div className="screening-hero__signal">
            <span>累计 {featuredWork.playtime}</span>
            <i />
            <span>{featuredWork.launchCount} 次启动</span>
            <i />
            <span>{featuredWork.installedSize}</span>
          </div>
        </div>

        <div className="screening-hero__poster">
          <span className="screening-hero__no">MM-0128 / 2024</span>
          <CoverArt work={featuredWork} />
          <p>
            <span>上次游玩</span>
            {featuredWork.lastPlayed}
          </p>
        </div>

        <div className="screening-hero__side" aria-hidden="true">
          <span>PLAYER ONE / LOCAL</span>
          <i />
          <span>LIB 128</span>
        </div>
      </section>

      <section className="screening-continue">
        <header className="screening-section-head">
          <div>
            <span className="screening-section-index">02</span>
            <h2>最近启动</h2>
            <em>再次启动上次玩过的游戏</em>
          </div>
          <Link to="/prototype/screening/library">
            全部游戏
            <ArrowRight size={13} strokeWidth={1.5} />
          </Link>
        </header>
        <div className="screening-continue__row">
          {continueWorks.map((work) => (
            <Link
              to={`/prototype/screening/work/${work.id}`}
              className="screening-continue__card"
              key={work.id}
            >
              <CoverArt work={work} />
              <div className="screening-continue__copy">
                <span className="screening-card-status">{statusLabels[work.status]}</span>
                <h3>{work.title}</h3>
                <p>{work.originalTitle}</p>
                <small>
                  <Clock3 size={10} strokeWidth={1.6} />
                  {work.playtime} · 上次 {work.lastPlayed}
                </small>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="screening-recent">
        <header className="screening-section-head">
          <div>
            <span className="screening-section-index">03</span>
            <h2>最近入库</h2>
            <em>本周新增 6 部</em>
          </div>
          <button type="button" className="screening-text-button">
            管理游戏库
            <ArrowRight size={13} strokeWidth={1.5} />
          </button>
        </header>
        <div className="screening-recent__row">
          {recentWorks.map((work) => (
            <Link
              to={`/prototype/screening/work/${work.id}`}
              className="screening-recent__item"
              key={work.id}
            >
              <CoverArt work={work} />
              <div>
                <h3>{work.title}</h3>
                <p>{work.developer}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
